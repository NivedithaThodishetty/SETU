/**
 * SETU Mobile — REST client for the SETU engine.
 *
 * One fetch path for every verb, so identity, timeouts, abort handling, language
 * stamping and error shape stay identical no matter which call site is used.
 *
 * Two things here are load-bearing rather than incidental:
 *
 *  - `soft` calls treat unavailability as "no data yet" rather than an error.
 *    The whole app is built to stay usable with the engine down, and a screen
 *    that throws instead of showing its cached copy defeats that.
 *  - Language is stamped centrally. Threading a `language` argument through
 *    thirty call sites is exactly the kind of change where one gets forgotten,
 *    and the symptom — one screen answering in English while the rest speaks
 *    Tamil — looks like a model bug rather than a plumbing one.
 */

import { DEFAULT_API_URL, resolveApiUrl } from '../constants/config';
import { DEFAULT_LANGUAGE } from '../constants/languages';
import { peekUserId } from './identity';
import {
  SystemHealthStatus,
  MindMapDocument,
  MindMapRecord,
  MindMapNode,
  StartModeResult,
  SimplifyModeResult,
  LearnModeResult,
  MeetModeResult,
  PracticeModeResult,
  WriteModeResult,
  GuideModeResult,
  NumbersModeResult,
  ListenResult,
  ProgressState,
  DocumentFileResult,
  VoiceCatalogue,
  ChunkedTaskResult,
} from '../types';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number = 0) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const OFFLINE_MESSAGE =
  'Cannot reach the SETU engine. Check the backend address in Settings, or try again when you are back online.';

/** Timeouts in milliseconds. Research and document parsing legitimately take a while. */
const TIMEOUTS = {
  health: 8000,
  read: 15000,
  write: 20000,
  ai: 120000,
  upload: 180000,
};

/* -------------------------------------------------------------------------- */
/* Mutable client configuration                                               */
/* -------------------------------------------------------------------------- */

/**
 * Held here rather than read from storage per call, because the storage layer
 * already imports this module to mirror writes and reaching back would close an
 * import cycle. The preferences layer pushes both of these at boot and on change.
 */
let currentBaseUrl = DEFAULT_API_URL;
let currentLanguage = DEFAULT_LANGUAGE;

export function setApiBaseUrl(url?: string | null): string {
  currentBaseUrl = resolveApiUrl(url);
  return currentBaseUrl;
}

export function getApiBaseUrl(): string {
  return currentBaseUrl;
}

export function setApiLanguage(code?: string | null): void {
  currentLanguage = code || DEFAULT_LANGUAGE;
}

export function getApiLanguage(): string {
  return currentLanguage;
}

function url(path: string): string {
  return `${currentBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'x-user-id': peekUserId(),
    ...extra,
  };
}

/** Stamp the chosen language onto outbound request bodies. */
function withLanguage<T>(body: T): T {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const record = body as Record<string, unknown>;
  if (record.language) return body;
  return { ...record, language: currentLanguage } as unknown as T;
}

/* -------------------------------------------------------------------------- */
/* Request dispatcher                                                         */
/* -------------------------------------------------------------------------- */

interface RequestOptions {
  body?: unknown;
  timeoutMs?: number;
  soft?: boolean;
  signal?: AbortSignal;
}

async function request<T>(
  method: string,
  path: string,
  { body, timeoutMs = TIMEOUTS.read, soft = false, signal }: RequestOptions = {}
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const forwardAbort = () => controller.abort();
  signal?.addEventListener('abort', forwardAbort);

  try {
    const response = await fetch(url(path), {
      method,
      headers: headers(),
      ...(body === undefined ? {} : { body: JSON.stringify(withLanguage(body)) }),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new ApiError(
        (data as any).error || (data as any).message || `Request failed (${response.status})`,
        response.status
      );
    }
    return data as T;
  } catch (error: any) {
    if (soft) return null;

    if (error?.name === 'AbortError') {
      throw new ApiError(
        signal?.aborted
          ? 'Request cancelled.'
          : 'The engine took too long to answer. Try a shorter passage or a narrower topic.',
        408
      );
    }
    if (error instanceof ApiError) throw error;
    throw new ApiError(OFFLINE_MESSAGE, 0);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }
}

const hard = <T>(method: string, path: string, options: RequestOptions = {}) =>
  request<T>(method, path, options) as Promise<T>;

const get = <T>(path: string, options: RequestOptions = {}) =>
  request<T>('GET', path, { soft: true, ...options });

const post = <T>(path: string, body?: unknown, options: RequestOptions = {}) =>
  hard<T>('POST', path, { body, timeoutMs: TIMEOUTS.ai, ...options });

const del = <T>(path: string, options: RequestOptions = {}) =>
  request<T>('DELETE', path, { soft: true, timeoutMs: TIMEOUTS.write, ...options });

const put = <T>(path: string, body?: unknown, options: RequestOptions = {}) =>
  request<T>('PUT', path, { body, soft: true, timeoutMs: TIMEOUTS.write, ...options });

/**
 * Fire-and-forget mirror for local-first writes.
 *
 * Never blocks the UI and never surfaces an error: the local write already
 * succeeded, and the server copy is a bonus that lets a second device catch up.
 */
export function syncInBackground(method: string, path: string, body?: unknown): void {
  try {
    fetch(url(path), {
      method,
      headers: headers(),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }).catch(() => {});
  } catch (_) {}
}

/* -------------------------------------------------------------------------- */
/* Multipart upload                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Upload a local file (camera capture, gallery image, or picked document).
 *
 * Content-Type is deliberately omitted so React Native sets the multipart
 * boundary itself; setting it by hand produces a body the server cannot parse.
 */
export async function uploadFile(
  fileUri: string,
  mimeType: string = 'image/jpeg',
  fileName: string = 'document.jpg',
  conversationId?: string | null
): Promise<DocumentFileResult> {
  const formData = new FormData();
  formData.append('file', { uri: fileUri, type: mimeType, name: fileName } as any);
  if (conversationId) formData.append('conversationId', conversationId);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUTS.upload);

  try {
    const response = await fetch(url('/api/files/upload'), {
      method: 'POST',
      headers: { 'x-user-id': peekUserId() },
      body: formData,
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ApiError((data as any).error || `Upload failed (${response.status})`, response.status);
    }
    return (data as any).document;
  } catch (error: any) {
    if (error instanceof ApiError) throw error;
    if (error?.name === 'AbortError') {
      throw new ApiError('The upload took too long. Try a smaller file.', 408);
    }
    throw new ApiError(OFFLINE_MESSAGE, 0);
  } finally {
    clearTimeout(timer);
  }
}

/* -------------------------------------------------------------------------- */
/* Streaming chat                                                             */
/* -------------------------------------------------------------------------- */

export interface ChatStreamHandlers {
  onStatus?: (data: { stage?: string; message?: string }) => void;
  onReply?: (data: { text?: string; intent?: string; final?: boolean; sources?: string[] }) => void;
  onMap?: (data: any) => void;
  onError?: (data: { error?: string }) => void;
  onDone?: (data: { ok?: boolean; conversationId?: string }) => void;
}

/**
 * Stream a chat turn over Server-Sent Events.
 *
 * React Native's `fetch` has no readable-stream body, so this reads the growing
 * `responseText` off an XHR instead. Research answers take upwards of thirty
 * seconds end to end; without streaming the user stares at a spinner for all of
 * it, which is precisely the wait an ADHD reader will not sit through.
 *
 * Frames are buffered across chunk boundaries because a frame can be split
 * mid-line, and the event name resets per frame so a frame without an explicit
 * `event:` cannot inherit the previous frame's type.
 */
export function streamChat(
  payload: Record<string, unknown>,
  handlers: ChatStreamHandlers = {},
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let consumed = 0;
    let buffer = '';
    let settled = false;

    const dispatch = (event: string, data: any) => {
      if (event === 'status') handlers.onStatus?.(data);
      else if (event === 'reply') handlers.onReply?.(data);
      else if (event === 'map') handlers.onMap?.(data);
      else if (event === 'error') handlers.onError?.(data);
      else if (event === 'done') handlers.onDone?.(data);
    };

    const handleFrame = (frame: string) => {
      let event = 'message';
      const dataLines: string[] = [];

      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }

      if (!dataLines.length) return;
      try {
        dispatch(event, JSON.parse(dataLines.join('\n')));
      } catch (_) {
        /* a malformed frame must not kill the stream */
      }
    };

    const drain = (text: string) => {
      buffer += text;
      const frames = buffer.split('\n\n');
      buffer = frames.pop() || '';
      for (const frame of frames) handleFrame(frame);
    };

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      if (error) reject(error);
      else resolve();
    };

    const onAbort = () => {
      try {
        xhr.abort();
      } catch (_) {}
      finish(new ApiError('Request cancelled.', 499));
    };

    xhr.open('POST', url('/api/chat'));
    for (const [key, value] of Object.entries(headers({ Accept: 'text/event-stream' }))) {
      xhr.setRequestHeader(key, value);
    }
    xhr.timeout = TIMEOUTS.ai;

    xhr.onprogress = () => {
      const chunk = xhr.responseText.slice(consumed);
      consumed = xhr.responseText.length;
      if (chunk) drain(chunk);
    };

    xhr.onload = () => {
      const chunk = xhr.responseText.slice(consumed);
      consumed = xhr.responseText.length;
      if (chunk) drain(chunk);
      // Flush a trailing frame that arrived without its blank-line terminator.
      if (buffer.trim()) handleFrame(buffer);

      if (xhr.status >= 400) {
        finish(new ApiError('The chat engine is unavailable.', xhr.status));
        return;
      }
      finish();
    };

    xhr.onerror = () => finish(new ApiError(OFFLINE_MESSAGE, 0));
    xhr.ontimeout = () => finish(new ApiError('The engine took too long to answer.', 408));
    xhr.onabort = () => finish(new ApiError('Request cancelled.', 499));

    signal?.addEventListener('abort', onAbort);
    if (signal?.aborted) {
      onAbort();
      return;
    }

    xhr.send(JSON.stringify(withLanguage(payload)));
  });
}

/* -------------------------------------------------------------------------- */
/* Streaming explanation                                                      */
/* -------------------------------------------------------------------------- */

export interface ExplainStreamHandlers {
  onText?: (chunk: string) => void;
  onDone?: (info: { fallback?: boolean; fallbackReason?: string }) => void;
  onError?: (message: string) => void;
}

export interface ExplainStreamPayload {
  text: string;
  /** 'simple' | 'plain' | 'detailed' — how far the explanation goes. */
  style?: string;
  language?: string;
}

/**
 * Stream a plain-language explanation of a passage.
 *
 * Selecting a mind-map branch used to read the branch's own note back, in
 * whatever language that note happened to be written in. For a reader who chose
 * Tamil that is not an accommodation, it is an English sentence spoken at them.
 * So a branch is now *explained* rather than recited, and the audio follows the
 * explanation.
 *
 * The frames here are plain `data:` lines with no `event:` name — a different
 * shape from `/api/chat`, which is why this cannot reuse `streamChat`. The
 * terminator is the literal string `[DONE]`, and a mid-stream failure arrives
 * as a final frame carrying `fallback: true` rather than as an error, because
 * the server would rather hand over a rougher offline rewrite than nothing.
 */
export function streamExplain(
  payload: ExplainStreamPayload,
  handlers: ExplainStreamHandlers = {},
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let consumed = 0;
    let buffer = '';
    let settled = false;
    let doneInfo: { fallback?: boolean; fallbackReason?: string } = {};

    const handleFrame = (frame: string) => {
      const dataLines: string[] = [];
      for (const line of frame.split('\n')) {
        if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      if (!dataLines.length) return;

      const raw = dataLines.join('\n');
      if (raw === '[DONE]') return;

      try {
        const parsed = JSON.parse(raw);
        if (parsed.error) {
          handlers.onError?.(String(parsed.error));
          return;
        }
        if (typeof parsed.text === 'string' && parsed.text) handlers.onText?.(parsed.text);
        if (parsed.done) {
          doneInfo = { fallback: parsed.fallback, fallbackReason: parsed.fallbackReason };
        }
      } catch (_) {
        /* a malformed frame must not kill the stream */
      }
    };

    const drain = (text: string) => {
      buffer += text;
      const frames = buffer.split('\n\n');
      buffer = frames.pop() || '';
      for (const frame of frames) handleFrame(frame);
    };

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      if (error) reject(error);
      else {
        handlers.onDone?.(doneInfo);
        resolve();
      }
    };

    const onAbort = () => {
      try {
        xhr.abort();
      } catch (_) {}
      finish(new ApiError('Request cancelled.', 499));
    };

    xhr.open('POST', url('/api/agent/explain/stream'));
    for (const [key, value] of Object.entries(headers({ Accept: 'text/event-stream' }))) {
      xhr.setRequestHeader(key, value);
    }
    xhr.timeout = TIMEOUTS.ai;

    xhr.onprogress = () => {
      const chunk = xhr.responseText.slice(consumed);
      consumed = xhr.responseText.length;
      if (chunk) drain(chunk);
    };

    xhr.onload = () => {
      const chunk = xhr.responseText.slice(consumed);
      consumed = xhr.responseText.length;
      if (chunk) drain(chunk);
      if (buffer.trim()) handleFrame(buffer);

      if (xhr.status >= 400) {
        finish(new ApiError('The explainer is unavailable right now.', xhr.status));
        return;
      }
      finish();
    };

    xhr.onerror = () => finish(new ApiError(OFFLINE_MESSAGE, 0));
    xhr.ontimeout = () => finish(new ApiError('The engine took too long to answer.', 408));
    xhr.onabort = () => finish(new ApiError('Request cancelled.', 499));

    signal?.addEventListener('abort', onAbort);
    if (signal?.aborted) {
      onAbort();
      return;
    }

    xhr.send(
      JSON.stringify(
        withLanguage({
          text: payload.text,
          style: payload.style || 'plain',
          ...(payload.language ? { language: payload.language } : {}),
        })
      )
    );
  });
}

/* -------------------------------------------------------------------------- */
/* API surface                                                                */
/* -------------------------------------------------------------------------- */

export const api = {
  /* System */
  health: () => get<SystemHealthStatus>('/api/health', { timeoutMs: TIMEOUTS.health }),
  healthAi: () => get<any>('/api/health/ai', { timeoutMs: 45000 }),
  dbStatus: () => get<any>('/api/db/status', { timeoutMs: TIMEOUTS.health }),

  /**
   * Research a topic into a map.
   *
   * Resolves to the saved map record itself — `{ title, topic, summary, root, … }`
   * — not a wrapper around one. Reading a `map` property off this response
   * yields undefined and silently produces a rootless document.
   */
  mindMap: (topic: string, context: string = '', documentId: string | null = null) =>
    post<MindMapRecord>('/api/research/mindmap', { topic, context, documentId }),

  expandNode: (topic: string, nodeLabel: string, nodeDetail: string = '', path: string[] = []) =>
    post<{ children: MindMapNode[]; explanation?: string }>('/api/research/expand', {
      topic,
      nodeLabel,
      nodeDetail,
      path,
    }),

  listMindMaps: (search: string = '') =>
    get<any>(`/api/mindmaps?search=${encodeURIComponent(search)}`),
  saveMindMapToDb: (map: MindMapDocument) =>
    post<any>('/api/mindmaps', map, { timeoutMs: TIMEOUTS.write }),
  deleteMindMapFromDb: (id: string) => del<any>(`/api/mindmaps/${encodeURIComponent(id)}`),
  clearMindMapsInDb: () => del<any>('/api/mindmaps'),

  /* Files & documents */
  uploadFile,
  listFiles: (conversationId: string = '') =>
    get<any>(
      `/api/files${conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : ''}`
    ),
  getFile: (id: string) => get<any>(`/api/files/${encodeURIComponent(id)}`),
  deleteFile: (id: string) => del<any>(`/api/files/${encodeURIComponent(id)}`),
  mindMapFromFile: (id: string) => post<any>(`/api/files/${encodeURIComponent(id)}/mindmap`, {}),
  queryFile: (id: string, query: string) =>
    post<any>(`/api/files/${encodeURIComponent(id)}/query`, { query }),

  /* Conversation threads */
  listConversations: (search: string = '') =>
    get<any>(`/api/conversations?search=${encodeURIComponent(search)}`),
  createConversation: (data: any) =>
    post<any>('/api/conversations', data, { timeoutMs: TIMEOUTS.write }),
  getConversation: (id: string) => get<any>(`/api/conversations/${encodeURIComponent(id)}`),
  updateConversation: (id: string, data: any) =>
    put<any>(`/api/conversations/${encodeURIComponent(id)}`, data),
  deleteConversation: (id: string) => del<any>(`/api/conversations/${encodeURIComponent(id)}`),
  getMessages: (conversationId: string) =>
    get<any>(`/api/conversations/${encodeURIComponent(conversationId)}/messages`),
  saveMessage: (conversationId: string, msg: any) =>
    post<any>(`/api/conversations/${encodeURIComponent(conversationId)}/messages`, msg, {
      timeoutMs: TIMEOUTS.write,
    }),

  /* Chat */
  chat: (topic: string, message: string, history: { role: string; content: string }[] = []) =>
    post<{ reply: string; mapData?: MindMapNode }>('/api/chat', { topic, message, history }),
  streamChat,
  streamExplain,

  /**
   * Break a passage into exactly three steps.
   *
   * The engine's chunker was written for a web page, so it takes a
   * `pageContext` shaped like one. There is no page here — the input is
   * whatever the reader pasted or scanned — so the text goes in the `text`
   * slot and the rest is left empty rather than invented. Sending a fake URL
   * and fake headings would only give the model something wrong to reason
   * about.
   */
  chunkIntoSteps: (text: string, title: string = '') =>
    post<ChunkedTaskResult>('/api/agent/chunk', {
      pageContext: { title, text, headings: [], controls: [] },
    }),

  /** Turn a chart, table or dense passage into a structure worth drawing. */
  visualize: (payload: { text?: string; image?: string; mimeType?: string; context?: string }) =>
    post<any>('/api/agent/visualize', payload),

  /* Summaries & settings */
  listSummaries: () => get<any>('/api/summaries'),
  saveSummaryToDb: (summary: any) =>
    post<any>('/api/summaries', summary, { timeoutMs: TIMEOUTS.write }),
  getSettingsFromDb: () => get<any>('/api/settings'),
  saveSettingsToDb: (settings: any) =>
    post<any>('/api/settings', settings, { timeoutMs: TIMEOUTS.write }),

  /* Reward progress mirror */
  getProgress: () => get<{ progress?: ProgressState }>('/api/progress'),
  saveProgress: (progress: ProgressState) =>
    post<any>('/api/progress', progress, { timeoutMs: TIMEOUTS.write }),

  /* General helpers */
  summarize: (text: string) =>
    post<{ gist: string; points: string[]; readingTimeMinutes: number }>('/api/summarize', { text }),
  explain: (text: string, language: string = 'English') =>
    post<{ explanation: string }>('/api/agent/explain', { text, language }),
  describeImage: (image: string, prompt?: string) =>
    post<{ description: string; extractedText?: string }>('/api/agent/describe-image', {
      image,
      prompt,
    }),

  /* Cognitive modes */
  start: (task: string, isStuck: boolean = true) =>
    post<StartModeResult>('/api/start', { task, isStuck }),
  simplify: (text: string) => post<SimplifyModeResult>('/api/simplify', { text }),
  learn: (text: string) => post<LearnModeResult>('/api/learn', { text }),
  meet: (transcript: string) => post<MeetModeResult>('/api/meet', { transcript }),
  practice: (topic: string, userUtterance: string = '') =>
    post<PracticeModeResult>('/api/practice', { topic, userUtterance }),
  write: (text: string) => post<WriteModeResult>('/api/write', { text }),
  guide: (goal: string) => post<GuideModeResult>('/api/guide', { goal }),

  /* Dyscalculia support & reflective listening */
  numbers: (problem: string) => post<NumbersModeResult>('/api/numbers', { problem }),
  listen: (entry: string, mood: number | null = null) =>
    post<ListenResult>('/api/listen', { entry, mood }),

  /* Natural voice & speech-to-text */
  speechVoices: () => get<VoiceCatalogue>('/api/speech/voices', { timeoutMs: TIMEOUTS.health }),

  /* Export */
  /* -- Reading Check ------------------------------------------------------ */

  /*
   * The outcome measure, and the akshara-aware screener built on top of it.
   *
   * Scoring is deliberately server-side: the band boundaries, the
   * provisional-norm caveat and the regulatory wording live in one place, so a
   * correction reaches every surface at once instead of waiting for app-store
   * review. This client sends a transcript and a duration and renders what
   * comes back — it never decides a band itself.
   */
  readingStimuli: (params: {
    language?: string;
    grade?: number;
    task?: 'oral-reading' | 'ran' | 'nonword' | 'deletion';
    seed?: number;
  } = {}) => {
    const q = new URLSearchParams();
    if (params.language) q.set('language', params.language);
    if (params.grade != null) q.set('grade', String(params.grade));
    if (params.task) q.set('task', params.task);
    if (params.seed != null) q.set('seed', String(params.seed));
    return get<any>(`/api/reading-check/stimuli?${q.toString()}`);
  },

  submitReadingCheck: (payload: {
    task?: string;
    type?: string;
    language?: string;
    grade?: number | null;
    learnerLabel?: string;
    stimulusId?: string;
    passage?: string;
    items?: string[];
    transcript: string;
    durationMs: number;
    comprehensionCorrect?: number;
    comprehensionTotal?: number;
    keepTranscript?: boolean;
  }) => post<any>('/api/reading-check', payload, { timeoutMs: TIMEOUTS.write }),

  /** History, oldest first — the shape a progress chart wants. */
  readingHistory: (type?: string) =>
    get<any>(`/api/reading-check${type ? `?type=${encodeURIComponent(type)}` : ''}`),

  /* -- Agent saved-details profile ---------------------------------------- */

  /*
   * The details the form-filling agent uses, held by the engine so they survive
   * a reinstall and reach a second device rather than living in one app's
   * storage.
   *
   * Government ID and bank fields are refused by the server outright, so a
   * response never carries an Aadhaar or an account number. Those stay on the
   * device and are entered when a form genuinely needs them.
   */
  getProfile: () => get<{ profile: Record<string, unknown> | null; neverStored?: string[] }>('/api/profile'),

  saveProfile: (values: Record<string, unknown>) =>
    post<any>('/api/profile', { values }, { timeoutMs: TIMEOUTS.write }),

  exportMarkdown: (mode: string, data: any) =>
    post<any>('/api/export', { mode, data }, { timeoutMs: TIMEOUTS.write }),
};

export { TIMEOUTS, withLanguage, OFFLINE_MESSAGE };
