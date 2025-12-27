import axios from 'axios';
import { Platform } from 'react-native';

// IMPORTANT: Update this IP address to match your computer's local network IP
// For physical device testing, both your phone and computer must be on the same Wi-Fi network
// Find your IP: Windows (ipconfig), Mac/Linux (ifconfig)
const YOUR_LOCAL_IP = '192.168.0.100'; // ⚠️ CHANGE THIS TO YOUR COMPUTER'S IP ADDRESS

// Use localhost for iOS simulator, local IP for physical devices
const API_BASE_URL = __DEV__ 
  ? (Platform.OS === 'android' 
      ? `http://${YOUR_LOCAL_IP}:8000`  // Physical Android device
      : `http://${YOUR_LOCAL_IP}:8000`) // Physical iOS device (or use 'localhost' for simulator)
  : `http://${YOUR_LOCAL_IP}:8000`;     // Production mode

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

class WebSocketManager {
  constructor() {
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.listeners = [];
    this.reconnectTimeout = null;
  }

  connect(onMessage, onError) {
    const wsUrl = API_BASE_URL.replace('http', 'ws') + '/ws';
    
    try {
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
      };
      
      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onMessage(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };
      
      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        if (onError) onError(error);
      };
      
      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.attemptReconnect(onMessage, onError);
      };
    } catch (error) {
      console.error('Error creating WebSocket:', error);
      if (onError) onError(error);
    }
  }

  attemptReconnect(onMessage, onError) {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms...`);
      
      this.reconnectTimeout = setTimeout(() => {
        this.connect(onMessage, onError);
      }, delay);
    } else {
      console.error('Max reconnection attempts reached');
    }
  }

  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }
}

export const wsManager = new WebSocketManager();

export const cameraAPI = {
  // List available cameras
  listCameras: async () => {
    const response = await api.get('/api/cameras');
    return response.data;
  },

  // Start streaming
  startStream: async (cameraIndex, motionThreshold = 5000, rtspUrl = null) => {
    const payload = { motion_threshold: motionThreshold };
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
  queryVideos: async (query) => {
    const response = await api.post('/api/query', { query });
    return response.data;
  },

  // Clear database
  clearDatabase: async () => {
    const response = await api.post('/api/clear-database');
    return response.data;
  },

  // Get video URL
  getVideoUrl: (filename) => {
    return `${API_BASE_URL}/api/video/${filename}`;
  },

};

// Helper function to get the base URL (useful for stream URLs)
export const getBaseUrl = () => API_BASE_URL;

export default api;
