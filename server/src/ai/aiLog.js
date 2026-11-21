// Records every AI attempt (valid or not, and why) as one JSON line in server/logs/ai-attempts.jsonl.
// The "valid on first attempt" metric in the README is computed from this file (npm run ai-stats).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LOG_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'logs');
export const LOG_FILE = path.join(LOG_DIR, 'ai-attempts.jsonl');

// Tests set this to false so they don't fill the log with fake attempts.
export const aiLogSettings = { enabled: process.env.NODE_ENV !== 'test' };

// entry: { kind, topic, attempt, valid, problems, model, ms, ... }
export function logAttempt(entry) {
  const line = { at: new Date().toISOString(), ...entry, problems: (entry.problems || []).slice(0, 10) };
  console.log(`[ai] ${line.kind} "${line.topic}" attempt ${line.attempt}: ${line.valid ? 'valid' : `invalid (${line.problems.length} problems)`} ${line.model || ''} ${line.ms ?? ''}ms`);
  if (!aiLogSettings.enabled) return;
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, JSON.stringify(line) + '\n');
  } catch (err) {
    console.warn('[ai] could not write the attempt log:', err.message);
  }
}
