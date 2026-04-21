"""
NEXUS Backend - Unified Examiner Core

Centralizes the fast path for:
1. Creating a reusable examiner workspace
2. Ingesting uploaded PDFs into chunks + embeddings
3. Building a saved exam paper from previous knowledge or document context
"""

import base64
import random
import re
import uuid
from typing import Any, Optional

import anyio
import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.models import Chunk, Course, Document, ExamPaper, User
from app.rag.chunker import chunk_text, extract_text_from_file
from app.rag import chroma_store
from app.rag.embedder import embedder
from app.rag.retriever import retrieve_chunks
from app.schemas.examiner import ExamPaperResponse, ExamPaperSummary, ExamQuestion

SUPPORTED_QUESTION_TYPES = {"mcq", "code", "theory"}
SUPPORTED_DIFFICULTIES = ("easy", "medium", "hard")


def determine_content_type(filename: str, fallback: Optional[str] = None) -> str:
    lower = filename.lower()
    if lower.endswith(".pdf"):
        return "pdf"
    if lower.endswith((".md", ".markdown")):
        return "markdown"
    if lower.endswith(".txt"):
        return "text"
    return fallback or "text"


def _slugify_session(session_key: Optional[str]) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "-", (session_key or "local").lower()).strip("-")
    return cleaned[:48] or "local"


async def ensure_examiner_workspace(
    db: AsyncSession,
    current_user: Optional[User],
    session_key: Optional[str],
) -> tuple[User, Course]:
    """Create or reuse a stable workspace for the examiner feature."""
    workspace_user = current_user

    if workspace_user is None:
        session_slug = _slugify_session(session_key)
        guest_email = f"guest+{session_slug}@{settings.EXAMINER_GUEST_EMAIL_DOMAIN}"
        result = await db.execute(select(User).where(User.email == guest_email))
        workspace_user = result.scalar_one_or_none()

        if workspace_user is None:
            workspace_user = User(
                email=guest_email,
                password_hash="guest-session",
                display_name="Examiner Guest",
                is_active=True,
            )
            db.add(workspace_user)
            await db.flush()

    course_result = await db.execute(
        select(Course).where(
            Course.owner_user_id == workspace_user.id,
            Course.title == settings.EXAMINER_WORKSPACE_TITLE,
        )
    )
    workspace_course = course_result.scalar_one_or_none()

    if workspace_course is None:
        workspace_course = Course(
            title=settings.EXAMINER_WORKSPACE_TITLE,
            description="Auto-created workspace for saved examiner papers and uploaded syllabi.",
            owner_user_id=workspace_user.id,
        )
        db.add(workspace_course)
        await db.flush()

    return workspace_user, workspace_course


async def create_document_upload(
    db: AsyncSession,
    course_id: str,
    filename: str,
    file_bytes: bytes,
    content_type: str,
) -> Document:
    """Persist the uploaded file metadata so it can be ingested later."""
    document = Document(
        course_id=course_id,
        filename=filename,
        content_type=content_type,
        file_size=len(file_bytes),
        status="uploaded",
        metadata_={"raw_content_b64": base64.b64encode(file_bytes).decode("utf-8")},
    )
    db.add(document)
    await db.flush()
    return document


async def ingest_document_record(
    db: AsyncSession,
    document: Document,
    raw_bytes: Optional[bytes] = None,
) -> tuple[int, str]:
    """Extract, chunk, embed, and persist vectors for a document."""
    if raw_bytes is None:
        encoded = (document.metadata_ or {}).get("raw_content_b64")
        if not encoded:
            raise ValueError("No uploaded content is available for ingestion.")
        raw_bytes = base64.b64decode(encoded)

    document.status = "processing"
    await db.flush()

    text = extract_text_from_file(raw_bytes, document.content_type)
    if not text.strip():
        raise ValueError("No text could be extracted from the uploaded file.")

    chunks_data = chunk_text(text=text, filename=document.filename)
    embeddings = embedder.embed_texts(
        [chunk["text"] for chunk in chunks_data],
        batch_size=settings.EMBEDDING_BATCH_SIZE,
    )

    chroma_ids: list[str] = []
    chroma_documents: list[str] = []
    chroma_metadatas: list[dict[str, Any]] = []

    for index, chunk_data in enumerate(chunks_data):
        chunk_id = uuid.uuid4()
        db.add(
            Chunk(
                id=chunk_id,
                document_id=document.id,
                chunk_index=index,
                text=chunk_data["text"],
                metadata_=chunk_data["metadata"],
            )
        )

        chroma_ids.append(str(chunk_id))
        chroma_documents.append(chunk_data["text"])
        chroma_metadatas.append(
            {
                "course_id": str(document.course_id),
                "document_id": str(document.id),
                "source": document.filename,
                "chunk_index": index,
            }
        )

    await db.flush()

    try:
        await anyio.to_thread.run_sync(
            chroma_store.upsert_chunks,
            ids=chroma_ids,
            documents=chroma_documents,
            embeddings=embeddings,
            metadatas=chroma_metadatas,
        )
    except Exception:
        # Best-effort cleanup in case a partial upsert occurred.
        try:
            await anyio.to_thread.run_sync(chroma_store.delete_ids, chroma_ids)
        except Exception:
            pass
        raise

    metadata = dict(document.metadata_ or {})
    metadata.pop("raw_content_b64", None)
    metadata.update(
        {
            "chunk_count": len(chunks_data),
            "embedding_model": settings.EMBEDDING_MODEL,
            "embedding_device": embedder.device,
            "vector_store": "chroma",
            "chroma_collection": settings.CHROMA_COLLECTION,
            "preview": _compact_text(text, 280),
        }
    )

    document.status = "ready"
    document.error_message = None
    document.metadata_ = metadata
    await db.flush()

    return len(chunks_data), text


async def build_source_blocks(
    db: AsyncSession,
    source_mode: str,
    course_id,
    document: Optional[Document],
    topics: list[str],
    previous_knowledge: str,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if source_mode == "pdf":
        if document is None:
            raise ValueError("A PDF source requires an uploaded document.")

        retrieval_query = " ".join([*topics, previous_knowledge.strip(), document.filename]).strip()
        if retrieval_query:
            blocks = await retrieve_chunks(
                db=db,
                query=retrieval_query,
                course_id=course_id,
                document_id=document.id,
                top_k=settings.RAG_TOP_K,
            )
        else:
            blocks = []

        if not blocks:
            result = await db.execute(
                select(Chunk)
                .where(Chunk.document_id == document.id)
                .order_by(Chunk.chunk_index.asc())
                .limit(settings.RAG_TOP_K)
            )
            stored_chunks = result.scalars().all()
            blocks = [
                {
                    "chunk_id": str(chunk.id),
                    "text": chunk.text,
                    "source": document.filename,
                    "score": 1.0,
                    "metadata": chunk.metadata_ or {},
                }
                for chunk in stored_chunks
            ]

        return blocks, {
            "source_label": document.filename,
            "retrieval_query": retrieval_query,
            "document_id": str(document.id),
        }

    knowledge_blocks = []
    if previous_knowledge.strip():
        for paragraph in re.split(r"\n{2,}", previous_knowledge):
            cleaned = _clean_text(paragraph)
            if cleaned:
                knowledge_blocks.append(
                    {
                        "chunk_id": f"knowledge-{len(knowledge_blocks) + 1}",
                        "text": cleaned,
                        "source": "Previous knowledge",
                        "score": 1.0,
                        "metadata": {"origin": "knowledge"},
                    }
                )

    for topic in topics:
        knowledge_blocks.append(
            {
                "chunk_id": f"topic-{topic}",
                "text": f"Focus on {topic}. Ask exam-style questions that test concept clarity and application.",
                "source": "Previous knowledge",
                "score": 1.0,
                "metadata": {"origin": "topic"},
            }
        )

    if not knowledge_blocks:
        raise ValueError("Add previous knowledge notes or choose at least one topic before generating.")

    return knowledge_blocks, {
        "source_label": "Previous knowledge",
        "retrieval_query": " ".join(topics).strip(),
    }


def generate_exam_questions(
    source_blocks: list[dict[str, Any]],
    question_count: int,
    difficulty: str,
    question_types: list[str],
    topics: list[str],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    normalized_types = [item for item in question_types if item in SUPPORTED_QUESTION_TYPES] or ["mcq", "theory"]
    passages = _build_passages(source_blocks, topics)
    if not passages:
        raise ValueError("Could not build enough material to create exam questions.")

    generated = []
    for index in range(question_count):
        passage = passages[index % len(passages)]
        question_type = normalized_types[index % len(normalized_types)]
        level = _resolve_difficulty(difficulty, index)

        if question_type == "mcq":
            generated.append(_build_mcq_question(passages, passage, index, level))
        elif question_type == "code":
            generated.append(_build_code_question(passage, index, level))
        else:
            generated.append(_build_theory_question(passage, index, level))

    metadata = {
        "generation_backend": "heuristic-local",
        "embedding_model": settings.EMBEDDING_MODEL,
        "embedding_device": embedder.device,
        "source_block_count": len(source_blocks),
    }
    return generated, metadata


def build_exam_title(source_mode: str, topics: list[str], document: Optional[Document], title: Optional[str]) -> str:
    if title and title.strip():
        return title.strip()
    if source_mode == "pdf" and document is not None:
        base = re.sub(r"\.[^.]+$", "", document.filename).strip()
        return f"{base} Practice Paper"
    if topics:
        return f"{topics[0]} Practice Paper"
    return "Custom Practice Paper"


def serialize_exam_paper(
    paper: ExamPaper,
    source_label: Optional[str] = None,
) -> ExamPaperResponse:
    logger = structlog.get_logger()
    
    # Safely deserialize questions with fallback for malformed data
    questions = []
    for question in (paper.questions_ or []):
        try:
            # Ensure all required fields have defaults
            q = dict(question) if isinstance(question, dict) else question
            q.setdefault('id', str(q.get('id', '')))
            q.setdefault('type', 'theory')
            q.setdefault('difficulty', 'medium')
            q.setdefault('topic', 'General')
            q.setdefault('question', 'Question')
            questions.append(ExamQuestion(**q))
        except Exception as e:
            # Skip malformed questions and log error
            logger.warning("malformed_exam_question", error=str(e), question=question)
            continue
    
    return ExamPaperResponse(
        id=paper.id,
        title=paper.title,
        source_mode=paper.source_mode,
        status=paper.status,
        question_count=paper.question_count,
        created_at=paper.created_at,
        source_label=source_label or (paper.metadata_ or {}).get("source_label"),
        document_id=paper.document_id,
        settings=paper.settings_ or {},
        questions=questions,
        metadata=paper.metadata_ or {},
        error_message=paper.error_message,
    )


def serialize_exam_summary(paper: ExamPaper, source_label: Optional[str] = None) -> ExamPaperSummary:
    return ExamPaperSummary(
        id=paper.id,
        title=paper.title,
        source_mode=paper.source_mode,
        status=paper.status,
        question_count=paper.question_count,
        created_at=paper.created_at,
        source_label=source_label or (paper.metadata_ or {}).get("source_label"),
    )


def _build_passages(source_blocks: list[dict[str, Any]], topics: list[str]) -> list[dict[str, Any]]:
    passages: list[dict[str, Any]] = []
    seen: set[str] = set()

    for block in source_blocks:
        raw_text = block.get("text") or ""
        candidates = re.split(r"\n{2,}|(?<=[.!?])\s+(?=[A-Z0-9])", raw_text)
        if not candidates:
            candidates = [raw_text]

        for candidate in candidates:
            cleaned = _clean_text(candidate)
            if len(cleaned) < 40:
                continue
            key = cleaned.lower()
            if key in seen:
                continue
            seen.add(key)
            passages.append(
                {
                    "text": cleaned,
                    "topic": _detect_topic(cleaned, topics),
                    "source": block.get("source"),
                }
            )

    if passages:
        return passages

    for block in source_blocks:
        cleaned = _clean_text(block.get("text") or "")
        if cleaned:
            passages.append(
                {
                    "text": cleaned,
                    "topic": _detect_topic(cleaned, topics),
                    "source": block.get("source"),
                }
            )

    return passages


def _build_mcq_question(
    passages: list[dict[str, Any]],
    passage: dict[str, Any],
    index: int,
    difficulty: str,
) -> dict[str, Any]:
    sentence = _first_sentence(passage["text"])
    subject, predicate = _split_statement(sentence)

    if predicate:
        question = f"Which option best completes this statement about {passage['topic']}: {subject} ..."
        correct = predicate
    else:
        question = f"Which statement best reflects the study material for {passage['topic']}?"
        correct = sentence

    distractors = []
    for candidate in passages:
        if candidate["text"] == passage["text"]:
            continue
        option = _first_sentence(candidate["text"])
        if option and option.lower() != correct.lower():
            distractors.append(option)

    while len(distractors) < 3:
        distractors.append(f"A misconception that ignores the main idea behind {passage['topic']}.")

    options = [correct, *distractors[:3]]
    rng = random.Random(index + len(question))
    rng.shuffle(options)

    return {
        "id": f"q-{index + 1}",
        "type": "mcq",
        "difficulty": difficulty,
        "topic": passage["topic"],
        "question": question,
        "options": options,
        "correct_answer": options.index(correct),
        "answer_guide": _compact_text(passage["text"], 220),
        "source_excerpt": _compact_text(passage["text"], 220),
        "source_document": passage.get("source"),
    }


def _build_theory_question(passage: dict[str, Any], index: int, difficulty: str) -> dict[str, Any]:
    return {
        "id": f"q-{index + 1}",
        "type": "theory",
        "difficulty": difficulty,
        "topic": passage["topic"],
        "question": f"Explain {passage['topic']} in your own words and connect it to this study cue: {_compact_text(passage['text'], 140)}",
        "options": [],
        "correct_answer": None,
        "answer_guide": _compact_text(passage["text"], 260),
        "source_excerpt": _compact_text(passage["text"], 220),
        "source_document": passage.get("source"),
    }


def _build_code_question(passage: dict[str, Any], index: int, difficulty: str) -> dict[str, Any]:
    return {
        "id": f"q-{index + 1}",
        "type": "code",
        "difficulty": difficulty,
        "topic": passage["topic"],
        "question": f"Write short pseudocode or a code outline that demonstrates {passage['topic']}. Use this syllabus cue for scope: {_compact_text(passage['text'], 140)}",
        "options": [],
        "correct_answer": None,
        "answer_guide": f"Strong answers should cover: {_compact_text(passage['text'], 240)}",
        "source_excerpt": _compact_text(passage["text"], 220),
        "source_document": passage.get("source"),
    }


def _resolve_difficulty(preferred: str, index: int) -> str:
    if preferred in SUPPORTED_DIFFICULTIES:
        return preferred
    return SUPPORTED_DIFFICULTIES[index % len(SUPPORTED_DIFFICULTIES)]


def _detect_topic(text: str, topics: list[str]) -> str:
    lowered = text.lower()
    for topic in topics:
        if topic.lower() in lowered:
            return topic

    stripped = re.sub(r"^\[page\s+\d+\]\s*", "", text, flags=re.IGNORECASE)
    if ":" in stripped:
        candidate = stripped.split(":", 1)[0].strip()
        if 1 <= len(candidate.split()) <= 8:
            return candidate

    words = re.findall(r"[A-Za-z][A-Za-z0-9+#/-]*", stripped)
    return " ".join(words[:4]) or "Core concept"


def _split_statement(sentence: str) -> tuple[str, str]:
    for marker in (" is ", " are ", " refers to ", " means ", " includes ", " uses "):
        if marker in sentence:
            left, right = sentence.split(marker, 1)
            return left.strip(), right.strip().rstrip(".")
    return sentence.strip(), ""


def _first_sentence(text: str) -> str:
    cleaned = _clean_text(text)
    parts = re.split(r"(?<=[.!?])\s+", cleaned, maxsplit=1)
    return parts[0].strip() if parts else cleaned


def _clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def _compact_text(text: str, limit: int) -> str:
    cleaned = _clean_text(text)
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[: limit - 3].rstrip() + "..."
