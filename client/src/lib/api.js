// Small helper for calling the REST API. Adds the host's login token automatically.
import { SERVER_URL } from './config.js';

const TOKEN_KEY = 'lc-token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => (token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY));

// An error from the API, with the HTTP status and the server's list of problems (if any).
export class ApiError extends Error {
  constructor(status, message, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

// api('/api/quizzes') or api('/api/quizzes', { method: 'POST', body: {...} }).
// Returns the parsed JSON. Throws ApiError with the server's message on failure.
export async function api(path, { method = 'GET', body, signal } = {}) {
  const token = getToken();
  let res;
  try {
    res = await fetch(SERVER_URL + path, {
      method,
      signal,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, 'Cannot reach the server. Is it running?');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || `Request failed (${res.status})`, data);
  return data;
}

// Downloads a file (e.g. a CSV export) using the login token, then saves it.
export async function downloadFile(path, filename) {
  const res = await fetch(SERVER_URL + path, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new ApiError(res.status, 'Download failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
