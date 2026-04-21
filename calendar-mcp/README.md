# Calendar MCP (Mock)

This is a tiny local HTTP server that mimics a "Calendar MCP" tool service so the KAI Commander agent can:

- `check_calendar` (find free slots)
- `book_event` (create a study block)

It **does not** talk to Google Calendar yet — it stores events in `events.json` locally. This lets you validate the end‑to‑end agent workflow immediately.

## Run

From the repo root:

```bash
node calendar-mcp/server.js
```

By default it listens on `http://localhost:3333`.

## Backend config

Set this in `backend/.env`:

```env
CALENDAR_MCP_URL=http://localhost:3333
```

## API

- `POST /check_calendar`
- `POST /book_event`
- `GET /events` (debug)

If you later swap this for a real Google Calendar MCP server, keep the same endpoints or update `backend/app/mcp/calendar_mcp.py`.

