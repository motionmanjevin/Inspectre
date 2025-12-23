import os
import logging
from typing import Optional
from gradio_client import Client, handle_file
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)

class VideoProcessor:
    def __init__(self, hf_space_url: Optional[str] = None, hf_token: Optional[str] = None):
        """
        Initialize video processor with Qwen3-VL API
        
        Args:
            hf_space_url: HuggingFace Space URL (e.g., "username/space-name")
                         If None, will try to use local gradio client or default space
            hf_token: HuggingFace API token for authentication (uses account quota)
        """
        self.hf_space_url = hf_space_url or os.getenv("QWEN3VL_SPACE_URL", "motionmanjevin/vidresp")
        self.client: Optional[Client] = None
        self.prompt = "what happened in this video, take note of how many different people there are , their features and what actions people are peforming"
        
        # Get token from parameter, environment variable, or HF_API_TOKEN
        token = hf_token or os.getenv("HF_API_TOKEN") or os.getenv("HF_TOKEN")
        
        # Initialize client with token to use account quota
        try:
            self.client = Client(self.hf_space_url, token=token)
            logger.info(f"Initialized Qwen3-VL client with space: {self.hf_space_url}")
        except Exception as e:
            logger.error(f"Failed to initialize Qwen3-VL client: {e}")
            raise
    
    def process_video(self, video_path: str) -> dict:
        """
        Process a single video clip through Qwen3-VL
        
        Args:
            video_path: Path to video file
            
        Returns:
            dict with keys: video_path, start_time, end_time, analysis, error
        """
        if not self.client:
            raise RuntimeError("Qwen3-VL client not initialized")
        
        if not os.path.exists(video_path):
            raise FileNotFoundError(f"Video file not found: {video_path}")
        
        start_time = datetime.now()
        
        try:
            logger.info(f"Processing video: {video_path}")
            
            # Use gradio_client to process video
            # file() function validates and handles file paths/URLs
            result = self.client.predict(
                video_file={"video": handle_file(video_path)},
                prompt=self.prompt,
                api_name="/predict"
            )
            
            end_time = datetime.now()
            
            # Extract analysis text from result
            analysis_text = str(result) if result else "No analysis generated"
            
            logger.info(f"Successfully processed video: {video_path}")
            
            return {
                "video_path": video_path,
                "start_time": start_time.isoformat(),
                "end_time": end_time.isoformat(),
                "analysis": analysis_text,
                "error": None
            }
            
        except Exception as e:
            end_time = datetime.now()
            error_msg = str(e)
            logger.error(f"Error processing video {video_path}: {error_msg}")
            
            return {
                "video_path": video_path,
                "start_time": start_time.isoformat(),
                "end_time": end_time.isoformat(),
                "analysis": None,
                "error": error_msg
            }
    
    def process_video_sync(self, video_path: str) -> dict:
        """
        Synchronous processing wrapper (same as process_video for now)
        """
        return self.process_video(video_path)
    
    def update_prompt(self, prompt: str):
        """Update the prompt used for video analysis"""
        self.prompt = prompt
        logger.info(f"Updated prompt to: {prompt}")

