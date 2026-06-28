"""
ChromaDB Vector Memory Service — Zero-shot continuous learning.
Scam patterns are vectorized using DistilBERT [CLS] embeddings
and stored in ChromaDB for instant cosine-similarity lookup.
"""
import chromadb
import torch
from typing import Optional

# Module-level references — set by init_chromadb()
_chroma_client = None
_scam_collection = None
_tokenizer = None
_model = None


def init_chromadb(tokenizer, model):
    """
    Initialize ChromaDB client and scam_vectors collection.
    Must be called at startup after model is loaded.
    """
    global _chroma_client, _scam_collection, _tokenizer, _model
    _tokenizer = tokenizer
    _model = model
    _chroma_client = chromadb.Client()
    _scam_collection = _chroma_client.get_or_create_collection(
        name="scam_vectors",
        metadata={"hnsw:space": "cosine"},
    )
    print(f"✓ ChromaDB initialized — {_scam_collection.count()} vectors loaded")


def embed_text(text: str) -> list[float]:
    """
    Produce a 768-dim [CLS] embedding from BERT (production1_chat_model).
    Used for both indexing and querying.
    """
    inputs = _tokenizer(text, return_tensors="pt", truncation=True, max_length=512)
    with torch.no_grad():
        outputs = _model.bert(**inputs)  # access BERT base model
    # [CLS] token is at position 0
    cls_vector = outputs.last_hidden_state[:, 0, :].squeeze().tolist()
    return cls_vector


def add_to_vector_db(text: str, report_id: str) -> None:
    """
    Vectorize a confirmed scam message and add to ChromaDB.
    No model retraining required — future near-duplicates are
    caught instantly by cosine similarity.
    """
    vector = embed_text(text)
    _scam_collection.add(
        embeddings=[vector],
        documents=[text],
        ids=[report_id],
    )
    print(f"✓ Added scam vector {report_id} — total: {_scam_collection.count()}")


def check_vector_db(text: str, threshold: float = 0.95) -> dict:
    """
    Query ChromaDB for cosine similarity against known scam patterns.
    ChromaDB returns *distances* (1 - cosine_sim for cosine space).
    A distance of 0 = identical; we want similarity >= threshold.
    So we check: (1 - distance) >= threshold  →  distance <= (1 - threshold).
    
    Returns: { 'match': bool, 'pattern': str | None, 'similarity': float }
    """
    if _scam_collection.count() == 0:
        return {"match": False, "pattern": None, "similarity": 0.0}

    vector = embed_text(text)
    results = _scam_collection.query(
        query_embeddings=[vector],
        n_results=1,
    )

    if results["distances"] and results["distances"][0]:
        distance = results["distances"][0][0]
        similarity = 1.0 - distance  # cosine similarity
        if similarity >= threshold:
            return {
                "match": True,
                "pattern": results["documents"][0][0],
                "similarity": similarity,
            }

    return {"match": False, "pattern": None, "similarity": 0.0}


def delete_from_vector_db(chroma_id: str) -> bool:
    """Delete a false-positive entry from the scam_vectors collection."""
    try:
        _scam_collection.delete(ids=[chroma_id])
        return True
    except Exception:
        return False


def get_collection_stats() -> dict:
    """Return stats about the scam_vectors collection."""
    count = _scam_collection.count() if _scam_collection else 0
    recent = []
    if count > 0:
        result = _scam_collection.peek(limit=10)
        if result and result.get("documents"):
            recent = [
                {"id": result["ids"][i], "text": doc[:80]}
                for i, doc in enumerate(result["documents"])
            ]
    return {"total_vectors": count, "recent_patterns": recent}
