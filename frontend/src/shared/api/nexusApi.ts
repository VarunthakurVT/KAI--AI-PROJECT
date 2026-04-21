/**
 * NEXUS Frontend – API Client
 *
 * Connects the React SPA to the FastAPI backend.
 * Handles auth, streaming chat (SSE), and document management.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/v1';
/**
 * Root backend URL (no `/v1`), used for `/health` and other non-versioned endpoints.
 * You may override via `VITE_API_ROOT_URL`.
 */
const API_ROOT =
  import.meta.env.VITE_API_ROOT_URL ||
  API_BASE.replace(/\/v1\/?$/i, '');
/** Auth-only base (Express BFF). Omit to keep auth on the same host as VITE_API_URL. */
const AUTH_BASE = import.meta.env.VITE_AUTH_URL || API_BASE;

// ── Token storage ──
let accessToken: string | null = localStorage.getItem('nexus_token');

function getSessionId(): string {
  const storageKey = 'nexus_session_id';
  let sessionId = localStorage.getItem(storageKey);

  if (!sessionId) {
    sessionId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `session-${Date.now()}`;
    localStorage.setItem(storageKey, sessionId);
  }

  return sessionId;
}

export function setToken(token: string | null) {
  accessToken = token;
  if (token) {
    localStorage.setItem('nexus_token', token);
  } else {
    localStorage.removeItem('nexus_token');
  }
}

export function getToken(): string | null {
  return accessToken;
}

// ── Helpers ──
function headers(extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Nexus-Session': getSessionId(),
    ...extra,
  };
  if (accessToken) {
    h['Authorization'] = `Bearer ${accessToken}`;
  }
  return h;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorMessage = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (typeof body === 'object' && body !== null) {
        if (body.detail) {
          errorMessage = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
        } else if (body.message) {
          errorMessage = body.message;
        } else {
          errorMessage = JSON.stringify(body);
        }
      }
    } catch {
      errorMessage = res.statusText || errorMessage;
    }
    throw new Error(errorMessage);
  }
  return res.json();
}

// ╔══════════════════════════════════════════════╗
// ║  Auth                                        ║
// ╚══════════════════════════════════════════════╝

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface UserProfile {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
  is_active: boolean;
}

export interface CourseResponse {
  id: string;
  title: string;
  description?: string | null;
  owner_user_id: string;
  created_at: string;
  document_count: number;
}

export async function register(email: string, password: string, displayName?: string): Promise<TokenResponse> {
  const res = await fetch(`${AUTH_BASE}/auth/register`, {
    method: 'POST',
    headers: headers(),
    credentials: 'include',
    body: JSON.stringify({ email, password, display_name: displayName }),
  });
  const data = await handleResponse<TokenResponse>(res);
  setToken(data.access_token);
  return data;
}

export async function login(email: string, password: string): Promise<TokenResponse> {
  const res = await fetch(`${AUTH_BASE}/auth/login`, {
    method: 'POST',
    headers: headers(),
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });
  const data = await handleResponse<TokenResponse>(res);
  setToken(data.access_token);
  return data;
}

export async function getMe(): Promise<UserProfile> {
  const res = await fetch(`${AUTH_BASE}/auth/me`, {
    headers: headers(),
    credentials: 'include',
  });
  return handleResponse<UserProfile>(res);
}

export function getGoogleLoginUrl(): string {
  return `${AUTH_BASE}/auth/google`;
}

export interface AuthProvidersResponse {
  google: boolean;
}

export async function getAuthProviders(): Promise<AuthProvidersResponse> {
  const res = await fetch(`${AUTH_BASE}/auth/providers`, {
    headers: { 'X-Nexus-Session': getSessionId() },
    credentials: 'include',
  });
  return handleResponse<AuthProvidersResponse>(res);
}

export async function completeGoogleLogin(): Promise<TokenResponse> {
  const res = await fetch(`${AUTH_BASE}/auth/session`, {
    headers: { 'X-Nexus-Session': getSessionId() },
    credentials: 'include',
  });
  const data = await handleResponse<TokenResponse>(res);
  setToken(data.access_token);
  return data;
}

export function logout() {
  void fetch(`${AUTH_BASE}/auth/session`, {
    method: 'DELETE',
    headers: { 'X-Nexus-Session': getSessionId() },
    credentials: 'include',
  }).catch(() => undefined);
  setToken(null);
}

// ╔══════════════════════════════════════════════╗
// ║  Health                                      ║
// ╚══════════════════════════════════════════════╝

export interface ApiHealthResponse {
  status: string;
  service?: string;
  version?: string;
}

export async function checkApiHealth(signal?: AbortSignal): Promise<ApiHealthResponse> {
  const res = await fetch(`${API_ROOT}/health`, {
    method: 'GET',
    headers: { 'X-Nexus-Session': getSessionId() },
    signal,
  });
  return handleResponse<ApiHealthResponse>(res);
}

export async function waitForApiHealth(options?: {
  timeoutMs?: number;
  intervalMs?: number;
}): Promise<ApiHealthResponse> {
  const timeoutMs = options?.timeoutMs ?? 30_000;
  const intervalMs = options?.intervalMs ?? 800;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let lastError: unknown = null;
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      try {
        return await checkApiHealth(controller.signal);
      } catch (err) {
        lastError = err;
        await new Promise((r) => setTimeout(r, intervalMs));
      }
    }

    throw lastError ?? new Error('API health check timed out');
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}


// ╔══════════════════════════════════════════════╗
// ║  Chat – Streaming (SSE)                      ║
// ╚══════════════════════════════════════════════╝

export interface ChatCitation {
  chunk_id: string;
  text: string;
  source: string;
}

export interface ChatStreamCallbacks {
  onToken: (text: string) => void;
  onDone: (data: { message_id: string; conversation_id: string; citations: ChatCitation[] }) => void;
  onError: (error: { code: string; message: string }) => void;
}

export async function chatStream(
  message: string,
  callbacks: ChatStreamCallbacks,
  options?: { conversation_id?: string; course_id?: string; tooling_mode?: boolean; use_rag?: boolean },
): Promise<void> {
  const res = await fetch(`${API_BASE}/chat/stream`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      message,
      conversation_id: options?.conversation_id,
      course_id: options?.course_id,
      tooling_mode: options?.tooling_mode ?? false,
      use_rag: options?.use_rag ?? true,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    callbacks.onError({ code: `HTTP_${res.status}`, message: body.detail || res.statusText });
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    callbacks.onError({ code: 'NO_BODY', message: 'Response has no body' });
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    let eventType = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6));

        switch (eventType) {
          case 'token':
            callbacks.onToken(data.text);
            break;
          case 'done':
            callbacks.onDone(data);
            break;
          case 'error':
            callbacks.onError(data);
            break;
        }
        eventType = '';
      }
    }
  }
}


// ╔══════════════════════════════════════════════╗
// ║  Chat – Non-streaming                        ║
// ╚══════════════════════════════════════════════╝

export async function chatNonStream(
  message: string,
  options?: { conversation_id?: string; course_id?: string; tooling_mode?: boolean; use_rag?: boolean; user_name?: string },
) {
  const res = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      message,
      conversation_id: options?.conversation_id,
      course_id: options?.course_id,
      tooling_mode: options?.tooling_mode ?? false,
      use_rag: options?.use_rag ?? true,
      user_name: options?.user_name,
    }),
  });
  return handleResponse(res);
}


// ╔══════════════════════════════════════════════╗
// ║  Courses                                     ║
// ╚══════════════════════════════════════════════╝

export async function createCourse(title: string, description?: string): Promise<CourseResponse> {
  const res = await fetch(`${API_BASE}/courses`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ title, description }),
  });
  return handleResponse<CourseResponse>(res);
}

export async function listCourses(): Promise<CourseResponse[]> {
  const res = await fetch(`${API_BASE}/courses`, { headers: headers() });
  return handleResponse<CourseResponse[]>(res);
}


// ╔══════════════════════════════════════════════╗
// ║  Documents                                   ║
// ╚══════════════════════════════════════════════╝

export async function uploadDocument(courseId: string, file: File) {
  const formData = new FormData();
  formData.append('file', file);

  const h: Record<string, string> = { 'X-Nexus-Session': getSessionId() };
  if (accessToken) h['Authorization'] = `Bearer ${accessToken}`;

  const res = await fetch(`${API_BASE}/documents/courses/${courseId}/documents`, {
    method: 'POST',
    headers: h,
    body: formData,
  });
  return handleResponse(res);
}

export async function ingestDocument(documentId: string) {
  const res = await fetch(`${API_BASE}/documents/${documentId}/ingest`, {
    method: 'POST',
    headers: headers(),
  });
  return handleResponse(res);
}

export async function getDocument(documentId: string) {
  const res = await fetch(`${API_BASE}/documents/${documentId}`, {
    headers: headers(),
  });
  return handleResponse(res);
}

// ╔══════════════════════════════════════════════╗
// ║  Scribe – Audio → Transcript → Notes         ║
// ╚══════════════════════════════════════════════╝

export interface ScribeNotes {
  title: string;
  summary: string;
  topics: Array<{ heading: string; points: string[] }>;
  key_takeaways?: string[];
  action_items?: string[];
  keywords?: string[];
  scribe_section?: {
    label?: string;
    caption?: string;
  };
  theme?: {
    accent?: string;
    mood?: string;
    layout?: string;
  };
}

export interface ScribeGroqConfig {
  provider: 'groq';
  transcription_model: string;
  note_model: string;
  language?: string | null;
}

export interface ScribeGroqTranscribeResponse extends ScribeGroqConfig {
  transcript: string;
}

export interface ScribeFolder {
  id: string;
  name: string;
  created_at: string;
}

export interface ScribeNote {
  id: string;
  folder_id: string | null;
  title: string;
  summary: string | null;
  transcript: string | null;
  structured_notes: ScribeNotes | null;
  audio_filename: string | null;
  audio_mime: string | null;
  duration_seconds: number | null;
  is_deleted?: boolean;
  created_at: string;
}

export async function scribeTranscribe(file: File): Promise<{ transcript: string }> {
  const formData = new FormData();
  formData.append('file', file);

  const h: Record<string, string> = { 'X-Nexus-Session': getSessionId() };
  if (accessToken) h['Authorization'] = `Bearer ${accessToken}`;

  const res = await fetch(`${API_BASE}/scribe/transcribe`, {
    method: 'POST',
    headers: h,
    body: formData,
  });
  return handleResponse(res);
}

export async function getScribeGroqConfig(): Promise<ScribeGroqConfig> {
  const res = await fetch(`${API_BASE}/scribe/groq`, { headers: headers() });
  return handleResponse(res);
}

export async function scribeGroqTranscribe(file: File): Promise<ScribeGroqTranscribeResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const h: Record<string, string> = { 'X-Nexus-Session': getSessionId() };
  if (accessToken) h['Authorization'] = `Bearer ${accessToken}`;

  const res = await fetch(`${API_BASE}/scribe/groq/transcribe`, {
    method: 'POST',
    headers: h,
    body: formData,
  });
  return handleResponse(res);
}

export async function scribeStructure(transcript: string): Promise<ScribeNotes> {
  const res = await fetch(`${API_BASE}/scribe/structure`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ transcript }),
  });
  return handleResponse(res);
}

export async function scribeGroqStructure(transcript: string): Promise<ScribeNotes> {
  const res = await fetch(`${API_BASE}/scribe/groq/structure`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ transcript }),
  });
  return handleResponse(res);
}

export async function listScribeFolders(): Promise<ScribeFolder[]> {
  const res = await fetch(`${API_BASE}/scribe/folders`, { headers: headers() });
  return handleResponse(res);
}

export async function createScribeFolder(name: string): Promise<ScribeFolder> {
  const res = await fetch(`${API_BASE}/scribe/folders`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ name }),
  });
  return handleResponse(res);
}

export async function deleteScribeFolder(folderId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/scribe/folders/${folderId}`, {
    method: 'DELETE',
    headers: headers(),
  });
  if (!res.ok && res.status !== 204) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
}

export async function listScribeNotes(folderId?: string | null): Promise<ScribeNote[]> {
  const url = folderId ? `${API_BASE}/scribe/notes?folder_id=${encodeURIComponent(folderId)}` : `${API_BASE}/scribe/notes`;
  const res = await fetch(url, { headers: headers() });
  return handleResponse(res);
}

export async function deleteScribeNote(noteId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/scribe/notes/${noteId}`, {
    method: 'DELETE',
    headers: headers(),
  });
  if (!res.ok && res.status !== 204) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
}

export async function createScribeNoteFromAudio(folderId: string | null, file: File): Promise<ScribeNote> {
  const formData = new FormData();
  formData.append('file', file);

  const h: Record<string, string> = { 'X-Nexus-Session': getSessionId() };
  if (accessToken) h['Authorization'] = `Bearer ${accessToken}`;

  const url = folderId
    ? `${API_BASE}/scribe/notes/audio?folder_id=${encodeURIComponent(folderId)}`
    : `${API_BASE}/scribe/notes/audio`;

  const res = await fetch(url, {
    method: 'POST',
    headers: h,
    body: formData,
  });
  return handleResponse(res);
}

export async function createScribeGroqNoteFromAudio(folderId: string | null, file: File): Promise<ScribeNote> {
  const formData = new FormData();
  formData.append('file', file);

  const h: Record<string, string> = { 'X-Nexus-Session': getSessionId() };
  if (accessToken) h['Authorization'] = `Bearer ${accessToken}`;

  const url = folderId
    ? `${API_BASE}/scribe/groq/notes/audio?folder_id=${encodeURIComponent(folderId)}`
    : `${API_BASE}/scribe/groq/notes/audio`;

  const res = await fetch(url, {
    method: 'POST',
    headers: h,
    body: formData,
  });
  return handleResponse(res);
}

export interface StreamProgress {
  phase: 'uploading' | 'transcribing' | 'structuring' | 'complete';
  progress: number; // 0-100
  message: string;
  data?: ScribeNote;
}

const CHUNK_SIZE = 64 * 1024; // 64KB chunks

/** Upload audio file in chunks with real-time progress streaming */
export async function createScribeGroqNoteFromAudioStream(
  folderId: string | null,
  file: File,
  onProgress: (update: StreamProgress) => void,
): Promise<ScribeNote> {
  const sessionId = getSessionId();
  const chunks = Math.ceil(file.size / CHUNK_SIZE);
  const uploadSessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  // Phase 1: Upload file in chunks
  for (let i = 0; i < chunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);

    const formData = new FormData();
    formData.append('chunk', chunk);
    formData.append('chunk_index', i.toString());
    formData.append('total_chunks', chunks.toString());
    formData.append('upload_session_id', uploadSessionId);
    formData.append('filename', file.name);
    formData.append('content_type', file.type);

    const h: Record<string, string> = { 'X-Nexus-Session': sessionId };
    if (accessToken) h['Authorization'] = `Bearer ${accessToken}`;

    const uploadUrl = folderId
      ? `${API_BASE}/scribe/groq/notes/audio/stream?folder_id=${encodeURIComponent(folderId)}`
      : `${API_BASE}/scribe/groq/notes/audio/stream`;

    try {
      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: h,
        body: formData,
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error(`Chunk ${i} upload failed`, { status: res.status, error: errorText });
        throw new Error(`Upload chunk ${i} failed: ${res.status} - ${errorText}`);
      }

      // Verify response is JSON
      const contentType = res.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        console.warn(`Chunk ${i} response not JSON`, { contentType });
      }

      const uploadProgress = Math.round(((i + 1) / chunks) * 60); // Upload is 60% of total
      onProgress({
        phase: 'uploading',
        progress: uploadProgress,
        message: `Uploading: chunk ${i + 1}/${chunks}`,
      });
    } catch (error) {
      console.error(`Failed to upload chunk ${i}`, error);
      throw new Error(`Chunk upload failed at ${i}/${chunks}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Phase 2: Stream transcription & structuring via SSE
  const eventUrl = folderId
    ? `${API_BASE}/scribe/groq/notes/audio/stream/events?upload_session_id=${uploadSessionId}&folder_id=${encodeURIComponent(folderId)}`
    : `${API_BASE}/scribe/groq/notes/audio/stream/events?upload_session_id=${uploadSessionId}`;

  return new Promise((resolve, reject) => {
    const eventSource = new EventSource(eventUrl);

    eventSource.addEventListener('progress', (event) => {
      try {
        const data = JSON.parse(event.data);
        onProgress({
          phase: data.phase || 'structuring',
          progress: data.progress || 70,
          message: data.message || 'Processing...',
        });
      } catch (error) {
        console.error('Failed to parse progress event', error);
      }
    });

    eventSource.addEventListener('complete', (event) => {
      try {
        const data = JSON.parse(event.data);
        onProgress({
          phase: 'complete',
          progress: 100,
          message: 'Complete!',
          data,
        });
        eventSource.close();
        resolve(data);
      } catch (error) {
        console.error('Failed to parse complete event', error);
        eventSource.close();
        reject(error);
      }
    });

    eventSource.addEventListener('error', (event) => {
      console.error('SSE error', event);
      eventSource.close();
      reject(new Error('Stream processing failed'));
    });

    eventSource.onerror = () => {
      eventSource.close();
      reject(new Error('Connection lost'));
    };
  });
}


export async function createScribeNoteFromChat(folderId: string | null, prompt: string): Promise<ScribeNote> {
  const res = await fetch(`${API_BASE}/scribe/notes/chat`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ folder_id: folderId, prompt }),
  });
  return handleResponse(res);
}

export async function createScribeGroqNoteFromChat(folderId: string | null, prompt: string): Promise<ScribeNote> {
  const res = await fetch(`${API_BASE}/scribe/groq/notes/chat`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ folder_id: folderId, prompt }),
  });
  return handleResponse(res);
}

export interface ExamQuestion {
  id: string;
  type: 'mcq' | 'code' | 'theory';
  difficulty: 'easy' | 'medium' | 'hard';
  topic: string;
  question: string;
  options: string[];
  correct_answer: number | null;
  answer_guide: string | null;
  source_excerpt: string | null;
  source_document: string | null;
}

export interface ExamPaperSummary {
  id: string;
  title: string;
  source_mode: 'knowledge' | 'pdf';
  status: string;
  question_count: number;
  created_at: string;
  source_label?: string | null;
}

export interface ExamPaper extends ExamPaperSummary {
  document_id: string | null;
  settings: {
    difficulty?: string;
    question_types?: string[];
    topics?: string[];
    previous_knowledge?: string;
  };
  questions: ExamQuestion[];
  metadata: Record<string, unknown>;
  error_message: string | null;
}

export interface GenerateExamInput {
  sourceMode: 'knowledge' | 'pdf';
  title?: string;
  previousKnowledge?: string;
  topics: string[];
  questionCount: number;
  difficulty: 'mixed' | 'easy' | 'medium' | 'hard';
  questionTypes: string[];
  file?: File | null;
}

export async function generateExamPaper(payload: GenerateExamInput): Promise<ExamPaper> {
  const formData = new FormData();
  formData.append('source_mode', payload.sourceMode);
  formData.append('title', payload.title ?? '');
  formData.append('previous_knowledge', payload.previousKnowledge ?? '');
  formData.append('topics', JSON.stringify(payload.topics));
  formData.append('question_count', String(payload.questionCount));
  formData.append('difficulty', payload.difficulty);
  formData.append('question_types', JSON.stringify(payload.questionTypes));

  if (payload.file) {
    formData.append('file', payload.file);
  }

  const h: Record<string, string> = {
    'X-Nexus-Session': getSessionId(),
  };
  if (accessToken) {
    h['Authorization'] = `Bearer ${accessToken}`;
  }

  const res = await fetch(`${API_BASE}/examiner/generate`, {
    method: 'POST',
    headers: h,
    body: formData,
  });
  return handleResponse<ExamPaper>(res);
}

export async function listExamPapers(): Promise<ExamPaperSummary[]> {
  const res = await fetch(`${API_BASE}/examiner/papers`, {
    headers: headers(),
  });
  return handleResponse<ExamPaperSummary[]>(res);
}

export async function getExamPaper(paperId: string): Promise<ExamPaper> {
  const res = await fetch(`${API_BASE}/examiner/papers/${paperId}`, {
    headers: headers(),
  });
  return handleResponse<ExamPaper>(res);
}


// ╔══════════════════════════════════════════════╗
// ║  Progress / Analytics                        ║
// ╚══════════════════════════════════════════════╝

export interface DayProgress {
  date: string;
  completed: boolean;
  study_minutes: number;
  topics_studied: string[];
}

export interface MonthProgress {
  month: string;
  days_completed: number;
  total_days: number;
  total_minutes: number;
  topics_completed: string[];
}

export interface ProgressSummary {
  current_streak: number;
  longest_streak: number;
  today_completed: boolean;
  today_minutes: number;
  daily_goal_minutes: number;
  active_topic: string;
  daily_progress: DayProgress[];
  monthly_progress: MonthProgress[];
}

export async function getProgress(): Promise<ProgressSummary> {
  const res = await fetch(`${API_BASE}/progress`, { headers: headers() });
  return handleResponse<ProgressSummary>(res);
}

export async function recordProgress(minutes: number, topics: string[] = [], completed: boolean = false): Promise<DayProgress> {
  const res = await fetch(`${API_BASE}/progress/record`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ minutes, topics, completed }),
  });
  return handleResponse<DayProgress>(res);
}

export async function completeProgress(minutes: number, topics: string[] = []): Promise<DayProgress> {
  const res = await fetch(`${API_BASE}/progress/complete`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ minutes, topics, completed: true }),
  });
  return handleResponse<DayProgress>(res);
}
