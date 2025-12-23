import cv2
import threading
import time
import os
from datetime import datetime
from pathlib import Path
from typing import Optional, Callable
import numpy as np
from queue import Queue
import logging

logger = logging.getLogger(__name__)

class CameraService:
    def __init__(self, recordings_dir: str = "backend/backend/recordings"):
        # Resolve to absolute path to avoid issues with working directory
        # If running from backend/ directory, "backend/backend/recordings" resolves to:
        # C:\Users\xserv\Documents\CustomAPI\backend\backend\backend\recordings
        self.recordings_dir = Path(recordings_dir).resolve()
        self.recordings_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"Recordings directory set to: {self.recordings_dir}")
        
        self.cap: Optional[cv2.VideoCapture] = None
        self.is_streaming = False
        self.is_recording = False
        self.motion_detected = False
        self.current_camera_index: Optional[int] = None
        self.current_rtsp_url: Optional[str] = None
        self.motion_threshold = 5000
        
        self.stream_thread: Optional[threading.Thread] = None
        self.recording_thread: Optional[threading.Thread] = None
        self.motion_thread: Optional[threading.Thread] = None
        
        self.frame_queue = Queue(maxsize=10)
        self.motion_callback: Optional[Callable] = None
        self.progress_callback: Optional[Callable] = None
        
        self.recording_writer: Optional[cv2.VideoWriter] = None
        self.recording_start_time: Optional[float] = None
        self.recording_duration = 16.0  # Maximum recording duration (16 seconds), but can stop earlier if motion stops
        self.current_recording_path: Optional[str] = None
        
        self.last_frame: Optional[np.ndarray] = None
        self.processed_clips = []
        
    def list_cameras(self) -> list:
        """List available cameras"""
        cameras = []
        # Try first 10 camera indices
        for i in range(10):
            cap = cv2.VideoCapture(i)
            if cap.isOpened():
                ret, _ = cap.read()
                if ret:
                    cameras.append({
                        "index": i,
                        "name": f"Camera {i}"
                    })
                cap.release()
        return cameras
    
    def start_stream(self, camera_index: Optional[int] = None, rtsp_url: Optional[str] = None, 
                    motion_threshold: int = 5000, 
                    motion_callback: Optional[Callable] = None,
                    progress_callback: Optional[Callable] = None):
        """Start streaming from camera or RTSP URL with motion detection"""
        if self.is_streaming:
            self.stop_stream()
        
        if camera_index is None and rtsp_url is None:
            raise ValueError("Either camera_index or rtsp_url must be provided")
        if camera_index is not None and rtsp_url is not None:
            raise ValueError("Cannot specify both camera_index and rtsp_url. Choose one.")
        
        self.current_camera_index = camera_index
        self.current_rtsp_url = rtsp_url
        self.motion_threshold = motion_threshold
        self.motion_callback = motion_callback
        self.progress_callback = progress_callback
        
        # Open video source (camera index or RTSP URL)
        if rtsp_url:
            # Open RTSP stream (OpenCV will use available backend - FFMPEG, GStreamer, etc.)
            try:
                self.cap = cv2.VideoCapture(rtsp_url)
            except Exception as e:
                raise ValueError(f"Error creating VideoCapture for RTSP stream: {str(e)}")
            
            if not self.cap.isOpened():
                raise ValueError(f"Failed to open RTSP stream: {rtsp_url}. Check URL format (e.g., rtsp://user:pass@ip:port/stream) and network connectivity.")
            
            # Set buffer size to reduce latency (before trying to read)
            try:
                self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            except:
                pass  # Some backends may not support this property
            
            # Try to read a frame to verify the connection actually works
            # RTSP streams can take a moment to connect, so we retry a few times
            retries = 5
            frame_read = False
            last_error = None
            for i in range(retries):
                try:
                    ret, frame = self.cap.read()
                    if ret and frame is not None and frame.size > 0:
                        frame_read = True
                        logger.info(f"Successfully read frame from RTSP stream on attempt {i+1}")
                        break
                    time.sleep(0.5)  # Wait 0.5 seconds between retries
                except Exception as e:
                    last_error = str(e)
                    logger.warning(f"Error reading frame on attempt {i+1}: {e}")
                    time.sleep(0.5)
            
            if not frame_read:
                self.cap.release()
                self.cap = None
                error_msg = f"Failed to read frames from RTSP stream: {rtsp_url}"
                if last_error:
                    error_msg += f". Error: {last_error}"
                error_msg += ". The stream may be unavailable, incorrect, require authentication, or your OpenCV installation may not support RTSP streams."
                raise ValueError(error_msg)
            
            logger.info(f"Opened and verified RTSP stream: {rtsp_url}")
        else:
            self.cap = cv2.VideoCapture(camera_index)
            if not self.cap.isOpened():
                raise ValueError(f"Failed to open camera {camera_index}")
            # Set camera properties (only for local cameras, not RTSP)
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            self.cap.set(cv2.CAP_PROP_FPS, 30)
            logger.info(f"Opened camera index: {camera_index}")
        
        # For RTSP streams, set buffer size to reduce latency
        if rtsp_url:
            self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        
        self.is_streaming = True
        
        # Start streaming thread
        self.stream_thread = threading.Thread(target=self._stream_loop, daemon=True)
        self.stream_thread.start()
        
        # Start motion detection thread
        self.motion_thread = threading.Thread(target=self._motion_detection_loop, daemon=True)
        self.motion_thread.start()
        
        source_info = f"RTSP: {rtsp_url}" if rtsp_url else f"Camera {camera_index}"
        logger.info(f"Started streaming from {source_info}")
    
    def stop_stream(self):
        """Stop streaming and recording"""
        self.is_streaming = False
        self.is_recording = False
        
        if self.recording_writer is not None:
            self.recording_writer.release()
            self.recording_writer = None
        
        if self.cap is not None:
            self.cap.release()
            self.cap = None
        
        # Wait for threads to finish
        if self.stream_thread and self.stream_thread.is_alive():
            self.stream_thread.join(timeout=2.0)
        if self.motion_thread and self.motion_thread.is_alive():
            self.motion_thread.join(timeout=2.0)
        if self.recording_thread and self.recording_thread.is_alive():
            self.recording_thread.join(timeout=2.0)
        
        logger.info("Stopped streaming")
    
    def _stream_loop(self):
        """Main streaming loop"""
        consecutive_errors = 0
        max_consecutive_errors = 10
        
        while self.is_streaming and self.cap is not None:
            try:
                ret, frame = self.cap.read()
                if ret and frame is not None:
                    consecutive_errors = 0  # Reset error counter on success
                    # Put frame in queue (drop if full)
                    if not self.frame_queue.full():
                        self.frame_queue.put(frame.copy())
                    
                    # If recording, write frame
                    if self.is_recording and self.recording_writer is not None:
                        try:
                            self.recording_writer.write(frame)
                        except Exception as e:
                            logger.error(f"Error writing frame to video: {e}")
                            # Stop recording if we can't write frames
                            self.is_recording = False
                            if self.recording_writer is not None:
                                self.recording_writer.release()
                                self.recording_writer = None
                else:
                    consecutive_errors += 1
                    if consecutive_errors >= max_consecutive_errors:
                        logger.error(f"Failed to read {consecutive_errors} consecutive frames. Stream may be broken.")
                        break
                    time.sleep(0.1)
            except cv2.error as e:
                logger.error(f"OpenCV error in stream loop: {e}")
                consecutive_errors += 1
                if consecutive_errors >= max_consecutive_errors:
                    logger.error("Too many OpenCV errors. Stopping stream loop.")
                    break
                time.sleep(0.5)  # Wait longer after OpenCV errors
            except Exception as e:
                logger.error(f"Unexpected error in stream loop: {e}")
                consecutive_errors += 1
                if consecutive_errors >= max_consecutive_errors:
                    logger.error("Too many errors. Stopping stream loop.")
                    break
                time.sleep(0.5)
        
        # Clean up if loop exits due to errors
        if self.is_streaming:
            logger.warning("Stream loop exited unexpectedly. Cleaning up.")
            self.is_streaming = False
    
    def _motion_detection_loop(self):
        """Motion detection loop using frame differencing"""
        while self.is_streaming:
            if self.frame_queue.empty():
                time.sleep(0.05)
                continue
            
            current_frame = self.frame_queue.get()
            
            if self.last_frame is None:
                self.last_frame = cv2.cvtColor(current_frame, cv2.COLOR_BGR2GRAY)
                continue
            
            # Convert to grayscale
            gray_current = cv2.cvtColor(current_frame, cv2.COLOR_BGR2GRAY)
            
            # Calculate frame difference
            frame_diff = cv2.absdiff(self.last_frame, gray_current)
            
            # Apply threshold
            _, thresh = cv2.threshold(frame_diff, 30, 255, cv2.THRESH_BINARY)
            
            # Count non-zero pixels
            motion_pixels = cv2.countNonZero(thresh)
            
            # Check if motion detected
            motion_detected = motion_pixels > self.motion_threshold
            
            # Update motion state and notify callback
            if motion_detected != self.motion_detected:
                self.motion_detected = motion_detected
                if self.motion_callback:
                    self.motion_callback(motion_detected)
            
            # Start recording when motion is detected and not already recording
            if motion_detected and not self.is_recording:
                logger.info(f"Motion detected - starting recording. Motion pixels: {motion_pixels}")
                self._start_recording()
            
            # Stop recording immediately when motion stops (don't wait for timer)
            if not motion_detected and self.is_recording:
                logger.info("Motion stopped - stopping recording early")
                self._stop_recording()
            
            # Update last frame
            self.last_frame = gray_current
    
    def _start_recording(self):
        """Start recording a 16-second clip"""
        if self.is_recording:
            return
        
        self.is_recording = True
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.current_recording_path = str(self.recordings_dir / f"clip_{timestamp}.mp4")
        
        # Get frame dimensions
        ret, frame = self.cap.read()
        if not ret:
            self.is_recording = False
            return
        
        height, width = frame.shape[:2]
        fps = int(self.cap.get(cv2.CAP_PROP_FPS)) or 30
        
        # Initialize video writer
        # Try H.264 codec first (better browser support), fallback to mp4v
        fourcc = cv2.VideoWriter_fourcc(*'H264')
        self.recording_writer = cv2.VideoWriter(
            self.current_recording_path,
            fourcc,
            fps,
            (width, height)
        )
        
        # If H.264 fails, try mp4v
        if not self.recording_writer.isOpened():
            logger.warning("H.264 codec not available, trying mp4v")
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            self.recording_writer = cv2.VideoWriter(
                self.current_recording_path,
                fourcc,
                fps,
                (width, height)
            )
        
        if not self.recording_writer.isOpened():
            logger.error(f"Failed to open video writer with codec")
            self.is_recording = False
            return
        
        self.recording_start_time = time.time()
        
        # Verify the directory exists and is writable
        if not self.recordings_dir.exists():
            logger.error(f"Recordings directory does not exist: {self.recordings_dir}")
            self.is_recording = False
            return
        
        # Start recording thread
        self.recording_thread = threading.Thread(target=self._recording_timer, daemon=True)
        self.recording_thread.start()
        
        logger.info(f"Started recording to: {self.current_recording_path}")
        logger.info(f"Recordings directory: {self.recordings_dir}")
    
    def _recording_timer(self):
        """Timer for maximum recording duration (stops after 16 seconds if motion is still present)"""
        while self.is_recording and (time.time() - self.recording_start_time) < self.recording_duration:
            time.sleep(0.5)
        
        # Only stop if still recording (motion might have stopped earlier, which would have stopped recording)
        if self.is_recording:
            logger.info("Maximum recording duration reached - stopping recording")
            self._stop_recording()
    
    def _stop_recording(self):
        """Stop recording and save clip"""
        if not self.is_recording:
            return
        
        self.is_recording = False
        
        if self.recording_writer is not None:
            self.recording_writer.release()
            self.recording_writer = None
        
        if self.current_recording_path:
            # Give the file system a moment to finish writing
            time.sleep(0.5)
            
            # Verify file was actually created and has content
            video_path = Path(self.current_recording_path)
            
            # Wait a bit more if file doesn't exist yet (up to 2 seconds)
            retries = 4
            while retries > 0 and not video_path.exists():
                time.sleep(0.5)
                retries -= 1
            
            if video_path.exists():
                file_size = video_path.stat().st_size
                if file_size > 0:
                    self.processed_clips.append(self.current_recording_path)
                    logger.info(f"Stopped recording: {self.current_recording_path} (size: {file_size} bytes)")
                    
                    # Notify that a new clip is ready for processing
                    if self.progress_callback:
                        self.progress_callback("clip_ready", self.current_recording_path)
                else:
                    logger.warning(f"Recording file exists but is empty: {self.current_recording_path}")
                    # Try to delete empty file
                    try:
                        video_path.unlink()
                    except:
                        pass
            else:
                logger.error(f"Recording file was not created: {self.current_recording_path}")
                logger.error(f"Expected directory: {self.recordings_dir}")
                logger.error(f"Directory exists: {self.recordings_dir.exists()}")
                logger.error(f"Directory is writable: {os.access(self.recordings_dir, os.W_OK) if self.recordings_dir.exists() else False}")
                if self.recordings_dir.exists():
                    try:
                        contents = list(self.recordings_dir.iterdir())
                        logger.error(f"Directory contents ({len(contents)} items): {[str(c.name) for c in contents[:5]]}")
                    except Exception as e:
                        logger.error(f"Error listing directory contents: {e}")
        
        self.current_recording_path = None
        self.recording_start_time = None
    
    def get_latest_frame(self) -> Optional[bytes]:
        """Get latest frame as JPEG for MJPEG stream"""
        if self.frame_queue.empty():
            return None
        
        # Get frame from queue
        frame = self.frame_queue.get()
        
        # Encode as JPEG
        ret, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        if ret:
            return buffer.tobytes()
        return None
    
    def get_status(self) -> dict:
        """Get current status"""
        return {
            "is_streaming": self.is_streaming,
            "camera_index": self.current_camera_index,
            "rtsp_url": self.current_rtsp_url,
            "motion_detected": self.motion_detected,
            "is_recording": self.is_recording,
            "current_recording": self.current_recording_path
        }
    
    def get_pending_clips(self) -> list:
        """Get list of clips ready for processing"""
        return self.processed_clips.copy()

