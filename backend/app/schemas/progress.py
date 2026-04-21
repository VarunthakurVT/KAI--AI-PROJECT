"""
NEXUS Backend – Progress / Analytics Schemas
"""

from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel
from uuid import UUID


# ── Request ──
class RecordProgressRequest(BaseModel):
    minutes: int
    topics: list[str] = []
    completed: bool = False


# ── Response ──
class DayProgressResponse(BaseModel):
    date: str
    completed: bool
    study_minutes: int
    topics_studied: list[str]


class MonthProgressResponse(BaseModel):
    month: str
    days_completed: int
    total_days: int
    total_minutes: int
    topics_completed: list[str]


class ProgressSummaryResponse(BaseModel):
    current_streak: int
    longest_streak: int
    today_completed: bool
    today_minutes: int
    daily_goal_minutes: int
    active_topic: str
    daily_progress: list[DayProgressResponse]
    monthly_progress: list[MonthProgressResponse]
