// Small formatting helpers (plain JS, so they can be unit-tested with node --test).

// Elapsed time: 754000 -> "12:34", 3_725_000 -> "1:02:05". Empty for null/undefined.
export function formatMs(ms) {
  if (ms === null || ms === undefined) return '';
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

// Countdown: rounds UP so "0:01" shows until the very end. Never negative.
export function formatClock(ms) {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

// Problem letters: 0 -> "A", 3 -> "D".
export const LETTER = (i) => String.fromCharCode(65 + i);
