"""
NEXUS Backend – LLM Package

Exports LLM clients for Gemini (PDF extraction) and Groq (chat completions).
"""

from app.llm.gemini_client import extract_pdf_study_guide, DEFAULT_EXAMINER_PDF_PROMPT
from app.llm.groq_client import GroqClient

__all__ = [
    # Groq client
    "GroqClient",
    # Gemini (PDF extraction)
    "extract_pdf_study_guide",
    "DEFAULT_EXAMINER_PDF_PROMPT",
]
