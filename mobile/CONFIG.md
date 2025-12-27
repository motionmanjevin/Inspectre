# Configuration Guide

## Backend Connection Setup

### For Physical Device Testing

1. **Find your computer's local IP address:**
   - **Windows**: Open Command Prompt and run `ipconfig`. Look for "IPv4 Address" under your active network adapter.
   - **Mac/Linux**: Open Terminal and run `ifconfig` (Mac) or `ip addr` (Linux). Look for the "inet" address.

2. **Update the API URL in `src/services/api.js`:**
   ```javascript
   // Replace YOUR_SERVER_IP with your actual IP (e.g., '192.168.1.100')
   const API_BASE_URL = __DEV__ 
     ? (Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://localhost:8000')
     : 'http://192.168.1.100:8000'; // Your computer's IP here
   ```

3. **For development mode (physical device):**
   - Update the development URL directly:
   ```javascript
   const API_BASE_URL = Platform.OS === 'android' 
     ? 'http://YOUR_IP:8000'  // Replace YOUR_IP
     : 'http://YOUR_IP:8000'; // Replace YOUR_IP
   ```

4. **Ensure both devices are on the same network:**
   - Your phone and computer must be connected to the same Wi-Fi network
   - Some networks may block device-to-device communication - check your router settings

5. **Verify backend is accessible:**
   - Make sure your FastAPI backend is running on port 8000
   - Test by opening `http://192.168.181.95:8000/api/cameras` in your phone's browser
   - You should see JSON response with camera list

## Backend Endpoints

The mobile app connects to these endpoints:
- `GET /api/cameras` - List available cameras
- `POST /api/stream/start` - Start camera stream
- `POST /api/stream/stop` - Stop camera stream
- `GET /api/stream/status` - Get stream status
- `GET /api/stream/video` - MJPEG video stream
- `GET /api/progress` - Get processing progress
- `POST /api/query` - Query video analyses
- `POST /api/clear-database` - Clear database
- `GET /api/video/{filename}` - Get video file
- `WS /ws` - WebSocket for real-time updates

## Troubleshooting

### Cannot connect to backend
- Verify backend is running: `cd backend && python -m uvicorn main:app --reload`
- Check firewall settings - allow port 8000
- Ensure phone and computer are on same network
- Try pinging your computer's IP from your phone (use network tools app)

### Video stream not loading
- Ensure stream is started from Settings screen first
- Check that camera source is configured
- Verify MJPEG endpoint is accessible in browser

### WebSocket connection issues
- WebSocket uses same base URL as REST API
- Check that backend WebSocket endpoint is working
- App will automatically attempt reconnection

