from pydantic import BaseModel, Field
from datetime import datetime
from uuid import UUID


class ScribeTranscribeResponse(BaseModel):
    transcript: str = Field(..., description="Raw transcript from speech-to-text")


class ScribeGroqConfigResponse(BaseModel):
    provider: str = "groq"
    transcription_model: str
    note_model: str
    language: str | None = None


class ScribeGroqTranscribeResponse(ScribeTranscribeResponse):
    provider: str = "groq"
    transcription_model: str
    note_model: str
    language: str | None = None


class ScribeStructureRequest(BaseModel):
    transcript: str = Field(..., min_length=1, description="Raw transcript text")


class ScribeTopic(BaseModel):
    heading: str
    points: list[str]


class ScribeSectionMeta(BaseModel):
    label: str = "Scribe"
    caption: str = "Bullet-first notes in your NEXUS theme."


class ScribeTheme(BaseModel):
    accent: str = "amber"
    mood: str = "focused"
    layout: str = "scribe-stack"


class ScribeNotes(BaseModel):
    title: str
    topics: list[ScribeTopic]
    summary: str
    key_takeaways: list[str] = Field(default_factory=list)
    action_items: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    scribe_section: ScribeSectionMeta = Field(default_factory=ScribeSectionMeta)
    theme: ScribeTheme = Field(default_factory=ScribeTheme)


class ScribeFolderCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)


class ScribeFolderResponse(BaseModel):
    id: UUID
    name: str
    created_at: datetime


class ScribeNoteCreateFromChatRequest(BaseModel):
    folder_id: UUID | None = None
    prompt: str = Field(..., min_length=1, max_length=8000)


class ScribeNoteResponse(BaseModel):
    id: UUID
    folder_id: UUID | None
    title: str
    summary: str | None
    transcript: str | None
    structured_notes: dict | None
    audio_filename: str | None
    audio_mime: str | None
    duration_seconds: int | None
    is_deleted: bool = False
    created_at: datetime
