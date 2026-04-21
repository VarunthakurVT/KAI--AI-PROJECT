"""
NEXUS Backend – Application Settings

Loads configuration from environment variables / .env file.
"""

from pydantic_settings import BaseSettings
from typing import List
import json


class Settings(BaseSettings):
    """Central configuration — reads from .env or system env vars."""

    # ── Database ──
    DATABASE_URL: str = "postgresql+asyncpg://nexus:nexus_secret@localhost:5432/nexus_db"

    # ── JWT ──
    JWT_SECRET_KEY: str = "change-me-to-a-random-64-char-string"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    AUTH_BFF_SHARED_SECRET: str = ""

    # ── Groq ──
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "llama-3.3-70b-versatile"
    SCRIBE_GROQ_API_KEY: str = ""
    SCRIBE_GROQ_MODEL: str = "llama-3.3-70b-versatile"
    SCRIBE_GROQ_TRANSCRIPTION_MODEL: str = "whisper-large-v3"
    SCRIBE_GROQ_LANGUAGE: str = ""
    EXAMINER_GROQ_API_KEY: str = ""
    EXAMINER_GROQ_MODEL: str = "llama-3.3-70b-versatile"

    # Gemini (Google AI Studio)
    # Used to "read" PDFs for the Examiner feature (content extraction only).
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-1.5-flash"

    # Calendar MCP (local server) – used by the Commander agent tools
    # Example: http://localhost:3333
    CALENDAR_MCP_URL: str = ""
    CALENDAR_MCP_TIMEOUT_SECONDS: float = 12.0

    # ── Embedding ──
    EMBEDDING_MODEL: str = "BAAI/bge-small-en-v1.5"
    EMBEDDING_DIMENSION: int = 384
    EMBEDDING_DEVICE: str = "auto"
    EMBEDDING_BATCH_SIZE: int = 32

    # ── CORS ──
    CORS_ORIGINS: str = '["http://localhost:5173","http://localhost:5174","http://localhost:3000"]'

    @property
    def cors_origins_list(self) -> List[str]:
        return json.loads(self.CORS_ORIGINS)

    # ── App ──
    APP_ENV: str = "development"
    APP_DEBUG: bool = True

    # ── RAG ──
    RAG_CHUNK_SIZE: int = 500
    RAG_CHUNK_OVERLAP: int = 50
    RAG_TOP_K: int = 8

    # --- Chroma Vector DB ---
    # Modes:
    #   - persistent: embedded local store (CHROMA_PERSIST_PATH)
    #   - http: connect to a Chroma server (CHROMA_HOST/CHROMA_PORT)
    CHROMA_MODE: str = "persistent"
    CHROMA_HOST: str = "localhost"
    CHROMA_PORT: int = 8000
    CHROMA_COLLECTION: str = "nexus_chunks"
    CHROMA_PERSIST_PATH: str = "./ai_database"
    CHROMA_DISTANCE: str = "cosine"

    # Examiner
    EXAMINER_WORKSPACE_TITLE: str = "Examiner Workspace"
    EXAMINER_GUEST_EMAIL_DOMAIN: str = "nexus.local"
    EXAMINER_HISTORY_LIMIT: int = 10
    
    # System prompts for different modes
    RAG_SYSTEM_PROMPT: str = (
        "You are NEXUS, a warm and knowledgeable AI learning companion helping a student master their course material. "
        "Address the student in a friendly, encouraging tone — like a personal tutor who genuinely cares about their progress. "
        "Answer questions using the provided course context. "
        "If the context is insufficient, say so honestly, then offer to explain the concept from your general knowledge. "
        "Actively invite the student to share any doubts or follow-up questions they have — never let them leave confused. "
        "Cite your sources using [Source: filename] notation. "
        "Format your response for readability: use short paragraphs, blank lines between sections, and markdown (headers, bullet points, code blocks). "
        "Use a few relevant emojis (not too many) to make the tone friendly and motivating. "
        "End every response with a brief, relevant follow-up question or suggestion to deepen their understanding."
    )
    
    GENERAL_SYSTEM_PROMPT: str = (
        "You are NEXUS, an expert study assistant and AI learning companion. "
        "Your role is to help students learn effectively by providing clear explanations, study strategies, and academic support. "
        "When a student asks for help, respond as a knowledgeable study assistant who: "
        "- Provides accurate, well-structured explanations "
        "- Breaks down complex topics into manageable steps "
        "- Offers study tips and learning strategies "
        "- Helps with homework, exam preparation, and concept understanding "
        "- Uses encouraging and supportive language "
        "Format responses with clear headings, bullet points, and examples when helpful. "
        "Always maintain a professional yet friendly academic tone. "
        "End with suggestions for further study or related topics to explore."
    )

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
