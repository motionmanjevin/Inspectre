import os
import asyncio
import logging
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from pathlib import Path
from contextlib import asynccontextmanager
import threading
import time
from typing import List, Any, Optional

from models import (
    CameraInfo, StreamStartRequest, StreamStatus, ProgressUpdate,
    QueryRequest, QueryResponse
)
from camera_service import CameraService
from video_processor import VideoProcessor
from storage_service import StorageService
from llm_service import LLMService

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Global services
camera_service: CameraService = None
video_processor: VideoProcessor = None
storage_service: StorageService = None
llm_service: LLMService = None

# WebSocket connections
active_connections: List[WebSocket] = []
# Store the event loop for thread-safe WebSocket broadcasting
event_loop: Optional[asyncio.AbstractEventLoop] = None

# Processing queue and state
processing_queue = []
is_processing = False
processed_clips_count = 0
processed_seconds = 0

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize and cleanup services"""
    global camera_service, video_processor, storage_service, llm_service, event_loop
    
    # Store the event loop for thread-safe WebSocket broadcasting
    event_loop = asyncio.get_running_loop()
    
    # Initialize services
    logger.info("Initializing services...")
    camera_service = CameraService()
    
    try:
        video_processor = VideoProcessor()
    except Exception as e:
        logger.warning(f"Failed to initialize video processor: {e}")
        logger.warning("Video processing will be disabled until Qwen3-VL is available")
        video_processor = None
    
    storage_service = StorageService()
    
    try:
        llm_service = LLMService()
    except Exception as e:
        logger.warning(f"Failed to initialize LLM service: {e}")
        logger.warning("Query functionality will be disabled until HF API token is set")
        llm_service = None
    
    logger.info("Services initialized")
    
    # Start background processing thread
    processing_thread = threading.Thread(target=process_video_queue, daemon=True)
    processing_thread.start()
    
    yield
    
    # Cleanup
    logger.info("Shutting down...")
    if camera_service:
        camera_service.stop_stream()

app = FastAPI(title="Camera Motion Detection Video Analysis", lifespan=lifespan)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify allowed origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def broadcast_update(update: dict):
    """Broadcast update to all WebSocket connections (called from background threads)"""
    global event_loop
    
    if not active_connections:
        return
    
    if event_loop is None:
        logger.warning("Event loop not available for WebSocket broadcast")
        return
    
    disconnected = []
    # Schedule coroutines to run in the event loop from background threads
    for connection in active_connections:
        try:
            # Use run_coroutine_threadsafe to safely call async function from sync context
            future = asyncio.run_coroutine_threadsafe(connection.send_json(update), event_loop)
            # Optionally check for exceptions (don't wait, just check if done)
            if future.done() and future.exception():
                raise future.exception()
        except Exception as e:
            logger.warning(f"Error broadcasting to WebSocket: {e}")
            disconnected.append(connection)
    
    # Remove disconnected connections
    for conn in disconnected:
        if conn in active_connections:
            active_connections.remove(conn)

def on_motion_detected(detected: bool):
    """Callback when motion is detected"""
    broadcast_update({
        "type": "motion",
        "motion_detected": detected
    })

def on_progress_update(event_type: str, data: Any = None):
    """Callback for progress updates"""
    global processed_clips_count, processed_seconds
    
    if event_type == "clip_ready":
        # Add clip to processing queue
        processing_queue.append(data)
        logger.info(f"Added clip to processing queue: {data}")
        broadcast_update({
            "type": "clip_queued",
            "clip_path": data
        })
    elif event_type == "clip_processed":
        processed_clips_count += 1
        processed_seconds += 16  # Each clip is 16 seconds
        broadcast_update({
            "type": "progress",
            "seconds_processed": processed_seconds,
            "clips_processed": processed_clips_count
        })

def process_video_queue():
    """Background thread to process video clips synchronously"""
    global is_processing, processed_clips_count, processed_seconds
    
    while True:
        if processing_queue and video_processor and not is_processing:
            is_processing = True
            clip_path = processing_queue.pop(0)
            
            try:
                logger.info(f"Processing clip: {clip_path}")
                broadcast_update({
                    "type": "processing_started",
                    "clip_path": clip_path
                })
                
                # Process video through Qwen3-VL
                result = video_processor.process_video_sync(clip_path)
                
                if result.get("error"):
                    logger.error(f"Error processing clip: {result['error']}")
                    broadcast_update({
                        "type": "processing_error",
                        "clip_path": clip_path,
                        "error": result["error"]
                    })
                else:
                    # Store in ChromaDB
                    try:
                        clip_index = len(storage_service.get_all_analyses())
                        storage_service.store_analysis(
                            video_path=result["video_path"],
                            start_time=result["start_time"],
                            end_time=result["end_time"],
                            analysis=result["analysis"],
                            clip_index=clip_index
                        )
                        
                        on_progress_update("clip_processed")
                        logger.info(f"Successfully processed and stored clip: {clip_path}")
                        
                        broadcast_update({
                            "type": "processing_complete",
                            "clip_path": clip_path
                        })
                    except Exception as e:
                        logger.error(f"Error storing analysis: {e}")
            
            except Exception as e:
                logger.error(f"Error in video processing: {e}")
                broadcast_update({
                    "type": "processing_error",
                    "clip_path": clip_path,
                    "error": str(e)
                })
            
            finally:
                is_processing = False
        
        time.sleep(1)  # Check queue every second

@app.get("/")
async def root():
    return {"message": "Camera Motion Detection Video Analysis API"}

@app.get("/api/cameras", response_model=List[CameraInfo])
async def list_cameras():
    """Get list of available cameras"""
    if not camera_service:
        raise HTTPException(status_code=503, detail="Camera service not initialized")
    
    cameras = camera_service.list_cameras()
    return [CameraInfo(**cam) for cam in cameras]

@app.post("/api/stream/start")
async def start_stream(request: StreamStartRequest):
    """Start camera stream or RTSP stream with motion detection"""
    if not camera_service:
        raise HTTPException(status_code=503, detail="Camera service not initialized")
    
    if request.camera_index is None and request.rtsp_url is None:
        raise HTTPException(status_code=400, detail="Either camera_index or rtsp_url must be provided")
    
    try:
        camera_service.start_stream(
            camera_index=request.camera_index,
            rtsp_url=request.rtsp_url,
            motion_threshold=request.motion_threshold,
            motion_callback=on_motion_detected,
            progress_callback=on_progress_update
        )
        
        response = {"status": "started"}
        if request.camera_index is not None:
            response["camera_index"] = request.camera_index
        if request.rtsp_url is not None:
            response["rtsp_url"] = request.rtsp_url
        return response
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/stream/stop")
async def stop_stream():
    """Stop camera stream"""
    if not camera_service:
        raise HTTPException(status_code=503, detail="Camera service not initialized")
    
    camera_service.stop_stream()
    return {"status": "stopped"}

@app.get("/api/stream/status", response_model=StreamStatus)
async def get_stream_status():
    """Get current stream status"""
    if not camera_service:
        raise HTTPException(status_code=503, detail="Camera service not initialized")
    
    status = camera_service.get_status()
    return StreamStatus(**status)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time updates"""
    await websocket.accept()
    active_connections.append(websocket)
    
    try:
        while True:
            # Keep connection alive and handle any client messages
            data = await websocket.receive_text()
            # Echo back or handle commands if needed
            await websocket.send_json({"type": "ping", "message": "pong"})
    except WebSocketDisconnect:
        if websocket in active_connections:
            active_connections.remove(websocket)

@app.get("/api/progress")
async def get_progress():
    """Get processing progress"""
    return {
        "seconds_processed": processed_seconds,
        "clips_processed": processed_clips_count,
        "queue_length": len(processing_queue),
        "is_processing": is_processing
    }

@app.get("/api/video/{video_filename:path}")
async def get_video(video_filename: str):
    """Serve video files"""
    import os
    # Security: Only allow files from recordings directory
    # Use the camera service's recordings directory if available, otherwise check common locations
    base_dir = None
    if camera_service:
        base_dir = camera_service.recordings_dir
        if not base_dir.exists():
            base_dir = None
    
    # Fallback to checking common locations
    if not base_dir:
        possible_paths = [
            Path("backend/backend/recordings").resolve(),  # Correct location (when running from backend/)
            Path("backend/backend/backend/recordings").resolve(),
            Path("backend/recordings").resolve(),
            Path("recordings").resolve(),
        ]
        for path in possible_paths:
            if path.exists():
                base_dir = path
                break
    
    if not base_dir:
        raise HTTPException(status_code=404, detail="Recordings directory not found")
    
    # Clean the filename to prevent directory traversal
    video_filename = os.path.basename(video_filename)
    video_path = base_dir / video_filename
    
    # Final security check
    video_path = video_path.resolve()
    if not str(video_path).startswith(str(base_dir.resolve())):
        raise HTTPException(status_code=403, detail="Access denied")
    
    if not video_path.exists():
        logger.error(f"Video file not found: {video_path}")
        raise HTTPException(status_code=404, detail=f"Video not found: {video_filename}")
    
    # Log video serving for debugging
    logger.info(f"Serving video file: {video_path} (size: {video_path.stat().st_size} bytes)")
    
    # Determine content type based on file extension
    content_type = "video/mp4"
    if video_filename.lower().endswith('.avi'):
        content_type = "video/x-msvideo"
    elif video_filename.lower().endswith('.mov'):
        content_type = "video/quicktime"
    elif video_filename.lower().endswith('.webm'):
        content_type = "video/webm"
    
    return FileResponse(
        path=str(video_path),
        media_type=content_type,
        filename=video_filename,
        headers={
            "Accept-Ranges": "bytes",
            "Content-Disposition": f'inline; filename="{video_filename}"'
        }
    )

@app.post("/api/clear-database")
async def clear_database():
    """Clear all video analyses from ChromaDB"""
    if not storage_service:
        raise HTTPException(status_code=503, detail="Storage service not initialized")
    
    try:
        storage_service.clear_all()
        logger.info("Database cleared by user")
        
        # Also clear processing stats
        global processed_clips_count, processed_seconds
        processed_clips_count = 0
        processed_seconds = 0
        
        return {"status": "success", "message": "Database cleared successfully"}
    except Exception as e:
        logger.error(f"Error clearing database: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to clear database: {str(e)}")

@app.post("/api/query", response_model=QueryResponse)
async def query_videos(request: QueryRequest):
    """Query video analyses using natural language"""
    if not storage_service:
        raise HTTPException(status_code=503, detail="Storage service not initialized")
    
    if not llm_service:
        raise HTTPException(status_code=503, detail="LLM service not initialized. Set HF_API_TOKEN environment variable.")
    
    # Search ChromaDB for relevant analyses
    relevant_contexts = storage_service.search_analyses(
        query=request.query,
        top_k=request.top_k or 5
    )
    
    if not relevant_contexts:
        return QueryResponse(
            answer="No relevant video content found to answer your query.",
            timestamps=[],
            relevant_clips=[]
        )
    
    # Generate answer using LLM (limit to top_k clips)
    result = llm_service.generate_answer(
        request.query, 
        relevant_contexts,
        max_clips=request.top_k or 5
    )
    
    return QueryResponse(
        answer=result["answer"],
        timestamps=result["timestamps"],
        relevant_clips=result["relevant_clips"]
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

