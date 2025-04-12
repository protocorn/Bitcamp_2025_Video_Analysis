const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

class GeminiService {
  constructor() {
    // Initialize the Gemini API with API key
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not set');
    }
    
    this.genAI = new GoogleGenerativeAI(apiKey);
    // Use gemini-2.0-flash for text and gemini-1.5-flash for multimodal
    this.textModel = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    this.visionModel = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    console.log('Initialized Gemini models:');
    console.log('- Text model: gemini-2.0-flash');
    console.log('- Vision model: gemini-1.5-flash');
  }

  /**
   * Generate an answer to a question based on the video transcript using Gemini
   * @param {string} question - The user's question
   * @param {string} transcript - The video transcript
   * @returns {Promise<string>} The generated answer
   */
  async generateAnswer(question, transcript) {
    try {
      // Construct a prompt for Gemini that includes both the transcript and the question
      const prompt = `
        Based on the following transcript from a YouTube video, please answer the question.
        
        TRANSCRIPT:
        ${transcript}
        
        QUESTION:
        ${question}
        
        Please provide a concise, accurate answer based solely on the information in the transcript.
      `;
      
      // Generate response from Gemini
      const result = await this.textModel.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      if (!text) {
        return "Sorry, I couldn't generate an answer at this time.";
      }
      
      return text;
    } catch (error) {
      throw new Error(`Failed to generate answer: ${error.message}`);
    }
  }

  /**
   * Generate answer based on both video frames and transcript
   * @param {string} question - The user's question
   * @param {object} videoData - Object containing transcript and frame URLs
   * @returns {Promise<string>} The generated answer
   */
  async generateMultimodalAnswer(question, videoData) {
    try {
      const { detailedTranscript, frames } = videoData; // Use detailedTranscript and frames {url, timestamp}
      
      console.log(`Processing multimodal answer with ${frames ? frames.length : 0} frames`);
      
      if (!frames || frames.length === 0) {
        console.log("No frames available, falling back to text-only");
        // Fall back to text-only if no frames are available
        return this.generateAnswer(question, videoData.plainTranscript);
      }
      
      // Format detailed transcript with timestamps
      const formattedTranscript = detailedTranscript
        ? detailedTranscript.map(seg => {
            // Check if segment, offset, and duration are valid numbers
            if (seg && typeof seg.offset === 'number' && !isNaN(seg.offset) && typeof seg.duration === 'number' && !isNaN(seg.duration)) {
              return `[${seg.offset.toFixed(2)}s - ${(seg.offset + seg.duration).toFixed(2)}s] ${seg.text}`;
            } else if (seg && typeof seg.offset === 'number' && !isNaN(seg.offset)) {
               // Fallback if only offset is valid
               console.warn("Transcript segment missing valid duration:", seg);
               return `[${seg.offset.toFixed(2)}s] ${seg.text}`;
            } else if (seg) {
               // Fallback if timing is missing
               console.warn("Transcript segment missing valid offset/duration:", seg);
               return `${seg.text}`;
            } else {
                // Fallback for invalid segment object
                console.warn("Invalid transcript segment object found.");
                return "[Invalid Segment]";
            }
          }).join('\n')
        : '(No detailed transcript available)';
        
      // Prepare frame information text for the prompt (doesn't need loading here)
      // -- DEBUG LOG: Inspect the frames array before mapping --
      console.log("Inspecting frames array before formatting text:", JSON.stringify(frames, null, 2));
      // -- END DEBUG LOG --
      const formattedFramesText = frames
        .map((frame, index) => {
            // Add check for valid frame and timestamp before formatting
            if (frame && typeof frame.timestamp === 'number' && !isNaN(frame.timestamp)) {
                return `Frame ${index + 1}: Timestamp approx ${frame.timestamp.toFixed(2)}s (Image provided separately)`;
            } else {
                // Fallback text if timestamp is missing or invalid
                console.warn(`Frame ${index + 1} has missing or invalid timestamp:`, frame);
                return `Frame ${index + 1}: Timestamp missing (Image provided separately)`;
            }
        }).join('\n');
        
      const contextDescription = `CONTEXT:
Transcript with Timestamps (Audio Content):
${formattedTranscript}

Frames with Timestamps (Key Visual Moments):
${formattedFramesText || '(No frames available)'}`;

      // Start building the parts array with the text prompt
      const parts = [
        {
          text: `You are a knowledgeable and patient teacher helping students deeply understand a topic.\nUse only the context information below (transcript segments with timestamps and accompanying frames with timestamps) to generate your response.\n---------------------\n${contextDescription}\n---------------------\nGiven the context above, provide a detailed, educational explanation in response to the query.\nExplain the topic thoroughly with step-by-step reasoning, clear definitions, and relevant examples based *only* on the transcript and frames.\nTry to correlate the transcript segments with the visual frames using their timestamps when relevant to the query.\nAlso, identify and explain any related concepts or information present in the context that can help the student gain a broader and more connected understanding.\nBreak down concepts step-by-step, include definitions, examples, and any relevant insights that would help a student fully grasp the topic.\n\n**Formatting Instructions:**\n*   Use Markdown for general formatting (like lists).\n*   For mathematical equations, formulas, or symbols (like integrals ∫, fractions, exponents ^, greek letters π, etc.), use standard LaTeX delimiters: enclose inline math with \`$...\$\` and display math (equations on their own line) with \`$$...$$\`.\n\nIf the query is conversational (like asking for a summary, clarification, or simplification), respond naturally and helpfully — but only based on the context, using timestamps where appropriate (e.g., \"Around 15.32s, the video shows...\").\nEnsure the explanation is informative, beginner-friendly, and suitable for someone eager to learn in depth.\nIf the context (transcript and frames) does not contain sufficient information to answer the query, politely respond with something like: \"The provided material (video transcript and frames) doesn\\'t include specific details to fully answer this question.\"\nDo not attempt to answer using outside knowledge.\n\nQuery: ${question}\nAnswer: `
        }
      ];
      
      // Now, load images one by one and add them to the parts array
      let loadedImageCount = 0;
      for (const frame of frames) { // Iterate through frame objects {url, timestamp}
         if(frame.url) { // Ensure url exists
             const imgData = await this._loadSingleFrameAsBase64(frame.url); // Use helper
             if (imgData) {
                parts.push({
                    inlineData: {
                        data: imgData,
                        mimeType: 'image/jpeg'
                    }
                });
                loadedImageCount++;
             }
         }
      }
      
      // Fallback if no images could be loaded *after* trying
       if (loadedImageCount === 0) {
        console.log("No images could be loaded successfully, falling back to text-only");
        return this.generateAnswer(question, videoData.plainTranscript);
      }

      console.log(`Sending request to ${this.visionModel.model} model with updated prompt and ${loadedImageCount} successfully loaded frames...`);
      // console.log("Request Text Part:", parts[0].text); // Log only the text part
      
      // Generate response using the vision model
      const result = await this.visionModel.generateContent({
        contents: [{ role: "user", parts }],
      });
      
      const response = result.response;
      const text = response.text();
      
      console.log("Received response from vision model");
      
      if (!text) {
        return "Sorry, I couldn't generate an answer at this time.";
      }
      
      return text;
    } catch (error) {
      console.error('Multimodal generation error:', error);
      // Fall back to text-only if vision model fails
      try {
        console.log("Vision model failed, falling back to text-only");
        return await this.generateAnswer(question, videoData.plainTranscript);
      } catch (fallbackError) {
        throw new Error(`Failed to generate answer: ${error.message}`);
      }
    }
  }

  /**
   * Load image frames as base64 strings
   * @param {Array<string>} frameUrls - Array of frame URLs
   * @returns {Promise<Array<string>>} Array of base64 image data
   */
  async _loadFramesAsBase64(frameUrls) {
    try {
      const base64Images = [];
      
      // Limit to maximum frames to avoid token limits & cost
      const MAX_FRAMES = 5; // Increased from 2 to 5
      const framesToProcess = frameUrls.slice(0, MAX_FRAMES);
      
      console.log(`Processing up to ${MAX_FRAMES} frames (found ${frameUrls.length}, processing ${framesToProcess.length})`);
      
      for (const frameUrl of framesToProcess) {
        try {
          // Convert relative URL to absolute file path
          const filePath = path.join(__dirname, '../public', frameUrl);
          console.log(`Trying to load image from: ${filePath}`);
          
          if (fs.existsSync(filePath)) {
            // Get file stats to check size
            const stats = fs.statSync(filePath);
            
            // Only include if the file is valid (> 100 bytes)
            if (stats.size > 100) {
              const imageBuffer = fs.readFileSync(filePath);
              const base64Image = imageBuffer.toString('base64');
              base64Images.push(base64Image);
              console.log(`Successfully loaded image: ${frameUrl} (${Math.round(stats.size/1024)}KB)`);
            } else {
              console.error(`Image file too small (${stats.size} bytes): ${filePath}`);
            }
          } else {
            console.error(`Image file does not exist: ${filePath}`);
          }
        } catch (imgError) {
          console.error(`Error loading image ${frameUrl}:`, imgError.message);
        }
      }
      
      console.log(`Successfully loaded ${base64Images.length} images`);
      return base64Images;
    } catch (error) {
      console.error('Error loading images:', error.message);
      return [];
    }
  }

  /**
   * Loads a single frame image as a base64 string
   * @param {string} frameUrl - Relative URL of the frame
   * @returns {Promise<string|null>} Base64 image data or null if error/not found
   */
  async _loadSingleFrameAsBase64(frameUrl) {
      try {
          // Convert relative URL to absolute file path
          const filePath = path.join(__dirname, '../public', frameUrl);
          // console.log(`Trying to load image from: ${filePath}`); // Verbose log
          
          if (fs.existsSync(filePath)) {
              const stats = fs.statSync(filePath);
              if (stats.size > 100) {
                  const imageBuffer = fs.readFileSync(filePath);
                  return imageBuffer.toString('base64');
                  // console.log(`Successfully loaded image: ${frameUrl} (${Math.round(stats.size/1024)}KB)`);
              } else {
                  console.error(`Image file too small (${stats.size} bytes): ${filePath}`);
                  return null;
              }
          } else {
              console.error(`Image file does not exist: ${filePath}`);
              return null;
          }
      } catch (imgError) {
          console.error(`Error loading image ${frameUrl}:`, imgError.message);
          return null;
      }
  }
}

module.exports = { GeminiService }; 
module.exports = { GeminiService }; 