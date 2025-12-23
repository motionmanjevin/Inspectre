from gradio_client import Client
import os

hf_token = os.getenv("HF_API_TOKEN")
client = Client("motionmanjevin/textanal", token=hf_token)
result = client.predict(
		question="how does chromadb semantic search work?",
		api_name="/ask"
)
print(result)