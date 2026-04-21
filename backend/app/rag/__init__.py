"""
NEXUS Backend – RAG (Retrieval-Augmented Generation) Package

Provides vector-store-backed context retrieval, document chunking, embedding,
and exam paper generation using Chroma + Groq.
"""

# Chroma vector store
from app.rag.chroma_store import get_collection, upsert_chunks

# Chunking & extraction
from app.rag.chunker import chunk_text, extract_text_from_file

# Embeddings
from app.rag.embedder import EmbeddingService, embedder

# Retrieval
from app.rag.retriever import retrieve_chunks

# Prompting
from app.rag.prompt import build_context_block, build_messages

# Unified exam core
from app.rag.unified_core import (
    determine_content_type,
    ensure_examiner_workspace,
    ingest_document_record,
    build_source_blocks,
    generate_exam_questions,
    serialize_exam_paper,
    serialize_exam_summary,
)

__all__ = [
    # Chroma
    "get_collection",
    "upsert_chunks",
    # Chunking
    "chunk_text",
    "extract_text_from_file",
    # Embeddings
    "EmbeddingService",
    "embedder",
    # Retrieval
    "retrieve_chunks",
    # Prompting
    "build_context_block",
    "build_messages",
    # Unified exam core
    "determine_content_type",
    "ensure_examiner_workspace",
    "ingest_document_record",
    "build_source_blocks",
    "generate_exam_questions",
    "serialize_exam_paper",
    "serialize_exam_summary",
]
