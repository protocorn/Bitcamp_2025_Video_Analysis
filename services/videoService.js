const { YoutubeTranscript } = require('youtube-transcript');
const urlParser = require('youtube-url-parser');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { extractFramesFromYouTube } = require('./frameExtractor');

class VideoService {
  constructor() {
    // this.transcripts = {}; // Store plain text transcripts (optional, keep if needed elsewhere)
    this.videoData = {}; // Store detailed video data (transcript objects, frames with timestamps, etc.)
    
    // Create directories for storing frames if they don't exist
    this.frameDir = path.join(__dirname, '../public/frames');
    if (!fs.existsSync(this.frameDir)) {
      fs.mkdirSync(this.frameDir, { recursive: true });
    }
  }

  /**
   * Process a YouTube video: extract video ID, download transcript, and extract frames
   * @param {string} youtubeUrl - The YouTube video URL
   * @returns {Promise<string>} A unique ID for the processed video
   */
  async processYoutubeVideo(youtubeUrl) {
    try {
      // Extract video ID from YouTube URL
      const videoId = this._extractVideoId(youtubeUrl);
      
      if (!videoId) {
        throw new Error('Invalid YouTube URL format');
      }

      // Generate a unique ID for this processed video
      const uniqueId = uuidv4();
      
      // Initialize video data object with placeholder for detailed transcript
      this.videoData[uniqueId] = {
        youtubeId: videoId,
        plainTranscript: null, // Optional: Keep plain text version if needed
        detailedTranscript: null, // To store {text, duration, offset}
        frames: [], // To store {url, timestamp}
        frameCount: 0
      };

      // Process transcript (fetch detailed version)
      await this._processTranscript(videoId, uniqueId);
      
      // Extract frames using Python OpenCV (this part already passes uniqueId)
      try {
        console.log(`Extracting frames for YouTube video: ${youtubeUrl} (ID: ${uniqueId})`);
        const extractionResult = await extractFramesFromYouTube(youtubeUrl, uniqueId);
        
        if (extractionResult.success && extractionResult.frames) {
          // Store the frames with timestamps from Python extraction
          if (extractionResult.video_id === uniqueId) {
            // Filter for valid frame objects before mapping
            this.videoData[uniqueId].frames = extractionResult.frames
              .filter(frame => 
                typeof frame === 'object' && 
                frame !== null && 
                typeof frame.url === 'string' && 
                typeof frame.timestamp === 'number' && 
                !isNaN(frame.timestamp) // Ensure timestamp is not NaN
              )
              .map(frame => ({ 
                url: frame.url, 
                timestamp: frame.timestamp 
              }));
            this.videoData[uniqueId].frameCount = this.videoData[uniqueId].frames.length; // Update count based on filtered frames
            console.log(`Successfully extracted and stored ${this.videoData[uniqueId].frameCount} valid frames with timestamps for ID ${uniqueId}`);
          } else {
            console.error(`Mismatch between requested uniqueId (${uniqueId}) and Python result video_id (${extractionResult.video_id}). Frames not stored.`);
            this.videoData[uniqueId].frames = []; // Ensure frames is empty on error
            this.videoData[uniqueId].frameCount = 0;
          }
        } else if (extractionResult.error) {
          console.error(`Python extraction error for ID ${uniqueId}: ${extractionResult.error}`);
           this.videoData[uniqueId].frames = []; // Ensure frames is empty on error
           this.videoData[uniqueId].frameCount = 0;
        }
      } catch (frameError) {
        console.error(`Frame extraction failed for ID ${uniqueId}:`, frameError.message);
        this.videoData[uniqueId].frames = []; // Ensure frames is empty on error
        this.videoData[uniqueId].frameCount = 0;
      }
      
      return uniqueId;
    } catch (error) {
      console.error(`Error processing video ${youtubeUrl}: ${error.message}`)
      throw new Error(`Failed to process video: ${error.message}`);
    }
  }

  /**
   * Process the transcript for a video, fetching detailed timing info
   * @param {string} videoId - The YouTube video ID
   * @param {string} uniqueId - The unique ID for storage
   * @returns {Promise<void>}
   */
  async _processTranscript(videoId, uniqueId) {
    try {
      // Fetch the detailed transcript
      const detailedTranscript = await this._getYoutubeTranscript(videoId);
      this.videoData[uniqueId].detailedTranscript = detailedTranscript;
      
      // Generate and store plain text version as well (optional)
      this.videoData[uniqueId].plainTranscript = this._formatTranscriptPlainText(detailedTranscript);
      console.log(`Stored detailed transcript (${detailedTranscript.length} segments) and plain text version for ID ${uniqueId}`);

    } catch (error) {
      console.error(`Transcript error for ID ${uniqueId}:`, error.message);
      this.videoData[uniqueId].detailedTranscript = null;
      this.videoData[uniqueId].plainTranscript = "No transcript available for this video.";
    }
  }

  /**
   * Retrieve the plain text transcript for a processed video by its ID
   * @param {string} videoId - The unique ID for the processed video
   * @returns {Promise<string>} The plain transcript text
   */
  async getTranscript(videoId) {
    if (!this.videoData[videoId] || !this.videoData[videoId].plainTranscript) {
      // Check if processing happened but failed, or video just not found
      if (this.videoData[videoId]){
        return "No transcript available for this video.";
      } else {
         throw new Error(`Video with ID ${videoId} not found`);
      }
    }
    return this.videoData[videoId].plainTranscript;
  }

  /**
   * Get frames (with timestamps) for a processed video
   * @param {string} videoId - The unique ID for the processed video
   * @returns {Promise<Array>} Array of frame objects ({url, timestamp})
   */
  async getVideoFrames(videoId) {
    if (!this.videoData[videoId]) {
      throw new Error(`Video with ID ${videoId} not found`);
    }
    // Return the array of frame objects
    return this.videoData[videoId].frames || [];
  }

  /**
   * Get all data for a processed video, including detailed transcript
   * @param {string} videoId - The unique ID for the processed video
   * @returns {Object} Video data including transcript (plain & detailed) and frames
   */
  async getVideoData(videoId) {
    if (!this.videoData[videoId]) {
      throw new Error(`Video with ID ${videoId} not found`);
    }
    
    const data = {
      plainTranscript: this.videoData[videoId].plainTranscript || "No transcript available",
      detailedTranscript: this.videoData[videoId].detailedTranscript, // Include detailed transcript
      frames: this.videoData[videoId].frames || [],
      youtubeId: this.videoData[videoId].youtubeId
    };
    
    console.log(`Returning video data for ${videoId}:`, {
      transcriptLength: data.plainTranscript ? data.plainTranscript.length : 0,
      detailedTranscriptSegments: data.detailedTranscript ? data.detailedTranscript.length : 0,
      frameCount: data.frames.length,
      // frameUrls: data.frames.slice(0, 2).map(f => f.url) // Log first couple of frame URLs
    });
    
    return data;
  }

  /**
   * Extract the YouTube video ID from a URL
   * @param {string} youtubeUrl - The YouTube video URL
   * @returns {string|null} The YouTube video ID
   */
  _extractVideoId(youtubeUrl) {
    try {
      // Extract using regex instead of the parser for better handling of various URL formats
      const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
      const match = youtubeUrl.match(regExp);
      return (match && match[2].length === 11) ? match[2] : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get detailed transcript (with timings) for a YouTube video
   * @param {string} videoId - The YouTube video ID
   * @returns {Promise<Array>} Array of transcript objects ({ text, duration, offset })
   */
  async _getYoutubeTranscript(videoId) {
    try {
      // FetchTranscript returns an array of objects with text, start, duration
      console.log(`Fetching transcript for video: ${videoId}`);
      const transcriptList = await YoutubeTranscript.fetchTranscript(videoId);
      console.log(`Fetched ${transcriptList.length} raw transcript segments.`);
      
      // Filter and map the list, ensuring offset (start) and duration are valid numbers
      const validSegments = transcriptList
        .filter(entry => 
            typeof entry.start === 'number' && !isNaN(entry.start) &&
            typeof entry.duration === 'number' && !isNaN(entry.duration)
         )
        .map(entry => ({ 
          text: entry.text, 
          offset: entry.start, // Already verified as a valid number
          duration: entry.duration // Already verified as a valid number
        }));

      console.log(`Filtered down to ${validSegments.length} valid transcript segments with timing.`);
      return validSegments; // Return only segments with valid timings

    } catch (error) {
      // Add videoId to error context
      console.error(`Failed to get transcript for video ${videoId}: ${error.message}`);
      // Re-throw the error so the caller knows it failed
      throw new Error(`Failed to get transcript for video ${videoId}: ${error.message}`);
    }
  }

  /**
   * Format a detailed transcript list into a single plain text string
   * @param {Array} detailedTranscript - Array of transcript objects
   * @returns {string} Plain text transcript
   */
   _formatTranscriptPlainText(detailedTranscript) {
    if (!detailedTranscript || detailedTranscript.length === 0) {
      return "";
    }
    return detailedTranscript.map(entry => entry.text).join(' ').trim();
  }
}

module.exports = { VideoService }; 