# Chat with YouTube Video API

A Node.js application that allows users to ask questions about YouTube videos and get answers using Gemini 2.0 AI with both visual and audio analysis.

## Features

- YouTube video URL processing
- Transcript extraction from videos
- Frame extraction for visual analysis
- Question answering using Gemini 2.0 AI with multimodal capabilities
- User-friendly web interface

## Setup

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Install FFmpeg (required for video frame extraction):
   - On Windows: Download from https://ffmpeg.org/download.html and add to PATH
   - On Mac: `brew install ffmpeg`
   - On Ubuntu: `sudo apt install ffmpeg`
   
4. Create a `.env` file based on `.env.example` and add your Gemini API key:
   ```
   GEMINI_API_KEY=your_gemini_api_key_here
   PORT=8000
   ```

## Running the Application

Start the Express server:

```
npm start
```

For development with auto-restart:
```
npm run dev
```

The application will be available at `http://localhost:8000`

## Using the Web Interface

1. Open your browser and navigate to `http://localhost:8000`
2. Paste a YouTube video URL in the input field and click "Process Video"
3. The system will:
   - Extract the video transcript
   - Extract key frames from the video for visual analysis
   - Display the extracted frames in the interface
4. Once the video is processed, you can ask questions about its content
5. The AI will generate answers based on both the video's transcript and visual content

## How It Works

1. **Video Processing**:
   - Extracts the audio transcript
   - Downloads the video temporarily
   - Extracts frames at regular intervals (one frame every 5 seconds)
   - Stores frames for analysis

2. **Question Answering**:
   - Uses Gemini Pro Vision model to analyze both the frames and transcript
   - Provides comprehensive answers considering both visual and audio content
   - Falls back to text-only analysis if frames aren't available

## API Endpoints

For direct API access:

### Process a YouTube Video

```
POST /api/videos
```

Request body:
```json
{
  "youtube_url": "https://www.youtube.com/watch?v=VIDEO_ID"
}
```

Response:
```json
{
  "video_id": "unique_id",
  "message": "Video processed successfully",
  "frame_count": 10,
  "has_frames": true,
  "has_transcript": true
}
```

### Ask a Question About a Video

```
POST /api/chat
```

Request body (using video_id):
```json
{
  "question": "What is this video about?",
  "video_id": "unique_id"
}
```

OR (using YouTube URL directly):
```json
{
  "question": "What is this video about?",
  "youtube_url": "https://www.youtube.com/watch?v=VIDEO_ID"
}
```

Response:
```json
{
  "answer": "This video is about..."
}
```

### Get Video Frames

```
GET /api/videos/:videoId/frames
```

Response:
```json
{
  "frames": [
    "/frames/unique_id/frame-001.jpg",
    "/frames/unique_id/frame-002.jpg",
    "..."
  ]
}
```

## Getting Gemini API Key

1. Go to the [Google AI Studio](https://ai.google.dev/)
2. Sign in with your Google account
3. Navigate to API keys section
4. Create a new API key
5. Add the API key to your `.env` file

## Technical Details

- Express.js for the backend framework
- YouTube Transcript API for extracting video transcripts
- ytdl-core and fluent-ffmpeg for video processing and frame extraction
- Gemini 2.0 API with multimodal capabilities for analyzing both text and images
- Vanilla JavaScript frontend
- In-memory storage for transcripts and frames (for demo purposes) 