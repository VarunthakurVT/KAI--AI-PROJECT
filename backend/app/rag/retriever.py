"""
NEXUS Backend – Vector Retriever

Queries ChromaDB for the most relevant chunks given a query embedding.
Supports cosine similarity with optional MMR (Maximal Marginal Relevance).

Upgrades:
  - Excludes soft-deleted documents (is_deleted = false)
  - Supports page-range filtering (page_start / page_end on chunks)
"""

from typing import List, Optional, Dict, Any
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text as sql_text
from app.rag.embedder import embedder
from app.config import settings


async def retrieve_chunks(
    db: AsyncSession,
    query: str,
    course_id: Optional[UUID] = None,
    document_id: Optional[UUID] = None,
    top_k: int | None = None,
) -> List[Dict[str, Any]]:
    """
    Embed the query and retrieve the top-K most similar chunks via pgvector.

    Args:
        db: Async database session.
        query: Natural language search query.
        course_id: Optional filter to a specific course.
        document_id: Optional filter to a specific document.
        top_k: Number of results to return. Defaults to settings.RAG_TOP_K.

    Returns:
        List of dicts with keys: chunk_id, text, source, score, metadata
    """
    k = top_k or settings.RAG_TOP_K
    query_embedding = embedder.embed_text(query)

    # ── Build dynamic WHERE clauses ──
    where_clauses = [
        "d.status = 'ready'",
        "d.is_deleted = false",  # ✨ Respect soft deletes
    ]
    params: Dict[str, Any] = {
        "query_vec": str(query_embedding),
        "top_k": k,
    }

    if document_id:
        where_clauses.append("d.id = :document_id")
        params["document_id"] = str(document_id)
    elif course_id:
        where_clauses.append("d.course_id = :course_id")
        params["course_id"] = str(course_id)

    # ✨ Page-range metadata filtering
    if page_start is not None:
        where_clauses.append("c.page_start >= :page_start")
        params["page_start"] = page_start
    if page_end is not None:
        where_clauses.append("c.page_end <= :page_end")
        params["page_end"] = page_end

    where_sql = " AND ".join(where_clauses)

    sql = sql_text(f"""
        SELECT
            c.id AS chunk_id,
            c.text,
            c.metadata AS chunk_metadata,
            c.page_start,
            c.page_end,
            c.heading,
            d.filename AS source,
            1 - (ce.embedding <=> :query_vec::vector) AS score
        FROM chunk_embeddings ce
        JOIN chunks c ON c.id = ce.chunk_id
        JOIN documents d ON d.id = c.document_id
        WHERE {where_sql}
        ORDER BY ce.embedding <=> :query_vec::vector
        LIMIT :top_k
    """)

    result = await db.execute(sql, params)
    rows = result.fetchall()

    chunks = []
    for row in rows:
        chunks.append({
            "chunk_id": str(row.chunk_id),
            "text": row.text,
            "source": row.source,
            "score": float(row.score),
            "metadata": row.chunk_metadata or {},
            "page_start": row.page_start,
            "page_end": row.page_end,
            "heading": row.heading,
        })

    return chunks


async def retrieve_chunks(
    db: AsyncSession,
    query: str,
    course_id: Optional[UUID] = None,
    document_id: Optional[UUID] = None,
    page_start: Optional[int] = None,
    page_end: Optional[int] = None,
    top_k: int | None = None,
) -> List[Dict[str, Any]]:
    """
    Final retriever implementation aligned with the current database schema.

    page_start/page_end are accepted for compatibility, but ignored until the
    chunk schema grows explicit page columns.
    """
    del page_start, page_end

    k = top_k or settings.RAG_TOP_K
    query_embedding = embedder.embed_text(query)

    where_clauses = ["d.status = 'ready'"]
    params: Dict[str, Any] = {
        "query_vec": str(query_embedding),
        "top_k": k,
    }

    if document_id:
        where_clauses.append("d.id = :document_id")
        params["document_id"] = str(document_id)
    elif course_id:
        where_clauses.append("d.course_id = :course_id")
        params["course_id"] = str(course_id)

    sql = sql_text(
        f"""
        SELECT
            c.id AS chunk_id,
            c.text,
            c.metadata AS chunk_metadata,
            d.filename AS source,
            1 - (ce.embedding <=> :query_vec::vector) AS score
        FROM chunk_embeddings ce
        JOIN chunks c ON c.id = ce.chunk_id
        JOIN documents d ON d.id = c.document_id
        WHERE {' AND '.join(where_clauses)}
        ORDER BY ce.embedding <=> :query_vec::vector
        LIMIT :top_k
        """
    )

    result = await db.execute(sql, params)
    rows = result.fetchall()

    return [
        {
            "chunk_id": str(row.chunk_id),
            "text": row.text,
            "source": row.source,
            "score": float(row.score),
            "metadata": row.chunk_metadata or {},
        }
        for row in rows
    ]


async def retrieve_chunks(
    db: AsyncSession,
    query: str,
    course_id: Optional[UUID] = None,
    document_id: Optional[UUID] = None,
    page_start: Optional[int] = None,
    page_end: Optional[int] = None,
    top_k: int | None = None,
) -> List[Dict[str, Any]]:
    """
    Embed the query and retrieve the top-K most similar chunks via ChromaDB.

    Returns list[dict] with keys: chunk_id, text, source, score, metadata
    """
    import uuid

    import anyio
    from sqlalchemy import select

    from app.db.models import Chunk, Document
    from app.rag import chroma_store

    k = top_k or settings.RAG_TOP_K
    query_embedding = embedder.embed_text(query)

    where: Optional[Dict[str, Any]] = None
    if document_id:
        where = {"document_id": str(document_id)}
    elif course_id:
        where = {"course_id": str(course_id)}

    n_results = max(k * 5, k)

    try:
        chroma_result = await anyio.to_thread.run_sync(
            chroma_store.query,
            query_embedding=query_embedding,
            n_results=n_results,
            where=where,
        )
    except Exception:
        return []

    ids = (chroma_result.get("ids") or [[]])[0] or []
    distances = (chroma_result.get("distances") or [[]])[0] or []

    if not ids:
        return []

    scores_by_id: Dict[str, float] = {}
    for chunk_id, distance in zip(ids, distances):
        try:
            score = 1.0 - float(distance)
        except Exception:
            score = 0.0
        scores_by_id[str(chunk_id)] = score

    chunk_uuids: list[uuid.UUID] = []
    for chunk_id in ids:
        try:
            chunk_uuids.append(uuid.UUID(str(chunk_id)))
        except Exception:
            continue

    if not chunk_uuids:
        return []

    stmt = (
        select(Chunk, Document)
        .join(Document, Document.id == Chunk.document_id)
        .where(Chunk.id.in_(chunk_uuids))
        .where(Document.status == "ready")
        .where(Document.is_deleted.is_(False))
    )

    if document_id:
        stmt = stmt.where(Document.id == document_id)
    elif course_id:
        stmt = stmt.where(Document.course_id == course_id)

    if page_start is not None:
        stmt = stmt.where(Chunk.page_start.is_not(None)).where(Chunk.page_start >= page_start)
    if page_end is not None:
        stmt = stmt.where(Chunk.page_end.is_not(None)).where(Chunk.page_end <= page_end)

    result = await db.execute(stmt)
    rows = result.all()

    by_id = {str(chunk.id): (chunk, doc) for chunk, doc in rows}

    chunks: list[dict[str, Any]] = []
    for chunk_id in ids:
        key = str(chunk_id)
        pair = by_id.get(key)
        if not pair:
            continue

        chunk, doc = pair
        chunks.append(
            {
                "chunk_id": key,
                "text": chunk.text,
                "source": doc.filename,
                "score": float(scores_by_id.get(key, 0.0)),
                "metadata": chunk.metadata_ or {},
                "page_start": chunk.page_start,
                "page_end": chunk.page_end,
                "heading": chunk.heading,
            }
        )
        if len(chunks) >= k:
            break

    return chunks
