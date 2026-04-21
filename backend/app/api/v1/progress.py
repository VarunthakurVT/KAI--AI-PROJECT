"""
NEXUS Backend – Progress / Analytics API Endpoints

GET  /v1/progress         → get full progress summary (streaks, daily, monthly)
POST /v1/progress/record  → record study time for today
POST /v1/progress/complete → mark today as completed
"""

from datetime import date, timedelta
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_

from app.db.session import get_db
from app.db.models import User, DailyProgress
from app.schemas.progress import (
    RecordProgressRequest,
    DayProgressResponse,
    MonthProgressResponse,
    ProgressSummaryResponse,
)
from app.dependencies import get_current_user

import structlog

logger = structlog.get_logger(__name__)
router = APIRouter()


def _date_str(d: date) -> str:
    return d.isoformat()


def _compute_streak(rows: list[DailyProgress]) -> tuple[int, int]:
    """
    Compute (current_streak, longest_streak) from sorted daily progress rows.
    """
    if not rows:
        return 0, 0

    # Sort descending by date
    sorted_rows = sorted(rows, key=lambda r: r.date, reverse=True)

    # Current streak: count consecutive completed days ending yesterday or today
    current_streak = 0
    expected_date = date.today()
    for row in sorted_rows:
        if row.date == expected_date and row.streak_active:
            current_streak += 1
            expected_date -= timedelta(days=1)
        elif row.date == expected_date and not row.streak_active:
            break
        elif row.date < expected_date:
            # Gap in data — if today is missing, check from yesterday
            if current_streak == 0 and row.date == date.today() - timedelta(days=1):
                expected_date = row.date
                if row.streak_active:
                    current_streak += 1
                    expected_date -= timedelta(days=1)
                else:
                    break
            else:
                break

    # Longest streak
    longest = 0
    current = 0
    sorted_asc = sorted(rows, key=lambda r: r.date)
    prev_date = None
    for row in sorted_asc:
        if row.streak_active:
            if prev_date and (row.date - prev_date).days == 1:
                current += 1
            else:
                current = 1
            longest = max(longest, current)
        else:
            current = 0
        prev_date = row.date

    return current_streak, longest


def _build_monthly(day_list: list[DayProgressResponse]) -> list[MonthProgressResponse]:
    """Aggregate daily progress into monthly summaries."""
    month_map: dict[str, dict] = {}

    for d in day_list:
        month_key = d.date[:7]  # "YYYY-MM"
        if month_key not in month_map:
            month_map[month_key] = {
                "month": month_key,
                "days_completed": 0,
                "total_days": 0,
                "total_minutes": 0,
                "topics": set(),
            }
        entry = month_map[month_key]
        entry["total_days"] += 1
        entry["total_minutes"] += d.study_minutes
        if d.completed:
            entry["days_completed"] += 1
        for t in d.topics_studied:
            entry["topics"].add(t)

    return [
        MonthProgressResponse(
            month=v["month"],
            days_completed=v["days_completed"],
            total_days=v["total_days"],
            total_minutes=v["total_minutes"],
            topics_completed=sorted(v["topics"]),
        )
        for v in sorted(month_map.values(), key=lambda x: x["month"])
    ]


@router.get("", response_model=ProgressSummaryResponse)
async def get_progress(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the full progress summary for the current user."""
    # Fetch last 90 days of progress
    cutoff = date.today() - timedelta(days=90)
    result = await db.execute(
        select(DailyProgress)
        .where(DailyProgress.user_id == current_user.id, DailyProgress.date >= cutoff)
        .order_by(DailyProgress.date.asc())
    )
    rows = result.scalars().all()

    # Build daily progress list
    daily = []
    today_row = None
    for r in rows:
        dp = DayProgressResponse(
            date=_date_str(r.date),
            completed=r.streak_active,
            study_minutes=r.minutes_studied,
            topics_studied=r.topics_studied or [],
        )
        daily.append(dp)
        if r.date == date.today():
            today_row = r

    # Compute streaks
    current_streak, longest_streak = _compute_streak(list(rows))

    # Monthly aggregation
    monthly = _build_monthly(daily)

    # Determine the most recently studied topic
    active_topic = "General Study"
    for r in reversed(list(rows)):
        if r.topics_studied:
            active_topic = r.topics_studied[0]
            break

    return ProgressSummaryResponse(
        current_streak=current_streak,
        longest_streak=longest_streak,
        today_completed=today_row.streak_active if today_row else False,
        today_minutes=today_row.minutes_studied if today_row else 0,
        daily_goal_minutes=current_user.daily_goal_minutes,
        active_topic=active_topic,
        daily_progress=daily,
        monthly_progress=monthly,
    )


@router.post("/record", response_model=DayProgressResponse)
async def record_progress(
    body: RecordProgressRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add study minutes and topics to today's progress."""
    today = date.today()

    result = await db.execute(
        select(DailyProgress).where(
            DailyProgress.user_id == current_user.id,
            DailyProgress.date == today,
        )
    )
    row = result.scalar_one_or_none()

    if row:
        row.minutes_studied += body.minutes
        existing_topics = row.topics_studied or []
        merged = list(set(existing_topics + body.topics))
        row.topics_studied = merged
        if body.completed:
            row.streak_active = True
    else:
        row = DailyProgress(
            user_id=current_user.id,
            date=today,
            minutes_studied=body.minutes,
            topics_studied=body.topics,
            streak_active=body.completed,
        )
        db.add(row)

    await db.flush()

    return DayProgressResponse(
        date=_date_str(row.date),
        completed=row.streak_active,
        study_minutes=row.minutes_studied,
        topics_studied=row.topics_studied or [],
    )


@router.post("/complete", response_model=DayProgressResponse)
async def complete_today(
    body: RecordProgressRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark today as completed (goal met) and record additional time/topics."""
    today = date.today()

    result = await db.execute(
        select(DailyProgress).where(
            DailyProgress.user_id == current_user.id,
            DailyProgress.date == today,
        )
    )
    row = result.scalar_one_or_none()

    if row:
        row.minutes_studied += body.minutes
        existing_topics = row.topics_studied or []
        row.topics_studied = list(set(existing_topics + body.topics))
        row.streak_active = True
    else:
        row = DailyProgress(
            user_id=current_user.id,
            date=today,
            minutes_studied=body.minutes,
            topics_studied=body.topics,
            streak_active=True,
        )
        db.add(row)

    await db.flush()

    return DayProgressResponse(
        date=_date_str(row.date),
        completed=row.streak_active,
        study_minutes=row.minutes_studied,
        topics_studied=row.topics_studied or [],
    )
