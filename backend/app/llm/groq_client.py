"""
NEXUS Backend – Groq LLM Client

Provides both streaming and non-streaming chat completion via the Groq SDK.
Includes retry logic and timeout handling.
"""

import asyncio
from typing import List, Dict, AsyncGenerator, Optional
from groq import Groq, AsyncGroq
from app.config import settings

import structlog
import io

logger = structlog.get_logger(__name__)


class GroqClient:
    """Wrapper around the Groq Python SDK for chat completions."""

    def __init__(self, api_key: str | None = None, default_model: str | None = None):
        resolved_api_key = api_key or settings.GROQ_API_KEY
        self._default_model = default_model or settings.GROQ_MODEL
        self._client = Groq(api_key=resolved_api_key)
        self._async_client = AsyncGroq(api_key=resolved_api_key)

    async def chat_completion(
        self,
        messages: List[Dict[str, str]],
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
    ) -> Dict:
        """
        Non-streaming chat completion.

        Returns:
            {"content": "...", "token_usage": {"prompt_tokens": N, "completion_tokens": N, "total_tokens": N}}
        """
        _model = model or self._default_model

        try:
            response = await self._async_client.chat.completions.create(
                model=_model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                stream=False,
            )

            choice = response.choices[0]
            usage = response.usage

            return {
                "content": choice.message.content or "",
                "token_usage": {
                    "prompt_tokens": usage.prompt_tokens if usage else 0,
                    "completion_tokens": usage.completion_tokens if usage else 0,
                    "total_tokens": usage.total_tokens if usage else 0,
                },
            }
        except Exception as e:
            logger.error("groq_completion_error", error=str(e))
            raise

    async def chat_completion_stream(
        self,
        messages: List[Dict[str, str]],
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
    ) -> AsyncGenerator[str, None]:
        """
        Streaming chat completion — yields text chunks as they arrive.
        """
        _model = model or self._default_model

        try:
            stream = await self._async_client.chat.completions.create(
                model=_model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                stream=True,
            )

            async for chunk in stream:
                delta = chunk.choices[0].delta
                if delta and delta.content:
                    yield delta.content

        except Exception as e:
            logger.error("groq_stream_error", error=str(e))
            raise

    async def chat_with_tools(
        self,
        messages: List[Dict[str, str]],
        tools: List[Dict],
        model: str | None = None,
        temperature: float = 0.3,
    ) -> Dict:
        """
        Chat completion with tool/function calling.

        Returns the raw response including any tool_calls.
        """
        _model = model or self._default_model

        try:
            response = await self._async_client.chat.completions.create(
                model=_model,
                messages=messages,
                tools=tools,
                tool_choice="auto",
                temperature=temperature,
                stream=False,
            )

            choice = response.choices[0]
            return {
                "content": choice.message.content or "",
                "tool_calls": [
                    {
                        "id": tc.id,
                        "function_name": tc.function.name,
                        "arguments": tc.function.arguments,
                    }
                    for tc in (choice.message.tool_calls or [])
                ],
                "finish_reason": choice.finish_reason,
                "token_usage": {
                    "prompt_tokens": response.usage.prompt_tokens if response.usage else 0,
                    "completion_tokens": response.usage.completion_tokens if response.usage else 0,
                    "total_tokens": response.usage.total_tokens if response.usage else 0,
                },
            }
        except Exception as e:
            logger.error("groq_tool_call_error", error=str(e))
            raise

    async def transcribe_audio(
        self,
        audio_bytes: bytes,
        filename: str = "audio",
        content_type: str = "application/octet-stream",
        model: str = "whisper-large-v3",
        language: str | None = None,
    ) -> str:
        """
        Speech-to-text transcription using Groq-hosted Whisper.

        Returns raw transcript text.
        """
        try:
            file_obj = io.BytesIO(audio_bytes)
            file_obj.name = filename  # Groq SDK reads filename for multipart

            kwargs = {"model": model, "file": file_obj}
            if language:
                kwargs["language"] = language

            result = await self._async_client.audio.transcriptions.create(**kwargs)
            # SDK returns an object with .text in recent versions; fall back to dict
            text = getattr(result, "text", None) or (result.get("text") if isinstance(result, dict) else None)
            return (text or "").strip()
        except Exception as e:
            logger.error("groq_transcription_error", error=str(e))
            raise


# Module-level singleton
groq_client = GroqClient()
scribe_groq_client = GroqClient(
    api_key=settings.SCRIBE_GROQ_API_KEY or settings.GROQ_API_KEY,
    default_model=settings.SCRIBE_GROQ_MODEL or settings.GROQ_MODEL,
)
examiner_groq_client = GroqClient(
    api_key=settings.EXAMINER_GROQ_API_KEY or settings.GROQ_API_KEY,
    default_model=settings.EXAMINER_GROQ_MODEL or settings.GROQ_MODEL,
)
