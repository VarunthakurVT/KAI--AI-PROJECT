"""
NEXUS Backend – Document & Course Schemas

Pydantic models for course and document management.
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from uuid import UUID
from datetime import datetime


# ── Course ──

class CourseCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None


class CourseResponse(BaseModel):
    id: UUID
    title: str
    description: Optional[str]
    owner_user_id: UUID
    created_at: datetime
    document_count: int = 0

    model_config = {"from_attributes": True}


# ── Document ──

class DocumentResponse(BaseModel):
    id: UUID
    course_id: UUID
    filename: str
    content_type: str
    file_size: Optional[int]
    status: str
    error_message: Optional[str]
    created_at: datetime
    chunk_count: int = 0

    model_config = {"from_attributes": True}


class IngestResponse(BaseModel):
    document_id: UUID
    status: str
    chunks_created: int
    message: str
