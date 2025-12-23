# Camera Motion Detection Video Analysis System

A complete system that streams from cameras, detects motion using frame differencing, records 32-second clips when motion is detected, processes them through Qwen3-VL vision-language model, stores results in ChromaDB, and allows natural language querying via Qwen2.5-Instruct.

## Architecture

```
Camera Stream → Motion Detection → Record 32s Clip → Qwen3-VL API → ChromaDB
                                                                    ↓
User Query → Qwen2.5-Instruct → Search ChromaDB → Return Answer + Timestamps
```

## Features

- **Camera Selection**: Choose from available system cameras
- **Motion Detection**: Real-time frame differencing to detect motion
- **Automatic Recording**: Records 32-second clips when motion is detected
- **Video Analysis**: Processes clips through Qwen3-VL vision-language model
- **Semantic Storage**: Stores analyses in ChromaDB for efficient retrieval
- **Natural Language Queries**: Query video content using Qwen2.5-Instruct
- **Real-time Updates**: WebSocket-based progress tracking and status updates

## Setup

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create a virtual environment (recommended):
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Set environment variables (optional, can use defaults):
```bash
export QWEN3VL_SPACE_URL="your-hf-space/space-name"  # Default: motionmanjevin/vidresp
export HF_API_TOKEN="your-huggingface-api-token"     # Required for querying
```

5. Run the FastAPI server:
```bash
python main.py
# Or: uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The backend will run on `http://localhost:8000`

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

The frontend will run on `http://localhost:3000`

## Usage

1. **Start the System**:
   - Start the backend server first
   - Then start the frontend

2. **Select Camera**:
   - Choose a camera from the dropdown
   - Adjust motion threshold (lower = more sensitive)

3. **Start Streaming**:
   - Click "Start Streaming" to begin camera feed
   - Motion detection will automatically start

4. **Automatic Recording**:
   - When motion is detected, a 32-second clip will be recorded
   - After 32 seconds, motion is checked again
   - If motion continues, another clip is recorded

5. **Video Processing**:
   - Recorded clips are automatically processed through Qwen3-VL
   - Progress is shown in real-time (seconds processed, clips processed)
   - Results are stored in ChromaDB

6. **Query Videos**:
   - Enter a natural language query in the query panel
   - The system searches through stored analyses
   - Qwen2.5-Instruct generates an answer with timestamp references

## Configuration

### Motion Detection
- Default threshold: 5000 changed pixels
- Adjustable via slider in the UI
- Lower values = more sensitive (detects smaller movements)

### Video Processing
- Clip duration: 32 seconds
- Processing is synchronous (one clip at a time)
- Uses Qwen3-VL with "what happened in this video" prompt

### Storage
- ChromaDB stores all video analyses
- Database location: `backend/chroma_db/`
- Recorded videos: `backend/recordings/`

## API Endpoints

### REST API
- `GET /api/cameras` - List available cameras
- `POST /api/stream/start` - Start camera stream
- `POST /api/stream/stop` - Stop camera stream
- `GET /api/stream/status` - Get stream status
- `GET /api/stream/video` - MJPEG video stream
- `GET /api/progress` - Get processing progress
- `POST /api/query` - Query video analyses

### WebSocket
- `ws://localhost:8000/ws` - Real-time updates
  - Events: `motion`, `progress`, `clip_queued`, `processing_started`, `processing_complete`, `processing_error`

## Requirements

- Python 3.8+
- Node.js 16+
- System camera(s)
- HuggingFace API token (for Qwen2.5-Instruct queries)
- Qwen3-VL Space URL (default provided)

## Notes

- Video clips are stored temporarily in `backend/recordings/`
- ChromaDB data persists in `backend/chroma_db/`
- Motion detection uses frame differencing (cv2.absdiff)
- Processing is synchronous to manage GPU memory efficiently
- WebSocket reconnects automatically on disconnect

## Troubleshooting

1. **Camera not detected**: Check camera permissions and try different indices
2. **Qwen3-VL errors**: Verify the HF Space URL is correct and accessible
3. **Query errors**: Ensure HF_API_TOKEN is set correctly
4. **WebSocket issues**: Check that backend is running on port 8000
5. **Motion not detected**: Lower the motion threshold in the UI

