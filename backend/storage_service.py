import chromadb
from chromadb.config import Settings
import logging
from typing import List, Dict, Optional
from pathlib import Path
from datetime import datetime

logger = logging.getLogger(__name__)

class StorageService:
    def __init__(self, persist_directory: str = "backend/chroma_db"):
        """
        Initialize ChromaDB storage service
        
        Args:
            persist_directory: Directory to persist ChromaDB data
        """
        self.persist_directory = Path(persist_directory)
        self.persist_directory.mkdir(parents=True, exist_ok=True)
        
        # Initialize ChromaDB client
        self.client = chromadb.PersistentClient(
            path=str(self.persist_directory),
            settings=Settings(anonymized_telemetry=False)
        )
        
        # Get or create collection with embedding function for semantic search
        # ChromaDB will use default embedding function if not specified
        self.collection = self.client.get_or_create_collection(
            name="video_analyses",
            metadata={"hnsw:space": "cosine"}  # Use cosine similarity for semantic search
        )
        
        logger.info(f"Initialized ChromaDB storage at: {self.persist_directory}")
    
    def store_analysis(self, video_path: str, start_time: str, end_time: str, 
                      analysis: str, clip_index: Optional[int] = None) -> str:
        """
        Store video analysis in ChromaDB
        
        Args:
            video_path: Path to video file
            start_time: Start timestamp (ISO format)
            end_time: End timestamp (ISO format)
            analysis: Analysis text from Qwen3-VL
            clip_index: Optional clip index
            
        Returns:
            Document ID
        """
        if not analysis:
            raise ValueError("Analysis text cannot be empty")
        
        # Generate unique ID
        doc_id = f"{video_path}_{start_time}"
        
        # Prepare metadata
        metadata = {
            "video_path": video_path,
            "start_time": start_time,
            "end_time": end_time,
            "clip_index": str(clip_index) if clip_index is not None else "0"
        }
        
        # Add document to collection
        # ChromaDB will automatically generate embeddings from the document text
        self.collection.add(
            documents=[analysis],
            metadatas=[metadata],
            ids=[doc_id]
        )
        
        logger.info(f"Stored analysis for video: {video_path}")
        return doc_id
    
    def search_analyses(self, query: str, top_k: int = 5, min_relevance: float = 0.5) -> List[Dict]:
        """
        Search video analyses using semantic search
        
        Args:
            query: Search query text
            top_k: Number of results to return
            min_relevance: Minimum similarity threshold (0-1, higher = more strict)
            
        Returns:
            List of relevant analyses with metadata, sorted by relevance
        """
        if not query:
            return []
        
        # Get total count first to avoid querying more than exists
        total_count = self.collection.count()
        if total_count == 0:
            return []
        
        # Limit top_k to actual number of documents
        effective_top_k = min(top_k, total_count)
        
        try:
            # Query collection with semantic search
            results = self.collection.query(
                query_texts=[query],
                n_results=effective_top_k
            )
        except Exception as e:
            logger.error(f"ChromaDB query error: {e}")
            return []
        
        # Format results and filter by relevance threshold
        formatted_results = []
        if results and 'ids' in results and results['ids'] and len(results['ids'][0]) > 0:
            num_results = len(results['ids'][0])
            logger.info(f"ChromaDB returned {num_results} results for query (requested {effective_top_k})")
            
            for i in range(num_results):
                distance = results['distances'][0][i] if 'distances' in results and results['distances'] and len(results['distances'][0]) > i else None
                
                # Convert distance to similarity score (cosine distance: 0 = identical, 2 = opposite)
                # For cosine similarity: similarity = 1 - (distance / 2)
                # We want higher similarity = more relevant
                if distance is not None:
                    # For cosine distance, smaller distance = more similar
                    # Calculate similarity: similarity = 1 - (distance / max_distance)
                    # Cosine distance ranges from 0 to 2, so similarity = 1 - (distance / 2)
                    similarity = 1 - (distance / 2.0) if distance <= 2.0 else 0.0
                    
                    # Filter by minimum relevance threshold
                    if similarity < min_relevance:
                        logger.debug(f"Skipping result with similarity {similarity:.3f} < {min_relevance}")
                        continue
                else:
                    similarity = None
                
                formatted_results.append({
                    "id": results['ids'][0][i],
                    "document": results['documents'][0][i],
                    "metadata": results['metadatas'][0][i],
                    "distance": distance,
                    "similarity": similarity
                })
            
            # Ensure we don't exceed top_k (extra safety check)
            formatted_results = formatted_results[:top_k]
            
            # Log similarity scores for debugging
            if formatted_results and formatted_results[0].get("similarity") is not None:
                similarities = [f"{r.get('similarity', 0):.3f}" for r in formatted_results]
                logger.info(f"Result similarities: {', '.join(similarities)}")
        
        logger.info(f"Returning {len(formatted_results)} relevant analyses (limited to top_k={top_k}) for query: '{query[:50]}...'")
        return formatted_results
    
    def get_all_analyses(self) -> List[Dict]:
        """Get all stored analyses"""
        results = self.collection.get()
        
        formatted_results = []
        if results['ids']:
            for i in range(len(results['ids'])):
                formatted_results.append({
                    "id": results['ids'][i],
                    "document": results['documents'][i],
                    "metadata": results['metadatas'][i]
                })
        
        return formatted_results
    
    def delete_analysis(self, doc_id: str):
        """Delete an analysis by ID"""
        self.collection.delete(ids=[doc_id])
        logger.info(f"Deleted analysis: {doc_id}")
    
    def clear_all(self):
        """Clear all stored analyses (use with caution)"""
        # Get all IDs and delete them
        results = self.collection.get()
        if results['ids']:
            self.collection.delete(ids=results['ids'])
            logger.warning(f"Cleared {len(results['ids'])} video analyses from database")
        else:
            logger.info("Database already empty")

