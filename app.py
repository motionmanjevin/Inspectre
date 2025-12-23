import spaces
import torch
import gradio as gr
from transformers import AutoProcessor, AutoModelForVision2Seq
import moviepy.editor as mp
import numpy as np
from PIL import Image

# ---------------- MODEL SETUP ----------------
MODEL_ID = "Qwen/Qwen3-VL-8B-Instruct"

processor = AutoProcessor.from_pretrained(MODEL_ID)

# Let HF handle device placement safely
model = AutoModelForVision2Seq.from_pretrained(
    MODEL_ID,
    device_map="auto",
    torch_dtype=torch.float16
)

# ---------------- VIDEO UTILITIES ----------------
def split_video(video_path, chunk_duration=10):
    """Split video into N-second chunks, resized for memory efficiency"""
    video = None
    try:
        video = mp.VideoFileClip(video_path).resize(height=360)  # keeps aspect ratio
    except Exception as e:
        raise RuntimeError(f"Cannot read video: {e}")

    clips = []
    try:
        start = 0
        while start < video.duration:
            end = min(start + chunk_duration, video.duration)
            try:
                clips.append(video.subclip(start, end))
            except Exception:
                # Skip corrupted segments
                start += chunk_duration
                continue
            start += chunk_duration
    finally:
        # Clean up the original video clip to free memory
        if video is not None:
            video.close()
    
    return clips

def extract_frames(clip, max_frames=4):
    """Uniformly sample frames from a clip, returns frames and fps"""
    frames = []
    num_frames = min(max_frames, max(1, int(clip.duration)))
    if num_frames == 0:
        return frames, clip.fps if hasattr(clip, 'fps') else 24
    
    # Get fps from clip
    fps = clip.fps if hasattr(clip, 'fps') and clip.fps is not None else 24
    
    for t in np.linspace(0, clip.duration, num_frames, endpoint=False):
        try:
            frame = clip.get_frame(t)
            img = Image.fromarray(frame).convert("RGB")
            frames.append(img)
        except Exception:
            continue
    return frames, fps

# ---------------- MODEL CALL ----------------
def run_qwen(frames, user_prompt, fps=24):
    """
    Qwen3-VL multimodal call with video placeholder
    """
    messages = [
        {
            "role": "user",
            "content": [
                {"type": "video"},
                {"type": "text", "text": user_prompt}
            ]
        }
    ]

    # Apply Qwen-style chat template to create video tokens
    text = processor.apply_chat_template(
        messages,
        tokenize=False,
        add_generation_prompt=True
    )

    # Prepare video metadata - fps and total_num_frames are required
    video_metadata = {
        "fps": fps,
        "total_num_frames": len(frames)
    }

    # Processor call with video metadata
    inputs = processor(
        videos=frames,
        text=text,
        video_metadata=video_metadata,
        return_tensors="pt"
    )

    # Move tensors to model device safely
    for k, v in inputs.items():
        if isinstance(v, torch.Tensor):
            inputs[k] = v.to(model.device)

    # Generate with inference mode to save memory
    with torch.inference_mode():
        outputs = model.generate(
            **inputs,
            max_new_tokens=256,  # Increased for more detailed responses
            do_sample=True,
            temperature=0.7
        )

    return processor.decode(outputs[0], skip_special_tokens=True)

# ---------------- SPACES GPU ENTRY ----------------
@spaces.GPU
def infer(video_file, prompt):
    if video_file is None or not prompt.strip():
        return "Please upload a video and enter a prompt."

    # Handle Gradio video paths
    video_path = video_file["path"] if isinstance(video_file, dict) else video_file

    try:
        clips = split_video(video_path, chunk_duration=4)
    except RuntimeError as e:
        return f"Error reading video: {e}"

    responses = []
    total_chunks = len(clips)
    
    for i, clip in enumerate(clips):
        try:
            frames, fps = extract_frames(clip, max_frames=4)  # 4 frames per 4-second chunk
            if not frames:
                responses.append(f"🕒 {int(i*4)}s–{int((i+1)*4)}s:\n[Error: no frames extracted]")
                clip.close()  # Clean up clip
                continue

            try:
                answer = run_qwen(frames, prompt, fps=fps)
                responses.append(f"🕒 {int(i*4)}s–{int((i+1)*4)}s:\n{answer}")
            except Exception as e:
                responses.append(f"🕒 {int(i*4)}s–{int((i+1)*4)}s:\n[Error processing segment: {e}]")
            finally:
                clip.close()  # Always clean up clip to free memory
                # Clear GPU cache after each chunk to prevent memory buildup
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                
        except Exception as e:
            responses.append(f"🕒 {int(i*4)}s–{int((i+1)*4)}s:\n[Error with clip: {e}]")
            if 'clip' in locals():
                clip.close()

    return "\n\n".join(responses) if responses else "No usable frames found."

# ---------------- GRADIO UI ----------------
iface = gr.Interface(
    fn=infer,
    inputs=[
        gr.Video(label="Upload Video"),
        gr.Textbox(
            label="Prompt",
            placeholder="Ask about events, actions, or timestamps in the video..."
        )
    ],
    outputs="text",
    title="Qwen3-VL Long-Video QA (HF Spaces GPU)",
    description="Processes long videos safely by chunking + frame sampling (Qwen Chat–style)."
)

iface.launch()