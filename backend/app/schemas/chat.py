"""
NEXUS Backend – Chat Schemas

Pydantic models for chat request/response and SSE events.
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from uuid import UUID
from datetime import datetime


# ── Formatted Response ──

class FormattedAIResponse(BaseModel):
    """Structured AI response with heading, content, and follow-up."""
    greeting: str
    heading: str
    heading_icon: str = "🔗"
    content: str
    followup: str
    followup_icon: str = "❓"


# ── Request ──

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=10000)
    conversation_id: Optional[UUID] = None
    course_id: Optional[UUID] = None
    tooling_mode: bool = False  # enable agent tool-calling
    use_rag: bool = True  # if False, general conversation mode; if True, course-aware RAG mode
    user_name: Optional[str] = None  # Display name for personalization


# ── Response ──

class Citation(BaseModel):
    chunk_id: str
    text: str
    source: str  # original filename


class CalendarEventPayload(BaseModel):
    id: Optional[str] = None
    title: str
    start: str
    end: str
    html_link: Optional[str] = None


class ChatResponse(BaseModel):
    message_id: UUID
    conversation_id: UUID
    content: str
    role: str = "assistant"
    formatted_response: Optional[FormattedAIResponse] = None
    citations: List[Citation] = []
    token_usage: Optional[dict] = None
    created_at: Optional[datetime] = None
    calendar_updated: bool = False
    new_event: Optional[CalendarEventPayload] = None

    model_config = {"from_attributes": True}


class MessageResponse(BaseModel):
    id: UUID
    role: str 
    content: str
    citations: Optional[List[Citation]] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ConversationResponse(BaseModel):
    id: UUID
    title: Optional[str]
    course_id: Optional[UUID]
    created_at: datetime
    messages: List[MessageResponse] = []

    model_config = {"from_attributes": True}
