"""
NEXUS Backend – Document Chunker

Splits documents into overlapping text chunks for embedding and retrieval.
"""

from typing import List, Dict, Any
from app.config import settings


def chunk_text(
    text: str,
    filename: str = "",
    chunk_size: int | None = None,
    chunk_overlap: int | None = None,
) -> List[Dict[str, Any]]:
    """
    Split text into overlapping chunks with metadata.

    Returns a list of dicts:
      [{"text": "...", "metadata": {"chunk_index": 0, "source": "file.pdf", ...}}, ...]
    """
    _chunk_size = chunk_size or settings.RAG_CHUNK_SIZE
    _chunk_overlap = chunk_overlap or settings.RAG_CHUNK_OVERLAP

    # Dependency-free chunking to avoid LangChain version/import churn.
    # Prefer paragraph boundaries, but enforce max size with overlap.
    parts = [p.strip() for p in text.split("\n\n") if p.strip()]
    if not parts:
        parts = [text]

    raw_chunks: list[str] = []
    buf = ""

    def flush_buffer():
        nonlocal buf
        if buf.strip():
            raw_chunks.append(buf.strip())
        buf = ""

    for part in parts:
        candidate = f"{buf}\n\n{part}".strip() if buf else part
        if len(candidate) <= _chunk_size:
            buf = candidate
            continue

        flush_buffer()

        # If a single part is huge, hard-split it.
        start = 0
        while start < len(part):
            end = min(len(part), start + _chunk_size)
            raw_chunks.append(part[start:end].strip())
            if end >= len(part):
                break
            start = max(0, end - _chunk_overlap)

    flush_buffer()

    # Add overlap at chunk boundaries for smoother retrieval.
    if _chunk_overlap > 0 and len(raw_chunks) > 1:
        with_overlap: list[str] = []
        for i, ch in enumerate(raw_chunks):
            if i == 0:
                with_overlap.append(ch)
                continue
            prev = raw_chunks[i - 1]
            prefix = prev[-_chunk_overlap:] if len(prev) > _chunk_overlap else prev
            with_overlap.append((prefix + ch).strip())
        raw_chunks = with_overlap

    chunks = []
    for i, chunk_text_str in enumerate(raw_chunks):
        chunks.append({
            "text": chunk_text_str.strip(),
            "metadata": {
                "chunk_index": i,
                "source": filename,
                "char_start": text.find(chunk_text_str[:50]),  # approximate position
                "char_count": len(chunk_text_str),
            },
        })

    return chunks


def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extract text from a PDF file."""
    from pypdf import PdfReader
    import io

    reader = PdfReader(io.BytesIO(file_bytes))
    pages = []
    for i, page in enumerate(reader.pages):
        page_text = page.extract_text() or ""
        if page_text.strip():
            pages.append(f"[Page {i + 1}]\n{page_text}")

    return "\n\n".join(pages)


def extract_text_from_file(file_bytes: bytes, content_type: str) -> str:
    """Extract text from a file based on its content type."""
    if content_type in ("application/pdf", "pdf"):
        return extract_text_from_pdf(file_bytes)
    elif content_type in ("text/markdown", "text/plain", "markdown", "text", "txt"):
        return file_bytes.decode("utf-8", errors="replace")
    else:
        # Attempt plain text decoding as fallback
        return file_bytes.decode("utf-8", errors="replace")
