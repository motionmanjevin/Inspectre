import React, { useState, useEffect, useCallback } from 'react';
import { cameraAPI, WebSocketManager } from './services/api';
import CameraStream from './components/CameraStream';
import QueryPanel from './components/QueryPanel';
import './index.css';

function App() {
  const [cameras, setCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const [rtspUrl, setRtspUrl] = useState('');
  const [rtspUsername, setRtspUsername] = useState('');
  const [rtspPassword, setRtspPassword] = useState('');
  const [useRtsp, setUseRtsp] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [motionDetected, setMotionDetected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [secondsProcessed, setSecondsProcessed] = useState(0);
  const [clipsProcessed, setClipsProcessed] = useState(0);
  const [motionThreshold, setMotionThreshold] = useState(5000);
  const [wsManager, setWsManager] = useState(null);
  const [error, setError] = useState(null);

  // Initialize cameras on mount
  useEffect(() => {
    loadCameras();
  }, []);

  // WebSocket connection
  useEffect(() => {
    const ws = new WebSocketManager();
    setWsManager(ws);
    ws.connect();

    // Set up event listeners
    ws.on('motion', (data) => {
      setMotionDetected(data.motion_detected || false);
    });

    ws.on('progress', (data) => {
      if (data.seconds_processed !== undefined) {
        setSecondsProcessed(data.seconds_processed);
      }
      if (data.clips_processed !== undefined) {
        setClipsProcessed(data.clips_processed);
      }
    });

    ws.on('clip_queued', (data) => {
      console.log('Clip queued for processing:', data.clip_path);
    });

    ws.on('processing_started', (data) => {
      console.log('Processing started:', data.clip_path);
    });

    ws.on('processing_complete', (data) => {
      console.log('Processing complete:', data.clip_path);
    });

    ws.on('processing_error', (data) => {
      console.error('Processing error:', data);
      setError(`Processing error: ${data.error}`);
    });

    return () => {
      ws.disconnect();
    };
  }, []);

  // Poll for status updates
  useEffect(() => {
    if (!isStreaming) return;

    const interval = setInterval(async () => {
      try {
        const status = await cameraAPI.getStatus();
        setIsStreaming(status.is_streaming);
        setMotionDetected(status.motion_detected);
        setIsRecording(status.is_recording);

        const progress = await cameraAPI.getProgress();
        setSecondsProcessed(progress.seconds_processed || 0);
        setClipsProcessed(progress.clips_processed || 0);
      } catch (err) {
        console.error('Error fetching status:', err);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isStreaming]);

  const loadCameras = async () => {
    try {
      const cameraList = await cameraAPI.getCameras();
      setCameras(cameraList);
      if (cameraList.length > 0 && !selectedCamera) {
        setSelectedCamera(cameraList[0].index.toString());
      }
    } catch (err) {
      setError('Failed to load cameras: ' + (err.response?.data?.detail || err.message));
      console.error('Error loading cameras:', err);
    }
  };

  const handleStartStream = async () => {
    if (!useRtsp && !selectedCamera) {
      setError('Please select a camera or enter an RTSP URL');
      return;
    }
    if (useRtsp && !rtspUrl.trim()) {
      setError('Please enter an RTSP URL');
      return;
    }

    try {
      setError(null);
      const cameraIndex = useRtsp ? null : parseInt(selectedCamera);
      let rtsp = null;
      
      if (useRtsp) {
        // Construct RTSP URL with credentials if provided
        const baseUrl = rtspUrl.trim();
        const username = rtspUsername.trim();
        const password = rtspPassword.trim();
        
        if (username || password) {
          // Check if URL already has credentials
          try {
            const url = new URL(baseUrl);
            // Replace or add credentials
            if (username) url.username = username;
            if (password) url.password = password;
            rtsp = url.toString();
          } catch (e) {
            // URL parsing failed, try manual construction
            if (baseUrl.startsWith('rtsp://')) {
              const withoutProtocol = baseUrl.replace('rtsp://', '');
              const atIndex = withoutProtocol.indexOf('@');
              
              if (atIndex !== -1) {
                // Already has credentials, replace them
                const afterAt = withoutProtocol.substring(atIndex + 1);
                rtsp = `rtsp://${username}:${password}@${afterAt}`;
              } else {
                // No existing credentials, add them
                rtsp = `rtsp://${username}:${password}@${withoutProtocol}`;
              }
            } else {
              rtsp = baseUrl; // Fallback
            }
          }
        } else {
          rtsp = baseUrl; // No credentials needed
        }
      }
      
      await cameraAPI.startStream(cameraIndex, motionThreshold, rtsp);
      setIsStreaming(true);
      
      // Load initial progress
      const progress = await cameraAPI.getProgress();
      setSecondsProcessed(progress.seconds_processed || 0);
      setClipsProcessed(progress.clips_processed || 0);
    } catch (err) {
      setError('Failed to start stream: ' + (err.response?.data?.detail || err.message));
      console.error('Error starting stream:', err);
    }
  };

  const handleStopStream = async () => {
    try {
      await cameraAPI.stopStream();
      setIsStreaming(false);
      setMotionDetected(false);
      setIsRecording(false);
    } catch (err) {
      setError('Failed to stop stream: ' + (err.response?.data?.detail || err.message));
      console.error('Error stopping stream:', err);
    }
  };

  return (
    <div className="app-container">
      <div className="header">
        <h1>Camera Motion Detection Video Analysis</h1>
        <p>Stream from camera, detect motion, and query video content</p>
      </div>

      {error && (
        <div className="error">
          {error}
          <button
            onClick={() => setError(null)}
            style={{ marginLeft: '10px', padding: '5px 10px', fontSize: '12px' }}
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="controls">
        <div className="control-group">
          <label style={{ marginBottom: '10px', display: 'block' }}>
            <input
              type="checkbox"
              checked={useRtsp}
              onChange={(e) => setUseRtsp(e.target.checked)}
              disabled={isStreaming}
              style={{ marginRight: '8px' }}
            />
            Use RTSP Stream
          </label>
          
          {useRtsp ? (
            <>
              <label htmlFor="rtsp-url">RTSP Stream URL</label>
              <input
                id="rtsp-url"
                type="text"
                value={rtspUrl}
                onChange={(e) => setRtspUrl(e.target.value)}
                placeholder="rtsp://ip:port/stream"
                disabled={isStreaming}
                style={{
                  width: '100%',
                  padding: '8px',
                  marginBottom: '10px',
                  fontSize: '14px',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
              />
              
              <label htmlFor="rtsp-username">Username (optional)</label>
              <input
                id="rtsp-username"
                type="text"
                value={rtspUsername}
                onChange={(e) => setRtspUsername(e.target.value)}
                placeholder="username"
                disabled={isStreaming}
                style={{
                  width: '100%',
                  padding: '8px',
                  marginBottom: '10px',
                  fontSize: '14px',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
              />
              
              <label htmlFor="rtsp-password">Password (optional)</label>
              <input
                id="rtsp-password"
                type="password"
                value={rtspPassword}
                onChange={(e) => setRtspPassword(e.target.value)}
                placeholder="password"
                disabled={isStreaming}
                style={{
                  width: '100%',
                  padding: '8px',
                  marginBottom: '5px',
                  fontSize: '14px',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
              />
              <small style={{ color: '#7f8c8d', display: 'block', marginBottom: '15px' }}>
                Enter RTSP URL without credentials, then add username/password if needed
              </small>
            </>
          ) : (
            <>
              <label htmlFor="camera-select">Select Camera</label>
              <select
                id="camera-select"
                value={selectedCamera}
                onChange={(e) => setSelectedCamera(e.target.value)}
                disabled={isStreaming}
              >
                <option value="">-- Select Camera --</option>
                {cameras.map((cam) => (
                  <option key={cam.index} value={cam.index}>
                    {cam.name} (Index: {cam.index})
                  </option>
                ))}
              </select>
            </>
          )}
          
          <label htmlFor="motion-threshold" style={{ marginTop: '15px' }}>
            Motion Threshold: {motionThreshold}
          </label>
          <input
            id="motion-threshold"
            type="range"
            min="1000"
            max="20000"
            step="500"
            value={motionThreshold}
            onChange={(e) => setMotionThreshold(parseInt(e.target.value))}
            disabled={isStreaming}
          />
          <small style={{ color: '#7f8c8d', display: 'block', marginTop: '5px' }}>
            Lower = more sensitive (default: 5000)
          </small>

          <div className="button-group">
            <button
              className="btn-primary"
              onClick={handleStartStream}
              disabled={isStreaming || (!useRtsp && !selectedCamera) || (useRtsp && !rtspUrl.trim())}
              title={useRtsp && !rtspUrl.trim() ? 'Please enter an RTSP URL' : ''}
            >
              Start Streaming
            </button>
            <button
              className="btn-danger"
              onClick={handleStopStream}
              disabled={!isStreaming}
            >
              Stop Streaming
            </button>
            <button
              className="btn-secondary"
              onClick={loadCameras}
            >
              Refresh Cameras
            </button>
          </div>
        </div>

        <div className="status-indicators">
          <div className="status-card">
            <h3>Stream Status</h3>
            <div className="value">
              <span className={`status-indicator ${isStreaming ? 'active' : 'inactive'}`}></span>
              {isStreaming ? 'Active' : 'Inactive'}
            </div>
          </div>

          <div className="status-card">
            <h3>Motion Detected</h3>
            <div className="value">
              <span className={`status-indicator ${motionDetected ? 'active' : 'inactive'}`}></span>
              {motionDetected ? 'Yes' : 'No'}
            </div>
          </div>

          <div className="status-card">
            <h3>Recording</h3>
            <div className="value">
              <span className={`status-indicator ${isRecording ? 'active' : 'inactive'}`}></span>
              {isRecording ? 'Recording' : 'Idle'}
            </div>
          </div>

          <div className="status-card">
            <h3>Seconds Processed</h3>
            <div className="value">{secondsProcessed}s</div>
          </div>

          <div className="status-card">
            <h3>Clips Processed</h3>
            <div className="value">{clipsProcessed}</div>
          </div>
        </div>
      </div>

      <CameraStream isStreaming={isStreaming} cameraIndex={selectedCamera} />

      <QueryPanel />
    </div>
  );
}

export default App;

