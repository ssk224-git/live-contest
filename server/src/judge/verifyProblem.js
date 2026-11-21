// "Never trust the tests": runs a problem's reference solution on every example and hidden test.
// A hidden test the solution fails is dropped (its expected output is probably wrong).
// A failing example, a broken solution, or too few surviving tests flags the problem.
import { createHash } from 'node:crypto';
import { judgeCode } from './judge.js';

// A short hash of everything the check depends on. If any of it changes, the check is out of date.
export function problemFingerprint(p) {
  const relevant = {
    examples: (p.examples || []).map((e) => [e.input, e.output]),
    tests: (p.tests || []).map((t) => [t.input, t.output]),
    solution: [p.referenceSolution?.language, p.referenceSolution?.code],
    timeLimitSec: p.timeLimitSec,
  };
  return createHash('sha256').update(JSON.stringify(relevant)).digest('hex').slice(0, 16);
}

const preview = (s, n = 80) => {
  const one = String(s ?? '').replace(/\s+/g, ' ').trim();
  return one.length > n ? `${one.slice(0, n)}…` : one;
};

// Returns { problem (failing hidden tests removed), verification, dropped: [...], judge: summary }.
// minTests: how many hidden tests must survive (1 for hand-written problems, 5 for AI drafts).
export async function verifyProblem(problem, { minTests = 1, judge = judgeCode } = {}) {
  const sol = problem.referenceSolution || {};
  if (!sol.code?.trim()) {
    return {
      problem,
      dropped: [],
      verification: { status: 'unverified', checkedAt: new Date(), fingerprint: problemFingerprint(problem), notes: ['Add a reference solution to check the tests.'] },
    };
  }

  const examples = problem.examples || [];
  const tests = problem.tests || [];
  const all = [...examples, ...tests].map((t) => ({ input: t.input, output: t.output }));
  const summary = await judge({ language: sol.language, code: sol.code, tests: all, timeLimitSec: problem.timeLimitSec || 2, showDetails: true });

  const notes = [];
  let status = 'verified';
  const dropped = [];
  let kept = tests;

  if (summary.verdictCode === 'CE') {
    status = 'flagged';
    notes.push(`The reference solution does not compile: ${preview(summary.message, 300)}`);
  } else {
    // Examples are shown to students, so a failing example cannot be silently dropped: flag it.
    summary.tests.slice(0, examples.length).forEach((t, i) => {
      if (t.verdict !== 'Accepted') {
        status = 'flagged';
        notes.push(`Example ${i + 1}: the reference solution gave "${preview(t.stdout || t.stderr)}" but the example says "${preview(t.expected)}" (${t.verdict}).`);
      }
    });
    const failing = [];
    summary.tests.slice(examples.length).forEach((t, i) => {
      if (t.verdict !== 'Accepted') failing.push({ test: i + 1, verdict: t.verdict, input: preview(t.input), expected: preview(t.expected), got: preview(t.stdout || t.stderr) });
    });

    if (status === 'flagged') {
      // The solution disagrees with an example, so we cannot trust it to judge the hidden tests either.
      if (failing.length) notes.push(`It also fails hidden test${failing.length > 1 ? 's' : ''} ${failing.map((f) => f.test).join(', ')}. Nothing was dropped: fix the solution or the example first.`);
    } else if (failing.length === tests.length) {
      status = 'flagged';
      notes.push('The reference solution fails every hidden test. Nothing was dropped: check the tests and the solution.');
    } else {
      // All examples pass, so we trust the solution: drop the hidden tests it fails.
      dropped.push(...failing);
      const bad = new Set(failing.map((f) => f.test - 1));
      kept = tests.filter((_, i) => !bad.has(i));
      if (dropped.length) notes.push(`Dropped ${dropped.length} hidden test${dropped.length > 1 ? 's' : ''} the reference solution failed.`);
      if (kept.length < minTests) {
        status = 'flagged';
        notes.push(`Only ${kept.length} hidden test${kept.length === 1 ? '' : 's'} left (need at least ${minTests}).`);
      }
    }
  }

  const cleaned = { ...problem, tests: kept };
  return {
    problem: cleaned,
    dropped,
    verification: { status, checkedAt: new Date(), fingerprint: problemFingerprint(cleaned), notes },
    judge: { verdict: summary.verdict, timeMs: summary.timeMs },
  };
}

// When a problem is saved: keep its "verified" status only if nothing changed since the check.
export function refreshVerification(problem) {
  const v = problem.verification;
  if (v && v.status !== 'unverified' && v.fingerprint === problemFingerprint(problem)) return v;
  return { status: 'unverified', notes: [], fingerprint: undefined, checkedAt: undefined };
}
