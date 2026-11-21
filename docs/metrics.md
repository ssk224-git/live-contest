# Measured results (2026-11-21)

Everything below was measured on the dev laptop (Windows 11, Node 24) against the real services. Nothing is estimated.

## 1. Live MCQ load test (`npm run load-test -- --players N`)

The real server code (Express + Socket.IO + game logic) with N `socket.io-client` bots, all in **one process on localhost**. Each bot joins, then answers every question after a random 0.2–4 s delay. 5 questions per game.

| Players | Join all | Answers sent | Lost | Ack p50 | Ack p95 | Ack p99 | Reveal fan-out p95 | Heap growth |
|---|---|---|---|---|---|---|---|---|
| 100 | 145 ms | 500 | **0** | 0.8 ms | 1.4 ms | 5.0 ms | 4.8 ms | 1.1 MB |
| 300 | 304 ms | 1,500 | **0** | 0.7 ms | 1.2 ms | 1.7 ms | 16.3 ms | 13.2 MB |
| 500 | 496 ms | 2,500 | **0** | 0.7 ms | 1.3 ms | 1.8 ms | 14.9 ms | 20.3 MB |

"Reveal fan-out" = time between the first and the last client receiving `question:end`.

Honest limits: localhost has no network delay, and the bots share the CPU with the server, so these numbers are a best case. The deployed numbers (Render free tier, real phones on mobile data) have **not** been measured yet.

## 2. Code runner (Judge0 CE public instance)

| Check | Result |
|---|---|
| `npm run check:judge`: AC, WA, TLE, RE, CE in C++, Python, JavaScript, Java (20 programs × 3 tests) | **20/20 verdicts as expected**, 26 s total with 3 batches in flight |
| One run, round trip from the laptop | C++ ~4.3 s, Python ~1.8–2.5 s, JavaScript ~2.4 s, Java ~1.3–2.8 s |
| Batch of 5 tests in one call | ~4 s |
| Fixed startup that Judge0 counts for Python 3.11+ / Node 18+ | ~1.1 s (Python 3.8 / Node 12: 0.01 s), so those languages get a startup allowance |
| Browser test (host + 3 students) | Every language got both Accepted and Wrong Answer; verdicts showed up in a few seconds |

## 3. AI drafts (from `server/logs/ai-attempts.jsonl`)

| | MCQ quizzes | Coding problems |
|---|---|---|
| Drafts | 11 | 8 (7 topics) |
| Valid on the first attempt | 10 (91%) | 7 verified by the first check |
| Valid after the one retry | 11 (100%) | 8 (100%) |
| Median time | 2.9 s (flash-lite) | 6–14 s (Gemini + Judge0 check) |
| Mistakes caught | Options over 80 characters (fixed by the retry) | **3 of 90 AI-written expected outputs were wrong** and were dropped; 1 draft's reference solution disagreed with its own example and was regenerated |

Examples of AI mistakes the cross-check caught:
- "Count the vowels in `Why do we use tests?`": the AI said 6, its own solution printed 5 (o, e, u, e, e).
- "Sum of digits of `402830948230948`": the AI said 66, the real answer is 64.

Model notes for the user's free key on this date:
- `gemini-3.6-flash` and `gemini-3.5-flash`: 5–25 s per call, and their **daily free quota ran out** during testing (HTTP 429 "per day"). The server now skips a model for an hour after a daily-quota error.
- `gemini-3.5-flash-lite`: ~1 s for a tiny request, 2–8 s for a quiz; occasional 503 "overloaded" (3 of 11 problem requests in one burst), so the server makes one quick second pass when every model was briefly busy.

## 4. Automated tests

| Suite | Result |
|---|---|
| Server (`cd server && npm test`) | **47/47** pass (API with a real test database, game rules, judge with a fake runner, verify, AI validators, two full socket games) |
| Client (`cd client && npm test`) | 3/3 pass |
| Client build (`npm run build`) | OK (the 700 KB code-editor chunk is lazy-loaded on contest pages only) |
