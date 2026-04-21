"""
NEXUS Backend – AI Response Formatter

Formats AI responses with consistent structure and formatting.
"""

from dataclasses import dataclass
from typing import Optional

@dataclass
class FormattedAIResponse:
    """Standard AI response format with heading, content, and follow-up."""
    greeting: str
    heading: str
    heading_icon: str = "🔗"
    content: str = ""
    followup: str = ""
    followup_icon: str = "❓"


def format_explanation_response(topic: str, explanation: str) -> FormattedAIResponse:
    """Format an explanation response."""
    return FormattedAIResponse(
        greeting=f"Hello 👋, let me explain this concept!",
        heading=f"Understanding {topic}",
        heading_icon="📚",
        content=explanation,
        followup="Would you like more details or examples?",
        followup_icon="🤔"
    )


def format_quiz_response(question: str, context: str = "") -> FormattedAIResponse:
    """Format a quiz/question response."""
    return FormattedAIResponse(
        greeting="Hello 👋, test your knowledge!",
        heading="Quiz Question",
        heading_icon="❓",
        content=question,
        followup="What's your answer?" if not context else context,
        followup_icon="✍️"
    )


def format_guidance_response(topic: str, guidance: str) -> FormattedAIResponse:
    """Format a guidance/help response."""
    return FormattedAIResponse(
        greeting="Hello 👋, I'm here to help!",
        heading=f"Guidance: {topic}",
        heading_icon="🎯",
        content=guidance,
        followup="Do you need clarification on any part?",
        followup_icon="💡"
    )


def format_summary_response(topic: str, summary: str) -> FormattedAIResponse:
    """Format a summary response."""
    return FormattedAIResponse(
        greeting="Hello 👋, here's what you need to know!",
        heading=f"Summary: {topic}",
        heading_icon="📝",
        content=summary,
        followup="Would you like to go deeper into any section?",
        followup_icon="🔍"
    )


def format_practice_response(problem: str, context: str = "") -> FormattedAIResponse:
    """Format a practice problem response."""
    return FormattedAIResponse(
        greeting="Hello 👋, time to practice!",
        heading="Practice Problem",
        heading_icon="💪",
        content=problem,
        followup="Do you want hints, the solution, or would you like to try again?",
        followup_icon="🚀"
    )


def format_calendar_response(availability: str) -> FormattedAIResponse:
    """Format a calendar/scheduling response."""
    return FormattedAIResponse(
        greeting="Hello 👋, checking your calendar!",
        heading="Calendar Availability",
        heading_icon="📅",
        content=availability,
        followup="Would you like to schedule something?",
        followup_icon="✓"
    )


def format_error_response(error_message: str) -> FormattedAIResponse:
    """Format an error response."""
    return FormattedAIResponse(
        greeting="Hello 👋, I encountered an issue.",
        heading="Error",
        heading_icon="⚠️",
        content=error_message,
        followup="Can I help you with something else?",
        followup_icon="🤝"
    )


def to_dict(response: FormattedAIResponse) -> dict:
    """Convert FormattedAIResponse to dictionary."""
    return {
        "greeting": response.greeting,
        "heading": response.heading,
        "heading_icon": response.heading_icon,
        "content": response.content,
        "followup": response.followup,
        "followup_icon": response.followup_icon,
    }
