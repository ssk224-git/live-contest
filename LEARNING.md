# How Live Contest works (plain language)

This guide explains the project so you can change it yourself and answer interview questions about it. Read it top to bottom once; later use the file map as a reference.

---

## 1. The big picture in one story

1. Ms. Rao logs in (host account) and creates either an **MCQ quiz** or a **coding contest** with up to 4 problems. AI can draft either one; she reviews it.
2. She presses **Host live**. The server creates a **room** in memory with a 6-letter code like `K7QMZ2` and shows it big on her projector.
3. Students open the site, type the code and a nickname. Their browsers open a **WebSocket** (a connection that stays open, so the server can push messages any time).
4. She presses **Start**. From now on the **server** decides everything: when time is up, who answered first, which code passed. The browsers only display what the server tells them.
5. At the end, the server saves **one** document with the results to MongoDB, and she downloads a CSV.

Two kinds of communication are used:

| | REST (`fetch`) | WebSocket (Socket.IO) |
|---|---|---|
| Used for | Logging in, saving quizzes/contests, AI drafts, CSV download | Everything live: joining, questions, answers, Run/Submit, leaderboards |
| Who starts | Always the browser asks, the server answers | Either side can send at any moment |
| Files | `server/src/routes/*.js` | `server/src/live/*.js` |

---

## 2. File map

```
server/src/
  index.js            starts Express + Socket.IO on one port, connects MongoDB
  app.js              Express app: security headers, CORS, routes, error handler
  config.js           reads .env in ONE place
  models/             Mongoose schemas: User, Quiz, Contest, Session, Submission
  routes/             REST: auth, quizzes, contests, sessions (create room, history, CSV)
  middleware/         requireAuth (JWT check), validateBody (Zod check)
  validation/         Zod schemas for request bodies
  ai/
    gemini.js         talks to Gemini: model fallback list, 30 s timeout, quota skip
    quizGenerator.js  MCQ prompt + strict checks + one retry + option shuffle
    problemGenerator.js  coding problem prompt + checks + verify with the reference solution
    aiLog.js          writes every AI attempt to logs/ai-attempts.jsonl (for metrics)
  judge/
    judge0.js         sends code to Judge0 in one batch, polls until done
    judge.js          turns Judge0 results into a verdict (AC/WA/TLE/RE/CE)
    compare.js        output comparison word by word
    languages.js      Judge0 language ids + time limits per language
    queue.js          "at most 3 jobs at once" queue
    verifyProblem.js  runs the reference solution on all tests, drops bad tests
  live/
    rooms.js          the in-memory room store, room codes, nickname rules
    sockets.js        host:join, player:join, disconnects, cleanup of old rooms
    quizGame.js       MCQ rules as pure functions (scoring, answer checks, ranking)
    quizSocket.js     MCQ socket events and timers
    contestGame.js    contest rules as pure functions (LeetCode ranking)
    contestSocket.js  contest socket events: start/end, Run, Submit, leaderboard
    csv.js            builds the CSV export
server/tests/         node:test tests (47)
server/scripts/       seed, check-judge, check-gemini, try-quiz, try-problem, load-test

client/src/
  App.jsx             the list of pages (routes)
  lib/                api.js (fetch + token), socket.js (one shared socket), auth.jsx,
                      useCountdown.js (server-synced clock), player.js (per-tab memory)
  pages/              Home, Auth, Dashboard, QuizEditor, ContestEditor, History,
                      HostPage -> HostQuiz / HostContest, PlayPage -> PlayQuiz / PlayContest
  components/         QuizParts (bars, leaderboard, podium), ContestParts (board, verdicts),
                      CodeEditor (CodeMirror, lazy-loaded), JoinBanner, VerifyBadge
```

A pattern used everywhere: **rules are pure functions** (`quizGame.js`, `contestGame.js`, `judge.js`), and the socket files only call them and send messages. Pure functions are easy to test: give them input, check the output, no network needed.

---

## 3. Key ideas

### 3.1 Rooms live in memory
`live/rooms.js` keeps a `Map` from room code to a room object (players, phase, timer…). Memory is fast, which matters when hundreds of answers arrive in one second. The cost: if the server restarts, live rooms are gone. (To run several servers you would move this state to Redis.)

Room codes use 31 characters without `0/O` and `1/I/L`, so they are easy to read out loud.

### 3.2 The server owns the clock
When a question starts, the server stores `questionEndsAt` and starts a `setTimeout` that closes the question. An answer is accepted only if the **server's** clock says it arrived in time (plus 300 ms grace for network delay). The browser's clock is never trusted, so a student cannot cheat by changing their phone's time.

The countdown on screen: each message carries `serverNow`. The browser computes `offset = serverNow - Date.now()` and shows `endsAt - (Date.now() + offset)`. So every screen shows the same countdown even if a phone's clock is wrong (`client/src/lib/useCountdown.js`).

### 3.3 Secrets stay on the server
- MCQ: `question:start` contains the text and options but **no** `correctIndex`. It is only sent in `question:end`. (Verified with a raw WebSocket "spy" in the browser and in `tests/quizSocket.test.js`.)
- Contest: `publicProblem()` in `contestGame.js` copies only the safe fields; hidden tests and the reference solution never leave the server. Problems are not sent at all before the contest starts.
- `playerId` is a secret: it lets you rejoin as that student. Leaderboards use a separate `publicId`, so nobody can steal someone's place.

### 3.4 Summarise, don't broadcast
If 300 students answer and the server told everyone about every answer, that is 300 × 300 = 90,000 messages. Instead: answers just update counters, the host gets a summary at most twice a second, and after each question **one** shared message goes to the room plus one tiny personal result per student. The contest leaderboard is sent at most once per second.

### 3.5 One database write per event
No MongoDB writes during an MCQ game. When it ends, one `Session` document is written. (Contest submissions are also saved one by one, because they contain code the teacher may want later, and they are rare: seconds apart, not milliseconds.)

---

## 4. MCQ quiz, step by step

| Step | Event | What the server does |
|---|---|---|
| Host opens the room | `host:join {code, token}` | Checks the JWT belongs to the room's owner |
| Student joins | `player:join {code, nickname, playerId?}` | New player, or reattach if `playerId` matches (refresh) |
| Host presses Start / Next | `quiz:start`, `quiz:next` | `startQuestion()`, sends `question:start`, starts the timer |
| Student taps an answer | `answer:submit {index, optionIndex}` | `submitAnswer()` checks: right question, in time, first answer, option 0–3 |
| Time is up or everyone answered | (timer) | `closeQuestion()`: scores everyone once, sorts once, sends `question:end` + `player:result` |
| Last question done | `quiz:next` | `finishQuiz()`, sends `game:over`, saves the `Session` |

Scoring: correct = `500 + round(500 × timeLeft / timeLimit)`, wrong or no answer = 0. Answer in the first instant → 1000; at the buzzer → 500. Equal scores share a rank (1, 2, 2, 4).

---

## 5. Coding contest, step by step

### 5.1 Why Judge0, and why not run the code ourselves?
Student code is **untrusted**: it could delete files, read our `.env` (database password, API key) or loop forever. So it must run in a sandbox, never in our Node process. Options checked (see `SPEC.md`): the public Piston API closed in February 2026, self-hosting needs Docker, running in the browser would mean sending the hidden tests to the student. The free Judge0 CE public instance worked, was timed (C++ ~4 s per batch) and gives real verdicts.

### 5.2 Run vs Submit
- **Run** (`code:run`): your code on the **public examples**. You see input, expected output and your output for each one.
- **Submit** (`code:submit`): your code on the **hidden tests**. You see only the verdict, how many passed, and the number of the first failing test.

### 5.3 What happens on Submit (`contestSocket.js` → `judge.js` → `judge0.js`)
1. Checks: contest running, problem exists, language allowed, code under 64 KB, not already judging, 5 s since your last submit.
2. The submission goes into the host's live feed as "Judging".
3. The **queue** waits until fewer than 3 batches are in flight, then `runBatch()` sends one HTTP request to Judge0 with one run per hidden test (base64-encoded, with a CPU time limit and 256 MB memory limit).
4. It asks Judge0 every 0.7 s whether all runs are done.
5. `judgeCode()` looks at the tests **in order**; the first one that is not OK decides the verdict:
   - Judge0 status "Time Limit Exceeded" → **TLE**
   - "Compilation Error" → **CE** (and Python/JS `SyntaxError`, because those languages have no compile step, like LeetCode does)
   - a runtime error status → **RE**
   - ran fine: compare output word by word (`compare.js`) → **AC** or **WA**
6. The player's result is updated with LeetCode rules, the student gets `submission:result`, the host gets `submission:update`, and the leaderboard is scheduled.

We never send the expected output to Judge0: our server compares. That keeps hidden outputs in one place and lets us ignore extra spaces and blank lines.

### 5.4 Time limits per language
Python is slower than C++, and Judge0's Python/Node images spend ~1.1 s starting up (measured). So: `limit = base × factor + startup` (C++ ×1, Java ×2 +0.5 s, JavaScript ×2 +1.5 s, Python ×3 +1.5 s). With a 2 s base: C++ 2 s, Java 4.5 s, JS 5.5 s, Python 7.5 s.

### 5.5 Ranking (LeetCode rules), with an example
Penalty = 5 minutes per wrong submission **on a problem you later solved**.

| Student | What happened | Solved | Finish time |
|---|---|---|---|
| Riya | A: wrong at 12:51, accepted at 13:37. B: wrong at 14:17, accepted at 14:39 | 2 | 14:39 + 2 × 5:00 = **24:39** |
| Meera | A: wrong, accepted at 15:36. B: wrong, accepted at 16:09 | 2 | 16:09 + 10:00 = **26:09** |
| Arjun | nothing | 0 | – |

Riya ranks first: same number solved, smaller finish time. (These are the real numbers from the browser test.) Compile errors and judge errors cost nothing; wrong answers on a problem you never solve cost nothing.

When time runs out, submissions that arrived before the end are still judged: `endContest()` waits for them (up to 60 s) before sending and saving the final standings.

---

## 6. The AI parts

### 6.1 `gemini.js`: calling the model safely
- **Fallback list**: tries `GEMINI_MODEL` models in order; moves on if one is retired (404), rate-limited (429), overloaded (503) or too slow.
- **30 s timeout** on every call (an `AbortController` plus a backup timer), so a silent model can never hang a request.
- **Daily quota skip**: on the free key the bigger models ran out of daily quota; after such an error the model is skipped for an hour.
- **JSON schema**: we pass `responseJsonSchema`, so Gemini returns JSON in our shape (but we still check it).
- MCQ drafts use the fast `flash-lite` model first (2–8 s); coding problems use the stronger model first.

### 6.2 MCQ drafts (`quizGenerator.js`)
Zod checks: exact question count, text 10–200 characters, exactly 4 options, all different, no "all/none of the above", `correctIndex` 0–3, an explanation. If anything fails, the prompt is sent again with "Your last answer had these problems: …". After 2 attempts it keeps the valid questions if at least 3 are left. Options are **shuffled** on the server because models like to put the right answer in the same place.

### 6.3 Coding problem drafts (`problemGenerator.js` + `verifyProblem.js`)
The AI writes the problem, examples, 10 hidden tests **and a Python reference solution**. Then:
1. Zod checks the shape (retry once if broken).
2. `verifyProblem()` runs the solution on all examples + tests in **one** Judge0 batch.
3. If all examples pass, any hidden test the solution fails is **dropped** (its expected output was probably miscalculated: language models are bad at arithmetic).
4. If an example fails, the solution itself is suspect, so nothing is dropped and the draft is regenerated once; if it is still wrong, it is shown as **Flagged**.

The "Verified" badge is tied to a **fingerprint** (a hash of the tests and solution). If the host edits a test, the badge resets to "Not verified", and the server never accepts a "verified" badge sent by a browser.

---

## 7. Security checklist (good interview material)

| Risk | What we do |
|---|---|
| Students reading answers in DevTools | Answers/hidden tests never sent; verified with a WebSocket spy |
| Untrusted code | Runs only in Judge0's sandbox, never in our server |
| Exfiltrating hidden tests via error output | Submit results hide stderr; only the failing test **number** is shown |
| Cheating with the clock | Server timestamps every answer and submission |
| Stealing someone's place | Secret `playerId` vs public `publicId` |
| Password guessing | bcrypt hashes, rate-limited login, same message for "no such email" and "wrong password" |
| Hosts reading each other's data | Every route checks the owner (403 otherwise) |
| CSV formula injection | Cells starting with `= + - @` are prefixed with `'` |
| Spam | Rate limits: joins, AI drafts, verify, run/submit cooldowns, room size cap |
| Secrets in git | `.env` is git-ignored from the first commit; only `.env.example` is committed |

---

## 8. Testing

- `server/tests/*.test.js` use Node's built-in `node:test`. Run `cd server && npm test`.
- Pure rule tests: `quizGame.test.js` (a full game checked against hand-calculated scores), `contestGame.test.js` (the ranking example above), `judge.test.js` (fake Judge0), `verifyProblem.test.js`, `quizGenerator.test.js`, `problemGenerator.test.js` (fake Gemini).
- Socket tests start a real server on a random port and connect bots: `quizSocket.test.js`, `contestSocket.test.js`.
- API tests use a separate `live-contest-test` database and delete what they create.
- Real-service checks (not in `npm test`, they cost quota): `npm run check:judge`, `npm run check:gemini`, `node scripts/try-quiz.js`, `node scripts/try-problem.js`.

---

## 9. Questions an interviewer might ask

**Why WebSockets and not polling?** The server needs to push the next question to 300 phones at the same moment. Polling would mean 300 requests every second, mostly asking "anything new?".

**How do you stop students from seeing the answer?** The answer is not in the message. It's only sent after the question closes. Hiding it with CSS would not work: DevTools shows every message.

**What if two students submit at the same time?** Node handles one event at a time, so the room updates never interleave. Judge0 calls are asynchronous and go through a queue capped at 3 in flight.

**Why compare outputs yourself instead of asking Judge0?** So hidden expected outputs never leave our server, and so trailing spaces or a missing final newline don't cause a wrong answer.

**How does it scale past one server?** Sticky sessions on the load balancer, the Socket.IO Redis adapter for broadcasts across servers, room state in Redis (a sorted set for scores), and a Redis lock so only one server owns each room's timer. Not built; one server handled 500 local bots with p95 1.3 ms.

**How do you know the AI's test cases are right?** We don't trust them: the AI's own reference solution must pass every test in a real sandbox, failing tests are dropped, and the host reviews before saving. It caught 3 wrong expected outputs out of 90.

**Biggest risk in this design?** The free public Judge0 instance: unknown limits, no guarantee. The code is isolated in one module, so moving to a self-hosted or paid Judge0 is a config change.

---

## 10. Things to try (to learn by changing)

- Change the MCQ scoring formula in `quizGame.js` → `pointsFor()` and update the test.
- Add a language: one line in `server/src/judge/languages.js` (Judge0 id) and a starter in `client/src/lib/languages.js`.
- Show the class's answer distribution on students' phones too (it's already in `question:end`).
- Add a "freeze the leaderboard in the last 10 minutes" option to contests (like ICPC).
