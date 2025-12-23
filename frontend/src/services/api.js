import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const cameraAPI = {
  // Get list of available cameras
  getCameras: async () => {
    const response = await api.get('/api/cameras');
    return response.data;
  },

  // Start streaming
  startStream: async (cameraIndex, motionThreshold = 5000, rtspUrl = null) => {
    const payload = {
      motion_threshold: motionThreshold,
    };
    
    if (rtspUrl) {
      payload.rtsp_url = rtspUrl;
    } else {
      payload.camera_index = cameraIndex;
    }
    
    const response = await api.post('/api/stream/start', payload);
    return response.data;
  },

  // Stop streaming
  stopStream: async () => {
    const response = await api.post('/api/stream/stop');
    return response.data;
  },

  // Get stream status
  getStatus: async () => {
    const response = await api.get('/api/stream/status');
    return response.data;
  },

  // Get progress
  getProgress: async () => {
    const response = await api.get('/api/progress');
    return response.data;
  },

  // Query videos
  query: async (query, topK = 5) => {
    const response = await api.post('/api/query', {
      query,
      top_k: topK,
    });
    return response.data;
  },

  // Clear database
  clearDatabase: async () => {
    const response = await api.post('/api/clear-database');
    return response.data;
  },
};

// WebSocket connection manager
export class WebSocketManager {
  constructor(url = 'ws://localhost:8000/ws') {
    this.url = url;
    this.ws = null;
    this.listeners = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 3000;
  }

  connect() {
    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        this.emit('connected', {});
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.emit(data.type || 'message', data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.emit('error', { error });
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.emit('disconnected', {});
        this.attemptReconnect();
      };
    } catch (error) {
      console.error('Error creating WebSocket:', error);
      this.attemptReconnect();
    }
  }

  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      setTimeout(() => this.connect(), this.reconnectDelay);
    } else {
      console.error('Max reconnection attempts reached');
      this.emit('reconnect_failed', {});
    }
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in WebSocket listener for ${event}:`, error);
        }
      });
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.listeners.clear();
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }
}

export default api;

