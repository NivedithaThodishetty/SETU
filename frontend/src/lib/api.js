/**
 * SETU API client.
 *
 * In dev, Vite proxies /api to the backend, so requests stay same-origin.
 * In production, VITE_API_URL points at the deployed engine. Every call goes
 * through `url()` so a split-origin deploy cannot silently fall back to the
 * static host and 404.
 */

import { getUserId } from './identity';
import { apiUrl as url } from './apiBase';

/** Timeouts, in ms. Research and file processing legitimately take a while. */
const TIMEOUTS = {
  read: 15000,
  write: 20000,
  think: 120000,
  upload: 180000
};

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const OFFLINE_MESSAGE =
  'Cannot reach the SETU engine. Make sure the backend is running (npm start in /backend).';

function headers(extra = {}) {
  return {
    'Content-Type': 'application/json',
    'x-user-id': getUserId(),
    ...extra
  };
}

/**
 * The language every AI request is answered in.
 *
 * Held here rather than read from storage on each call, because storage.js
 * already imports this module and reaching back would close an import cycle.
 * App.jsx sets it at boot and Settings updates it on change.
 */
let currentLanguage = 'en-IN';

export function setApiLanguage(code) {
  currentLanguage = code || 'en-IN';
}

export function getApiLanguage() {
  return currentLanguage;
}

/**
 * Stamp the chosen language onto outbound request bodies.
 *
 * Done centrally so adding a language-aware endpoint later cannot silently miss
 * it — threading a `language` argument through twenty call sites is exactly the
 * kind of change where one gets forgotten and answers come back in English for
 * one screen only.
 */
function withLanguage(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  return body.language ? body : { ...body, language: currentLanguage };
}

/**
 * One fetch path for every verb, so identity, timeouts, abort handling, and
 * error shape stay identical no matter which call site is used.
 */
async function request(method, path, { body, signal, timeoutMs = TIMEOUTS.read, soft = false } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const forwardAbort = () => controller.abort();
  signal?.addEventListener('abort', forwardAbort, { once: true });

  try {
    const response = await fetch(url(path), {
      method,
      headers: headers(),
      ...(body === undefined ? {} : { body: JSON.stringify(withLanguage(body)) }),
      signal: controller.signal
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ApiError(data.error || `Request failed (${response.status})`, response.status);
    }
    return data;
  } catch (error) {
    // `soft` callers treat unavailability as "no data yet" rather than an error,
    // which keeps the UI usable when the engine or database is down.
    if (error.name === 'AbortError') {
      if (soft) return null;
      throw new ApiError(
        signal?.aborted
          ? 'Request cancelled.'
          : 'The engine took too long to answer. Try a narrower topic.',
        408
      );
    }
    if (error instanceof ApiError) {
      if (soft) return null;
      throw error;
    }
    if (soft) return null;
    throw new ApiError(OFFLINE_MESSAGE, 0);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }
}

const post = (path, body, options = {}) =>
  request('POST', path, { body, timeoutMs: TIMEOUTS.think, ...options });
const get = (path, options = {}) => request('GET', path, { soft: true, ...options });
const del = (path, options = {}) =>
  request('DELETE', path, { soft: true, timeoutMs: TIMEOUTS.write, ...options });
const put = (path, body, options = {}) =>
  request('PUT', path, { body, soft: true, timeoutMs: TIMEOUTS.write, ...options });

/**
 * Fire-and-forget background sync. Used by local-first writes that must never
 * block the UI or surface an error when the engine is offline.
 */
function syncInBackground(method, path, body) {
  try {
    fetch(url(path), {
      method,
      headers: headers(),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      keepalive: true
    }).catch(() => {});
  } catch (_) {
    /* the local write already succeeded; the server copy is a bonus */
  }
}

/**
 * Upload a document file (PDF, DOCX, TXT, MD, Image) using multipart/form-data.
 * Content-Type is deliberately omitted so the browser sets the multipart boundary.
 */
export async function uploadFile(file, conversationId = null) {
  const formData = new FormData();
  formData.append('file', file);
  if (conversationId) formData.append('conversationId', conversationId);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUTS.upload);

  try {
    const response = await fetch(url('/api/files/upload'), {
      method: 'POST',
      headers: { 'x-user-id': getUserId() },
      body: formData,
      signal: controller.signal
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ApiError(data.error || `Upload failed (${response.status})`, response.status);
    }
    return data.document;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error.name === 'AbortError') {
      throw new ApiError('The upload took too long. Try a smaller file.', 408);
    }
    throw new ApiError(OFFLINE_MESSAGE, 0);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Stream a chat turn using Server-Sent Events.
 *
 * The backend sends `event:` / `data:` pairs separated by a blank line. We buffer
 * across chunk boundaries because a frame can be split mid-line, and we reset the
 * event name per frame so a frame without an explicit `event:` cannot inherit the
 * previous frame's type.
 */
export async function streamChat(payload, handlers = {}, signal) {
  let response;
  try {
    response = await fetch(url('/api/chat'), {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(withLanguage(payload)),
      signal
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError(OFFLINE_MESSAGE, 0);
  }

  if (!response.ok || !response.body) {
    throw new ApiError('The chat engine is unavailable.', response.status);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const dispatch = (event, data) => {
    if (event === 'status') handlers.onStatus?.(data);
    else if (event === 'reply') handlers.onReply?.(data);
    else if (event === 'map') handlers.onMap?.(data);
    else if (event === 'error') handlers.onError?.(data);
    else if (event === 'done') handlers.onDone?.(data);
  };

  const handleFrame = (frame) => {
    let event = 'message';
    const dataLines = [];

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

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop() || '';
      for (const frame of frames) handleFrame(frame);
    }
    // Flush a trailing frame that arrived without its blank-line terminator.
    if (buffer.trim()) handleFrame(buffer);
  } finally {
    reader.cancel().catch(() => {});
  }
}

/**
 * Stream a plain-language explanation, token by token.
 *
 * Uses the same bare-SSE shape as the backend's `/api/agent/explain/stream`:
 * `data:` frames carrying `{ text }`, terminated by a literal `[DONE]`. There
 * are no `event:` names on this endpoint, so the frame parser here is
 * deliberately simpler than the one `streamChat` needs.
 *
 * Streaming is not a nicety on this screen. A node explanation is requested the
 * instant a branch is selected, and a reader who loses the thread while waiting
 * is exactly the reader this app exists for — first words on screen in about a
 * second beats a complete paragraph in fifteen.
 */
export async function streamExplain({ text, style = 'plain', language }, handlers = {}, signal) {
  let response;
  const body = withLanguage(language ? { text, style, language } : { text, style });

  try {
    response = await fetch(url('/api/agent/explain/stream'), {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
      signal
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError(OFFLINE_MESSAGE, 0);
  }

  if (!response.ok || !response.body) {
    // The rate limiter and the validator answer with JSON before the stream
    // opens, and their message is the useful one — "Too many requests, wait a
    // few seconds" tells a reader what to do; "unavailable" does not.
    const detail = await response.json().catch(() => ({}));
    throw new ApiError(
      detail.error || 'The explanation engine is unavailable.',
      response.status
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const handleFrame = (frame) => {
    const dataLines = [];
    for (const line of frame.split('\n')) {
      if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (!dataLines.length) return;

    const payload = dataLines.join('\n');
    if (payload === '[DONE]') {
      handlers.onDone?.({});
      return;
    }

    try {
      const parsed = JSON.parse(payload);
      if (parsed.error) handlers.onError?.(parsed);
      else if (typeof parsed.text === 'string') handlers.onChunk?.(parsed.text);
      if (parsed.done) handlers.onDone?.(parsed);
    } catch (_) {
      /* a malformed frame must not kill the stream */
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop() || '';
      for (const frame of frames) handleFrame(frame);
    }
    if (buffer.trim()) handleFrame(buffer);
  } finally {
    reader.cancel().catch(() => {});
  }
}

export const api = {
  health: () => get('/api/health', { timeoutMs: 8000 }),
  healthAi: () => get('/api/health/ai', { timeoutMs: 45000 }),
  dbStatus: () => get('/api/db/status'),

  // Research & Mind Maps
  mindMap: (topic, context = '', documentId = null) =>
    post('/api/research/mindmap', { topic, context, documentId }),

  expandNode: (topic, nodeLabel, nodeDetail, path = []) =>
    post('/api/research/expand', { topic, nodeLabel, nodeDetail, path }),

  // MongoDB mind map persistence
  listMindMaps: (search = '') => get(`/api/mindmaps?search=${encodeURIComponent(search)}`),
  saveMindMapToDb: (map) => post('/api/mindmaps', map, { timeoutMs: TIMEOUTS.write }),
  deleteMindMapFromDb: (id) => del(`/api/mindmaps/${encodeURIComponent(id)}`),
  clearMindMapsInDb: () => del('/api/mindmaps'),

  // Files & documents
  uploadFile,
  listFiles: (conversationId = '') =>
    get(`/api/files${conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : ''}`),
  getFile: (id) => get(`/api/files/${encodeURIComponent(id)}`),
  deleteFile: (id) => del(`/api/files/${encodeURIComponent(id)}`),
  mindMapFromFile: (id) => post(`/api/files/${encodeURIComponent(id)}/mindmap`, {}),
  queryFile: (id, query) => post(`/api/files/${encodeURIComponent(id)}/query`, { query }),

  // Conversation threads
  listConversations: (search = '') =>
    get(`/api/conversations?search=${encodeURIComponent(search)}`),
  createConversation: (data) => post('/api/conversations', data, { timeoutMs: TIMEOUTS.write }),
  getConversation: (id) => get(`/api/conversations/${encodeURIComponent(id)}`),
  updateConversation: (id, data) => put(`/api/conversations/${encodeURIComponent(id)}`, data),
  deleteConversation: (id) => del(`/api/conversations/${encodeURIComponent(id)}`),
  getMessages: (conversationId) =>
    get(`/api/conversations/${encodeURIComponent(conversationId)}/messages`),
  saveMessage: (conversationId, msg) =>
    post(`/api/conversations/${encodeURIComponent(conversationId)}/messages`, msg, {
      timeoutMs: TIMEOUTS.write
    }),

  // Summaries & settings
  listSummaries: () => get('/api/summaries'),
  saveSummaryToDb: (summary) => post('/api/summaries', summary, { timeoutMs: TIMEOUTS.write }),
  getSettingsFromDb: () => get('/api/settings'),
  saveSettingsToDb: (settings) => post('/api/settings', settings, { timeoutMs: TIMEOUTS.write }),

  // General helpers
  summarize: (text) => post('/api/summarize', { text }),
  /**
   * Plain-language explanation of any passage.
   *
   * The language is deliberately *not* defaulted here. Passing a literal
   * 'English' — as this used to — set the field before `withLanguage` could
   * stamp the chosen one on, so every explanation came back in English no
   * matter what the language picker said.
   */
  explain: (text, { style = 'plain', language, signal } = {}) =>
    post('/api/agent/explain', language ? { text, style, language } : { text, style }, { signal }),

  // Eight cognitive modes
  start: (task, isStuck = false) => post('/api/start', { task, isStuck }),
  simplify: (text) => post('/api/simplify', { text }),
  learn: (text) => post('/api/learn', { text }),
  meet: (transcript) => post('/api/meet', { transcript }),
  practice: (topic, userUtterance = '') => post('/api/practice', { topic, userUtterance }),
  write: (text) => post('/api/write', { text }),
  guide: (goal) => post('/api/guide', { goal }),

  // Dyscalculia support & reflective listening
  numbers: (problem) => post('/api/numbers', { problem }),
  listen: (entry, mood = null) => post('/api/listen', { entry, mood }),

  // Natural-voice read-aloud and Speech-to-Text (Sarvam AI)
  speechVoices: () => get('/api/speech/voices', { timeoutMs: 8000 }),
  transcribeAudio: async (formData) => {
    let res;
    try {
      res = await fetch(url('/api/speech/transcribe'), {
        method: 'POST',
        headers: { 'x-user-id': getUserId() },
        body: formData
      });
    } catch (networkError) {
      throw new ApiError(
        networkError.message || 'Network error during transcription — is the server reachable?',
        0
      );
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(data.error || 'Transcription failed', res.status);
    return data;
  },

  // Reward progress mirror
  getProgress: () => get('/api/progress'),
  saveProgress: (progress) => post('/api/progress', progress, { timeoutMs: TIMEOUTS.write }),

  exportMarkdown: (mode, data) => post('/api/export', { mode, data })
};

export { ApiError, syncInBackground, withLanguage };
