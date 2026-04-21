"""
NEXUS Backend - Examiner Schemas
"""

from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field


QuestionType = Literal["mcq", "code", "theory"]
QuestionDifficulty = Literal["easy", "medium", "hard"]
SourceMode = Literal["knowledge", "pdf"]


class ExamQuestion(BaseModel):
    id: str
    type: QuestionType
    difficulty: QuestionDifficulty
    topic: str
    question: str
    options: list[str] = Field(default_factory=list)
    correct_answer: Optional[int] = None
    answer_guide: Optional[str] = None
    source_excerpt: Optional[str] = None
    source_document: Optional[str] = None


class ExamPaperSummary(BaseModel):
    id: UUID
    title: str
    source_mode: SourceMode
    status: str
    question_count: int
    created_at: datetime
    source_label: Optional[str] = None


class ExamPaperResponse(ExamPaperSummary):
    document_id: Optional[UUID] = None
    settings: dict = Field(default_factory=dict)
    questions: list[ExamQuestion] = Field(default_factory=list)
    metadata: dict = Field(default_factory=dict)
    error_message: Optional[str] = None
