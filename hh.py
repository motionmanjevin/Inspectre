from gradio_client import Client, handle_file
import os

# Get your HF token
hf_token = os.getenv("HF_API_TOKEN")  # or os.getenv("HF_TOKEN")

client = Client("motionmanjevin/vidresp", token=hf_token)
result = client.predict(
    video_file={"video": handle_file(r'C:\Users\xserv\Documents\CustomAPI\tesvi.mp4')},
    prompt="give a detailed log of events that happened in the video",
    api_name="/predict"
)
print(result)