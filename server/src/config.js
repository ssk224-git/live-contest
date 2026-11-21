// Reads settings from server/.env (on your PC) or from the host's environment (Render).
// Every other file imports settings from here, so there is one place to look.
import 'dotenv/config';

// Turns "" or "   " into undefined so empty lines in .env count as "not set".
const clean = (value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined);

// Splits "a, b,c" into ["a", "b", "c"].
const list = (value) =>
  (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

// Reads a number, falling back to a default when it is missing or not a number.
const num = (value, fallback) => {
  const n = Number(clean(value));
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const config = {
  port: num(process.env.PORT, 5002),
  // Browsers on these origins may talk to the server (CORS). No trailing slashes.
  clientUrls: list(clean(process.env.CLIENT_URL) || 'http://localhost:5174').map((url) => url.replace(/\/$/, '')),
  mongoUri: clean(process.env.MONGODB_URI),
  // Secret used to sign host login tokens. Any long random string.
  jwtSecret: clean(process.env.JWT_SECRET),

  geminiKey: clean(process.env.GEMINI_API_KEY),
  // First model is tried first; the others are backups for overloaded (503),
  // rate-limited (429), retired (404) or timed-out models.
  // Used for coding problems, where a correct reference solution matters more than speed.
  geminiModels: list(clean(process.env.GEMINI_MODEL) || 'gemini-3.6-flash,gemini-3.5-flash,gemini-3.5-flash-lite'),
  // Used for MCQ drafts: the fast model first (measured 2-8 s vs up to 61 s), the validator + retry catch mistakes.
  geminiQuizModels: list(clean(process.env.GEMINI_QUIZ_MODEL) || 'gemini-3.5-flash-lite,gemini-3.6-flash,gemini-3.5-flash'),
  // How much hidden "thinking" the model does before answering. "low" is fastest. "off" = model default.
  geminiThinkingLevel: clean(process.env.GEMINI_THINKING_LEVEL) || 'low',
  // Give up on one model call after this many ms, so a silent model can never hang a request.
  geminiTimeoutMs: num(process.env.GEMINI_TIMEOUT_MS, 30_000),

  // The code runner (see judge/judge0.js). The public instance needs no key.
  judge0Url: (clean(process.env.JUDGE0_URL) || 'https://ce.judge0.com').replace(/\/$/, ''),
  // Only needed for a Judge0 instance that requires a token (e.g. a paid plan).
  judge0Key: clean(process.env.JUDGE0_KEY),
  // How many batches we send to Judge0 at the same time (be polite to a shared free service).
  judgeConcurrency: num(process.env.JUDGE_CONCURRENCY, 3),

  maxPlayersPerRoom: num(process.env.MAX_PLAYERS_PER_ROOM, 1000),
};
