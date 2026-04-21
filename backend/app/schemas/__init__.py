"""Schemas package exports."""

from .auth import LoginRequest, RegisterRequest, TokenResponse, UserResponse
from .chat import (
    ChatRequest,
    ChatResponse,
    Citation,
    ConversationResponse,
    MessageResponse,
)
from .documents import CourseCreate, CourseResponse, DocumentResponse, IngestResponse
from .examiner import ExamPaperResponse, ExamPaperSummary, ExamQuestion
from .progress import (
    DayProgressResponse,
    MonthProgressResponse,
    ProgressSummaryResponse,
    RecordProgressRequest,
)
from .scribe import (
    ScribeFolderCreateRequest,
    ScribeFolderResponse,
    ScribeNoteCreateFromChatRequest,
    ScribeNoteResponse,
    ScribeNotes,
    ScribeStructureRequest,
    ScribeTopic,
    ScribeTranscribeResponse,
)

__all__ = [
    "RegisterRequest",
    "LoginRequest",
    "TokenResponse",
    "UserResponse",
    "ChatRequest",
    "Citation",
    "ChatResponse",
    "MessageResponse",
    "ConversationResponse",
    "CourseCreate",
    "CourseResponse",
    "DocumentResponse",
    "IngestResponse",
    "ExamQuestion",
    "ExamPaperSummary",
    "ExamPaperResponse",
    "RecordProgressRequest",
    "DayProgressResponse",
    "MonthProgressResponse",
    "ProgressSummaryResponse",
    "ScribeTranscribeResponse",
    "ScribeStructureRequest",
    "ScribeTopic",
    "ScribeNotes",
    "ScribeFolderCreateRequest",
    "ScribeFolderResponse",
    "ScribeNoteCreateFromChatRequest",
    "ScribeNoteResponse",
]
