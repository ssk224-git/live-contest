// Countdown that stays in step with the SERVER's clock, even if this device's clock is wrong.
// When a message arrives we compute offset = serverNow - Date.now(); the time left is
// endsAt - (Date.now() + offset).
import { useEffect, useState } from 'react';

// Remembers the offset between this device's clock and the server's.
let clockOffset = 0;
export function syncClock(serverNow) {
  if (typeof serverNow === 'number') clockOffset = serverNow - Date.now();
}
export const serverTime = () => Date.now() + clockOffset;

// Returns milliseconds left until endsAt (server time), updating ~5 times a second. 0 when done.
export function useCountdown(endsAt) {
  const [left, setLeft] = useState(() => (endsAt ? Math.max(0, endsAt - serverTime()) : 0));
  useEffect(() => {
    if (!endsAt) return undefined;
    const tick = () => setLeft(Math.max(0, endsAt - serverTime()));
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [endsAt]);
  return left;
}

// 754000 -> "12:34", 5000 -> "0:05".
export function formatClock(ms) {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
