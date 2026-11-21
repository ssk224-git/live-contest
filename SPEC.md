# Live Contest: spec addendum

This project starts from `future-specs/live-ai-quiz.md` (the "Live AI Quiz Builder" spec). Everything in that spec still applies unless this file changes it. This file records **what changed** and **the decisions made before writing code** (2026-11-21).

## 1. What changed: two event types

The user's words: *"the admin or teacher or questioner chooses either some MCQ questions or some LeetCode style coding problem contest with at most 4 problems and then his students join the contest"*.

A **host** (teacher) logs in and creates one of two event types. **Students** join any event with a 6-character room code and a nickname. Students never need an account.

| | MCQ quiz | Coding contest |
|---|---|---|
| Content | 3 to 15 multiple-choice questions | 1 to **4** coding problems |
| AI help | AI drafts the questions from a topic | AI drafts a problem plus tests, checked by its own reference solution |
| Host review | Edit every question before saving | Edit statement, examples, tests and reference solution, then press Verify |
| Timer | Per question (server-owned) | One timer for the whole contest (server-owned) |
| Scoring | Correct and fast = more points (`500 + 500 × timeLeft / timeLimit`) | Problems solved, then finish time + penalty (LeetCode rules, section 4) |
| Live view | Answer distribution, top 10, podium | Live leaderboard, live submissions feed for the host |
| Export | CSV: one row per student, one column per question | CSV: one row per student, one column per problem |

## 2. Decisions

### 2.1 Code execution: Judge0 CE public instance

**Constraint:** free, no Docker on the dev machine, server on Render's free plan, and untrusted student code must **never** run inside our Node server.

Options checked on 2026-11-21 (requests timed from the dev machine):

| Option | Result |
|---|---|
| **Judge0 CE public** (`ce.judge0.com`, v1.14.0) | Works with no key. C++ 4.3 s, Python 1.8–2.5 s, JS 2.4 s, Java 1.3–2.8 s per round trip. A batch of 5 tests: ~4 s. Real verdicts (TLE and runtime errors detected). Limits are not published. |
| Piston public (`emkc.org`) | **Closed**: HTTP 401 "whitelist only as of 2/15/2026". |
| Wandbox | Works with no key, but C++ took 6–8 s and there is no time-limit verdict. |
| Judge0 on RapidAPI, free plan | 50 submissions per day: too few for a class. |
| OnlineCompiler.io | Free key (100k runs/month per its own site). Not timed: needs an account. |
| In-browser (Pyodide/WASM) | Rejected: judging hidden tests in the browser means sending them to the student. |
| Self-hosted Judge0/Piston | Rejected: needs Docker (and privileged containers, which Render's free plan does not allow). |

**Chosen:** Judge0 CE public, approved by the user. All calls go through one module, `server/src/judge/`, so switching provider (self-hosted Judge0, a paid plan, another API) is a config change, not a rewrite.

Rules that keep us polite to a shared free service and fair to students:
- One HTTP call per Run or Submit (Judge0 **batch** submissions, max 20 per batch).
- A server-wide queue: at most `JUDGE_CONCURRENCY` (default 3) batches in flight. Students see "Judging… position N".
- Each student: one job at a time, and a short cooldown between submissions.
- If Judge0 is down or rate-limits us, the student sees "Code runner busy, try again". **No penalty** is counted.
- We never send the expected output to Judge0. Our server compares the output itself (section 2.4).

**Measured quirk:** Judge0 CE's newer Python (3.11+) and Node (18+) images spend about **1.1 s starting up** on every run (Python 3.8 and Node 12 start in 0.01 s but are too old). So the time limit per language is `base × factor + startup`:

| Language | Judge0 id | Factor | Startup allowance | With base 2 s |
|---|---|---|---|---|
| C++ (GCC 14.1) | 105 | 1 | 0 s | 2 s |
| Java (JDK 17) | 91 | 2 | 0.5 s | 4.5 s |
| Python 3.13 | 109 | 3 | 1.5 s | 7.5 s |
| JavaScript (Node 22) | 102 | 2 | 1.5 s | 5.5 s |

Java code must use `public class Main`.

### 2.2 Languages

C++, Python, JavaScript and Java (user's choice). The host can turn languages off per contest.

### 2.3 Problem format: stdin / stdout

Students read input from standard input and print the answer, like Codeforces, CodeChef and HackerRank. The statement still looks like LeetCode (statement, examples with explanations, constraints). The user chose this over LeetCode-style function signatures because it works the same in every language and needs no generated "driver" code.

### 2.4 Judging a submission

- **Run**: runs the code on the problem's public **examples** and shows input, expected output and the student's output.
- **Submit**: runs the code on the **hidden tests**. Hidden test inputs and outputs never leave the server.
- Output comparison: split both outputs on whitespace and compare token by token (trailing spaces and blank lines do not matter).
- Verdict = the first failing test, in order: Compile Error, Runtime Error, Time Limit Exceeded, Wrong Answer. Otherwise Accepted.
- The student sees the verdict, how many tests passed, and which test number failed (not its contents). Compile errors and runtime error messages are shown, trimmed.

### 2.5 Where problems come from

The host can write a problem by hand or ask AI for a draft. **AI output is never trusted** (user approved this plan):

1. Gemini returns JSON: title, statement, input/output format, constraints, 2–3 examples, 8–10 hidden tests with expected outputs, and a **reference solution** (Python).
2. Zod checks the shape. If it fails, retry once with the list of problems.
3. The server runs the reference solution on every example and test through Judge0.
4. Any hidden test the reference solution fails is **dropped**. If an example fails, the solution crashes, or fewer than 5 hidden tests survive, generation is retried **once** with the list of problems. If it still fails, the draft is returned **flagged**.
5. The host sees what was dropped and why, can edit anything (including the reference solution), and can press **Verify** to re-run the check. The contest page warns about unverified problems.
6. The reference solution and hidden tests are only ever sent to the host who owns the contest.

### 2.6 Accounts

Hosts register and log in (bcrypt + JWT, as in the original spec). Students join with code + nickname only.

## 3. Coding contest: data and events

MongoDB:

```
Contest  { owner: User, title, durationMin (5–300), penaltyMin (default 5),
           languages: ["cpp","python","javascript","java"],
           problems (1–4): [{ title, statement, inputFormat, outputFormat, constraints,
                              examples: [{ input, output, explanation }],
                              tests: [{ input, output }],           // hidden
                              referenceSolution: { language, code },
                              timeLimitSec (base, default 2),
                              verification: { status: "unverified"|"verified"|"flagged",
                                              checkedAt, notes: [String], dropped: [...] } }] }

Submission { session code, contest, playerId, nickname, problemIndex, language, code,
             verdict, passed, total, failedTest, timeMs, at }      // written as each one is judged

Session  { kind: "quiz"|"contest", ...final standings }          // written once at the end
```

Socket events (in addition to `host:join` / `player:join` from the original spec):

| Direction | Event | Notes |
|---|---|---|
| host → server | `contest:start`, `contest:end` | Start the timer / end early |
| server → room | `contest:started` | `{ endsAt, serverNow, problems }`: public view only (no tests, no reference solution) |
| player → server | `code:run` | `{ problemIndex, language, code }` → ack with per-example results |
| player → server | `code:submit` | `{ problemIndex, language, code }` → ack `{ queued, position }` |
| server → player | `submission:result` | verdict, passed/total, failed test number, message |
| server → room | `leaderboard` | Throttled to at most once per second |
| server → host | `submission:new` | Every judged submission, live |
| server → room | `contest:over` | Final standings |

## 4. Contest ranking (LeetCode rules)

1. More problems solved ranks higher.
2. Ties are broken by **finish time** = time of the last Accepted submission (from the contest start) + `penaltyMin` × wrong submissions on the problems that were **solved**.
3. Wrong submissions on unsolved problems do not count. Compile errors do not count. Submissions after a problem is solved do not change anything.

## 5. Rules kept from the original spec

- One milestone at a time, a visible "done when" check, `git commit` after each.
- The server is the referee: MCQ correct answers (before the reveal) and hidden tests never reach a student's browser.
- Every AI output is validated with a schema and retried once with the list of problems.
- 30-second timeout on every model call. Gemini models are tried in the order of `GEMINI_MODEL` (default `gemini-3.6-flash,gemini-3.5-flash,gemini-3.5-flash-lite`).
- No database writes per MCQ answer; one `Session` document per finished game.
- Simple, commented code.

## 6. Milestones for this project

| # | Milestone | Done when |
|---|---|---|
| M0 | Setup: client, server, MongoDB, `/api/health`, socket ping | Page shows "API ok" and "socket connected" |
| M1 | Host auth + quiz CRUD by hand | Tests: create/edit/delete works, another host gets 403 |
| M2 | AI quiz drafts with validation | 5 topics give valid drafts; 6 bad drafts are rejected in a unit test; attempt log written |
| M3 | Live MCQ game: lobby, question loop, reveal, top 10, podium, saved session | 3 tabs play a full game; late/duplicate answers rejected; no `correctIndex` before reveal |
| M4 | CSV export, history, reconnect | CSV opens with a comma in a nickname; refresh mid-question keeps score and time |
| M5 | Judge module (Judge0) | A script gets AC, WA, TLE, RE and CE in all 4 languages |
| M6 | Contest editor (max 4 problems) + Verify | Host writes a problem, Verify drops a wrong test |
| M7 | AI problem drafts cross-checked by the reference solution | Drafts for several topics, dropped tests reported; unit test for drop/retry |
| M8 | Live contest: editor, Run, Submit, verdicts, live leaderboard, host feed, CSV | Host + 2 student tabs; every language gets AC and WA; leaderboard updates live |
| M9 | Hardening, tests, docs, deploy config | Tests pass, client builds, README + LEARNING.md written |
