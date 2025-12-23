from pydantic import BaseModel
from typing import Optional, List, Dict
from datetime import datetime

class CameraInfo(BaseModel):
    index: int
    name: str

class StreamStartRequest(BaseModel):
    camera_index: Optional[int] = None  # Camera device index (e.g., 0, 1, 2)
    rtsp_url: Optional[str] = None  # RTSP stream URL (e.g., "rtsp://user:pass@ip:port/stream")
    motion_threshold: Optional[int] = 5000  # Number of changed pixels for motion detection

class StreamStatus(BaseModel):
    is_streaming: bool
    camera_index: Optional[int] = None
    rtsp_url: Optional[str] = None
    motion_detected: bool = False
    is_recording: bool = False

class ProgressUpdate(BaseModel):
    type: str  # "progress", "motion", "recording", etc.
    seconds_processed: Optional[int] = None
    clips_processed: Optional[int] = None
    motion_detected: Optional[bool] = None
    is_recording: Optional[bool] = None
    current_clip: Optional[str] = None

class QueryRequest(BaseModel):
    query: str
    top_k: Optional[int] = 5  # Number of relevant results to retrieve

class QueryResponse(BaseModel):
    answer: str
    timestamps: List[Dict[str, str]]  # [{"start": "0s", "end": "32s", "video_path": "..."}]
    relevant_clips: List[Dict[str, str]]

class VideoAnalysis(BaseModel):
    video_path: str
    start_time: datetime
    end_time: datetime
    clip_index: int
    analysis: str

