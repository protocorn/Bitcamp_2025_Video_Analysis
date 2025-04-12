require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const { VideoService } = require('./services/videoService');
const { GeminiService } = require('./services/geminiService');

const app = express();

// Middleware
app.use(cors());  // Enable CORS for all routes
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files

const videoService = new VideoService();
const geminiService = new GeminiService();

// Process YouTube video
app.post('/api/videos', async (req, res) => {
  try {
    const { youtube_url } = req.body;
    
    if (!youtube_url) {
      return res.status(400).json({ error: 'YouTube URL is required' });
    }
    
    const videoId = await videoService.processYoutubeVideo(youtube_url);
    
    // Get details including frame info
    const videoData = await videoService.getVideoData(videoId);
    
    res.status(201).json({ 
      video_id: videoId, 
      message: 'Video processed successfully',
      frame_count: videoData.frames.length,
      has_frames: videoData.frames.length > 0,
      has_transcript: videoData.transcript && videoData.transcript !== "No transcript available"
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Answer questions about a video
app.post('/api/chat', async (req, res) => {
  try {
    const { question, video_id, youtube_url } = req.body;
    
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }
    
    if (!video_id && !youtube_url) {
      return res.status(400).json({ error: 'Either video_id or youtube_url must be provided' });
    }
    
    let videoIdToUse = video_id;
    
    // Process video first if only URL is provided
    if (youtube_url && !video_id) {
      videoIdToUse = await videoService.processYoutubeVideo(youtube_url);
    }
    
    // Get full video data (transcript and frames)
    const videoData = await videoService.getVideoData(videoIdToUse);
    
    console.log(`Retrieved video data for ${videoIdToUse}:`, {
      hasTranscript: !!videoData.transcript,
      frameCount: videoData.frames.length,
      hasFrames: videoData.frames.length > 0
    });
    
    // Generate answer using Gemini with multimodal input
    let answer;
    let analysisType = 'transcript_only';
    
    if (videoData.frames && videoData.frames.length > 0) {
      try {
        // Use multimodal model if we have frames
        console.log(`Using multimodal analysis with ${videoData.frames.length} frames`);
        answer = await geminiService.generateMultimodalAnswer(question, videoData);
        console.log('Multimodal analysis complete');
        analysisType = 'visual_and_transcript';
      } catch (visionError) {
        console.error('Vision model error:', visionError);
        // Fall back to text-only if vision model fails
        console.log('Falling back to text-only analysis');
        answer = await geminiService.generateAnswer(question, videoData.transcript);
        analysisType = 'transcript_only';
      }
    } else {
      // Fall back to text-only if no frames
      console.log('No frames available, using text-only analysis');
      answer = await geminiService.generateAnswer(question, videoData.transcript);
    }
    
    res.json({ 
      answer,
      analysis_type: analysisType
    });
  } catch (error) {
    console.error('Error in /api/chat:', error);
    res.status(400).json({ error: error.message });
  }
});

// Get video frames
app.get('/api/videos/:videoId/frames', async (req, res) => {
  try {
    const { videoId } = req.params;
    const frames = await videoService.getVideoFrames(videoId);
    res.json({ frames });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});