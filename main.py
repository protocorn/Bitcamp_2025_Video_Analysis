from fastapi import FastAPI, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Use direct imports for local modules
import sys
sys.path.append('.')  # Add current directory to path
from app.services.video_service import VideoService
from app.services.gemini_service import GeminiService

app = FastAPI(title="Chat with YouTube Video API")

video_service = VideoService()
gemini_service = GeminiService()

class VideoRequest(BaseModel):
    youtube_url: str

class QuestionRequest(BaseModel):
    question: str
    video_id: Optional[str] = None
    youtube_url: Optional[str] = None

class AnswerResponse(BaseModel):
    answer: str

@app.post("/api/videos", status_code=201)
async def process_video(request: VideoRequest):
    try:
        video_id = await video_service.process_youtube_video(request.youtube_url)
        return {"video_id": video_id, "message": "Video processed successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/chat", response_model=AnswerResponse)
async def answer_question(request: QuestionRequest):
    try:
        if not request.video_id and not request.youtube_url:
            raise HTTPException(status_code=400, detail="Either video_id or youtube_url must be provided")
            
        if request.youtube_url and not request.video_id:
            # Process video first if only URL is provided
            video_id = await video_service.process_youtube_video(request.youtube_url)
        else:
            video_id = request.video_id
            
        # Get transcript from video service
        transcript = await video_service.get_transcript(video_id)
        
        # Generate answer using Gemini
        answer = await gemini_service.generate_answer(request.question, transcript)
        
        return AnswerResponse(answer=answer)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True) 