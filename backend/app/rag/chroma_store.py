"""
NEXUS Backend - Chroma Vector Store

Centralizes ChromaDB interactions (client + collection) so the rest of the code
can treat the vector database as a simple service.
"""

from __future__ import annotations

import threading
from typing import Any, Optional, TYPE_CHECKING

try:
    import chromadb
    from chromadb.config import Settings as ChromaSettings
except ModuleNotFoundError as e:
    # Allow the API to boot even if ChromaDB isn't installed.
    # RAG endpoints will raise a clear error when they first need the vector store.
    chromadb = None  # type: ignore[assignment]
    ChromaSettings = None  # type: ignore[assignment]
    _chromadb_import_error: Exception = e
else:
    _chromadb_import_error = None  # type: ignore[assignment]

from app.config import settings

if TYPE_CHECKING:
    from chromadb.api.models import Collection
else:
    # Runtime fallback so the module can be imported without `chromadb` installed.
    Collection = Any  # type: ignore[assignment]

_client = None
_collection: Optional[Collection] = None
_init_lock = threading.Lock()


def _create_client():
    if chromadb is None or ChromaSettings is None:
        raise RuntimeError(
            "chromadb is not installed, so the vector store cannot be initialized. "
            "Install backend dependencies that include chromadb (and a working build toolchain "
            "for chroma-hnswlib on Windows), then restart the backend."
        ) from _chromadb_import_error

    chroma_settings = ChromaSettings(anonymized_telemetry=False)
    mode = (settings.CHROMA_MODE or "").strip().lower()

    if mode == "http":
        return chromadb.HttpClient(
            host=settings.CHROMA_HOST,
            port=settings.CHROMA_PORT,
            settings=chroma_settings,
        )

    if mode == "persistent":
        return chromadb.PersistentClient(
            path=settings.CHROMA_PERSIST_PATH,
            settings=chroma_settings,
        )

    raise ValueError(
        f"Unsupported CHROMA_MODE={settings.CHROMA_MODE!r}. Use 'persistent' or 'http'."
    )


def get_collection() -> Collection:
    global _client, _collection
    if _collection is not None:
        return _collection

    with _init_lock:
        if _collection is not None:
            return _collection

        _client = _create_client()
        _collection = _client.get_or_create_collection(
            name=settings.CHROMA_COLLECTION,
            metadata={"hnsw:space": settings.CHROMA_DISTANCE},
        )
        return _collection


def upsert_chunks(
    *,
    ids: list[str],
    documents: list[str],
    embeddings: list[list[float]],
    metadatas: list[dict[str, Any]],
) -> None:
    if not ids:
        return

    if not (len(ids) == len(documents) == len(embeddings) == len(metadatas)):
        raise ValueError("Chroma upsert requires ids/documents/embeddings/metadatas to be the same length.")

    collection = get_collection()
    collection.upsert(
        ids=ids,
        documents=documents,
        embeddings=embeddings,
        metadatas=metadatas,
    )


def query(
    *,
    query_embedding: list[float],
    n_results: int,
    where: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    collection = get_collection()

    kwargs: dict[str, Any] = {
        "query_embeddings": [query_embedding],
        "n_results": n_results,
        "include": ["metadatas", "documents", "distances"],
    }
    if where:
        kwargs["where"] = where

    return collection.query(**kwargs)


def delete_ids(ids: list[str]) -> None:
    if not ids:
        return

    collection = get_collection()
    collection.delete(ids=ids)

