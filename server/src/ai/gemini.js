// Talks to Google Gemini through the official SDK (@google/genai).
// The API key lives only here on the server; the browser never sees it.
// Adapted from the DoodleSync project: model fallback list + timeout on every call.
import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';
import { AppError } from '../utils/AppError.js';

let client;
// Creates the SDK client the first time it is needed.
function getClient() {
  if (!config.geminiKey) throw new AppError(503, 'GEMINI_API_KEY is not set on the server. Add it to server/.env');
  client ??= new GoogleGenAI({ apiKey: config.geminiKey });
  return client;
}

export const geminiConfigured = () => Boolean(config.geminiKey);

// Errors worth trying the next model for: retired (404), rate-limited (429), overloaded (5xx), timed out.
const RETRYABLE = new Set([404, 429, 500, 502, 503, 504]);
const statusOf = (err) => Number(err?.status ?? err?.code);
const isTimeout = (err) => err?.name === 'AbortError' || /timed? ?out|abort/i.test(String(err?.message));
const isRetryable = (err) => RETRYABLE.has(statusOf(err)) || isTimeout(err);

// Models that rejected the thinking setting; we stop sending it to them.
const noThinking = new Set();

// Calls one model once, giving up after timeoutMs (default 30 s).
async function callModel(model, prompt, { temperature, timeoutMs, schema, useThinking }) {
  const level = config.geminiThinkingLevel;
  const thinking = useThinking && level !== 'off' && !noThinking.has(model);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const request = getClient().models.generateContent({
      model,
      contents: prompt,
      config: {
        temperature,
        responseMimeType: 'application/json',
        ...(schema ? { responseJsonSchema: schema } : {}), // ask Gemini to follow our JSON shape
        ...(thinking ? { thinkingConfig: { thinkingLevel: level.toUpperCase() } } : {}),
        abortSignal: controller.signal,
        httpOptions: { timeout: timeoutMs },
      },
    });
    // Belt and braces: even if the SDK ignored the abort signal, stop waiting.
    const timeout = new Promise((_, reject) => {
      controller.signal.addEventListener('abort', () => {
        const err = new Error(`Timed out after ${timeoutMs} ms`);
        err.name = 'AbortError';
        reject(err);
      });
    });
    return await Promise.race([request, timeout]);
  } catch (err) {
    // Some models refuse the thinking setting with a 400: remember that and retry without it.
    if (thinking && statusOf(err) === 400 && /think/i.test(String(err?.message))) {
      noThinking.add(model);
      return callModel(model, prompt, { temperature, timeoutMs, schema, useThinking: false });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Turns SDK errors into messages a host can act on.
function friendlyError(err) {
  if (err instanceof AppError) return err;
  const status = statusOf(err);
  if (status === 429) return new AppError(429, 'The AI is busy right now (rate limit). Wait a minute and try again.');
  if (status === 401 || status === 403 || /api key/i.test(String(err?.message))) {
    return new AppError(502, 'The Gemini API key was rejected. Check GEMINI_API_KEY in server/.env');
  }
  if (status === 404) return new AppError(502, 'None of the AI models in GEMINI_MODEL were found.');
  if (isTimeout(err)) return new AppError(504, 'The AI took too long to answer (30 s). Please try again.');
  if (status >= 500) return new AppError(503, 'The AI service is having trouble. Please try again shortly.');
  return new AppError(502, `The AI request failed: ${String(err?.message || err).slice(0, 200)}`);
}

// Sends a prompt and returns the parsed JSON answer: { data, model, ms }.
// Tries each model in GEMINI_MODEL in order until one answers. Throws an AppError if all fail.
export async function generateJson(prompt, { schema, temperature = 0.6, timeoutMs = config.geminiTimeoutMs, models = config.geminiModels } = {}) {
  let lastError;
  for (const model of models) {
    const started = Date.now();
    try {
      const response = await callModel(model, prompt, { temperature, timeoutMs, schema, useThinking: true });
      const text = response.text ?? '';
      let data;
      try {
        data = parseJson(text);
      } catch {
        data = { __notJson: text.slice(0, 200) }; // let the validator report it, so we retry with feedback
      }
      return { data, model, ms: Date.now() - started };
    } catch (err) {
      lastError = err;
      if (!isRetryable(err)) break;
      console.warn(`[gemini] ${model} failed (${statusOf(err) || err.message}); trying the next model`);
    }
  }
  throw friendlyError(lastError);
}

// Reads JSON even if the model wrapped it in ```json fences.
export function parseJson(text) {
  const cleaned = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  return JSON.parse(cleaned);
}
