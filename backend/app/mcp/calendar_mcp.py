"""
NEXUS Backend – Calendar MCP Client

This module bridges the agent tool-calling layer to a local Calendar MCP server.

The server is expected to expose HTTP endpoints:
  POST /check_calendar
  POST /book_event

Both endpoints accept/return JSON.
"""

from __future__ import annotations

from typing import Any

import httpx
import structlog

from app.config import settings

logger = structlog.get_logger(__name__)


def _base_url() -> str:
    base = (settings.CALENDAR_MCP_URL or "").strip().rstrip("/")
    if not base:
        raise RuntimeError("CALENDAR_MCP_URL is not configured.")
    return base


async def check_calendar(payload: dict[str, Any]) -> dict[str, Any]:
    """Call the Calendar MCP server to retrieve free/busy information."""
    url = f"{_base_url()}/check_calendar"
    timeout = float(getattr(settings, "CALENDAR_MCP_TIMEOUT_SECONDS", 12.0))

    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        return resp.json()


async def book_event(payload: dict[str, Any]) -> dict[str, Any]:
    """Call the Calendar MCP server to create an event."""
    url = f"{_base_url()}/book_event"
    timeout = float(getattr(settings, "CALENDAR_MCP_TIMEOUT_SECONDS", 12.0))

    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        return resp.json()

