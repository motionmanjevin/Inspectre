# Inspectre Mobile App

A React Native mobile application for the Inspectre security AI assistant, built with Expo.

## Features

- **Chat Interface**: Query your security system using natural language
- **Settings**: Configure camera sources, motion detection, and stream controls
- **Real-time Updates**: WebSocket integration for live status updates
- **Video Playback**: View relevant video clips from query results
- **Dark Theme**: Modern, aesthetic dark mode UI

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure API endpoint in `src/services/api.js`:
   - For Android emulator: Already configured as `http://10.0.2.2:8000`
   - For iOS simulator: Already configured as `http://localhost:8000`
   - For physical device: You need to replace `YOUR_SERVER_IP` with your computer's local IP address
     - Windows: Run `ipconfig` and use the IPv4 address (e.g., `192.168.1.100`)
     - Mac/Linux: Run `ifconfig` or `ip addr` and use the local IP address
     - Update line 7 in `src/services/api.js` if using production mode
     - For development mode, update the `API_BASE_URL` constant on line 5-6

3. Clear cache and start the development server:
```bash
# Clear Metro bundler cache
npx expo start --clear

# Or if that doesn't work:
npm start -- --reset-cache
```

4. Run on your device:
   - Press `a` for Android
   - Press `i` for iOS
   - Scan QR code with Expo Go app on your phone

## Troubleshooting

### Worklets Error
If you encounter a Worklets version mismatch error:
1. Clear the cache: `npx expo start --clear`
2. Close the Expo Go app completely
3. Restart the Expo server
4. Reload the app in Expo Go

### Version Mismatch Warnings
If you see package version warnings, run:
```bash
npx expo install --fix
```

## Project Structure

```
mobile/
├── src/
│   ├── screens/          # Screen components
│   │   ├── ChatScreen.js  # Main chat/query interface
│   │   ├── CameraStreamScreen.js  # Live camera video feed
│   │   └── SettingsScreen.js  # Settings and controls
│   ├── navigation/       # Navigation setup
│   │   └── AppNavigator.js
│   ├── services/         # API and WebSocket services
│   │   └── api.js
│   └── styles/           # Theme and styling
│       └── theme.js
├── App.js                # Root component
├── babel.config.js       # Babel config with Reanimated plugin
└── package.json
```

## Backend Connection

Make sure your FastAPI backend is running on port 8000. The mobile app will connect to:
- REST API: `http://YOUR_IP:8000`
- WebSocket: `ws://YOUR_IP:8000/ws`

## Notes

- For physical device testing, ensure your phone and computer are on the same network
- Update the API_BASE_URL in `src/services/api.js` with your computer's local IP address
- The app uses WebView for video playback (may need additional setup for production)
