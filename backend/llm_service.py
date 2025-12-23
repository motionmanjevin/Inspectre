import os
import re
import logging
from typing import List, Dict, Optional
from gradio_client import Client

logger = logging.getLogger(__name__)

class LLMService:
    def __init__(self, hf_space_url: Optional[str] = None, api_token: Optional[str] = None):
        """
        Initialize Gradio Client for Qwen2.5 model hosted on HuggingFace Space
        
        Args:
            hf_space_url: HuggingFace Space URL (e.g., "username/space-name")
                         Default: "motionmanjevin/textanal"
            api_token: HuggingFace API token (or use HF_API_TOKEN env var)
        """
        self.hf_space_url = hf_space_url or os.getenv("QWEN25_SPACE_URL", "motionmanjevin/textanal")
        self.api_token = api_token or os.getenv("HF_API_TOKEN")
        
        # Initialize Gradio client
        try:
            self.client = Client(self.hf_space_url, token=self.api_token)
            logger.info(f"Initialized LLM service with Space: {self.hf_space_url}")
        except Exception as e:
            logger.error(f"Failed to initialize LLM service client: {e}")
            raise
    
    def generate_answer(self, user_query: str, relevant_contexts: List[Dict], max_clips: int = 5) -> Dict:
        """
        Generate answer from user query using relevant video analysis contexts
        
        Args:
            user_query: User's question/query
            relevant_contexts: List of relevant video analyses from ChromaDB
                              Each dict should have: document, metadata (with start_time, end_time, video_path)
            max_clips: Maximum number of clips to include in response
            
        Returns:
            dict with keys: answer, timestamps, relevant_clips
        """
        if not relevant_contexts:
            return {
                "answer": "No relevant video content found to answer your query.",
                "timestamps": [],
                "relevant_clips": []
            }
        
        # Limit to max_clips most relevant contexts (already sorted by ChromaDB search)
        limited_contexts = relevant_contexts[:max_clips]
        
        # Build structured context with clear time intervals and video info
        clip_data = []
        timestamps = []
        relevant_clips = []
        
        for idx, context in enumerate(limited_contexts, 1):
            analysis_text = context.get("document", "")
            metadata = context.get("metadata", {})
            
            start_time = metadata.get("start_time", "unknown")
            end_time = metadata.get("end_time", "unknown")
            video_path = metadata.get("video_path", "unknown")
            
            # Extract time portion if ISO format
            try:
                if "T" in start_time:
                    start_time = start_time.split("T")[1].split(".")[0]
                if "T" in end_time:
                    end_time = end_time.split("T")[1].split(".")[0]
            except:
                pass
            
            # Extract just the filename for cleaner display
            video_filename = re.split(r'[/\\]', video_path)[-1] if video_path else "unknown"
            
            clip_data.append({
                "clip_id": idx,
                "time_interval": f"{start_time} to {end_time}",
                "video_file": video_filename,
                "analysis": analysis_text
            })
            
            timestamps.append({
                "start": start_time,
                "end": end_time,
                "video_path": video_path
            })
            
            relevant_clips.append({
                "video_path": video_path,
                "start_time": start_time,
                "end_time": end_time,
                "analysis": analysis_text
            })
        
        # Build structured prompt for intelligent correlation detection
        clips_text = "\n\n".join([
            f"""CLIP #{clip['clip_id']}:
Time Interval: {clip['time_interval']}
Video File: {clip['video_file']}
Content Analysis:
{clip['analysis']}"""
            for clip in clip_data
        ])
        
        prompt = f"""You are a video content analysis system. Your task is to find correlations between a user's query and analyzed video clip content.

=== PROCESSED VIDEO CLIP ANALYSES ===

{clips_text}

=== USER QUERY ===
{user_query}

=== YOUR TASK ===
1. Carefully analyze each clip's content to determine if it contains ANY information relevant to the user's query.
2. Consider semantic meaning, not just keyword matching. Look for:
   - Direct mentions of query topics
   - Related concepts or events
   - Actions or objects that relate to the query
3. If you find relevant clips, provide:
   - A clear explanation of the correlation
   - The exact time intervals where relevant content appears
4. If NO clips contain relevant information (even tangentially), respond with NOT_FOUND.

=== RESPONSE FORMAT ===

IF RELEVANT CLIPS FOUND:
FOUND:
[Your detailed explanation of what was found and how it relates to the query]

TIMESTAMPS:
- Time: [start_time] to [end_time] | Video: [video_filename]
- Time: [start_time] to [end_time] | Video: [video_filename]
[List only the clips that actually correlate with the query]

IF NO RELEVANT CLIPS FOUND:
NOT_FOUND:
[Brief explanation of why no relevant content was found]

Be strict in your correlation assessment. Only include clips with genuine relevance to the query."""

        try:
            logger.info(f"Sending query to Qwen2.5 Space: {user_query[:50]}...")
            
            # Use gradio_client to call the Space API
            # Based on tt.py pattern: client.predict(question="...", api_name="/ask")
            result = self.client.predict(
                question=prompt,
                api_name="/ask"
            )
            
            # Extract answer from result
            answer = str(result) if result else "No response generated"
            
            # Clean up answer
            answer = answer.strip()
            
            # Parse the structured response to extract timestamps
            parsed_timestamps = []
            parsed_clips = []
            
            # Check if answer indicates no correlation found
            if answer.upper().startswith("NOT_FOUND"):
                # Extract the explanation after NOT_FOUND:
                explanation = answer.split(":", 1)[1].strip() if ":" in answer else "No relevant content found in the analyzed video clips."
                logger.info("LLM determined no correlation found")
                return {
                    "answer": explanation,
                    "timestamps": [],
                    "relevant_clips": []
                }
            
            # Parse timestamps from the structured response
            if "TIMESTAMPS:" in answer.upper():
                # Extract the timestamps section
                timestamps_section = answer.split("TIMESTAMPS:", 1)[1] if "TIMESTAMPS:" in answer.upper() else ""
                
                # Parse each timestamp line (supports multiple formats)
                for line in timestamps_section.split("\n"):
                    line = line.strip()
                    if line.startswith("-") and "Time:" in line:
                        # Extract time range and video filename
                        # Format: - Time: [start] to [end] | Video: [filename]
                        # Or: - Time: [start] to [end] (Video: [filename])
                        try:
                            # Handle both formats
                            if "|" in line:
                                time_part = line.split("Time:")[1].split("|")[0].strip()
                            elif "(Video:" in line:
                                time_part = line.split("Time:")[1].split("(Video:")[0].strip()
                            else:
                                time_part = line.split("Time:")[1].strip()
                            
                            if "to" in time_part:
                                start, end = [t.strip() for t in time_part.split("to")]
                                
                                # Find matching clip from our contexts by time interval
                                matching_clip = None
                                for clip in relevant_clips:
                                    if clip["start_time"] == start and clip["end_time"] == end:
                                        matching_clip = clip
                                        break
                                
                                if matching_clip:
                                    parsed_timestamps.append({
                                        "start": start,
                                        "end": end,
                                        "video_path": matching_clip["video_path"]
                                    })
                                    parsed_clips.append(matching_clip)
                                    logger.debug(f"Parsed timestamp: {start} to {end}")
                        except Exception as e:
                            logger.warning(f"Error parsing timestamp line: {line}, {e}")
            
            # If no timestamps were parsed but we have relevant_clips, use all of them
            # (fallback if LLM didn't follow format exactly)
            if not parsed_timestamps and relevant_clips:
                parsed_timestamps = timestamps
                parsed_clips = relevant_clips
            
            # Extract the answer part (before TIMESTAMPS:)
            answer_text = answer.split("TIMESTAMPS:", 1)[0] if "TIMESTAMPS:" in answer.upper() else answer
            answer_text = answer_text.replace("FOUND:", "").strip()
            
            logger.info(f"Generated answer from Qwen2.5-Instruct, found {len(parsed_timestamps)} relevant timestamps")
            
            return {
                "answer": answer_text,
                "timestamps": parsed_timestamps if parsed_timestamps else timestamps,
                "relevant_clips": parsed_clips if parsed_clips else relevant_clips
            }
            
        except Exception as e:
            error_msg = f"Error calling Qwen2.5 Space API: {str(e)}"
            logger.error(error_msg)
            return {
                "answer": f"Error generating answer: {error_msg}",
                "timestamps": timestamps,
                "relevant_clips": relevant_clips
            }
        except Exception as e:
            error_msg = f"Unexpected error: {str(e)}"
            logger.error(error_msg)
            return {
                "answer": f"Error generating answer: {error_msg}",
                "timestamps": timestamps,
                "relevant_clips": relevant_clips
            }

