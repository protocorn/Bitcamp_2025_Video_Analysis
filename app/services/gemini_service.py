import os
import google.generativeai as genai
from typing import Optional

class GeminiService:
    def __init__(self):
        # Initialize the Gemini API with API key
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY environment variable is not set")
        
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel(model_name="gemini-2.0-flash")  # Using Gemini Pro model
    
    async def generate_answer(self, question: str, transcript: str) -> str:
        """
        Generate an answer to a question based on the video transcript using Gemini
        """
        try:
            # Construct a prompt for Gemini that includes both the transcript and the question
            prompt = f"""
            Based on the following transcript from a YouTube video, please answer the question.
            
            TRANSCRIPT:
            {transcript}
            
            QUESTION:
            {question}
            
            Please provide a concise, accurate answer based solely on the information in the transcript.
            """
            
            # Generate response from Gemini
            response = self.model.generate_content(prompt)
            
            if not response or not hasattr(response, 'text'):
                return "Sorry, I couldn't generate an answer at this time."
            
            return response.text
        except Exception as e:
            raise Exception(f"Failed to generate answer: {str(e)}") 