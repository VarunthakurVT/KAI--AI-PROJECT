# KAI Frontend – MCP Adapter Integration Guide

## Overview

This guide explains how to use MCP (Model Context Protocol) adapters in your React frontend. MCP adapters are AI-powered integrations with external services like calendars, emails, and more.

## Quick Start (5 minutes)

### Step 1: Import the API Client
```typescript
import { checkCalendarAvailability, bookCalendarEvent } from '../api/mcpApi';
```

### Step 2: Use in Your Component
```typescript
export function MyCalendarComponent() {
  const [slots, setSlots] = useState([]);

  const checkAvailability = async () => {
    const result = await checkCalendarAvailability('2026-04-17', 'user123');
    setSlots(result.available_slots);
  };

  return (
    <button onClick={checkAvailability}>Check Calendar</button>
  );
}
```

## Complete Setup

### 1. Install Dependencies (if needed)
```bash
cd frontend
npm install
```

### 2. Ensure Backend is Running
```bash
# In backend directory
uv run python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### 3. Check API Configuration
Verify `mcpApi.ts` imports are working:
```typescript
// frontend/src/shared/api/mcpApi.ts
// Should have: checkCalendarAvailability, bookCalendarEvent, etc.
```

## Available Adapters

### Calendar Adapter

**Check availability:**
```typescript
const availability = await checkCalendarAvailability(
  '2026-04-17',           // Date (YYYY-MM-DD)
  'user123',              // User ID
  'America/New_York'      // Timezone (optional)
);

// Response:
// {
//   date: '2026-04-17',
//   available_slots: [
//     { start_time: '10:00', end_time: '11:00', duration_minutes: 60 }
//   ],
//   timezone: 'America/New_York',
//   is_available: true
// }
```

**Book an event:**
```typescript
const event = await bookCalendarEvent(
  {
    title: 'Team Meeting',
    start_time: '2026-04-17T10:00:00Z',
    end_time: '2026-04-17T11:00:00Z',
    duration_minutes: 60,
    description: 'Quarterly planning'
  },
  'user123'
);

// Response:
// {
//   id: 'evt_123',
//   title: 'Team Meeting',
//   start_time: '2026-04-17T10:00:00Z',
//   end_time: '2026-04-17T11:00:00Z',
//   created_at: '2026-04-17T09:00:00Z'
// }
```

**Get upcoming events:**
```typescript
const events = await getCalendarEvents('user123', 10);
// Returns array of upcoming CalendarEvent objects
```

### Email Adapter (when available)

**Send email:**
```typescript
const result = await sendEmail({
  to: 'user@example.com',
  subject: 'Hello',
  body: 'Test message',
  html: '<p>Test message</p>',
  cc: ['cc@example.com'],
  attachments: [
    { filename: 'doc.pdf', content_type: 'application/pdf', url: '...' }
  ]
});

// Response: { message_id: 'msg_123', sent_at: '2026-04-17T10:00:00Z' }
```

**Get emails:**
```typescript
const emails = await getEmails(20); // Fetch 20 emails
```

## React Component Examples

### Example 1: Simple Calendar Checker
```typescript
import { useState } from 'react';
import { checkCalendarAvailability } from '../api/mcpApi';

export function SimpleCalendarChecker() {
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const handleCheck = async () => {
    setLoading(true);
    try {
      const result = await checkCalendarAvailability(date, 'me');
      setSlots(result.available_slots || []);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />
      <button onClick={handleCheck} disabled={loading}>
        {loading ? 'Checking...' : 'Check Availability'}
      </button>
      {slots.map((slot, i) => (
        <div key={i}>
          {slot.start_time} - {slot.end_time}
        </div>
      ))}
    </div>
  );
}
```

### Example 2: Calendar Booking Form
```typescript
import { useState } from 'react';
import { bookCalendarEvent } from '../api/mcpApi';

export function BookingForm() {
  const [form, setForm] = useState({
    title: '',
    start_time: '',
    duration_minutes: 60,
  });
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const start = new Date(form.start_time);
      const end = new Date(start.getTime() + form.duration_minutes * 60000);

      await bookCalendarEvent(
        {
          title: form.title,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          duration_minutes: form.duration_minutes,
        },
        'me'
      );
      setMessage('✓ Event booked successfully!');
      setForm({ title: '', start_time: '', duration_minutes: 60 });
    } catch (error) {
      setMessage('✗ Booking failed');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Event title"
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
        required
      />
      <input
        type="datetime-local"
        value={form.start_time}
        onChange={(e) => setForm({ ...form, start_time: e.target.value })}
        required
      />
      <select
        value={form.duration_minutes}
        onChange={(e) => setForm({ ...form, duration_minutes: parseInt(e.target.value) })}
      >
        <option value="30">30 min</option>
        <option value="60">1 hour</option>
        <option value="90">1.5 hours</option>
        <option value="120">2 hours</option>
      </select>
      <button type="submit">Book Event</button>
      {message && <p>{message}</p>}
    </form>
  );
}
```

### Example 3: Dynamic Adapter Caller
```typescript
import { useState } from 'react';
import { callMCPAdapter } from '../api/mcpApi';

export function AdapterTester() {
  const [adapter, setAdapter] = useState('calendar');
  const [action, setAction] = useState('check_availability');
  const [payload, setPayload] = useState('{\n  "date": "2026-04-17"\n}');
  const [response, setResponse] = useState<any>(null);
  const [error, setError] = useState('');

  const handleCall = async () => {
    try {
      const result = await callMCPAdapter(
        adapter,
        action,
        JSON.parse(payload)
      );
      setResponse(result);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error calling adapter');
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h3>MCP Adapter Tester</h3>
      
      <input
        placeholder="Adapter (e.g., calendar)"
        value={adapter}
        onChange={(e) => setAdapter(e.target.value)}
        style={{ display: 'block', marginBottom: '10px', width: '100%' }}
      />
      
      <input
        placeholder="Action (e.g., check_availability)"
        value={action}
        onChange={(e) => setAction(e.target.value)}
        style={{ display: 'block', marginBottom: '10px', width: '100%' }}
      />
      
      <textarea
        value={payload}
        onChange={(e) => setPayload(e.target.value)}
        style={{ display: 'block', marginBottom: '10px', width: '100%', height: '100px' }}
      />
      
      <button onClick={handleCall} style={{ marginBottom: '10px' }}>
        Call Adapter
      </button>

      {error && <div style={{ color: 'red' }}>Error: {error}</div>}
      {response && (
        <pre style={{ backgroundColor: '#f0f0f0', padding: '10px', borderRadius: '4px' }}>
          {JSON.stringify(response, null, 2)}
        </pre>
      )}
    </div>
  );
}
```

## Hooks for MCP Adapters

Create custom hooks for cleaner component code:

```typescript
// hooks/useCalendar.ts
import { useState } from 'react';
import { checkCalendarAvailability, bookCalendarEvent, CalendarEvent } from '../api/mcpApi';

export function useCalendar(userId: string) {
  const [availability, setAvailability] = useState<any>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkAvailability = async (date: string) => {
    setLoading(true);
    try {
      const result = await checkCalendarAvailability(date, userId);
      setAvailability(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error checking availability');
    } finally {
      setLoading(false);
    }
  };

  const bookEvent = async (event: Omit<CalendarEvent, 'id' | 'created_at'>) => {
    setLoading(true);
    try {
      const result = await bookCalendarEvent(event, userId);
      setEvents([...events, result]);
      setError(null);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error booking event');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    availability,
    events,
    loading,
    error,
    checkAvailability,
    bookEvent,
  };
}
```

Usage:
```typescript
function MyComponent() {
  const calendar = useCalendar('user123');

  return (
    <div>
      <button onClick={() => calendar.checkAvailability('2026-04-17')}>
        Check Calendar
      </button>
      {calendar.availability && (
        <p>Available slots: {calendar.availability.available_slots.length}</p>
      )}
      {calendar.error && <p style={{ color: 'red' }}>{calendar.error}</p>}
    </div>
  );
}
```

## Error Handling

```typescript
async function callMCPAdapterSafely(adapter: string, action: string, payload: any) {
  try {
    return await callMCPAdapter(adapter, action, payload);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('404')) {
        console.error(`Adapter "${adapter}" not found`);
      } else if (error.message.includes('timeout')) {
        console.error(`Adapter call timed out`);
      } else if (error.message.includes('unauthorized')) {
        console.error(`Not authorized to call adapter`);
      } else {
        console.error(`Adapter error: ${error.message}`);
      }
    }
    throw error;
  }
}
```

## Debugging

### Enable console logging:
```typescript
// In mcpApi.ts, add logging:
console.log('Calling MCP adapter:', { adapter, action, payload });
const response = await callMCPAdapter(adapter, action, payload);
console.log('MCP response:', response);
```

### Check network requests:
1. Open browser DevTools (F12)
2. Go to Network tab
3. Look for requests to `/v1/calendar/*`, `/v1/email/*`
4. Check request/response payloads

### Test in GenericMCPCaller:
Use the `MCPAdapterExamples.tsx` component to test adapters with live JSON

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| 404 Adapter not found | Ensure backend has the adapter configured |
| CORS error | Add adapter URL to CORS_ORIGINS in backend .env |
| Timeout | Increase `*_MCP_TIMEOUT_SECONDS` in backend .env |
| Invalid response | Check that MCP server returns valid JSON |
| Auth error | Ensure user token is valid |

## Next Steps

1. ✅ Set up backend MCP adapters
2. ✅ Configure `.env` with adapter URLs
3. ✅ Import `mcpApi.ts` in your components
4. ✅ Use example components or create your own
5. 🔄 Test with GenericMCPCaller component
6. 🚀 Deploy to production

## Resources

- [Backend MCP Documentation](../backend/app/mcp/README.md)
- [API Client Source](./mcpApi.ts)
- [Example Components](./MCPAdapterExamples.tsx)
- [Adapter Template](../backend/app/mcp/adapter_template.py)
