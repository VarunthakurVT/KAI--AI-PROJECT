"""
NEXUS Backend – Database Package

Exports core database components (engine, session, Base) and all SQLAlchemy models.
"""

from app.db.session import Base, engine, async_session_factory
from app.db.models import (
    User,
    Course,
    Document,
    Chunk,
    Conversation,
    Message,
    ExamPaper,
    ScribeFolder,
    ScribeNote,
    DailyProgress,
)

__all__ = [
    # Session & engine
    "Base",
    "engine",
    "async_session_factory",
    # Models
    "User",
    "Course",
    "Document",
    "Chunk",
    "Conversation",
    "Message",
    "ExamPaper",
    "ScribeFolder",
    "ScribeNote",
    "DailyProgress",
]
