/**
 * NEXUS Frontend – MCP Adapter API Client
 *
 * This module extends the main API client to expose MCP adapter functionality.
 * MCP adapters enable real-time integration with external services (calendar, email, etc.)
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/v1';

// ── Helpers (from main nexusApi.ts) ──
function getSessionId(): string {
  const storageKey = 'nexus_session_id';
  let sessionId = localStorage.getItem(storageKey);
  if (!sessionId) {
    sessionId = `session-${Date.now()}`;
    localStorage.setItem(storageKey, sessionId);
  }
  return sessionId;
}

function getToken(): string | null {
  return localStorage.getItem('nexus_token');
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Nexus-Session': getSessionId(),
    ...extra,
  };
  const token = getToken();
  if (token) {
    h['Authorization'] = `Bearer ${token}`;
  }
  return h;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

// ╔══════════════════════════════════════════════╗
// ║  Calendar MCP Adapter                        ║
// ╚══════════════════════════════════════════════╝

export interface CalendarAvailability {
  date: string;
  available_slots: Array<{
    start_time: string;
    end_time: string;
    duration_minutes: number;
  }>;
  timezone: string;
  is_available: boolean;
}

export interface CalendarEvent {
  id?: string;
  title: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  description?: string;
  attendees?: string[];
  created_at?: string;
}

/**
 * Check calendar availability for a specific date
 * @param date - Date to check (ISO 8601 format: YYYY-MM-DD)
 * @param userId - User ID
 * @param timezone - Timezone (default: UTC)
 */
export async function checkCalendarAvailability(
  date: string,
  userId: string,
  timezone: string = 'UTC'
): Promise<CalendarAvailability> {
  const res = await fetch(`${API_BASE}/calendar/availability`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ date, user_id: userId, timezone }),
  });
  return handleResponse<CalendarAvailability>(res);
}

/**
 * Book a calendar event
 * @param event - Event details
 * @param userId - User ID
 */
export async function bookCalendarEvent(
  event: Omit<CalendarEvent, 'id' | 'created_at'>,
  userId: string
): Promise<CalendarEvent> {
  const res = await fetch(`${API_BASE}/calendar/events`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ ...event, user_id: userId }),
  });
  return handleResponse<CalendarEvent>(res);
}

/**
 * Get upcoming calendar events
 * @param userId - User ID
 * @param limit - Maximum number of events (default: 10)
 */
export async function getCalendarEvents(userId: string, limit: number = 10): Promise<CalendarEvent[]> {
  const res = await fetch(`${API_BASE}/calendar/events?user_id=${userId}&limit=${limit}`, {
    method: 'GET',
    headers: headers(),
  });
  return handleResponse<CalendarEvent[]>(res);
}

// ╔══════════════════════════════════════════════╗
// ║  Email MCP Adapter (Template)                ║
// ╚══════════════════════════════════════════════╝

export interface EmailMessage {
  id?: string;
  to: string | string[];
  subject: string;
  body: string;
  html?: string;
  cc?: string[];
  bcc?: string[];
  attachments?: Array<{ filename: string; content_type: string; url: string }>;
  sent_at?: string;
}

/**
 * Send an email via MCP adapter (when Email MCP is available)
 * @param email - Email details
 */
export async function sendEmail(email: EmailMessage): Promise<{ message_id: string; sent_at: string }> {
  const res = await fetch(`${API_BASE}/email/send`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(email),
  });
  return handleResponse(res);
}

/**
 * Get inbox emails (when Email MCP is available)
 * @param limit - Maximum emails to fetch
 */
export async function getEmails(limit: number = 20): Promise<EmailMessage[]> {
  const res = await fetch(`${API_BASE}/email/inbox?limit=${limit}`, {
    method: 'GET',
    headers: headers(),
  });
  return handleResponse<EmailMessage[]>(res);
}

// ╔══════════════════════════════════════════════╗
// ║  Generic MCP Adapter Call                    ║
// ╚══════════════════════════════════════════════╝

export interface MCPAdapterResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  adapter: string;
  action: string;
}

/**
 * Generic function to call any MCP adapter
 * Useful for dynamically calling adapters without hardcoding specific functions
 * @param adapter - Adapter name (e.g., 'calendar', 'email', 'slack')
 * @param action - Action name (e.g., 'check_availability', 'send_message')
 * @param payload - Payload to send to the adapter
 */
export async function callMCPAdapter<T = any>(
  adapter: string,
  action: string,
  payload: Record<string, any>
): Promise<MCPAdapterResponse<T>> {
  const res = await fetch(`${API_BASE}/adapters/${adapter}/${action}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(payload),
  });
  return handleResponse<MCPAdapterResponse<T>>(res);
}

export default {
  checkCalendarAvailability,
  bookCalendarEvent,
  getCalendarEvents,
  sendEmail,
  getEmails,
  callMCPAdapter,
};
