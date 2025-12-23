import React, { useState, useEffect, useRef } from 'react';
import { cameraAPI } from '../services/api';

const QueryPanel = () => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [clearing, setClearing] = useState(false);
  const videoRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!query.trim()) {
      setError('Please enter a query');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await cameraAPI.query(query);
      setResult(response);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to process query');
      console.error('Query error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClearDatabase = async () => {
    if (!window.confirm('Are you sure you want to clear the database? This will delete all stored video analyses and cannot be undone.')) {
      return;
    }

    setClearing(true);
    setError(null);
    
    try {
      await cameraAPI.clearDatabase();
      setResult(null);
      alert('Database cleared successfully!');
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to clear database');
      console.error('Clear database error:', err);
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="query-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0 }}>Query Video Content</h2>
        <button
          className="btn-danger"
          onClick={handleClearDatabase}
          disabled={clearing}
          style={{ padding: '8px 16px', fontSize: '14px' }}
        >
          {clearing ? 'Clearing...' : 'Clear Database'}
        </button>
      </div>
      <form onSubmit={handleSubmit}>
        <textarea
          className="query-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask about events, actions, or activities in the recorded videos..."
          disabled={loading}
        />
        <button
          type="submit"
          className="btn-primary"
          disabled={loading || !query.trim()}
        >
          {loading ? 'Searching...' : 'Search Videos'}
        </button>
      </form>

      {error && (
        <div className="error">
          {error}
        </div>
      )}

      {loading && (
        <div className="loading">
          Searching through video analyses...
        </div>
      )}

      {result && (
        <div className="query-results">
          <h3>Answer</h3>
          <div className="result-answer">
            {result.answer}
          </div>

          {result.timestamps && result.timestamps.length > 0 && (
            <div className="result-timestamps">
              <h3>Relevant Time Intervals</h3>
              {result.timestamps.map((ts, idx) => (
                <div key={idx} className="timestamp-item">
                  <strong>Time:</strong> {ts.start} - {ts.end}
                  {ts.video_path && (
                    <div style={{ fontSize: '12px', color: '#7f8c8d', marginTop: '5px' }}>
                      {ts.video_path.split('/').pop()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {result.relevant_clips && result.relevant_clips.length > 0 && (
            <div style={{ marginTop: '20px' }}>
              <h3>Relevant Clips</h3>
              {result.relevant_clips.map((clip, idx) => {
                // Extract filename from video_path
                const videoFilename = clip.video_path ? clip.video_path.split(/[/\\]/).pop() : null;
                const videoUrl = videoFilename ? `/api/video/${videoFilename}` : null;
                
                return (
                  <div key={idx} className="timestamp-item" style={{ marginTop: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong>Time:</strong> {clip.start_time} - {clip.end_time}
                      </div>
                      {videoUrl && (
                        <button
                          className="btn-primary"
                          onClick={() => setSelectedVideo({ url: videoUrl, clip: clip })}
                          style={{ padding: '5px 15px', fontSize: '12px' }}
                        >
                          Play Video
                        </button>
                      )}
                    </div>
                    <div style={{ 
                      fontSize: '14px', 
                      color: '#555', 
                      marginTop: '8px', 
                      whiteSpace: 'pre-wrap', 
                      wordBreak: 'break-word',
                      overflowWrap: 'break-word',
                      maxWidth: '100%',
                      display: 'block'
                    }}>
                      {clip.analysis}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Video Player Modal/Overlay */}
      {selectedVideo && (
        <div 
          className="video-modal-overlay"
          onClick={() => setSelectedVideo(null)}
        >
          <div 
            className="video-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="video-modal-header">
              <h3>Video: {selectedVideo.clip.start_time} - {selectedVideo.clip.end_time}</h3>
              <button 
                className="video-modal-close"
                onClick={() => setSelectedVideo(null)}
              >
                ×
              </button>
            </div>
            <div style={{ position: 'relative', width: '100%' }}>
              <video 
                ref={videoRef}
                key={selectedVideo.url}
                controls 
                autoPlay
                preload="auto"
                style={{ width: '100%', maxHeight: '70vh', display: 'block' }}
                onLoadedData={() => {
                  console.log('Video loaded successfully:', selectedVideo.url);
                  if (videoRef.current) {
                    videoRef.current.play().catch(err => {
                      console.error('Auto-play prevented:', err);
                    });
                  }
                }}
                onError={(e) => {
                  const video = e.target;
                  console.error('Video playback error:', e);
                  console.error('Video URL:', selectedVideo.url);
                  console.error('Video element error details:', video.error);
                  
                  if (video.error) {
                    let errorMsg = '';
                    switch (video.error.code) {
                      case video.error.MEDIA_ERR_ABORTED:
                        errorMsg = 'Video playback aborted.';
                        break;
                      case video.error.MEDIA_ERR_NETWORK:
                        errorMsg = 'Network error while loading video.';
                        break;
                      case video.error.MEDIA_ERR_DECODE:
                        errorMsg = 'Video decoding error. The video codec may not be supported.';
                        break;
                      case video.error.MEDIA_ERR_SRC_NOT_SUPPORTED:
                        errorMsg = 'Video format not supported by browser.';
                        break;
                      default:
                        errorMsg = 'Unknown video error.';
                    }
                    console.error('Error code:', video.error.code, errorMsg);
                    
                    // Show error message to user
                    const errorDiv = document.createElement('div');
                    errorDiv.style.padding = '20px';
                    errorDiv.style.color = '#e74c3c';
                    errorDiv.style.textAlign = 'center';
                    errorDiv.innerHTML = `<strong>Video Playback Error:</strong><br/>${errorMsg}<br/><small>URL: ${selectedVideo.url}</small>`;
                    video.parentNode.insertBefore(errorDiv, video);
                  } else {
                    console.error('Video error object is null/undefined');
                    const errorDiv = document.createElement('div');
                    errorDiv.style.padding = '20px';
                    errorDiv.style.color = '#e74c3c';
                    errorDiv.style.textAlign = 'center';
                    errorDiv.innerHTML = `<strong>Video Load Error:</strong><br/>Failed to load video. Please check the URL and network connection.<br/><small>URL: ${selectedVideo.url}</small>`;
                    video.parentNode.insertBefore(errorDiv, video);
                  }
                  video.style.display = 'none';
                }}
                onCanPlay={() => {
                  console.log('Video can play:', selectedVideo.url);
                }}
              >
                <source src={selectedVideo.url} type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            </div>
            <div className="video-modal-description">
              <strong>Analysis:</strong>
              <div style={{ marginTop: '10px', whiteSpace: 'pre-wrap' }}>
                {selectedVideo.clip.analysis}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QueryPanel;

