"""
NEXUS Backend – Agent Tools

Tool registry for the agentic layer. Each tool is defined with:
  - A Pydantic schema (for Groq's function calling)
  - An execution function
"""

import json
from typing import List, Dict, Any, Optional
from uuid import UUID
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.rag.retriever import retrieve_chunks
from app.mcp import calendar_mcp

import structlog
import httpx

logger = structlog.get_logger(__name__)


# ╔══════════════════════════════════════════════╗
# ║  Tool Schemas (Pydantic → JSON Schema)       ║
# ╚══════════════════════════════════════════════╝

class SearchKnowledgeBaseArgs(BaseModel):
    """Arguments for the search_knowledge_base tool."""
    query: str = Field(..., description="The search query to find relevant knowledge base chunks.")
    course_id: Optional[str] = Field(None, description="Optional course ID to scope the search.")
    top_k: int = Field(6, description="Number of top results to return.", ge=1, le=20)
    
    @field_validator('top_k', mode='before')
    @classmethod
    def coerce_top_k(cls, v):
        """Convert string numbers to integers."""
        if isinstance(v, str):
            return int(v)
        return v


class EvaluateAnswerArgs(BaseModel):
    """Arguments for the evaluate_answer tool."""
    answer: str = Field(..., description="The student's answer to evaluate.")
    rubric: str = Field(..., description="The evaluation criteria or rubric to use.")


class FetchExternalResourceArgs(BaseModel):
    """Arguments for the fetch_external_resource tool."""
    url: str = Field(..., description="The URL of the external resource to fetch.")


class CheckCalendarArgs(BaseModel):
    """Arguments for the check_calendar tool."""
    date: str = Field(
        ...,
        description="Date to search in YYYY-MM-DD (you may also pass 'today' or 'tomorrow').",
    )
    duration_minutes: int = Field(
        120,
        description="Minimum continuous free time to find (minutes).",
        ge=15,
        le=480,
    )
    timezone: str = Field(
        "Asia/Calcutta",
        description="IANA timezone name for interpreting the date and returned slots.",
    )
    window_start: str = Field("08:00", description="Earliest local time (HH:MM) to consider.")
    window_end: str = Field("22:00", description="Latest local time (HH:MM) to consider.")
    calendar_id: Optional[str] = Field("primary", description="Calendar ID (default: primary).")
    
    @field_validator('duration_minutes', mode='before')
    @classmethod
    def coerce_duration_minutes(cls, v):
        """Convert string numbers to integers."""
        if isinstance(v, str):
            return int(v)
        return v


class BookEventArgs(BaseModel):
    """Arguments for the book_event tool."""
    title: str = Field(..., description="Event title.")
    start: str = Field(..., description="Event start datetime (RFC3339 or ISO 8601).")
    end: str = Field(..., description="Event end datetime (RFC3339 or ISO 8601).")
    timezone: str = Field("Asia/Calcutta", description="IANA timezone for the event.")
    description: Optional[str] = Field(None, description="Optional event description/notes.")
    calendar_id: Optional[str] = Field("primary", description="Calendar ID (default: primary).")


# ╔══════════════════════════════════════════════╗
# ║  Tool Definitions (for Groq function calling)║
# ╚══════════════════════════════════════════════╝

TOOL_DEFINITIONS: List[Dict] = [
    {
        "type": "function",
        "function": {
            "name": "search_knowledge_base",
            "description": (
                "Search the NEXUS knowledge base for relevant information. "
                "Use this when the student asks about course material or you need "
                "to find specific information to answer a question."
            ),
            "parameters": SearchKnowledgeBaseArgs.model_json_schema(),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "evaluate_answer",
            "description": (
                "Evaluate a student's answer against a rubric or criteria. "
                "Use this to grade answers, provide feedback, or assess understanding."
            ),
            "parameters": EvaluateAnswerArgs.model_json_schema(),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "fetch_external_resource",
            "description": (
                "Fetch content from a pre-approved external URL. "
                "Only use when the knowledge base is insufficient and an external "
                "resource is needed."
            ),
            "parameters": FetchExternalResourceArgs.model_json_schema(),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "check_calendar",
            "description": (
                "Check the user's calendar and return free time slots that can fit a study block. "
                "Use this when the user asks to find time for studying, scheduling, or planning."
            ),
            "parameters": CheckCalendarArgs.model_json_schema(),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "book_event",
            "description": (
                "Book a calendar event for a study block. "
                "Use this AFTER identifying a suitable free slot."
            ),
            "parameters": BookEventArgs.model_json_schema(),
        },
    },
]


# ╔══════════════════════════════════════════════╗
# ║  Tool Executors                               ║
# ╚══════════════════════════════════════════════╝

# Allowed domains for external fetching (security allowlist)
ALLOWED_DOMAINS = [
    "en.wikipedia.org",
    "docs.python.org",
    "cppreference.com",
    "developer.mozilla.org",
    "learn.microsoft.com",
]


async def execute_search_knowledge_base(
    args: Dict[str, Any],
    db: AsyncSession,
) -> str:
    """Execute the search_knowledge_base tool."""
    parsed = SearchKnowledgeBaseArgs(**args)
    course_uuid = UUID(parsed.course_id) if parsed.course_id else None

    chunks = await retrieve_chunks(
        db=db,
        query=parsed.query,
        course_id=course_uuid,
        top_k=parsed.top_k,
    )

    if not chunks:
        return "No relevant results found in the knowledge base."

    results = []
    for i, chunk in enumerate(chunks, 1):
        results.append(
            f"[Result {i}] Source: {chunk['source']} | Score: {chunk['score']:.2f}\n"
            f"{chunk['text'][:500]}"
        )

    return "\n\n---\n\n".join(results)


async def execute_evaluate_answer(args: Dict[str, Any]) -> str:
    """Execute the evaluate_answer tool (returns structured evaluation)."""
    parsed = EvaluateAnswerArgs(**args)

    # This would ideally call the LLM with a grading prompt.
    # For MVP, return a structured template the LLM can work with.
    return json.dumps({
        "answer_received": parsed.answer[:200],
        "rubric_applied": parsed.rubric[:200],
        "evaluation": "Pending LLM analysis — use the rubric above to score this answer.",
    })


async def execute_fetch_external_resource(args: Dict[str, Any]) -> str:
    """Execute the fetch_external_resource tool (with domain allowlist)."""
    parsed = FetchExternalResourceArgs(**args)

    # Security: check domain allowlist
    from urllib.parse import urlparse
    domain = urlparse(parsed.url).netloc
    if not any(allowed in domain for allowed in ALLOWED_DOMAINS):
        return f"Error: Domain '{domain}' is not in the allowed list. Allowed: {', '.join(ALLOWED_DOMAINS)}"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(parsed.url, follow_redirects=True)
            resp.raise_for_status()

            # Return first 2000 chars of text content
            text = resp.text[:2000]
            return f"Content from {parsed.url}:\n\n{text}"
    except Exception as e:
        return f"Error fetching resource: {str(e)}"


async def execute_check_calendar(args: Dict[str, Any]) -> dict[str, Any]:
    """Execute the check_calendar tool via Calendar MCP."""
    parsed = CheckCalendarArgs(**args)
    payload = parsed.model_dump()

    try:
        result = await calendar_mcp.check_calendar(payload)
        return {"content": json.dumps(result), "side_effects": None}
    except Exception as exc:
        logger.error("calendar_check_error", error=str(exc))
        return {"content": f"Error: calendar check failed ({exc})", "side_effects": None}


async def execute_book_event(args: Dict[str, Any]) -> dict[str, Any]:
    """Execute the book_event tool via Calendar MCP."""
    parsed = BookEventArgs(**args)
    payload = parsed.model_dump()

    try:
        result = await calendar_mcp.book_event(payload)
    except Exception as exc:
        logger.error("calendar_book_error", error=str(exc))
        return {"content": f"Error: booking failed ({exc})", "side_effects": None}

    def _extract_dt(value: Any) -> Optional[str]:
        """Normalize common calendar datetime shapes to an ISO string."""
        if value is None:
            return None
        if isinstance(value, str):
            return value
        if isinstance(value, dict):
            # Google-style: {"dateTime": "...", "timeZone": "..."} or all-day {"date": "..."}
            if value.get("dateTime"):
                return str(value["dateTime"])
            if value.get("date"):
                return str(value["date"])
        return None

    def _extract_event(payload_dict: Any) -> Optional[dict[str, Any]]:
        """Calendar MCPs vary: sometimes the event is under 'event', sometimes top-level."""
        if not isinstance(payload_dict, dict):
            return None
        if isinstance(payload_dict.get("event"), dict):
            return payload_dict["event"]
        # Heuristic: treat as event if it looks like one.
        if any(k in payload_dict for k in ("start", "end", "title", "summary", "htmlLink", "html_link", "id")):
            return payload_dict
        return None

    event = _extract_event(result)
    side_effects = None
    if isinstance(event, dict):
        title = event.get("title") or event.get("summary") or parsed.title
        start = _extract_dt(event.get("start")) or str(event.get("start_time") or parsed.start)
        end = _extract_dt(event.get("end")) or str(event.get("end_time") or parsed.end)
        html_link = event.get("html_link") or event.get("htmlLink") or event.get("link")

        # Only emit side effects if we have minimally useful scheduling data.
        if title and start and end:
            side_effects = {
                "calendar_updated": True,
                "new_event": {
                    "id": str(event.get("id") or event.get("event_id") or ""),
                    "title": str(title),
                    "start": str(start),
                    "end": str(end),
                    "html_link": html_link,
                },
            }

    return {"content": json.dumps(result), "side_effects": side_effects}


# ╔══════════════════════════════════════════════╗
# ║  Tool Router                                  ║
# ╚══════════════════════════════════════════════╝

async def execute_tool(
    tool_name: str,
    arguments: str,
    db: AsyncSession,
) -> dict[str, Any]:
    """Route a tool call to the appropriate executor."""
    args = json.loads(arguments)

    match tool_name:
        case "search_knowledge_base":
            return {"content": await execute_search_knowledge_base(args, db), "side_effects": None}
        case "evaluate_answer":
            return {"content": await execute_evaluate_answer(args), "side_effects": None}
        case "fetch_external_resource":
            return {"content": await execute_fetch_external_resource(args), "side_effects": None}
        case "check_calendar":
            return await execute_check_calendar(args)
        case "book_event":
            return await execute_book_event(args)
        case _:
            return {"content": f"Unknown tool: {tool_name}", "side_effects": None}
