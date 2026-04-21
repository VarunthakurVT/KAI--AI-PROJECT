const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.CALENDAR_MCP_PORT || 3333);
const DATA_PATH = path.join(__dirname, 'events.json');

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

let events = readJsonFile(DATA_PATH, []);

function json(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  return JSON.parse(raw);
}

function resolveDateLabel(label) {
  const value = String(label || '').trim().toLowerCase();
  if (!value) return null;
  const now = new Date();
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (value === 'today') return day.toISOString().slice(0, 10);
  if (value === 'tomorrow') {
    const t = new Date(day);
    t.setDate(t.getDate() + 1);
    return t.toISOString().slice(0, 10);
  }
  return value; // assume YYYY-MM-DD
}

function dateAtTime(dateStr, timeStr) {
  const [hh, mm] = String(timeStr || '00:00').split(':').map((n) => Number(n));
  const d = new Date(`${dateStr}T00:00:00`);
  d.setHours(Number.isFinite(hh) ? hh : 0, Number.isFinite(mm) ? mm : 0, 0, 0);
  return d;
}

function clampInterval(start, end, windowStart, windowEnd) {
  const s = start < windowStart ? windowStart : start;
  const e = end > windowEnd ? windowEnd : end;
  if (e <= s) return null;
  return { start: s, end: e };
}

function mergeIntervals(intervals) {
  const sorted = intervals
    .slice()
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged = [];
  for (const it of sorted) {
    const last = merged[merged.length - 1];
    if (!last || it.start > last.end) {
      merged.push({ start: it.start, end: it.end });
      continue;
    }
    if (it.end > last.end) last.end = it.end;
  }
  return merged;
}

function diffFreeSlots(windowStart, windowEnd, busy, minMinutes) {
  const minMs = Math.max(0, Number(minMinutes) || 0) * 60 * 1000;
  const free = [];
  let cursor = windowStart;

  for (const interval of busy) {
    if (interval.start > cursor) {
      const gapMs = interval.start.getTime() - cursor.getTime();
      if (gapMs >= minMs) free.push({ start: new Date(cursor), end: new Date(interval.start) });
    }
    if (interval.end > cursor) cursor = interval.end;
  }

  if (cursor < windowEnd) {
    const gapMs = windowEnd.getTime() - cursor.getTime();
    if (gapMs >= minMs) free.push({ start: new Date(cursor), end: new Date(windowEnd) });
  }

  return free;
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, {});

  try {
    if (req.method === 'GET' && req.url === '/events') {
      return json(res, 200, { events });
    }

    if (req.method === 'POST' && req.url === '/check_calendar') {
      const body = await readBody(req);
      const date = resolveDateLabel(body.date);
      if (!date) return json(res, 400, { error: 'Missing date' });

      const windowStart = dateAtTime(date, body.window_start || '08:00');
      const windowEnd = dateAtTime(date, body.window_end || '22:00');
      if (windowEnd <= windowStart) return json(res, 400, { error: 'Invalid window' });

      const dayStart = new Date(`${date}T00:00:00`);
      const dayEnd = new Date(`${date}T23:59:59`);

      const busyRaw = events
        .map((e) => ({
          ...e,
          _start: new Date(e.start),
          _end: new Date(e.end),
        }))
        .filter((e) => !Number.isNaN(e._start.getTime()) && !Number.isNaN(e._end.getTime()))
        .filter((e) => e._start < dayEnd && e._end > dayStart)
        .map((e) => clampInterval(e._start, e._end, windowStart, windowEnd))
        .filter(Boolean);

      const busy = mergeIntervals(busyRaw);
      const freeSlots = diffFreeSlots(windowStart, windowEnd, busy, body.duration_minutes || 120).map((slot) => ({
        start: slot.start.toISOString(),
        end: slot.end.toISOString(),
      }));

      return json(res, 200, {
        date,
        timezone: body.timezone || 'local',
        duration_minutes: body.duration_minutes || 120,
        window_start: body.window_start || '08:00',
        window_end: body.window_end || '22:00',
        free_slots: freeSlots,
        busy: busy.map((b) => ({ start: b.start.toISOString(), end: b.end.toISOString() })),
      });
    }

    if (req.method === 'POST' && req.url === '/book_event') {
      const body = await readBody(req);
      const title = String(body.title || '').trim();
      const start = String(body.start || '').trim();
      const end = String(body.end || '').trim();
      if (!title || !start || !end) {
        return json(res, 400, { error: 'title, start, end are required' });
      }

      const event = {
        id: `evt_${Math.random().toString(16).slice(2)}`,
        title,
        start,
        end,
        timezone: body.timezone || 'local',
        description: body.description || null,
        calendar_id: body.calendar_id || 'primary',
        html_link: null,
        created_at: new Date().toISOString(),
      };

      events = [event, ...events].slice(0, 200);
      writeJsonFile(DATA_PATH, events);

      return json(res, 201, { status: 'created', event });
    }

    return json(res, 404, { error: 'Not found' });
  } catch (err) {
    return json(res, 500, { error: String(err?.message || err || 'Unknown error') });
  }
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[calendar-mcp] Mock server listening on http://localhost:${PORT}`);
});

