"""
NEXUS Backend – MCP Adapter Template

This template shows how to create a new MCP client adapter for external services.
Copy this file and customize for your specific service (email, Slack, database, etc.).

Steps to create a new adapter:
1. Copy this file and rename (e.g., email_mcp.py, slack_mcp.py)
2. Replace SERVICE_NAME and SERVICE_URL_CONFIG with your values
3. Implement the async functions for your adapter
4. Add imports to __init__.py
5. Update the docstring with new adapter info

Example: Email MCP Adapter
  File: email_mcp.py
  Functions: send_email(), get_emails(), mark_as_read()
"""

from __future__ import annotations

from typing import Any

import httpx
import structlog

from app.config import settings

logger = structlog.get_logger(__name__)

# ── Configuration ──
SERVICE_NAME = "SERVICE_MCP"  # e.g., "EMAIL_MCP", "SLACK_MCP"
SERVICE_URL_CONFIG = "SERVICE_MCP_URL"  # e.g., "EMAIL_MCP_URL", "SLACK_MCP_URL"
SERVICE_TIMEOUT_CONFIG = "SERVICE_MCP_TIMEOUT_SECONDS"  # Timeout for requests


def _base_url() -> str:
    """Get the base URL from configuration."""
    base = (getattr(settings, SERVICE_URL_CONFIG, "") or "").strip().rstrip("/")
    if not base:
        raise RuntimeError(f"{SERVICE_URL_CONFIG} is not configured.")
    return base


def _get_timeout() -> float:
    """Get timeout from configuration."""
    return float(getattr(settings, SERVICE_TIMEOUT_CONFIG, 12.0))


async def action_one(payload: dict[str, Any]) -> dict[str, Any]:
    """
    First action exposed by the MCP server.
    
    Args:
        payload: Request body with necessary parameters
        
    Returns:
        Response from the MCP server
        
    Example:
        result = await action_one({"param1": "value1"})
    """
    url = f"{_base_url()}/action-one"
    timeout = _get_timeout()

    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        return resp.json()


async def action_two(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Second action exposed by the MCP server.
    
    Args:
        payload: Request body with necessary parameters
        
    Returns:
        Response from the MCP server
        
    Example:
        result = await action_two({"param2": "value2"})
    """
    url = f"{_base_url()}/action-two"
    timeout = _get_timeout()

    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        return resp.json()


# ── Optional: Synchronous wrapper ──
def action_one_sync(payload: dict[str, Any]) -> dict[str, Any]:
    """Synchronous wrapper for action_one (if needed)."""
    import asyncio
    
    loop = asyncio.get_event_loop()
    return loop.run_until_complete(action_one(payload))


# ── Optional: Batch operations ──
async def batch_actions(payloads: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Execute multiple actions in parallel."""
    import asyncio
    
    tasks = [action_one(payload) for payload in payloads]
    return await asyncio.gather(*tasks)
