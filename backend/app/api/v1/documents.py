"""
NEXUS Backend – Document API Endpoints

POST /v1/courses/{course_id}/documents    → upload a document
POST /v1/documents/{document_id}/ingest   → run ingestion (chunk + embed)
GET  /v1/documents/{document_id}          → get document status
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.db.session import get_db
from app.db.models import User, Course, Document, Chunk
from app.schemas.documents import DocumentResponse, IngestResponse
from app.dependencies import get_current_user
from app.rag.unified_core import create_document_upload, determine_content_type, ingest_document_record

import structlog
logger = structlog.get_logger(__name__)
router = APIRouter()


@router.post("/courses/{course_id}/documents", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    course_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload a document to a course."""
    # Verify course ownership
    result = await db.execute(
        select(Course).where(Course.id == course_id, Course.owner_user_id == current_user.id)
    )
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")

    filename = file.filename or "unknown"
    file_bytes = await file.read()
    content_type = determine_content_type(filename, file.content_type)
    doc = await create_document_upload(
        db=db,
        course_id=course.id,
        filename=filename,
        file_bytes=file_bytes,
        content_type=content_type,
    )

    return DocumentResponse(
        id=doc.id,
        course_id=doc.course_id,
        filename=doc.filename,
        content_type=doc.content_type,
        file_size=doc.file_size,
        status=doc.status,
        error_message=doc.error_message,
        created_at=doc.created_at,
        chunk_count=0,
    )


@router.post("/{document_id}/ingest", response_model=IngestResponse)
async def ingest_document(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Run the ingestion pipeline on an uploaded document:
    1. Extract text from the file
    2. Split into chunks
    3. Generate embeddings
    4. Store chunks in Postgres + vectors in ChromaDB
    """
    # Fetch document
    result = await db.execute(
        select(Document)
        .join(Course, Course.id == Document.course_id)
        .where(Document.id == document_id, Course.owner_user_id == current_user.id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    if doc.status == "ready":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Document already ingested")

    try:
        chunks_created, _ = await ingest_document_record(db=db, document=doc)
        logger.info("document_ingested", document_id=str(doc.id), chunks=chunks_created)

        return IngestResponse(
            document_id=doc.id,
            status=doc.status,
            chunks_created=chunks_created,
            message=f"Successfully ingested '{doc.filename}' — {chunks_created} chunks created.",
        )

    except Exception as e:
        doc.status = "error"
        doc.error_message = str(e)
        await db.flush()
        logger.error("ingestion_error", document_id=str(doc.id), error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ingestion failed: {str(e)}",
        )


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get document details and ingestion status."""
    result = await db.execute(
        select(
            Document,
            func.count(Chunk.id).label("chunk_count"),
        )
        .outerjoin(Chunk, Chunk.document_id == Document.id)
        .join(Course, Course.id == Document.course_id)
        .where(Document.id == document_id, Course.owner_user_id == current_user.id)
        .group_by(Document.id)
    )

    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    doc = row[0]
    return DocumentResponse(
        id=doc.id,
        course_id=doc.course_id,
        filename=doc.filename,
        content_type=doc.content_type,
        file_size=doc.file_size,
        status=doc.status,
        error_message=doc.error_message,
        created_at=doc.created_at,
        chunk_count=row[1],
    )
