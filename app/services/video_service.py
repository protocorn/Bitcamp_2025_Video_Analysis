import os
import uuid
import pytube
from youtube_transcript_api import YouTubeTranscriptApi
from urllib.parse import urlparse, parse_qs

class VideoService:
    def __init__(self):
        self.transcripts = {}  # In-memory storage for transcripts
    
    async def process_youtube_video(self, youtube_url: str) -> str:
        """
        Process a YouTube video: extract video ID, download transcript
        Returns a unique ID for the processed video
        """
        try:
            # Extract video ID from YouTube URL
            video_id = self._extract_video_id(youtube_url)
            
            # Get transcript from YouTube
            transcript_list = await self._get_youtube_transcript(video_id)
            
            # Generate a unique ID for this processed video
            unique_id = str(uuid.uuid4())
            
            # Store the transcript with the unique ID
            self.transcripts[unique_id] = transcript_list
            
            return unique_id
        except Exception as e:
            raise Exception(f"Failed to process video: {str(e)}")
    
    async def get_transcript(self, video_id: str) -> str:
        """
        Retrieve the transcript for a processed video by its ID
        """
        if video_id not in self.transcripts:
            raise Exception(f"Video with ID {video_id} not found")
        
        return self.transcripts[video_id]
    
    def _extract_video_id(self, youtube_url: str) -> str:
        """
        Extract the YouTube video ID from a URL
        """
        if "youtu.be" in youtube_url:
            # Handle shortened URLs like youtu.be/abc123
            return youtube_url.split("/")[-1].split("?")[0]
        
        # Handle regular YouTube URLs
        parsed_url = urlparse(youtube_url)
        if parsed_url.netloc in ["www.youtube.com", "youtube.com"]:
            query_params = parse_qs(parsed_url.query)
            if "v" in query_params:
                return query_params["v"][0]
        
        raise ValueError("Invalid YouTube URL format")
    
    async def _get_youtube_transcript(self, video_id: str) -> str:
        """
        Get transcript for a YouTube video
        """
        try:
            transcript_list = YouTubeTranscriptApi.get_transcript(video_id)
            
            # Format transcript as a string
            transcript_text = ""
            for entry in transcript_list:
                transcript_text += f"{entry['text']} "
            
            return transcript_text.strip()
        except Exception as e:
            raise Exception(f"Failed to get transcript: {str(e)}") 