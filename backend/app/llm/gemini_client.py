"""
NEXUS Backend – Gemini (Google AI Studio) helper

Used by the Examiner feature to "read" PDFs in the cloud (no local RAG / vector DB required).
Gemini is ONLY used for extracting/condensing PDF content; Groq generates the final question paper.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Any, Optional

import anyio
import structlog

from app.config import settings

logger = structlog.get_logger(__name__)


DEFAULT_EXAMINER_PDF_PROMPT = """
You are extracting study-relevant content from a course PDF for an exam generator.

Task:
- Read the PDF and produce a concise but high-fidelity "study guide" of ONLY the content found in the document.
- Preserve all examinable topics, subtopics, definitions, rules, algorithms, formulas, and any learning outcomes.
- Prefer structured headings and bullet points.
- Do NOT add outside knowledge.

Output format:
- Plain text (no markdown code fences).
"""


def _gemini_extract_sync(
    pdf_path: str,
    *,
    api_key: str,
    model: str,
    prompt: str,
) -> tuple[str, dict[str, Any]]:
    try:
        import google.generativeai as genai
    except Exception as exc:  # pragma: no cover
        raise RuntimeError(
            "Missing dependency: google-generativeai. Install with: uv pip install google-generativeai"
        ) from exc

    genai.configure(api_key=api_key)

    gemini_file = genai.upload_file(pdf_path)
    response_text = ""
    try:
        model_obj = genai.GenerativeModel(model)
        response = model_obj.generate_content([gemini_file, prompt])
        response_text = (getattr(response, "text", None) or "").strip()
    finally:
        # Best-effort remote cleanup (SDK API differs by version).
        try:
            if hasattr(gemini_file, "delete"):
                gemini_file.delete()
            elif hasattr(genai, "delete_file") and getattr(gemini_file, "name", None):
                genai.delete_file(gemini_file.name)
        except Exception:
            pass

    return response_text, {
        "gemini_model": model,
        "gemini_file_name": getattr(gemini_file, "name", None),
    }


async def extract_pdf_study_guide(
    pdf_bytes: bytes,
    filename: str,
    *,
    prompt: Optional[str] = None,
    max_output_chars: int = 120_000,
    model: Optional[str] = None,
    api_key: Optional[str] = None,
) -> tuple[str, dict[str, Any]]:
    """
    Upload the PDF to Gemini and return extracted/condensed content as plain text.

    Returns: (text, metadata)
    """
    resolved_api_key = (api_key or settings.GEMINI_API_KEY or "").strip()
    if not resolved_api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured.")

    resolved_model = (model or settings.GEMINI_MODEL or "gemini-1.5-flash").strip()
    resolved_prompt = (prompt or DEFAULT_EXAMINER_PDF_PROMPT).strip()

    suffix = (Path(filename).suffix if filename else "") or ".pdf"
    fd, temp_path = tempfile.mkstemp(prefix="nexus_examiner_", suffix=suffix)
    os.close(fd)

    try:
        with open(temp_path, "wb") as handle:
            handle.write(pdf_bytes)

        text, meta = await anyio.to_thread.run_sync(
            lambda: _gemini_extract_sync(
                temp_path,
                api_key=resolved_api_key,
                model=resolved_model,
                prompt=resolved_prompt,
            )
        )

        cleaned = (text or "").strip()
        truncated = False
        if max_output_chars and len(cleaned) > max_output_chars:
            cleaned = cleaned[:max_output_chars].rstrip() + "\n\n[TRUNCATED]"
            truncated = True

        meta.update(
            {
                "extraction_backend": "gemini",
                "extracted_char_count": len(cleaned),
                "truncated": truncated,
            }
        )
        return cleaned, meta
    finally:
        try:
            os.remove(temp_path)
        except OSError:
            logger.warning("gemini_tempfile_cleanup_failed", path=temp_path)


async def generate_exam_questions_with_gemini(
    *,
    filename: str,
    pdf_context: str,
    previous_knowledge: str,
    topics: list[str],
    question_count: int,
    difficulty: str,
    question_types: list[str],
    model: Optional[str] = None,
    api_key: Optional[str] = None,
) -> tuple[str, dict[str, Any]]:
    """
    Generate exam questions using Gemini API as a fallback to Groq.
    Returns: (response_text, metadata)
    """
    import json
    
    resolved_api_key = (api_key or settings.GEMINI_API_KEY or "").strip()
    if not resolved_api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured for fallback question generation.")

    resolved_model = (model or settings.GEMINI_MODEL or "gemini-1.5-flash").strip()
    
    allowed_types = [qt for qt in question_types if qt in {"mcq", "code", "theory"}] or ["mcq", "theory"]
    focus = ", ".join(topics) if topics else "Use the document outline"
    
    prompt = (
        "Generate a practice exam as STRICT JSON only (no markdown, no backticks).\n"
        f"Document: {filename}\n"
        f"Question count: {question_count}\n"
        f"Difficulty: {difficulty} (if 'mixed', include easy/medium/hard across the paper)\n"
        f"Allowed question types: {json.dumps(allowed_types)}\n"
        f"Focus topics: {focus}\n\n"
        "Use ONLY the provided PDF context for facts. Do NOT add external knowledge.\n\n"
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
        '      "answer_guide": "short marking scheme",\n'
        '      "source_excerpt": "supporting excerpt from PDF",\n'
        f'      "source_document": "{filename}"\n'
        "    }\n"
        "  ]\n"
        "}\n\n"
        "Rules:\n"
        "- For type=mcq: exactly 4 options, correct_answer = 0-based index\n"
        "- For type=code or theory: options=[], correct_answer=null\n"
        "- Keep answer_guide concise (2-5 lines)\n\n"
        "PDF_CONTEXT:\n"
        f"{pdf_context}\n\n"
        "STUDENT_NOTES (optional):\n"
        f"{previous_knowledge.strip()}\n"
    )

    try:
        import google.generativeai as genai
    except Exception as exc:
        raise RuntimeError("Missing dependency: google-generativeai") from exc

    genai.configure(api_key=resolved_api_key)
    model_obj = genai.GenerativeModel(resolved_model)
    
    response = await anyio.to_thread.run_sync(
        lambda: model_obj.generate_content(prompt)
    )
    
    response_text = (getattr(response, "text", None) or "").strip()
    
    return response_text, {
        "generation_backend": "gemini",
        "gemini_model": resolved_model,
    }

