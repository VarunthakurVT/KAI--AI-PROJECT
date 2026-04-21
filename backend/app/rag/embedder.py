"""
NEXUS Backend – Embedding Generator

Uses sentence-transformers to generate local embeddings (no API cost).
Singleton pattern ensures model is loaded once.
"""

import threading
from typing import List

from app.config import settings


def _resolve_device() -> str:
    preferred = settings.EMBEDDING_DEVICE.lower()
    if preferred != "auto":
        return preferred

    try:
        import torch

        return "cuda" if torch.cuda.is_available() else "cpu"
    except Exception:
        return "cpu"


class EmbeddingService:
    """Thread-safe singleton for generating embeddings with sentence-transformers."""

    _instance = None
    _lock = threading.Lock()
    _model = None
    _device = None

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance

    def _load_model(self):
        """Lazy-load the sentence-transformers model."""
        if self._model is None:
            from sentence_transformers import SentenceTransformer
            self._device = _resolve_device()
            self._model = SentenceTransformer(settings.EMBEDDING_MODEL, device=self._device)

    def embed_text(self, text: str) -> List[float]:
        """Embed a single text string → list of floats."""
        self._load_model()
        embedding = self._model.encode(text, normalize_embeddings=True, show_progress_bar=False)
        return embedding.tolist()

    def embed_texts(self, texts: List[str], batch_size: int | None = None) -> List[List[float]]:
        """Embed multiple texts → list of list of floats."""
        if not texts:
            return []

        self._load_model()
        embeddings = self._model.encode(
            texts,
            batch_size=batch_size or settings.EMBEDDING_BATCH_SIZE,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        return embeddings.tolist()

    @property
    def dimension(self) -> int:
        return settings.EMBEDDING_DIMENSION

    @property
    def device(self) -> str:
        self._load_model()
        return self._device or "cpu"


# Module-level singleton
embedder = EmbeddingService()
