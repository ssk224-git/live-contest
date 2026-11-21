// A tiny "at most N jobs at once" queue. Every Run/Submit goes through it, so a class of 50
// pressing Submit together sends at most N batches to the free Judge0 server at a time.
import { config } from '../config.js';

export function createQueue(concurrency) {
  const waiting = []; // jobs not started yet, oldest first
  let active = 0;

  // Starts waiting jobs while there is a free slot.
  function pump() {
    while (active < concurrency && waiting.length) {
      const job = waiting.shift();
      active += 1;
      Promise.resolve()
        .then(job.fn)
        .then(job.resolve, job.reject)
        .finally(() => {
          active -= 1;
          pump();
        });
    }
  }

  return {
    // Adds a job (a function returning a promise). Resolves with the job's result.
    // onQueued(position) is called right away with how many jobs are ahead of this one.
    add(fn, onQueued) {
      return new Promise((resolve, reject) => {
        waiting.push({ fn, resolve, reject });
        onQueued?.(Math.max(0, waiting.length + active - concurrency));
        pump();
      });
    },
    get size() {
      return waiting.length + active;
    },
  };
}

// The one queue the whole server shares.
export const judgeQueue = createQueue(config.judgeConcurrency);
