"""
NEXUS Backend – SQLAlchemy Models

Defines all database tables: users, courses, documents, chunks,
conversations, messages, daily_progress.

Upgrades:
  - DailyProgress table for streak tracking & progress rings
  - Enhanced chunk metadata with page_start/page_end for filtered RAG
  - Soft deletes (is_deleted) on Documents, Conversations, ScribeNotes
"""

import uuid
from sqlalchemy import (
    Column, String, Text, Integer, Float, Boolean, DateTime, Date, ForeignKey,
    JSON, Index, UniqueConstraint, func, Uuid, LargeBinary,
)
from sqlalchemy.orm import relationship
from app.db.session import Base


def _uuid():
    return uuid.uuid4()


# ╔══════════════════════════════════════════════╗
# ║  Users                                       ║
# ╚══════════════════════════════════════════════╝
class User(Base):
    __tablename__ = "users"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=_uuid)
    email = Column(String(320), unique=True, nullable=False, index=True)
    password_hash = Column(String(256), nullable=False)
    display_name = Column(String(100), nullable=True)
    daily_goal_minutes = Column(Integer, default=180, nullable=False)  # Target for UI progress rings
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    is_active = Column(Boolean, default=True)

    # Relationships
    courses = relationship("Course", back_populates="owner", cascade="all, delete-orphan")
    conversations = relationship("Conversation", back_populates="user", cascade="all, delete-orphan")
    exam_papers = relationship("ExamPaper", back_populates="owner", cascade="all, delete-orphan")
    scribe_folders = relationship("ScribeFolder", back_populates="user", cascade="all, delete-orphan")
    scribe_notes = relationship("ScribeNote", back_populates="user", cascade="all, delete-orphan")
    daily_progress = relationship("DailyProgress", back_populates="user", cascade="all, delete-orphan")


# ╔══════════════════════════════════════════════╗
# ║  Courses                                     ║
# ╚══════════════════════════════════════════════╝
class Course(Base):
    __tablename__ = "courses"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=_uuid)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    owner_user_id = Column(Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    owner = relationship("User", back_populates="courses")
    documents = relationship("Document", back_populates="course", cascade="all, delete-orphan")
    exam_papers = relationship("ExamPaper", back_populates="course", cascade="all, delete-orphan")
    conversations = relationship("Conversation", back_populates="course")


# ╔══════════════════════════════════════════════╗
# ║  Documents                                   ║
# ╚══════════════════════════════════════════════╝
class Document(Base):
    __tablename__ = "documents"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=_uuid)
    course_id = Column(Uuid(as_uuid=True), ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    filename = Column(String(512), nullable=False)
    content_type = Column(String(100), nullable=False)  # pdf, markdown, text
    file_size = Column(Integer, nullable=True)
    status = Column(String(50), default="uploaded")  # uploaded → processing → ready → error
    error_message = Column(Text, nullable=True)
    metadata_ = Column("metadata", JSON, default=dict)
    is_deleted = Column(Boolean, default=False, nullable=False)  # ✨ Soft delete – hides from UI, keeps vectors
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    course = relationship("Course", back_populates="documents")
    chunks = relationship("Chunk", back_populates="document", cascade="all, delete-orphan")
    exam_papers = relationship("ExamPaper", back_populates="document")


# ╔══════════════════════════════════════════════╗
# ║  Chunks                                      ║
# ╚══════════════════════════════════════════════╝
class Chunk(Base):
    __tablename__ = "chunks"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=_uuid)
    document_id = Column(Uuid(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    chunk_index = Column(Integer, nullable=False)
    text = Column(Text, nullable=False)
    metadata_ = Column("metadata", JSON, default=dict)  # page_number, heading, topic, etc.
    page_start = Column(Integer, nullable=True)   # ✨ Enables "quiz me on pages 5-15" filtering
    page_end = Column(Integer, nullable=True)
    heading = Column(String(500), nullable=True)  # ✨ Section heading for topic-level filtering
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    document = relationship("Document", back_populates="chunks")


# ╔══════════════════════════════════════════════╗
# ║  Chunk Embeddings (pgvector)                 ║
# ╚══════════════════════════════════════════════╝
# ╔══════════════════════════════════════════════╗
# ║  Conversations                               ║
# ╚══════════════════════════════════════════════╝
class ExamPaper(Base):
    __tablename__ = "exam_papers"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=_uuid)
    owner_user_id = Column(Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    course_id = Column(Uuid(as_uuid=True), ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    document_id = Column(Uuid(as_uuid=True), ForeignKey("documents.id", ondelete="SET NULL"), nullable=True, index=True)
    title = Column(String(255), nullable=False)
    source_mode = Column(String(20), nullable=False)
    status = Column(String(50), nullable=False, default="ready")
    question_count = Column(Integer, nullable=False, default=5)
    settings_ = Column("settings", JSON, default=dict)
    questions_ = Column("questions", JSON, default=list)
    metadata_ = Column("metadata", JSON, default=dict)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    owner = relationship("User", back_populates="exam_papers")
    course = relationship("Course", back_populates="exam_papers")
    document = relationship("Document", back_populates="exam_papers")

    __table_args__ = (
        Index("ix_exam_papers_owner_created_at", "owner_user_id", "created_at"),
    )


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=_uuid)
    user_id = Column(Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    course_id = Column(Uuid(as_uuid=True), ForeignKey("courses.id", ondelete="SET NULL"), nullable=True)
    title = Column(String(255), nullable=True)
    is_deleted = Column(Boolean, default=False, nullable=False)  # ✨ Soft delete – preserves AI context history
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="conversations")
    course = relationship("Course", back_populates="conversations")
    messages = relationship("Message", back_populates="conversation", cascade="all, delete-orphan",
                            order_by="Message.created_at")


# ╔══════════════════════════════════════════════╗
# ║  Messages                                    ║
# ╚══════════════════════════════════════════════╝
class Message(Base):
    __tablename__ = "messages"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=_uuid)
    conversation_id = Column(Uuid(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(20), nullable=False)  # user, assistant, system
    content = Column(Text, nullable=False)
    token_usage = Column(JSON, nullable=True)  # {"prompt_tokens": ..., "completion_tokens": ...}
    citations = Column(JSON, nullable=True)  # [{"chunk_id": ..., "text": ..., "source": ...}]
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    conversation = relationship("Conversation", back_populates="messages")


# ╔══════════════════════════════════════════════╗
# ║  Scribe – Folders & Notes                    ║
# ╚══════════════════════════════════════════════╝
class ScribeFolder(Base):
    __tablename__ = "scribe_folders"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=_uuid)
    user_id = Column(Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(120), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="scribe_folders")
    notes = relationship("ScribeNote", back_populates="folder", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_scribe_folders_user_name", "user_id", "name", unique=True),
    )


class ScribeNote(Base):
    __tablename__ = "scribe_notes"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=_uuid)
    user_id = Column(Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    folder_id = Column(Uuid(as_uuid=True), ForeignKey("scribe_folders.id", ondelete="CASCADE"), nullable=True, index=True)

    title = Column(String(255), nullable=False)
    summary = Column(Text, nullable=True)
    transcript = Column(Text, nullable=True)
    structured_notes = Column(JSON, nullable=True)

    audio_filename = Column(String(512), nullable=True)
    audio_mime = Column(String(120), nullable=True)
    audio_bytes = Column(LargeBinary, nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    is_deleted = Column(Boolean, default=False, nullable=False)  # ✨ Soft delete

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="scribe_notes")
    folder = relationship("ScribeFolder", back_populates="notes")

    __table_args__ = (
        Index("ix_scribe_notes_user_created_at", "user_id", "created_at"),
        Index("ix_scribe_notes_user_not_deleted", "user_id", "is_deleted", "created_at"),  # Fast lookup for active notes
    )


# ╔══════════════════════════════════════════════╗
# ║  Daily Progress – Streaks & Rings            ║
# ╚══════════════════════════════════════════════╝
class DailyProgress(Base):
    """Feeds data to the React concentric progress rings (Day/Week/Month/Year).

    Each row = one calendar day for one user.
    The frontend queries this to compute streaks, average study time,
    and fill the 4 concentric ring animation.
    """
    __tablename__ = "daily_progress"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=_uuid)
    user_id = Column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    date = Column(Date, nullable=False)  # Calendar date (no time component)
    minutes_studied = Column(Integer, default=0, nullable=False)
    topics_studied = Column(JSON, default=list)  # ["Pointers", "RAII", ...]
    streak_active = Column(Boolean, default=False, nullable=False)  # Was goal met this day?
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user = relationship("User", back_populates="daily_progress")

    __table_args__ = (
        UniqueConstraint("user_id", "date", name="uq_daily_progress_user_date"),
        Index("ix_daily_progress_user_date", "user_id", "date"),
    )
