"""
NEXUS Backend - Examiner API Endpoints
"""

import json
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from app.config import settings
from app.db.models import ExamPaper, User
from app.db.session import get_db
from app.dependencies import get_optional_user
from app.llm.gemini_client import extract_pdf_study_guide
from app.llm.groq_client import examiner_groq_client
from app.rag.chunker import extract_text_from_file
from app.rag.unified_core import (
    build_exam_title,
    build_source_blocks,
    create_document_upload,
    determine_content_type,
    ensure_examiner_workspace,
    generate_exam_questions,
    serialize_exam_paper,
    serialize_exam_summary,
)
from app.schemas.examiner import ExamPaperResponse, ExamPaperSummary

router = APIRouter()

SUPPORTED_TYPES = {"mcq", "code", "theory"}
SUPPORTED_DIFFICULTIES = ("easy", "medium", "hard")


def _safe_json_loads(raw: str) -> object:
    cleaned = (raw or "").strip()
    if not cleaned:
        raise ValueError("LLM returned an empty response.")

    try:
        return json.loads(cleaned)
    except Exception:
        # Recover if the model wrapped JSON in text / markdown.
        obj_start = cleaned.find("{")
        obj_end = cleaned.rfind("}")
        if obj_start >= 0 and obj_end > obj_start:
            return json.loads(cleaned[obj_start : obj_end + 1])

        arr_start = cleaned.find("[")
        arr_end = cleaned.rfind("]")
        if arr_start >= 0 and arr_end > arr_start:
            return json.loads(cleaned[arr_start : arr_end + 1])

        raise


def _resolve_difficulty(preferred: str, index: int) -> str:
    if preferred in SUPPORTED_DIFFICULTIES:
        return preferred
    return SUPPORTED_DIFFICULTIES[index % len(SUPPORTED_DIFFICULTIES)]


def _normalize_questions(
    raw_json: object,
    *,
    filename: str,
    question_count: int,
    difficulty: str,
    question_types: list[str],
    topics: list[str],
) -> list[dict]:
    if isinstance(raw_json, dict):
        raw_questions = raw_json.get("questions")
    else:
        raw_questions = raw_json

    if not isinstance(raw_questions, list):
        raise ValueError("LLM JSON must contain a 'questions' array.")

    allowed_types = [qt for qt in question_types if qt in SUPPORTED_TYPES] or ["mcq", "theory"]
    normalized: list[dict] = []

    for index, item in enumerate(raw_questions):
        if not isinstance(item, dict):
            continue

        qtype = str(item.get("type") or allowed_types[index % len(allowed_types)]).strip().lower()
        if qtype not in SUPPORTED_TYPES:
            qtype = "theory"

        qdifficulty = str(item.get("difficulty") or _resolve_difficulty(difficulty, index)).strip().lower()
        if qdifficulty not in SUPPORTED_DIFFICULTIES:
            qdifficulty = _resolve_difficulty("mixed", index)

        topic_value = item.get("topic")
        if isinstance(topic_value, str) and topic_value.strip():
            topic = topic_value.strip()
        elif topics:
            topic = topics[index % len(topics)]
        else:
            topic = "Core concept"

        question_text = str(item.get("question") or "").strip()
        if not question_text:
            continue

        options_raw = item.get("options") or []
        options = [str(opt) for opt in options_raw] if isinstance(options_raw, list) else []
        correct_answer = item.get("correct_answer")

        # If MCQ isn't usable, downgrade to theory so the UI stays functional.
        if qtype == "mcq":
            if len(options) < 2:
                qtype = "theory"
                options = []
                correct_answer = None
            elif not isinstance(correct_answer, int) or correct_answer < 0 or correct_answer >= len(options):
                correct_answer = 0
        else:
            options = []
            correct_answer = None

        normalized.append(
            {
                "id": str(item.get("id") or f"q-{len(normalized) + 1}"),
                "type": qtype,
                "difficulty": qdifficulty,
                "topic": topic,
                "question": question_text,
                "options": options,
                "correct_answer": correct_answer,
                "answer_guide": (str(item["answer_guide"]).strip() if item.get("answer_guide") is not None else None),
                "source_excerpt": (str(item["source_excerpt"]).strip() if item.get("source_excerpt") is not None else None),
                "source_document": (str(item.get("source_document") or filename) if filename else None),
            }
        )

        if len(normalized) >= question_count:
            break

    if not normalized:
        raise ValueError("LLM returned no valid questions.")

    return normalized


def _build_groq_exam_prompt(
    *,
    filename: str,
    pdf_context: str,
    previous_knowledge: str,
    topics: list[str],
    question_count: int,
    difficulty: str,
    question_types: list[str],
) -> str:
    allowed_types = [qt for qt in question_types if qt in SUPPORTED_TYPES] or ["mcq", "theory"]
    focus = ", ".join(topics) if topics else "Use the document outline"

    return (
        "Generate a practice exam as STRICT JSON only (no markdown, no backticks).\n"
        f"Document: {filename}\n"
        f"Question count: {question_count}\n"
        f"Difficulty: {difficulty} (if 'mixed', include easy/medium/hard across the paper)\n"
        f"Allowed question types: {json.dumps(allowed_types)} (mix them across questions)\n"
        f"Focus topics: {focus}\n\n"
        "Use ONLY the provided PDF context for facts.\n\n"
        "Return JSON with this structure:\n"
        "{\n"
        '  "questions": [\n'
        "    {\n"
        '      "id": "q-1",\n'
        '      "type": "mcq|code|theory",\n'
        '      "difficulty": "easy|medium|hard",\n'
        '      "topic": "topic label",\n'
        '      "question": "question text",\n'
        '      "options": ["A","B","C","D"],\n'
        '      "correct_answer": 0,\n'
        '      "answer_guide": "short marking scheme / explanation",\n'
        '      "source_excerpt": "short supporting excerpt from the PDF context",\n'
        f'      "source_document": "{filename}"\n'
        "    }\n"
        "  ]\n"
        "}\n\n"
        "Rules:\n"
        "- For type=mcq: exactly 4 options and correct_answer must be the 0-based index.\n"
        "- For type=code or theory: options must be [] and correct_answer must be null.\n"
        "- Keep answer_guide concise (2-5 lines).\n\n"
        "PDF_CONTEXT:\n"
        "<<<BEGIN>>>\n"
        f"{pdf_context}\n"
        "<<<END>>>\n\n"
        "STUDENT_NOTES (optional, may influence focus but must not override PDF facts):\n"
        "<<<BEGIN>>>\n"
        f"{previous_knowledge.strip()}\n"
        "<<<END>>>\n"
    )


async def _generate_exam_questions_with_groq(
    *,
    filename: str,
    pdf_context: str,
    previous_knowledge: str,
    topics: list[str],
    question_count: int,
    difficulty: str,
    question_types: list[str],
) -> tuple[list[dict], dict]:
    # Keep payload bounded even if PDF context is large.
    max_context_chars = 80_000
    context_truncated = False
    bounded_context = pdf_context.strip()
    if len(bounded_context) > max_context_chars:
        bounded_context = bounded_context[:max_context_chars].rstrip() + "\n\n[TRUNCATED]"
        context_truncated = True

    prompt = _build_groq_exam_prompt(
        filename=filename,
        pdf_context=bounded_context,
        previous_knowledge=previous_knowledge,
        topics=topics,
        question_count=question_count,
        difficulty=difficulty,
        question_types=question_types,
    )

    result = await examiner_groq_client.chat_completion(
        messages=[
            {
                "role": "system",
                "content": "You are a strict JSON generator. Output only valid JSON.",
            },
            {"role": "user", "content": prompt},
        ],
        temperature=0.3,
        max_tokens=4096,
    )

    parsed = _safe_json_loads(result.get("content") or "")
    questions = _normalize_questions(
        parsed,
        filename=filename,
        question_count=question_count,
        difficulty=difficulty,
        question_types=question_types,
        topics=topics,
    )

    return questions, {
        "generation_backend": "groq",
        "groq_model": settings.EXAMINER_GROQ_MODEL or settings.GROQ_MODEL,
        "groq_token_usage": result.get("token_usage") or {},
        "context_truncated": context_truncated,
    }


async def _generate_exam_questions_hybrid(
    *,
    filename: str,
    pdf_context: str,
    previous_knowledge: str,
    topics: list[str],
    question_count: int,
    difficulty: str,
    question_types: list[str],
) -> tuple[list[dict], dict]:
    """
    Hybrid question generation: Try Groq first, fallback to Gemini on rate limit (413).
    This handles Groq's token limits gracefully by switching providers.
    """
    import structlog
    logger = structlog.get_logger(__name__)

    # Attempt 1: Try Groq (preferred for cost/speed)
    groq_error = None
    try:
        logger.info("examiner_question_generation", backend="groq", attempt=1)
        return await _generate_exam_questions_with_groq(
            filename=filename,
            pdf_context=pdf_context,
            previous_knowledge=previous_knowledge,
            topics=topics,
            question_count=question_count,
            difficulty=difficulty,
            question_types=question_types,
        )
    except Exception as e:
        groq_error = str(e)
        # Check if this is a rate limit error (413 or token limit message)
        error_str = str(e).lower()
        if "413" in error_str or "rate_limit" in error_str or "tpm" in error_str or "tokens per minute" in error_str:
            logger.warning(
                "groq_rate_limit_fallback",
                error=groq_error[:200],
                backend="gemini",
            )
        else:
            # Re-raise non-rate-limit errors
            raise

    # Fallback: Use Gemini API
    from app.llm.gemini_client import generate_exam_questions_with_gemini
    
    logger.info("examiner_question_generation", backend="gemini", attempt=2)
    
    try:
        response_text, gemini_metadata = await generate_exam_questions_with_gemini(
            filename=filename,
            pdf_context=pdf_context,
            previous_knowledge=previous_knowledge,
            topics=topics,
            question_count=question_count,
            difficulty=difficulty,
            question_types=question_types,
        )

        parsed = _safe_json_loads(response_text)
        questions = _normalize_questions(
            parsed,
            filename=filename,
            question_count=question_count,
            difficulty=difficulty,
            question_types=question_types,
            topics=topics,
        )

        return questions, {
            **gemini_metadata,
            "fallback_reason": "groq_rate_limit",
            "groq_error": groq_error[:200] if groq_error else None,
        }
    except Exception as gemini_error:
        # If Gemini also fails, raise with context from both attempts
        raise ValueError(
            f"Question generation failed with both Groq (error: {groq_error[:100]}) "
            f"and Gemini (error: {str(gemini_error)[:100]})"
        ) from gemini_error


def _parse_json_list(raw_value: str, field_name: str) -> list[str]:
    try:
        parsed = json.loads(raw_value or "[]")
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} must be a valid JSON array.",
        ) from exc

    if not isinstance(parsed, list):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} must be a JSON array.",
        )

    return [str(item).strip() for item in parsed if str(item).strip()]


async def _load_workspace(
    db: AsyncSession,
    current_user: Optional[User],
    session_key: Optional[str],
):
    workspace_user, workspace_course = await ensure_examiner_workspace(
        db=db,
        current_user=current_user,
        session_key=session_key,
    )
    return workspace_user, workspace_course


@router.post("/generate", response_model=ExamPaperResponse, status_code=status.HTTP_201_CREATED)
async def generate_exam(
    source_mode: str = Form(...),
    title: Optional[str] = Form(None),
    previous_knowledge: str = Form(""),
    topics: str = Form("[]"),
    question_count: int = Form(5),
    difficulty: str = Form("mixed"),
    question_types: str = Form('["mcq","theory"]'),
    file: Optional[UploadFile] = File(None),
    x_nexus_session: Optional[str] = Header(None),
    current_user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    if source_mode not in {"knowledge", "pdf"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="source_mode must be knowledge or pdf.")

    if question_count < 1 or question_count > 25:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="question_count must be between 1 and 25.")

    selected_topics = _parse_json_list(topics, "topics")
    selected_types = _parse_json_list(question_types, "question_types")

    workspace_user, workspace_course = await _load_workspace(db, current_user, x_nexus_session)

    document = None
    if source_mode == "pdf":
        if file is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Upload a PDF to generate questions from a document.")

        file_bytes = await file.read()
        if not file_bytes:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty.")

        content_type = determine_content_type(file.filename or "uploaded.pdf", file.content_type)
        document = await create_document_upload(
            db=db,
            course_id=workspace_course.id,
            filename=file.filename or "uploaded.pdf",
            file_bytes=file_bytes,
            content_type=content_type,
        )

        extraction_text = ""
        extraction_metadata: dict = {}

        # Preferred path: Gemini reads the entire PDF and returns a study guide.
        if settings.GEMINI_API_KEY:
            try:
                extraction_text, extraction_metadata = await extract_pdf_study_guide(
                    pdf_bytes=file_bytes,
                    filename=document.filename,
                )
            except Exception as exc:
                extraction_metadata = {
                    "extraction_backend": "pypdf",
                    "gemini_error": str(exc)[:240],
                }

        # Fallback: local PDF text extraction (still avoids vector DB).
        if not extraction_text.strip():
            extraction_text = extract_text_from_file(file_bytes, content_type)
            extraction_metadata.setdefault("extraction_backend", "pypdf")
            extraction_metadata.setdefault("extracted_char_count", len(extraction_text))

        try:
            questions, generation_metadata = await _generate_exam_questions_hybrid(
                filename=document.filename,
                pdf_context=extraction_text,
                previous_knowledge=previous_knowledge,
                topics=selected_topics,
                question_count=question_count,
                difficulty=difficulty,
                question_types=selected_types,
            )
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Question generation failed: {exc}",
            ) from exc

        generation_metadata = {
            **generation_metadata,
            "generation_backend": f"{extraction_metadata.get('extraction_backend', 'pdf')}+{generation_metadata.get('generation_backend', 'unknown')}",
        }

        document.status = "ready"
        document.metadata_ = {
            **(document.metadata_ or {}),
            "examiner_pdf_reader": extraction_metadata.get("extraction_backend"),
        }
        await db.flush()

        source_metadata = {
            "source_label": document.filename,
            "document_id": str(document.id),
            **extraction_metadata,
        }

    else:
        try:
            source_blocks, source_metadata = await build_source_blocks(
                db=db,
                source_mode=source_mode,
                course_id=workspace_course.id,
                document=document,
                topics=selected_topics,
                previous_knowledge=previous_knowledge,
            )
            questions, generation_metadata = generate_exam_questions(
                source_blocks=source_blocks,
                question_count=question_count,
                difficulty=difficulty,
                question_types=selected_types,
                topics=selected_topics,
            )
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    paper = ExamPaper(
        owner_user_id=workspace_user.id,
        course_id=workspace_course.id,
        document_id=document.id if document else None,
        title=build_exam_title(source_mode, selected_topics, document, title),
        source_mode=source_mode,
        status="ready",
        question_count=len(questions),
        settings_={
            "difficulty": difficulty,
            "question_types": selected_types,
            "topics": selected_topics,
            "previous_knowledge": previous_knowledge.strip(),
        },
        questions_=questions,
        metadata_={
            **source_metadata,
            **generation_metadata,
        },
    )
    db.add(paper)
    await db.flush()

    return serialize_exam_paper(paper)


@router.get("/papers", response_model=list[ExamPaperSummary])
async def list_exam_papers(
    x_nexus_session: Optional[str] = Header(None),
    current_user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    workspace_user, workspace_course = await _load_workspace(db, current_user, x_nexus_session)
    result = await db.execute(
        select(ExamPaper)
        .where(
            ExamPaper.owner_user_id == workspace_user.id,
            ExamPaper.course_id == workspace_course.id,
        )
        .order_by(ExamPaper.created_at.desc())
        .limit(settings.EXAMINER_HISTORY_LIMIT)
    )

    return [serialize_exam_summary(paper) for paper in result.scalars().all()]


@router.get("/papers/{paper_id}", response_model=ExamPaperResponse)
async def get_exam_paper(
    paper_id: str,
    x_nexus_session: Optional[str] = Header(None),
    current_user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    logger = structlog.get_logger()
    
    try:
        # Convert paper_id string to UUID
        try:
            paper_uuid = uuid.UUID(paper_id)
        except (ValueError, AttributeError):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid exam paper ID format.")
        
        workspace_user, workspace_course = await _load_workspace(db, current_user, x_nexus_session)
        result = await db.execute(
            select(ExamPaper)
            .where(
                ExamPaper.id == paper_uuid,
                ExamPaper.owner_user_id == workspace_user.id,
                ExamPaper.course_id == workspace_course.id,
            )
        )
        paper = result.scalar_one_or_none()
        if paper is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam paper not found.")

        return serialize_exam_paper(paper)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("get_exam_paper_error", error=str(e), paper_id=paper_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve exam paper: {str(e)}"
        )
