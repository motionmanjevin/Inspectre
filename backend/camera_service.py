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
        self.recording_duration = 16.0  # 16 seconds
        self.current_recording_path: Optional[str] = None
        self.recording_lock = threading.Lock()  # Lock to prevent race conditions
        
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
        logger.info("Stopping stream...")
        self.is_streaming = False
        
        # Stop any active recording properly
        if self.is_recording:
            try:
                self._stop_recording()
            except Exception as e:
                logger.error(f"Error stopping recording during stream stop: {e}")
                # Force cleanup if _stop_recording fails
                with self.recording_lock:
                    self.is_recording = False
                if self.recording_writer is not None:
                    try:
                        self.recording_writer.release()
                    except:
                        pass
                    self.recording_writer = None
        
        # Release camera
        if self.cap is not None:
            try:
                self.cap.release()
            except Exception as e:
                logger.error(f"Error releasing camera: {e}")
            self.cap = None
        
        # Wait for threads to finish
        if self.stream_thread and self.stream_thread.is_alive():
            self.stream_thread.join(timeout=2.0)
        if self.motion_thread and self.motion_thread.is_alive():
            self.motion_thread.join(timeout=2.0)
        if hasattr(self, 'recording_thread') and self.recording_thread and self.recording_thread.is_alive():
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
                        except (cv2.error, Exception) as e:
                            error_msg = str(e)
                            # Check if it's the FFmpeg threading assertion error
                            if "async_lock" in error_msg or "Assertion" in error_msg:
                                logger.error(f"FFmpeg threading error (async_lock assertion): {error_msg}")
                                logger.warning("This is usually caused by race conditions - stopping current recording")
                            else:
                                logger.error(f"Error writing frame to video: {e}")
                            
                            # Stop recording if we can't write frames
                            try:
                                if self.recording_writer is not None:
                                    self.recording_writer.release()
                            except:
                                pass
                            finally:
                                self.recording_writer = None
                            
                            with self.recording_lock:
                                self.is_recording = False
                            
                            logger.info("Recording stopped due to write error - will attempt to restart on next motion")
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
            # Stop any active recording
            if self.is_recording:
                try:
                    self._stop_recording()
                except Exception as e:
                    logger.error(f"Error stopping recording during cleanup: {e}")
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
            
            if motion_detected != self.motion_detected:
                self.motion_detected = motion_detected
                if self.motion_callback:
                    self.motion_callback(motion_detected)
            
            # If motion detected and not recording, start recording
            if motion_detected and not self.is_recording:
                self._start_recording()
            
            # Update last frame
            self.last_frame = gray_current
    
    def _start_recording(self):
        """Start recording a 16-second clip"""
        with self.recording_lock:
            if self.is_recording:
                return
            
            # Wait for any previous recording thread to finish
            if hasattr(self, 'recording_thread') and self.recording_thread is not None:
                if self.recording_thread.is_alive():
                    logger.debug("Waiting for previous recording thread to finish...")
                    self.recording_thread.join(timeout=1.0)
            
            self.is_recording = True
        
        # Release lock before file operations
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.current_recording_path = str(self.recordings_dir / f"clip_{timestamp}.avi")
        
        # Get frame dimensions
        ret, frame = self.cap.read()
        if not ret:
            with self.recording_lock:
                self.is_recording = False
            return
        
        height, width = frame.shape[:2]
        fps = int(self.cap.get(cv2.CAP_PROP_FPS)) or 30
        
        # Initialize video writer - use AVI format with XVID codec (skip H.264 to avoid errors)
        fourcc = cv2.VideoWriter_fourcc(*'XVID')
        successful_codec = 'XVID'
        self.recording_writer = cv2.VideoWriter(
            self.current_recording_path,
            fourcc,
            fps,
            (width, height)
        )
        
        # If XVID fails, try MJPG as fallback (works with AVI)
        if not self.recording_writer.isOpened():
            logger.warning("XVID codec failed, trying MJPG")
            fourcc = cv2.VideoWriter_fourcc(*'MJPG')
            successful_codec = 'MJPG'
            self.recording_writer = cv2.VideoWriter(
                self.current_recording_path,
                fourcc,
                fps,
                (width, height)
            )
        
        # Verify writer is working
        if not self.recording_writer.isOpened():
            logger.error("Failed to open video writer with XVID or MJPG codec")
            logger.error("Recording aborted - no valid video codec available")
            with self.recording_lock:
                self.is_recording = False
            self.current_recording_path = None
            self.recording_start_time = None
            return
        
        logger.info(f"Video writer initialized successfully (format: AVI, codec: {successful_codec})")
        
        with self.recording_lock:
            self.recording_start_time = time.time()
        
        # Verify the directory exists and is writable
        if not self.recordings_dir.exists():
            logger.error(f"Recordings directory does not exist: {self.recordings_dir}")
            with self.recording_lock:
                self.is_recording = False
            return
        
        # Start recording thread
        self.recording_thread = threading.Thread(target=self._recording_timer, daemon=True)
        self.recording_thread.start()
        
        logger.info(f"Started recording to: {self.current_recording_path}")
    
    def _recording_timer(self):
        """Timer for 16-second recording duration"""
        while self.is_recording and (time.time() - self.recording_start_time) < self.recording_duration:
            time.sleep(0.5)
        
        if self.is_recording:
            self._stop_recording()
            # Small delay to allow file system and FFmpeg to fully release resources
            time.sleep(0.2)
    
    def _stop_recording(self):
        """Stop recording and save clip"""
        with self.recording_lock:
            if not self.is_recording:
                return
            
            saved_path = self.current_recording_path
            self.is_recording = False  # Stop accepting new frames immediately
        
        # Release lock before file operations
        
        if self.recording_writer is not None:
            try:
                self.recording_writer.release()
            except Exception as e:
                logger.error(f"Error releasing video writer: {e}")
            self.recording_writer = None
        
        if saved_path:
            # Give AVI files more time to finalize (they take longer than MP4)
            time.sleep(1.0)  # Increased from 0.5 to 1.0 seconds
            
            video_path = Path(saved_path)
            
            # Wait for file to exist and check size multiple times
            # AVI files can take time to be fully written
            max_retries = 10
            retries = 0
            file_size = 0
            
            while retries < max_retries:
                if video_path.exists():
                    try:
                        file_size = video_path.stat().st_size
                        # AVI files should be at least a few KB (header + some frames)
                        # Check for reasonable minimum size (at least 1KB instead of just > 0)
                        if file_size > 1024:  # Changed from > 0 to > 1024 bytes (1KB)
                            break
                    except Exception as e:
                        logger.warning(f"Error checking file size (attempt {retries+1}): {e}")
                retries += 1
                time.sleep(0.3)  # Wait 0.3 seconds between checks
            
            if video_path.exists() and file_size > 1024:
                self.processed_clips.append(saved_path)
                logger.info(f"Stopped recording: {saved_path} (size: {file_size} bytes)")
                
                # Notify that a new clip is ready for processing
                if self.progress_callback:
                    try:
                        self.progress_callback("clip_ready", saved_path)
                        logger.info(f"Callback triggered for clip: {saved_path}")
                    except Exception as e:
                        logger.error(f"Error calling progress callback: {e}")
            else:
                if video_path.exists():
                    logger.warning(f"Recording file too small ({file_size} bytes), deleting: {saved_path}")
                else:
                    logger.error(f"Recording file not found after {max_retries} retries: {saved_path}")
                
                # Try to delete empty/invalid file
                try:
                    if video_path.exists():
                        video_path.unlink()
                except Exception as e:
                    logger.warning(f"Could not delete invalid file: {e}")
        
        # Clear state with lock
        with self.recording_lock:
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

