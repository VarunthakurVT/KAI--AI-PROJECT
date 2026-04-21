"""
NEXUS Backend – MCP Client Adapters

This package provides AI client adapters for integrating external services
via Model Context Protocol (MCP) servers. These adapters enable agents to
interact with third-party systems like calendars, databases, and APIs.

Available Adapters:
  - calendar_mcp: Calendar management (check_calendar, book_event)
  - Add more adapters as needed (email_mcp, slack_mcp, etc.)

Usage:
  from app.mcp import check_calendar, book_event
  
  # Check calendar availability
  availability = await check_calendar({"date": "2026-04-17", "user_id": "user123"})
  
  # Book an event
  event = await book_event({
    "title": "Team Meeting",
    "start_time": "2026-04-17T10:00:00Z",
    "duration_minutes": 60,
    "user_id": "user123"
  })
"""

from __future__ import annotations

from .calendar_mcp import (
    check_calendar,
    book_event,
)

__all__ = [
    # Calendar MCP Adapter
    "check_calendar",
    "book_event",
]


