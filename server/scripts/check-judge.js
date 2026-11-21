// Milestone M5 check: runs a correct program and 4 broken ones in every language on the real
// Judge0 server, and prints the verdicts and timings. Usage: npm run check:judge
import { judgeCode } from '../src/judge/judge.js';
import { LANGUAGE_KEYS, LANGUAGES } from '../src/judge/languages.js';
import { SUM_SOLUTIONS, BROKEN, SUM_TESTS } from '../src/judge/starters.js';
import { config } from '../src/config.js';

console.log(`Judge0: ${config.judge0Url} | ${SUM_TESTS.length} tests per run | concurrency ${config.judgeConcurrency}\n`);
const rows = [];
const jobs = [];
for (const lang of LANGUAGE_KEYS) {
  const cases = { AC: SUM_SOLUTIONS[lang], ...BROKEN[lang] };
  for (const [expected, code] of Object.entries(cases)) {
    jobs.push(
      (async () => {
        const started = Date.now();
        try {
          const r = await judgeCode({ language: lang, code, tests: SUM_TESTS, timeLimitSec: 1 });
          rows.push({ lang, expected, got: r.verdictCode, ok: r.verdictCode === expected, ms: Date.now() - started, info: `${r.passed}/${r.total} passed, max ${r.timeMs} ms` });
        } catch (err) {
          rows.push({ lang, expected, got: 'ERROR', ok: false, ms: Date.now() - started, info: err.message });
        }
      })(),
    );
  }
}
await Promise.all(jobs);

const order = (r) => LANGUAGE_KEYS.indexOf(r.lang) * 10 + ['AC', 'WA', 'TLE', 'RE', 'CE'].indexOf(r.expected);
for (const r of rows.sort((a, b) => order(a) - order(b))) {
  console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${LANGUAGES[r.lang].label.padEnd(22)} expected ${r.expected.padEnd(3)} got ${r.got.padEnd(5)} ${String(r.ms).padStart(6)} ms  ${r.info}`);
}
const failed = rows.filter((r) => !r.ok).length;
console.log(`\n${rows.length - failed}/${rows.length} verdicts as expected`);
process.exit(failed ? 1 : 0);
