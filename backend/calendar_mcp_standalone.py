"""
"""KAI Calendar MCP Server – Standalone Version (No Dependencies!)

This is a self-contained calendar server that requires minimal dependencies.
Run directly with: python calendar_mcp_standalone.py

No uv, no chromadb, no build tools needed!
"""

import json
import uuid
from datetime import datetime, timedelta
from typing import Optional, List
import pytz

# Minimal FastAPI setup
try:
    from fastapi import FastAPI, HTTPException
    from pydantic import BaseModel, Field
    import uvicorn
except ImportError:
    print("❌ FastAPI/Uvicorn not found. Install with:")
    print("   pip install fastapi uvicorn pydantic pytz")
    exit(1)


app = FastAPI(title="KAI Calendar MCP Server", version="1.0.0")

# In-memory event store
EVENTS_STORE: dict = {}


# ──────────────────────────────────────────────────────
# Pydantic Models
# ──────────────────────────────────────────────────────

class TimeSlot(BaseModel):
    start_time: str
    end_time: str


class CheckCalendarRequest(BaseModel):
    date: str = Field(..., description="Date in YYYY-MM-DD or 'today'/'tomorrow'")
    duration_minutes: int = Field(120, description="Min continuous free time")
    timezone: str = Field("Asia/Calcutta", description="IANA timezone")
    window_start: str = Field("08:00", description="Earliest time (HH:MM)")
    window_end: str = Field("22:00", description="Latest time (HH:MM)")
    calendar_id: Optional[str] = Field("primary")


class CheckCalendarResponse(BaseModel):
    date: str
    available_slots: List[TimeSlot]
    timezone: str


class BookEventRequest(BaseModel):
    title: str
    start: str
    end: str
    timezone: str = Field("Asia/Calcutta")
    description: Optional[str] = None
    calendar_id: Optional[str] = Field("primary")


class CalendarEvent(BaseModel):
    id: str
    title: str
    start: str
    end: str
    timezone: str
    description: Optional[str] = None
    htmlLink: Optional[str] = None


class BookEventResponse(BaseModel):
    success: bool
    event: Optional[CalendarEvent] = None
    message: str


# ──────────────────────────────────────────────────────
# Helper Functions
# ──────────────────────────────────────────────────────

def parse_date_string(date_str: str, tz_name: str) -> datetime:
    """Parse a date string ('today', 'tomorrow', or YYYY-MM-DD)."""
    tz = pytz.timezone(tz_name)
    now_tz = datetime.now(tz)

    if date_str.lower() == "today":
        return now_tz.replace(hour=0, minute=0, second=0, microsecond=0)
    elif date_str.lower() == "tomorrow":
        return (now_tz + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    else:
        try:
            dt = datetime.strptime(date_str, "%Y-%m-%d")
            return tz.localize(dt.replace(hour=0, minute=0, second=0, microsecond=0))
        except ValueError:
            raise ValueError(f"Invalid date format: {date_str}. Use YYYY-MM-DD, 'today', or 'tomorrow'.")


def time_to_datetime(date_obj: datetime, time_str: str) -> datetime:
    """Convert a date + time string (HH:MM) to datetime."""
    try:
        h, m = map(int, time_str.split(":"))
        return date_obj.replace(hour=h, minute=m, second=0, microsecond=0)
    except (ValueError, AttributeError):
        raise ValueError(f"Invalid time format: {time_str}. Use HH:MM.")


def get_booked_slots(date_obj: datetime, tz_name: str) -> List[tuple]:
    """Get list of booked time slots on a given date."""
    booked = []
    calendar_id = "primary"
    
    if calendar_id not in EVENTS_STORE:
        return booked

    for event in EVENTS_STORE[calendar_id]:
        try:
            event_start = datetime.fromisoformat(event["start"].replace("Z", "+00:00"))
            event_end = datetime.fromisoformat(event["end"].replace("Z", "+00:00"))
            
            # Convert to target timezone
            tz = pytz.timezone(tz_name)
            event_start_tz = event_start.astimezone(tz)
            event_end_tz = event_end.astimezone(tz)
            
            # Check if event is on the same date
            if event_start_tz.date() == date_obj.date():
                booked.append((event_start_tz.time(), event_end_tz.time()))
        except Exception as e:
            print(f"Warning: Error parsing event datetime: {e}")

    return booked


def find_available_slots(
    date_obj: datetime,
    window_start_str: str,
    window_end_str: str,
    duration_minutes: int,
    tz_name: str,
) -> List[TimeSlot]:
    """Find available time slots on a given day."""
    booked = get_booked_slots(date_obj, tz_name)
    
    # Parse window
    window_start = time_to_datetime(date_obj, window_start_str).time()
    window_end = time_to_datetime(date_obj, window_end_str).time()
    
    duration = timedelta(minutes=duration_minutes)
    available_slots = []
    
    current = datetime.combine(date_obj.date(), window_start)
    current_tz = pytz.timezone(tz_name).localize(current)
    end_of_window = datetime.combine(date_obj.date(), window_end)
    end_of_window_tz = pytz.timezone(tz_name).localize(end_of_window)
    
    while current_tz + duration <= end_of_window_tz:
        slot_end = current_tz + duration
        is_free = True
        
        for booked_start, booked_end in booked:
            booked_start_dt = datetime.combine(current_tz.date(), booked_start)
            booked_end_dt = datetime.combine(current_tz.date(), booked_end)
            booked_start_dt = pytz.timezone(tz_name).localize(booked_start_dt)
            booked_end_dt = pytz.timezone(tz_name).localize(booked_end_dt)
            
            # Check for overlap
            if not (slot_end <= booked_start_dt or current_tz >= booked_end_dt):
                is_free = False
                break
        
        if is_free:
            available_slots.append(TimeSlot(
                start_time=current_tz.strftime("%H:%M"),
                end_time=slot_end.strftime("%H:%M"),
            ))
        
        # Move to next 30-minute interval
        current_tz += timedelta(minutes=30)
    
    return available_slots


# ──────────────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────────────

@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "service": "KAI Calendar MCP Server"}


@app.post("/check_calendar")
async def check_calendar(request: CheckCalendarRequest) -> CheckCalendarResponse:
    """Check calendar availability and return free time slots."""
    try:
        date_obj = parse_date_string(request.date, request.timezone)
        available = find_available_slots(
            date_obj,
            request.window_start,
            request.window_end,
            request.duration_minutes,
            request.timezone,
        )
        return CheckCalendarResponse(
            date=date_obj.strftime("%Y-%m-%d"),
            available_slots=available,
            timezone=request.timezone,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"Error checking calendar: {e}")
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


@app.post("/book_event")
async def book_event(request: BookEventRequest) -> BookEventResponse:
    """Book a calendar event."""
    try:
        start_dt = datetime.fromisoformat(request.start.replace("Z", "+00:00"))
        end_dt = datetime.fromisoformat(request.end.replace("Z", "+00:00"))
        
        event_id = str(uuid.uuid4())
        calendar_id = request.calendar_id or "primary"
        
        if calendar_id not in EVENTS_STORE:
            EVENTS_STORE[calendar_id] = []
        
        event = {
            "id": event_id,
            "title": request.title,
            "start": start_dt.isoformat(),
            "end": end_dt.isoformat(),
            "timezone": request.timezone,
            "description": request.description,
            "htmlLink": f"http://localhost:3333/event/{event_id}",
        }
        
        EVENTS_STORE[calendar_id].append(event)
        
        return BookEventResponse(
            success=True,
            event=CalendarEvent(**event),
            message=f"Event '{request.title}' booked successfully.",
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid datetime format: {str(e)}")
    except Exception as e:
        print(f"Error booking event: {e}")
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


@app.get("/events")
async def list_events():
    """List all booked events (debug endpoint)."""
    return EVENTS_STORE


@app.delete("/events/{calendar_id}")
async def clear_events(calendar_id: str = "primary"):
    """Clear all events for a calendar (debug endpoint)."""
    if calendar_id in EVENTS_STORE:
        EVENTS_STORE[calendar_id] = []
    return {"message": f"Events cleared for calendar: {calendar_id}"}


if __name__ == "__main__":
    print("🚀 Starting KAI Calendar MCP Server (Standalone)")
    print("   Available endpoints:")
    print("   - POST /check_calendar → Check availability")
    print("   - POST /book_event → Book an event")
    print("   - GET  /health → Health check")
    print("   - GET  /events → List all events (debug)")
    print("   - DELETE /events/{calendar_id} → Clear events (debug)")
    print("")
    print("   Server: http://localhost:3333")
    print("")
    uvicorn.run(app, host="0.0.0.0", port=3333, log_level="info")
