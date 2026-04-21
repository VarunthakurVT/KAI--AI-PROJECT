# MCP Client Adapters – Documentation

## Overview

The MCP (Model Context Protocol) client adapters enable NEXUS to integrate with external services through HTTP-based MCP servers. These adapters bridge the agent tool-calling layer to third-party systems.

## Available Adapters

### 1. Calendar MCP Adapter
**File:** `calendar_mcp.py`

Manages calendar operations for scheduling and availability checks.

**Functions:**
- `check_calendar(payload)` - Check user availability
- `book_event(payload)` - Create/book calendar events

**Configuration:**
```env
CALENDAR_MCP_URL=http://localhost:3001
CALENDAR_MCP_TIMEOUT_SECONDS=12.0
```

**Usage:**
```python
from app.mcp import check_calendar, book_event

# Check availability
availability = await check_calendar({
    "date": "2026-04-17",
    "user_id": "user123",
    "timezone": "UTC"
})

# Book event
event = await book_event({
    "title": "Team Meeting",
    "start_time": "2026-04-17T10:00:00Z",
    "duration_minutes": 60,
    "user_id": "user123",
    "description": "Quarterly planning meeting"
})
```

---

## Creating a New Adapter

### Step 1: Create the Adapter File
Copy `adapter_template.py` and customize:
```powershell
Copy-Item adapter_template.py email_mcp.py
```

### Step 2: Customize the Adapter
Replace placeholders in your new file:

```python
# Customize these:
SERVICE_NAME = "EMAIL_MCP"
SERVICE_URL_CONFIG = "EMAIL_MCP_URL"
SERVICE_TIMEOUT_CONFIG = "EMAIL_MCP_TIMEOUT_SECONDS"

# Implement your functions:
async def send_email(payload: dict[str, Any]) -> dict[str, Any]:
    """Send an email via MCP server."""
    ...

async def get_emails(payload: dict[str, Any]) -> dict[str, Any]:
    """Fetch emails via MCP server."""
    ...
```

### Step 3: Update `__init__.py`
Add your adapter to the exports:

```python
from .email_mcp import send_email, get_emails

__all__ = [
    # Calendar MCP Adapter
    "check_calendar",
    "book_event",
    # Email MCP Adapter
    "send_email",
    "get_emails",
]
```

### Step 4: Configure Environment
Add to `.env`:
```env
EMAIL_MCP_URL=http://localhost:3002
EMAIL_MCP_TIMEOUT_SECONDS=15.0
```

### Step 5: Document Usage
Update this README with your new adapter.

---

## Integration with Agent Tools

MCP adapters are typically called via agent tool definitions. Example:

```python
# In app/agent/tools.py
{
    "name": "send_email",
    "description": "Send an email using the Email MCP server",
    "parameters": {
        "type": "object",
        "properties": {
            "to": {"type": "string", "description": "Recipient email"},
            "subject": {"type": "string", "description": "Email subject"},
            "body": {"type": "string", "description": "Email body"}
        },
        "required": ["to", "subject", "body"]
    }
}
```

---

## Best Practices

1. **Error Handling**: Always wrap MCP calls in try-catch blocks
   ```python
   try:
       result = await check_calendar(payload)
   except httpx.HTTPError as e:
       logger.error("calendar_mcp_error", error=str(e))
       raise
   ```

2. **Timeouts**: Set reasonable timeouts for external service calls
   ```env
   CALENDAR_MCP_TIMEOUT_SECONDS=12.0
   ```

3. **Async/Await**: Always use async functions for I/O operations
   ```python
   async def my_adapter_function(payload):
       async with httpx.AsyncClient(timeout=timeout) as client:
           resp = await client.post(url, json=payload)
           return resp.json()
   ```

4. **Logging**: Use structlog for consistent logging
   ```python
   logger.info("adapter_call", adapter="calendar", action="check_availability")
   ```

5. **Validation**: Validate payloads before sending to MCP servers
   ```python
   if not payload.get("user_id"):
       raise ValueError("user_id is required")
   ```

---

## Testing Adapters

### Local MCP Server Simulation
```bash
# Example: Start a mock calendar server
python -m http.server 3001 --directory mock_mcp_responses
```

### Integration Test
```python
import pytest
from app.mcp import check_calendar

@pytest.mark.asyncio
async def test_check_calendar():
    result = await check_calendar({
        "date": "2026-04-17",
        "user_id": "test_user"
    })
    assert result["available"] in [True, False]
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `RuntimeError: *_MCP_URL is not configured` | Add `*_MCP_URL` to `.env` file |
| `Connection refused` | Ensure MCP server is running on configured URL |
| `Timeout` | Increase `*_MCP_TIMEOUT_SECONDS` in `.env` |
| `JSONDecodeError` | Verify MCP server returns valid JSON |

---

## Future Adapters

Potential MCP adapters to implement:
- **Email MCP**: Gmail, Outlook integration
- **Slack MCP**: Message sending, channel management
- **Database MCP**: SQL query execution
- **File Storage MCP**: S3, Google Drive integration
- **Analytics MCP**: Metrics retrieval
- **Notification MCP**: SMS, Push notifications

---

## See Also

- [app/agent/tools.py](../agent/tools.py) - Agent tool definitions
- [adapter_template.py](./adapter_template.py) - Template for new adapters
- [calendar_mcp.py](./calendar_mcp.py) - Calendar adapter example

---

## 🎨 Frontend Integration

### Quick Start - Using MCP Adapters in React

The frontend connects to MCP adapters through the backend API.

#### 1. **Import the MCP API Client**
```typescript
// frontend/src/shared/api/mcpApi.ts
import {
  checkCalendarAvailability,
  bookCalendarEvent,
  getCalendarEvents,
  callMCPAdapter,
} from './mcpApi';
```

#### 2. **Check Calendar Availability**
```typescript
import { checkCalendarAvailability } from '../api/mcpApi';

export function CalendarWidget() {
  const [availability, setAvailability] = useState(null);

  const handleCheckDate = async (date: string) => {
    try {
      const result = await checkCalendarAvailability(date, 'user123');
      setAvailability(result);
    } catch (error) {
      console.error('Failed to check availability:', error);
    }
  };

  return (
    <div>
      <input type="date" onChange={(e) => handleCheckDate(e.target.value)} />
      {availability && (
        <div>
          Available slots:
          {availability.available_slots.map((slot) => (
            <div key={slot.start_time}>
              {slot.start_time} - {slot.end_time}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

#### 3. **Book a Calendar Event**
```typescript
import { bookCalendarEvent } from '../api/mcpApi';

async function handleBookEvent() {
  try {
    const event = await bookCalendarEvent(
      {
        title: 'Team Meeting',
        start_time: '2026-04-17T10:00:00Z',
        end_time: '2026-04-17T11:00:00Z',
        duration_minutes: 60,
        description: 'Quarterly planning',
      },
      'user123'
    );
    console.log('Event booked:', event);
  } catch (error) {
    console.error('Booking failed:', error);
  }
}
```

#### 4. **Use the Generic MCP Caller** (for dynamic adapters)
```typescript
import { callMCPAdapter } from '../api/mcpApi';

// Call any adapter dynamically
const result = await callMCPAdapter('email', 'send_email', {
  to: 'user@example.com',
  subject: 'Hello',
  body: 'Test message',
});
```

### Frontend File Structure

```
frontend/src/
├── shared/
│   └── api/
│       ├── nexusApi.ts          ← Main API client
│       └── mcpApi.ts            ← MCP Adapter client (NEW)
└── components/
    └── MCPAdapterExamples.tsx   ← Example components (NEW)
```

### Available Functions in `mcpApi.ts`

| Function | Purpose |
|----------|---------|
| `checkCalendarAvailability(date, userId)` | Check available time slots |
| `bookCalendarEvent(event, userId)` | Create calendar event |
| `getCalendarEvents(userId, limit)` | Fetch upcoming events |
| `sendEmail(email)` | Send email (when Email MCP enabled) |
| `getEmails(limit)` | Fetch inbox emails |
| `callMCPAdapter(adapter, action, payload)` | Generic adapter caller |

### Example Components

Use these pre-built React components in your app:

```typescript
import {
  CalendarAvailabilityChecker,
  BookEventForm,
  GenericMCPCaller,
} from '../components/MCPAdapterExamples';

function Dashboard() {
  return (
    <div>
      <CalendarAvailabilityChecker />
      <BookEventForm />
      <GenericMCPCaller />
    </div>
  );
}
```

### Error Handling in Frontend

```typescript
import { checkCalendarAvailability } from '../api/mcpApi';

async function safeMCPCall() {
  try {
    const availability = await checkCalendarAvailability('2026-04-17', 'user123');
    return availability;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('404')) {
        console.error('MCP adapter not found');
      } else if (error.message.includes('timeout')) {
        console.error('MCP server timeout');
      } else {
        console.error('Unknown error:', error.message);
      }
    }
    throw error;
  }
}
```

### Backend API Endpoints

The backend exposes these endpoints for MCP adapters:

```
POST /v1/calendar/availability      → Check availability
POST /v1/calendar/events            → Book event
GET  /v1/calendar/events            → Get events
POST /v1/email/send                 → Send email
GET  /v1/email/inbox                → Get emails
POST /v1/adapters/{adapter}/{action} → Generic adapter call
```

### Adding New Adapter Endpoints

1. **Create backend adapter** (e.g., `email_mcp.py`)
2. **Add API endpoint** in `app/api/v1/` (e.g., `email.py`)
3. **Create frontend client** in `mcpApi.ts`
4. **Create React component** in `components/`

Example endpoint (backend):
```python
# app/api/v1/email.py
from fastapi import APIRouter
from app.mcp import send_email

router = APIRouter()

@router.post("/send")
async def send_email_endpoint(payload: dict):
    result = await send_email(payload)
    return result
```

Example client (frontend):
```typescript
// frontend/src/shared/api/mcpApi.ts
export async function sendEmail(email: EmailMessage): Promise<any> {
  const res = await fetch(`${API_BASE}/email/send`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(email),
  });
  return handleResponse(res);
}
```

### Live Reload & Hot Updates

When using React development server:
- Changes to `mcpApi.ts` reload automatically
- Components using MCP adapters update in real-time
- Test different adapters without backend restart

### Testing MCP Adapters in UI

Use the **GenericMCPCaller** component to test any adapter:
1. Select adapter name (e.g., "calendar")
2. Enter action name (e.g., "check_availability")
3. Input JSON payload
4. See response immediately

### Full Example App

```typescript
import React, { useState } from 'react';
import { checkCalendarAvailability, bookCalendarEvent } from './api/mcpApi';

export default function MCPDashboard() {
  const [selectedDate, setSelectedDate] = useState('');
  const [slots, setSlots] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const checkDate = async () => {
    setLoading(true);
    try {
      const availability = await checkCalendarAvailability(selectedDate, 'me');
      setSlots(availability.available_slots || []);
    } catch (error) {
      console.error('Error:', error);
    }
    setLoading(false);
  };

  const bookSlot = async (startTime: string, endTime: string) => {
    try {
      await bookCalendarEvent({
        title: 'Booked Slot',
        start_time: startTime,
        end_time: endTime,
        duration_minutes: 30,
      }, 'me');
      alert('Event booked!');
      checkDate(); // Refresh
    } catch (error) {
      alert('Booking failed');
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>Calendar MCP Adapter</h1>
      <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
      <button onClick={checkDate} disabled={loading}>{loading ? 'Loading...' : 'Check'}</button>
      
      {slots.map((slot, i) => (
        <div key={i} style={{ marginTop: '10px', padding: '10px', border: '1px solid #ccc' }}>
          <p>{slot.start_time} - {slot.end_time}</p>
          <button onClick={() => bookSlot(slot.start_time, slot.end_time)}>Book</button>
        </div>
      ))}
    </div>
  );
}
```
