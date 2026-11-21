// Runs code on Judge0 (an open-source code-execution service). Student code NEVER runs inside
// our Node server: we send it to Judge0, which runs it in a sandbox and sends back the output.
// One call = one "batch": the same program with several inputs (one per test case).
import { config } from '../config.js';

const MAX_BATCH = 20; // Judge0's default limit per batch
const POLL_EVERY_MS = 700;
const GIVE_UP_AFTER_MS = 60_000;

// Thrown when Judge0 is down, rate-limits us, or takes too long. The student is not penalised.
export class JudgeUnavailableError extends Error {}

const toB64 = (text) => Buffer.from(text ?? '', 'utf8').toString('base64');
const fromB64 = (text) => (text ? Buffer.from(text, 'base64').toString('utf8') : '');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Calls the Judge0 HTTP API. Base64 is used both ways so any character survives the trip.
async function judge0Fetch(path, options = {}) {
  let res;
  try {
    res = await fetch(`${config.judge0Url}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(config.judge0Key ? { 'X-Auth-Token': config.judge0Key } : {}),
        ...options.headers,
      },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    throw new JudgeUnavailableError(`Cannot reach the code runner (${err.name === 'TimeoutError' ? 'timeout' : err.message})`);
  }
  if (res.status === 429) throw new JudgeUnavailableError('The code runner is busy (rate limit). Try again in a minute.');
  if (res.status >= 500) throw new JudgeUnavailableError(`The code runner had an error (HTTP ${res.status}). Try again.`);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new JudgeUnavailableError(`The code runner rejected the request (HTTP ${res.status}): ${JSON.stringify(body)?.slice(0, 200)}`);
  return body;
}

// runs: [{ languageId, source, stdin, timeLimitSec }]. Returns one result per run, in order:
// { statusId, status, stdout, stderr, compileOutput, message, timeMs, memoryKb }.
export async function runBatch(runs) {
  if (runs.length === 0) return [];
  if (runs.length > MAX_BATCH) throw new Error(`At most ${MAX_BATCH} runs per batch`);

  const submissions = runs.map((r) => ({
    language_id: r.languageId,
    source_code: toB64(r.source),
    stdin: toB64(r.stdin),
    cpu_time_limit: r.timeLimitSec,
    wall_time_limit: Math.min(20, r.timeLimitSec * 2 + 1),
    memory_limit: 256_000, // KB
  }));
  const created = await judge0Fetch('/submissions/batch?base64_encoded=true', {
    method: 'POST',
    body: JSON.stringify({ submissions }),
  });
  const tokens = created.map((c) => c.token);
  if (tokens.some((t) => !t)) throw new JudgeUnavailableError(`The code runner refused a run: ${JSON.stringify(created).slice(0, 200)}`);

  // Ask every 0.7 s until every run has finished (status id > 2 means done).
  const fields = 'token,status,stdout,stderr,compile_output,message,time,memory';
  const started = Date.now();
  while (Date.now() - started < GIVE_UP_AFTER_MS) {
    await sleep(POLL_EVERY_MS);
    const { submissions: done } = await judge0Fetch(`/submissions/batch?tokens=${tokens.join(',')}&base64_encoded=true&fields=${fields}`);
    if (done.every((s) => s.status?.id > 2)) {
      return done.map((s) => ({
        statusId: s.status.id,
        status: s.status.description,
        stdout: fromB64(s.stdout),
        stderr: fromB64(s.stderr),
        compileOutput: fromB64(s.compile_output),
        message: fromB64(s.message),
        timeMs: s.time ? Math.round(Number(s.time) * 1000) : null,
        memoryKb: s.memory ?? null,
      }));
    }
  }
  throw new JudgeUnavailableError('The code runner took too long. Try again.');
}
