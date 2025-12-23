import React from 'react';

const CameraStream = ({ isStreaming, cameraIndex }) => {
  const streamUrl = `/api/stream/video?t=${Date.now()}`;

  return (
    <div className="video-container">
      {isStreaming ? (
        <img
          src={streamUrl}
          alt="Camera Stream"
          className="video-stream"
          onError={(e) => {
            console.error('Error loading video stream');
            e.target.style.display = 'none';
          }}
        />
      ) : (
        <div style={{
          padding: '100px',
          textAlign: 'center',
          color: '#7f8c8d',
          backgroundColor: '#2c3e50'
        }}>
          <p>Camera stream will appear here</p>
          <p style={{ fontSize: '14px', marginTop: '10px' }}>
            Select a camera and start streaming
          </p>
        </div>
      )}
    </div>
  );
};

export default CameraStream;

