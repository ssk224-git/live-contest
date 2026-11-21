// Judges a program against test cases and turns Judge0's raw results into a verdict:
// Accepted / Wrong Answer / Time Limit Exceeded / Runtime Error / Compile Error.
import { runBatch, JudgeUnavailableError } from './judge0.js';
import { LANGUAGES, timeLimitFor } from './languages.js';
import { outputsMatch } from './compare.js';
import { judgeQueue } from './queue.js';

export { JudgeUnavailableError };

export const VERDICTS = {
  AC: 'Accepted',
  WA: 'Wrong Answer',
  TLE: 'Time Limit Exceeded',
  RE: 'Runtime Error',
  CE: 'Compile Error',
  JE: 'Judge Error', // Judge0's own problem: never counted against the student
};

export const MAX_CODE_BYTES = 64 * 1024;

// Cuts long text (compiler errors, output) so we never send megabytes to a browser.
const clip = (text, max) => (text && text.length > max ? `${text.slice(0, max)}\n… (cut)` : text || '');

// Python and JavaScript have no compile step, so Judge0 reports a syntax error as a Runtime Error.
// Like LeetCode, we call it a Compile Error instead (which also means no penalty).
const SYNTAX_ERROR = /^(SyntaxError|IndentationError|TabError)\b/m;

// One test's verdict from Judge0's status id. We compare the output ourselves (statuses 3/4 = "ran OK").
function testVerdict(result, expected, language) {
  const id = result.statusId;
  if (id === 3 || id === 4) return outputsMatch(expected, result.stdout) ? 'AC' : 'WA';
  if (id === 5) return 'TLE';
  if (id === 6) return 'CE';
  if (id >= 7 && id <= 12) {
    const interpreted = language === 'python' || language === 'javascript';
    return interpreted && SYNTAX_ERROR.test(result.stderr) ? 'CE' : 'RE';
  }
  return 'JE';
}

// Judges `code` on `tests` ([{ input, output }]).
// showDetails = true for "Run" on public examples (shows input, expected and actual output).
// showDetails = false for "Submit" on hidden tests: only the verdict, counts and the failing test NUMBER,
// so hidden inputs/outputs never reach the student (we also hide stderr, which could echo the input).
export async function judgeCode({ language, code, tests, timeLimitSec = 2, showDetails = false }, { runner = runBatch, queue = judgeQueue, onQueued } = {}) {
  const lang = LANGUAGES[language];
  if (!lang) throw new Error(`Unknown language: ${language}`);
  const limit = timeLimitFor(language, timeLimitSec);
  const runs = tests.map((t) => ({ languageId: lang.id, source: code, stdin: t.input, timeLimitSec: limit }));
  const results = await queue.add(() => runner(runs), onQueued);

  const perTest = results.map((r, i) => ({ verdict: testVerdict(r, tests[i].output, language), result: r }));
  const firstBad = perTest.findIndex((t) => t.verdict !== 'AC');
  const passed = perTest.filter((t) => t.verdict === 'AC').length;
  const code_ = firstBad === -1 ? 'AC' : perTest.some((t) => t.verdict === 'CE') ? 'CE' : perTest[firstBad].verdict;
  const bad = firstBad === -1 ? null : perTest[firstBad].result;

  const summary = {
    verdict: VERDICTS[code_],
    verdictCode: code_,
    passed,
    total: tests.length,
    failedTest: firstBad === -1 ? null : firstBad + 1,
    timeMs: Math.max(0, ...results.map((r) => r.timeMs || 0)),
    memoryKb: Math.max(0, ...results.map((r) => r.memoryKb || 0)),
    timeLimitSec: limit,
    message: '',
  };

  // A compile error depends only on the code (not the input), so it is safe to show.
  if (code_ === 'CE') summary.message = clip(bad.compileOutput || bad.stderr || bad.message, 3000);
  else if (code_ === 'RE') summary.message = showDetails ? clip(bad.stderr || bad.message, 2000) : `${bad.status}${bad.message ? ` – ${clip(bad.message, 200)}` : ''}`;
  else if (code_ === 'TLE') summary.message = `Your program ran longer than ${limit} s on test ${firstBad + 1}.`;
  else if (code_ === 'JE') summary.message = clip(bad.message || bad.status, 300);

  if (showDetails) {
    summary.tests = perTest.map(({ verdict, result }, i) => ({
      verdict: VERDICTS[verdict],
      input: clip(tests[i].input, 2000),
      expected: clip(tests[i].output, 2000),
      stdout: clip(result.stdout, 2000),
      stderr: clip(result.stderr, 1000),
      timeMs: result.timeMs,
    }));
  }
  return summary;
}
