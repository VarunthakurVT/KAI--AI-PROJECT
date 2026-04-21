"""
NEXUS Backend - Scribe API Endpoints

Voice notes and note-structuring endpoints powered by Groq.
"""

import asyncio
import json
import re
import uuid
from collections import Counter
from pathlib import Path
from typing import Any, Optional

import structlog
from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.models import ScribeFolder, ScribeNote, User
from app.db.session import get_db
from app.dependencies import get_optional_user
from app.llm.groq_client import scribe_groq_client
from app.schemas.scribe import (
    ScribeFolderCreateRequest,
    ScribeFolderResponse,
    ScribeGroqConfigResponse,
    ScribeGroqTranscribeResponse,
    ScribeNoteCreateFromChatRequest,
    ScribeNoteResponse,
    ScribeNotes,
    ScribeStructureRequest,
    ScribeTopic,
    ScribeTranscribeResponse,
)

logger = structlog.get_logger(__name__)
router = APIRouter()

TRANSCRIPTION_MODEL = settings.SCRIBE_GROQ_TRANSCRIPTION_MODEL or "whisper-large-v3"
SCRIBE_NOTE_MODEL = settings.SCRIBE_GROQ_MODEL or settings.GROQ_MODEL
SCRIBE_LANGUAGE = settings.SCRIBE_GROQ_LANGUAGE.strip() or None
MAX_SCRIBE_SOURCE_CHARS = 10_000  # Reduced for faster processing

# Temporary storage for chunked uploads (upload_session_id -> chunks dict)
_upload_chunks: dict[str, dict[str, Any]] = {}

STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "for",
    "from",
    "has",
    "have",
    "in",
    "is",
    "it",
    "of",
    "on",
    "or",
    "that",
    "the",
    "this",
    "to",
    "was",
    "we",
    "with",
    "you",
    "your",
}


def _scribe_provider_meta() -> dict[str, Any]:
    return {
        "provider": "groq",
        "transcription_model": TRANSCRIPTION_MODEL,
        "note_model": SCRIBE_NOTE_MODEL,
        "language": SCRIBE_LANGUAGE,
    }


async def _transcribe_with_scribe_groq(
    *,
    file_bytes: bytes,
    filename: str,
    content_type: str,
) -> str:
    transcript = await scribe_groq_client.transcribe_audio(
        audio_bytes=file_bytes,
        filename=filename,
        content_type=content_type,
        model=TRANSCRIPTION_MODEL,
        language=SCRIBE_LANGUAGE,
    )
    return _normalize_text(transcript)


def _slugify_session(session_key: Optional[str]) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "-", (session_key or "local").lower()).strip("-")
    return cleaned[:48] or "local"


async def _resolve_scribe_user(
    db: AsyncSession,
    current_user: Optional[User],
    session_key: Optional[str],
) -> User:
    """Ensure we always have a real user row (guest or authenticated)."""
    if current_user is not None:
        return current_user

    session_slug = _slugify_session(session_key)
    guest_email = f"scribe+{session_slug}@{settings.EXAMINER_GUEST_EMAIL_DOMAIN}"
    result = await db.execute(select(User).where(User.email == guest_email))
    guest_user = result.scalar_one_or_none()

    if guest_user is None:
        guest_user = User(
            email=guest_email,
            password_hash="guest-session",
            display_name="Scribe Guest",
            is_active=True,
        )
        db.add(guest_user)
        await db.flush()

    return guest_user


def _normalize_text(value: str) -> str:
    collapsed = re.sub(r"\r\n?", "\n", value or "")
    collapsed = re.sub(r"\n{3,}", "\n\n", collapsed)
    collapsed = re.sub(r"[ \t]{2,}", " ", collapsed)
    return collapsed.strip()


def _safe_json_loads(raw: str) -> object:
    cleaned = (raw or "").strip()
    if not cleaned:
        raise ValueError("LLM returned an empty response.")

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start >= 0 and end > start:
            return json.loads(cleaned[start : end + 1])
        raise


def _normalize_string_list(value: Any, *, max_items: int = 6, max_len: int = 180) -> list[str]:
    if not isinstance(value, list):
        return []

    cleaned: list[str] = []
    for item in value:
        text = re.sub(r"\s+", " ", str(item or "")).strip(" -\n\t")
        if not text:
            continue
        text = text[:max_len].strip()
        if text not in cleaned:
            cleaned.append(text)
        if len(cleaned) >= max_items:
            break
    return cleaned


def _split_sentences(text: str) -> list[str]:
    normalized = _normalize_text(text)
    if not normalized:
        return []

    raw_parts = re.split(r"(?<=[.!?])\s+|\n+", normalized)
    sentences: list[str] = []
    for part in raw_parts:
        cleaned = re.sub(r"\s+", " ", part).strip(" -")
        if len(cleaned) >= 12:
            sentences.append(cleaned)
    return sentences


def _truncate_words(text: str, max_words: int) -> str:
    words = re.findall(r"\S+", text or "")
    if len(words) <= max_words:
        return " ".join(words)
    return " ".join(words[:max_words]).rstrip(",.;:") + "..."


def _title_from_text(text: str, fallback: str = "Scribe Note") -> str:
    sentences = _split_sentences(text)
    if sentences:
        candidate = sentences[0]
    else:
        candidate = _normalize_text(text)

    candidate = re.sub(r"^[^A-Za-z0-9]+", "", candidate)
    candidate = re.sub(r"[^A-Za-z0-9 ]+", "", candidate)
    candidate = _truncate_words(candidate, 7).strip()
    return candidate.title() or fallback


def _pick_keywords(text: str, limit: int = 6) -> list[str]:
    tokens = re.findall(r"[A-Za-z][A-Za-z0-9+-]{3,}", text or "")
    counts = Counter(token.lower() for token in tokens if token.lower() not in STOPWORDS)
    keywords: list[str] = []
    for keyword, _count in counts.most_common(limit * 2):
        title = keyword.replace("-", " ").title()
        if title not in keywords:
            keywords.append(title)
        if len(keywords) >= limit:
            break
    return keywords


def _fallback_structured_notes(source_text: str, *, source_name: Optional[str] = None) -> dict[str, Any]:
    sentences = _split_sentences(source_text)
    summary = _truncate_words(" ".join(sentences[:2]) or _normalize_text(source_text), 40)
    highlights = sentences[:3] or [summary]
    detail_points = sentences[3:7]

    topics = [
        {
            "heading": "Key Beats",
            "points": highlights[:4] or [summary],
        }
    ]
    if detail_points:
        topics.append(
            {
                "heading": "Details",
                "points": detail_points[:4],
            }
        )

    fallback_title = Path(source_name).stem.replace("-", " ").replace("_", " ").title() if source_name else "Scribe Note"
    return {
        "title": _title_from_text(source_text, fallback=fallback_title or "Scribe Note"),
        "summary": summary or "Clean summary unavailable, but the key points are captured below.",
        "topics": topics,
        "key_takeaways": highlights[:4],
        "action_items": [],
        "keywords": _pick_keywords(source_text),
        "scribe_section": {
            "label": "Scribe",
            "caption": "Bullet-first notes shaped for your amber glass theme.",
        },
        "theme": {
            "accent": "amber",
            "mood": "focused",
            "layout": "scribe-stack",
        },
    }


def _normalize_topics(raw_topics: Any, fallback_topics: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not isinstance(raw_topics, list):
        return fallback_topics

    normalized_topics: list[dict[str, Any]] = []
    for item in raw_topics:
        if not isinstance(item, dict):
            continue
        heading = re.sub(r"\s+", " ", str(item.get("heading") or item.get("title") or "")).strip()
        points = _normalize_string_list(item.get("points") or item.get("bullets"), max_items=5)
        if heading and points:
            normalized_topics.append({"heading": heading[:80], "points": points})
        if len(normalized_topics) >= 4:
            break
    return normalized_topics or fallback_topics


def _normalize_notes_payload(
    payload: object,
    *,
    source_text: str,
    source_name: Optional[str] = None,
) -> dict[str, Any]:
    fallback = _fallback_structured_notes(source_text, source_name=source_name)
    if not isinstance(payload, dict):
        return fallback

    scribe_section = payload.get("scribe_section")
    theme = payload.get("theme")

    normalized = {
        "title": re.sub(r"\s+", " ", str(payload.get("title") or fallback["title"])).strip()[:255] or fallback["title"],
        "summary": re.sub(r"\s+", " ", str(payload.get("summary") or fallback["summary"])).strip()[:600] or fallback["summary"],
        "topics": _normalize_topics(payload.get("topics") or payload.get("sections"), fallback["topics"]),
        "key_takeaways": _normalize_string_list(
            payload.get("key_takeaways") or payload.get("highlights"),
            max_items=5,
        )
        or fallback["key_takeaways"],
        "action_items": _normalize_string_list(payload.get("action_items") or payload.get("next_steps"), max_items=5),
        "keywords": _normalize_string_list(payload.get("keywords"), max_items=6, max_len=40) or fallback["keywords"],
        "scribe_section": {
            "label": re.sub(r"\s+", " ", str((scribe_section or {}).get("label") or fallback["scribe_section"]["label"])).strip()[:32],
            "caption": re.sub(r"\s+", " ", str((scribe_section or {}).get("caption") or fallback["scribe_section"]["caption"])).strip()[:120],
        },
        "theme": {
            "accent": re.sub(r"\s+", " ", str((theme or {}).get("accent") or fallback["theme"]["accent"])).strip()[:24],
            "mood": re.sub(r"\s+", " ", str((theme or {}).get("mood") or fallback["theme"]["mood"])).strip()[:40],
            "layout": re.sub(r"\s+", " ", str((theme or {}).get("layout") or fallback["theme"]["layout"])).strip()[:40],
        },
    }

    if not normalized["action_items"]:
        normalized["action_items"] = fallback["action_items"]

    return normalized


def _build_scribe_prompt(source_text: str, *, note_mode: str, source_name: Optional[str] = None) -> str:
    source_label = source_name or ("voice transcript" if note_mode == "audio" else "note prompt")
    bounded_text = _normalize_text(source_text)[:MAX_SCRIBE_SOURCE_CHARS]

    return (
        "Convert to study-ready JSON notes. Keep it tight, punchy, organized for quick review.\n\n"
        f"Source: {source_label} | Mode: {note_mode}\n\n"
        "Return this JSON structure exactly:\n"
        "{\n"
        '  "title": "concise title",\n'
        '  "summary": "2-3 sentence recap",\n'
        '  "key_takeaways": ["short bullet", "short bullet"],\n'
        '  "topics": [\n'
        '    {"heading": "section title", "points": ["bullet point"]}\n'
        "  ],\n"
        '  "action_items": ["next steps"],\n'
        '  "keywords": ["key terms"],\n'
        '  "scribe_section": {"label": "Scribe", "caption": "note type"},\n'
        '  "theme": {"accent": "amber", "mood": "focused", "layout": "scribe-stack"}\n'
        "}\n\n"
        "Guidelines: 2-4 topics, 2-5 bullets per topic, no filler or duplicates.\n\n"
        "TEXT TO STRUCTURE:\n"
        f"{bounded_text}"
    )


async def _generate_structured_notes(
    source_text: str,
    *,
    note_mode: str,
    source_name: Optional[str] = None,
) -> dict[str, Any]:
    prompt = _build_scribe_prompt(source_text, note_mode=note_mode, source_name=source_name)

    try:
        result = await scribe_groq_client.chat_completion(
            messages=[
                {
                    "role": "system",
                    "content": "Output ONLY valid JSON. No markdown, no extra text.",
                },
                {"role": "user", "content": prompt},
            ],
            model=SCRIBE_NOTE_MODEL,
            temperature=0.1,  # Lower temp = faster & more consistent
            max_tokens=800,   # Reduced from 1400 for faster response
        )
        parsed = _safe_json_loads(result.get("content") or "")
        return _normalize_notes_payload(parsed, source_text=source_text, source_name=source_name)
    except Exception as exc:
        logger.warning("scribe_notes_fallback", error=str(exc))
        return _fallback_structured_notes(source_text, source_name=source_name)


async def _resolve_folder_id(
    db: AsyncSession,
    user: User,
    folder_id: Optional[uuid.UUID],
) -> Optional[uuid.UUID]:
    if folder_id is None:
        return None

    result = await db.execute(
        select(ScribeFolder).where(
            ScribeFolder.id == folder_id,
            ScribeFolder.user_id == user.id,
        )
    )
    folder = result.scalar_one_or_none()
    if folder is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")
    return folder.id


def _serialize_folder(folder: ScribeFolder) -> dict[str, Any]:
    return {
        "id": folder.id,
        "name": folder.name,
        "created_at": folder.created_at,
    }


def _serialize_note(note: ScribeNote) -> dict[str, Any]:
    return {
        "id": note.id,
        "folder_id": note.folder_id,
        "title": note.title,
        "summary": note.summary,
        "transcript": note.transcript,
        "structured_notes": note.structured_notes,
        "audio_filename": note.audio_filename,
        "audio_mime": note.audio_mime,
        "duration_seconds": note.duration_seconds,
        "is_deleted": note.is_deleted,
        "created_at": note.created_at,
    }


async def _create_scribe_note_from_audio(
    *,
    file: UploadFile,
    folder_id: Optional[uuid.UUID],
    x_nexus_session: Optional[str],
    current_user: Optional[User],
    db: AsyncSession,
) -> dict[str, Any]:
    user = await _resolve_scribe_user(db, current_user, x_nexus_session)
    resolved_folder_id = await _resolve_folder_id(db, user, folder_id)

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty.")

    try:
        transcript = await _transcribe_with_scribe_groq(
            file_bytes=file_bytes,
            filename=file.filename or "recording.webm",
            content_type=file.content_type or "application/octet-stream",
        )
    except Exception as exc:
        logger.error("scribe_audio_note_error", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Audio transcription failed while contacting Groq.",
        ) from exc

    if not transcript:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No speech detected in the uploaded file.")

    structured_notes = await _generate_structured_notes(
        transcript,
        note_mode="audio",
        source_name=file.filename,
    )

    note = ScribeNote(
        id=uuid.uuid4(),
        user_id=user.id,
        folder_id=resolved_folder_id,
        title=structured_notes["title"],
        summary=structured_notes["summary"],
        transcript=transcript,
        structured_notes=structured_notes,
        audio_filename=file.filename,
        audio_mime=file.content_type,
    )
    db.add(note)
    await db.flush()
    await db.refresh(note)
    await db.commit()
    return _serialize_note(note)


async def _create_scribe_note_from_chat(
    *,
    body: ScribeNoteCreateFromChatRequest,
    x_nexus_session: Optional[str],
    current_user: Optional[User],
    db: AsyncSession,
) -> dict[str, Any]:
    user = await _resolve_scribe_user(db, current_user, x_nexus_session)
    resolved_folder_id = await _resolve_folder_id(db, user, body.folder_id)
    prompt = _normalize_text(body.prompt)
    if not prompt:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Prompt cannot be empty.")

    structured_notes = await _generate_structured_notes(prompt, note_mode="chat")
    note = ScribeNote(
        id=uuid.uuid4(),
        user_id=user.id,
        folder_id=resolved_folder_id,
        title=structured_notes["title"],
        summary=structured_notes["summary"],
        transcript=prompt,
        structured_notes=structured_notes,
    )
    db.add(note)
    await db.flush()
    await db.refresh(note)
    await db.commit()
    return _serialize_note(note)


@router.get("/health")
async def scribe_health() -> dict[str, Any]:
    """Health check for Scribe service."""
    return {
        "status": "ok",
        "service": "scribe",
        **_scribe_provider_meta(),
    }


@router.post("/transcribe", response_model=ScribeTranscribeResponse)
async def transcribe_audio(file: UploadFile = File(...)) -> ScribeTranscribeResponse:
    """Transcribe an uploaded audio or screen recording with Groq Whisper."""
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty.")

    try:
        transcript = await _transcribe_with_scribe_groq(
            file_bytes=file_bytes,
            filename=file.filename or "recording.webm",
            content_type=file.content_type or "application/octet-stream",
        )
    except Exception as exc:
        logger.error("scribe_transcription_error", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Transcription failed while contacting Groq.",
        ) from exc

    if not transcript:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No speech detected in the uploaded file.")

    return ScribeTranscribeResponse(transcript=transcript)


@router.get("/groq", response_model=ScribeGroqConfigResponse)
async def scribe_groq_config() -> ScribeGroqConfigResponse:
    """Expose the active Groq provider settings for Scribe."""
    return ScribeGroqConfigResponse(**_scribe_provider_meta())


@router.get("/groq/health", response_model=ScribeGroqConfigResponse)
async def scribe_groq_health() -> ScribeGroqConfigResponse:
    """Health/config endpoint for the dedicated Groq Scribe API."""
    return ScribeGroqConfigResponse(**_scribe_provider_meta())


@router.post("/groq/transcribe", response_model=ScribeGroqTranscribeResponse)
async def transcribe_audio_with_groq(file: UploadFile = File(...)) -> ScribeGroqTranscribeResponse:
    """Explicit Groq Scribe transcription endpoint."""
    basic_response = await transcribe_audio(file=file)
    return ScribeGroqTranscribeResponse(
        transcript=basic_response.transcript,
        **_scribe_provider_meta(),
    )


@router.post("/structure", response_model=ScribeNotes)
async def structure_notes(body: ScribeStructureRequest) -> ScribeNotes:
    transcript = _normalize_text(body.transcript)
    if not transcript:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Transcript cannot be empty.")

    notes = await _generate_structured_notes(transcript, note_mode="transcript")
    return ScribeNotes(
        title=notes["title"],
        summary=notes["summary"],
        topics=[ScribeTopic(**topic) for topic in notes["topics"]],
        key_takeaways=notes["key_takeaways"],
        action_items=notes["action_items"],
        keywords=notes["keywords"],
        scribe_section=notes["scribe_section"],
        theme=notes["theme"],
    )


@router.post("/groq/structure", response_model=ScribeNotes)
async def structure_notes_with_groq(body: ScribeStructureRequest) -> ScribeNotes:
    """Explicit Groq Scribe transcript-to-notes endpoint."""
    return await structure_notes(body)


@router.get("/folders", response_model=list[ScribeFolderResponse])
async def get_folders(
    x_nexus_session: Optional[str] = Header(None),
    current_user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """Get the current user's note folders."""
    user = await _resolve_scribe_user(db, current_user, x_nexus_session)
    result = await db.execute(
        select(ScribeFolder)
        .where(ScribeFolder.user_id == user.id)
        .order_by(ScribeFolder.created_at.asc())
    )
    return [_serialize_folder(folder) for folder in result.scalars().all()]


@router.post("/folders", response_model=ScribeFolderResponse)
async def create_folder(
    req: ScribeFolderCreateRequest,
    x_nexus_session: Optional[str] = Header(None),
    current_user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Create a new folder or return the existing one with the same name."""
    user = await _resolve_scribe_user(db, current_user, x_nexus_session)
    folder_name = re.sub(r"\s+", " ", req.name).strip()
    if not folder_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Folder name cannot be empty.")

    existing_result = await db.execute(
        select(ScribeFolder).where(
            ScribeFolder.user_id == user.id,
            ScribeFolder.name == folder_name,
        )
    )
    existing_folder = existing_result.scalar_one_or_none()
    if existing_folder is not None:
        return _serialize_folder(existing_folder)

    folder = ScribeFolder(
        id=uuid.uuid4(),
        user_id=user.id,
        name=folder_name,
    )
    db.add(folder)
    await db.flush()
    await db.refresh(folder)
    await db.commit()
    return _serialize_folder(folder)


@router.delete("/folders/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_folder(
    folder_id: uuid.UUID,
    x_nexus_session: Optional[str] = Header(None),
    current_user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a folder and its notes."""
    user = await _resolve_scribe_user(db, current_user, x_nexus_session)
    result = await db.execute(
        select(ScribeFolder).where(
            ScribeFolder.id == folder_id,
            ScribeFolder.user_id == user.id,
        )
    )
    folder = result.scalar_one_or_none()
    if folder is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")

    await db.delete(folder)
    await db.commit()


@router.get("/notes", response_model=list[ScribeNoteResponse])
async def get_notes(
    folder_id: Optional[uuid.UUID] = Query(None),
    x_nexus_session: Optional[str] = Header(None),
    current_user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """Get the current user's notes, optionally filtered by folder."""
    user = await _resolve_scribe_user(db, current_user, x_nexus_session)
    await _resolve_folder_id(db, user, folder_id)

    query = select(ScribeNote).where(
        ScribeNote.user_id == user.id,
        ScribeNote.is_deleted.is_(False),
    )
    if folder_id is not None:
        query = query.where(ScribeNote.folder_id == folder_id)

    result = await db.execute(query.order_by(ScribeNote.created_at.desc()))
    return [_serialize_note(note) for note in result.scalars().all()]


@router.post("/notes", response_model=ScribeNoteResponse, status_code=status.HTTP_201_CREATED)
async def create_note(
    folder_id: Optional[uuid.UUID] = Query(None),
    x_nexus_session: Optional[str] = Header(None),
    current_user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Create a blank note shell inside an optional folder."""
    user = await _resolve_scribe_user(db, current_user, x_nexus_session)
    resolved_folder_id = await _resolve_folder_id(db, user, folder_id)

    structured_notes = _fallback_structured_notes("Empty note shell for manual drafting.")
    note = ScribeNote(
        id=uuid.uuid4(),
        user_id=user.id,
        folder_id=resolved_folder_id,
        title="Untitled Scribe Note",
        summary=structured_notes["summary"],
        transcript="",
        structured_notes=structured_notes,
    )
    db.add(note)
    await db.flush()
    await db.refresh(note)
    await db.commit()
    return _serialize_note(note)


@router.delete("/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_note(
    note_id: uuid.UUID,
    x_nexus_session: Optional[str] = Header(None),
    current_user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Soft-delete a note so it disappears from the UI."""
    user = await _resolve_scribe_user(db, current_user, x_nexus_session)
    result = await db.execute(
        select(ScribeNote).where(
            ScribeNote.id == note_id,
            ScribeNote.user_id == user.id,
            ScribeNote.is_deleted.is_(False),
        )
    )
    note = result.scalar_one_or_none()
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")

    note.is_deleted = True
    await db.commit()


@router.post("/notes/audio", response_model=ScribeNoteResponse, status_code=status.HTTP_201_CREATED)
async def create_note_from_audio(
    file: UploadFile = File(...),
    folder_id: Optional[uuid.UUID] = Query(None),
    x_nexus_session: Optional[str] = Header(None),
    current_user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Create a note from an uploaded audio file or screen recording."""
    return await _create_scribe_note_from_audio(
        file=file,
        folder_id=folder_id,
        x_nexus_session=x_nexus_session,
        current_user=current_user,
        db=db,
    )


@router.post("/notes/chat", response_model=ScribeNoteResponse, status_code=status.HTTP_201_CREATED)
async def create_note_from_chat(
    body: ScribeNoteCreateFromChatRequest,
    x_nexus_session: Optional[str] = Header(None),
    current_user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Create a structured note from a text prompt."""
    return await _create_scribe_note_from_chat(
        body=body,
        x_nexus_session=x_nexus_session,
        current_user=current_user,
        db=db,
    )


@router.post("/groq/notes/audio", response_model=ScribeNoteResponse, status_code=status.HTTP_201_CREATED)
async def create_groq_note_from_audio(
    file: UploadFile = File(...),
    folder_id: Optional[uuid.UUID] = Query(None),
    x_nexus_session: Optional[str] = Header(None),
    current_user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Explicit Groq Scribe audio-note endpoint."""
    return await _create_scribe_note_from_audio(
        file=file,
        folder_id=folder_id,
        x_nexus_session=x_nexus_session,
        current_user=current_user,
        db=db,
    )


@router.post("/groq/notes/chat", response_model=ScribeNoteResponse, status_code=status.HTTP_201_CREATED)
async def create_groq_note_from_chat(
    body: ScribeNoteCreateFromChatRequest,
    x_nexus_session: Optional[str] = Header(None),
    current_user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Explicit Groq Scribe text-to-notes endpoint."""
    return await _create_scribe_note_from_chat(
        body=body,
        x_nexus_session=x_nexus_session,
        current_user=current_user,
        db=db,
    )


# ╔════════════════════════════════════════════════╗
# ║  Streaming Audio Upload & Real-Time Processing  ║
# ╚════════════════════════════════════════════════╝


@router.post("/groq/notes/audio/stream")
async def upload_audio_chunk(
    chunk: UploadFile = File(...),
    chunk_index: int = Query(...),
    total_chunks: int = Query(...),
    upload_session_id: str = Query(...),
    filename: str = Query(...),
    content_type: str = Query(...),
    folder_id: Optional[uuid.UUID] = Query(None),
    x_nexus_session: Optional[str] = Header(None),
    current_user: Optional[User] = Depends(get_optional_user),
) -> dict[str, str]:
    """Accept audio file chunk for streaming upload.
    
    Chunks are collected and once all are received, ready for processing.
    """
    try:
        if not chunk or not chunk.file:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Chunk file is empty")
        
        if upload_session_id not in _upload_chunks:
            _upload_chunks[upload_session_id] = {
                "chunks": {},
                "total_chunks": total_chunks,
                "filename": filename,
                "content_type": content_type,
                "folder_id": folder_id,
                "session_id": x_nexus_session,
                "user": current_user,
            }
        
        session_data = _upload_chunks[upload_session_id]
        
        # Validate chunk index
        if chunk_index >= total_chunks or chunk_index < 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid chunk index {chunk_index}")
        
        # Read and store chunk
        chunk_bytes = await chunk.read()
        if not chunk_bytes:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Chunk data is empty")
        
        session_data["chunks"][chunk_index] = chunk_bytes
        
        received = len(session_data["chunks"])
        logger.info(
            "chunk_received",
            upload_id=upload_session_id,
            chunk=chunk_index,
            chunk_size=len(chunk_bytes),
            received=received,
            total=total_chunks,
        )
        
        return {
            "status": "chunk_received",
            "received": str(received),
            "total": str(total_chunks),
            "chunk_index": str(chunk_index),
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("chunk_upload_error", upload_id=upload_session_id, chunk_index=chunk_index, error=str(exc))
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Chunk upload failed: {str(exc)}")


@router.get("/groq/notes/audio/stream/events")
async def stream_audio_processing(
    upload_session_id: str = Query(...),
    folder_id: Optional[uuid.UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Stream real-time progress events (SSE) for audio processing.
    
    Events: progress, complete, error
    """
    
    async def event_generator():
        try:
            # Wait for upload to complete
            session_data = _upload_chunks.get(upload_session_id)
            if not session_data:
                logger.error("session_not_found", upload_id=upload_session_id)
                yield f"event: error\ndata: {json.dumps({'error': 'Session not found'})}\n\n"
                return
            
            logger.info("sse_session_started", upload_id=upload_session_id, total_chunks=session_data.get("total_chunks"))
            
            # Yield: waiting for chunks
            max_wait = 60  # 60 seconds timeout for all chunks
            start_time = asyncio.get_event_loop().time()
            last_logged = 0
            
            while len(session_data["chunks"]) < session_data["total_chunks"]:
                elapsed = asyncio.get_event_loop().time() - start_time
                if elapsed > max_wait:
                    logger.error("upload_timeout", upload_id=upload_session_id, elapsed=elapsed)
                    yield f"event: error\ndata: {json.dumps({'error': 'Upload timeout - chunks incomplete'})}\n\n"
                    return
                
                # Log progress every 5 seconds
                if elapsed - last_logged > 5:
                    logger.info(
                        "waiting_for_chunks",
                        upload_id=upload_session_id,
                        received=len(session_data["chunks"]),
                        total=session_data["total_chunks"],
                        elapsed=elapsed,
                    )
                    last_logged = elapsed
                
                await asyncio.sleep(0.5)
            
            logger.info("all_chunks_received", upload_id=upload_session_id)
            
            # Yield: transcribing
            yield f"event: progress\ndata: {json.dumps({'phase': 'transcribing', 'progress': 65, 'message': 'Transcribing audio...'})}\n\n"
            
            # Reconstruct file from chunks
            chunk_dict = session_data["chunks"]
            file_bytes = b"".join([chunk_dict[i] for i in sorted(chunk_dict.keys())])
            logger.info("file_reconstructed", upload_id=upload_session_id, total_size=len(file_bytes))
            
            # Transcribe
            transcript = await _transcribe_with_scribe_groq(
                file_bytes=file_bytes,
                filename=session_data.get("filename", "audio.webm"),
                content_type=session_data.get("content_type", "audio/webm"),
            )
            
            if not transcript:
                logger.warning("no_speech_detected", upload_id=upload_session_id)
                yield f"event: error\ndata: {json.dumps({'error': 'No speech detected'})}\n\n"
                return
            
            logger.info("transcription_complete", upload_id=upload_session_id, transcript_length=len(transcript))
            
            # Yield: structuring
            yield f"event: progress\ndata: {json.dumps({'phase': 'structuring', 'progress': 80, 'message': 'Structuring notes...'})}\n\n"
            
            # Structure notes
            structured = await _generate_structured_notes(transcript, note_mode="audio")
            
            # Create note in database
            user = await _resolve_scribe_user(db, session_data.get("user"), session_data.get("session_id"))
            resolved_folder_id = await _resolve_folder_id(db, user, session_data.get("folder_id"))
            
            note = ScribeNote(
                id=uuid.uuid4(),
                user_id=user.id,
                folder_id=resolved_folder_id,
                title=structured["title"],
                summary=structured["summary"],
                transcript=transcript,
                structured_notes=structured,
            )
            db.add(note)
            await db.flush()
            await db.refresh(note)
            await db.commit()
            
            logger.info("note_created", upload_id=upload_session_id, note_id=note.id)
            
            # Yield: complete with note data
            note_data = _serialize_note(note)
            yield f"event: complete\ndata: {json.dumps(note_data)}\n\n"
            
        except Exception as exc:
            logger.error("stream_processing_error", upload_id=upload_session_id, error=str(exc), exc_info=True)
            yield f"event: error\ndata: {json.dumps({'error': str(exc)})}\n\n"
        finally:
            # Cleanup
            if upload_session_id in _upload_chunks:
                logger.info("session_cleanup", upload_id=upload_session_id)
                del _upload_chunks[upload_session_id]
    
    return StreamingResponse(event_generator(), media_type="text/event-stream")

