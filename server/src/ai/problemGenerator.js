// AI drafts of coding problems, never trusted:
//   1. Gemini writes the problem, examples, hidden tests AND a reference solution (JSON schema).
//   2. Zod checks the shape. Broken shape -> retry once with the list of problems.
//   3. The server runs the reference solution on every example and test (Judge0).
//      Hidden tests it fails are dropped. A failing example, a broken solution, or fewer than
//      5 surviving tests -> retry once with what went wrong. Still bad -> returned "flagged".
//   4. The host reviews and edits the draft before it is saved.
import { z } from 'zod';
import { generateJson } from './gemini.js';
import { logAttempt } from './aiLog.js';
import { formatIssues } from '../validation/schemas.js';
import { verifyProblem } from '../judge/verifyProblem.js';
import { AppError } from '../utils/AppError.js';

const MIN_SURVIVING_TESTS = 5;

// The JSON shape we ask Gemini for.
export const problemJsonSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    statement: { type: 'string' },
    inputFormat: { type: 'string' },
    outputFormat: { type: 'string' },
    constraints: { type: 'string' },
    examples: {
      type: 'array',
      items: {
        type: 'object',
        properties: { input: { type: 'string' }, output: { type: 'string' }, explanation: { type: 'string' } },
        required: ['input', 'output', 'explanation'],
      },
    },
    tests: {
      type: 'array',
      items: { type: 'object', properties: { input: { type: 'string' }, output: { type: 'string' } }, required: ['input', 'output'] },
    },
    referenceSolution: { type: 'string', description: 'A complete Python 3 program that reads stdin and prints the answer' },
  },
  required: ['title', 'statement', 'inputFormat', 'outputFormat', 'constraints', 'examples', 'tests', 'referenceSolution'],
};

const io = z.object({
  input: z.string().max(2000, 'each input must be under 2000 characters'),
  output: z.string().trim().min(1, 'outputs cannot be empty').max(2000, 'each output must be under 2000 characters'),
});

// Strict rules for an AI draft.
export const aiProblemSchema = z.object({
  title: z.string().trim().min(3, 'title is too short').max(80, 'title must be under 80 characters'),
  statement: z.string().trim().min(20, 'statement is too short').max(3000, 'statement must be under 3000 characters'),
  inputFormat: z.string().trim().min(5, 'inputFormat is required').max(1000),
  outputFormat: z.string().trim().min(5, 'outputFormat is required').max(1000),
  constraints: z.string().trim().min(3, 'constraints are required').max(1000),
  examples: z.array(io.extend({ explanation: z.string().max(500).default('') })).min(2, 'give at least 2 examples').max(3, 'give at most 3 examples'),
  tests: z.array(io).min(6, 'give at least 8 hidden tests').max(15, 'give at most 12 hidden tests'),
  referenceSolution: z.string().trim().min(10, 'referenceSolution is required').max(10_000),
});

// Checks one AI answer. Returns { problem, problems } (problem is null if the shape is broken).
export function validateProblemDraft(raw) {
  if (!raw || typeof raw !== 'object' || raw.__notJson !== undefined) return { problem: null, problems: ['The response was not valid JSON'] };
  const result = aiProblemSchema.safeParse(raw);
  if (!result.success) return { problem: null, problems: formatIssues(result.error) };
  const d = result.data;
  const problems = [];
  const inputs = d.tests.map((t) => t.input.trim());
  if (new Set(inputs).size !== inputs.length) problems.push('hidden tests must all have different inputs');
  if (problems.length) return { problem: null, problems };
  return {
    problem: {
      title: d.title,
      statement: d.statement,
      inputFormat: d.inputFormat,
      outputFormat: d.outputFormat,
      constraints: d.constraints,
      examples: d.examples,
      tests: d.tests,
      referenceSolution: { language: 'python', code: d.referenceSolution },
      timeLimitSec: 2,
    },
    problems: [],
  };
}

// The instruction for Gemini, plus feedback from the previous attempt (if any).
export function problemPrompt({ topic, difficulty }, feedback = []) {
  let prompt = `Write one ${difficulty} competitive-programming problem for students about: "${topic}".

Rules:
- Standard input / standard output: the program reads the input from stdin and prints the answer to stdout.
- The answer must be exact and unique (integers or words). No floating-point answers, no "print any valid answer" problems.
- Clear statement (under 300 words), an input format, an output format and constraints.
- 2 or 3 examples, each with a short explanation.
- 10 hidden tests that are different from the examples: include edge cases (smallest sizes, equal values, negatives if allowed, the largest values in the constraints). Keep every test input under 1000 characters.
- Every expected output must be exactly what a correct program prints.
- referenceSolution: a complete, correct Python 3 program that reads stdin and prints the answer. It must pass every example and test.
Return JSON with: title, statement, inputFormat, outputFormat, constraints, examples [{input, output, explanation}], tests [{input, output}], referenceSolution.`;
  if (feedback.length) {
    prompt += `\n\nYour last answer had these problems: ${feedback.slice(0, 12).join('; ')}. Fix all of them (recompute every expected output carefully).`;
  }
  return prompt;
}

// Main entry. Returns { problem, verification, dropped, meta }. ai/verify are injectable for tests.
export async function generateProblem({ topic, difficulty }, { ai = generateJson, verify = verifyProblem } = {}) {
  const started = Date.now();
  let feedback = [];
  let shapeRetries = 0;
  let checkRetries = 0;
  let calls = 0;
  let model = '';
  let best = null; // the best checked draft so far
  const droppedAll = [];

  while (calls < 3) {
    calls += 1;
    const reply = await ai(problemPrompt({ topic, difficulty }, feedback), { schema: problemJsonSchema, temperature: 0.4 });
    model = reply.model;
    const { problem, problems } = validateProblemDraft(reply.data);

    if (!problem) {
      logAttempt({ kind: 'problem', topic, attempt: calls, valid: false, stage: 'shape', problems, model, ms: reply.ms });
      if (shapeRetries >= 1) break;
      shapeRetries += 1;
      feedback = problems;
      continue;
    }

    const checked = await verify(problem, { minTests: MIN_SURVIVING_TESTS });
    droppedAll.push(...checked.dropped.map((d) => ({ ...d, attempt: calls })));
    const ok = checked.verification.status === 'verified';
    logAttempt({
      kind: 'problem',
      topic,
      attempt: calls,
      valid: ok,
      stage: 'verify',
      problems: checked.verification.notes,
      dropped: checked.dropped.length,
      kept: checked.problem.tests.length,
      model,
      ms: reply.ms,
    });
    best = { ...checked, attempt: calls };
    if (ok || checkRetries >= 1) break;
    checkRetries += 1;
    feedback = [
      ...checked.verification.notes,
      ...checked.dropped.map((d) => `hidden test with input "${d.input}": you said "${d.expected}" but your own solution prints "${d.got}"`),
    ];
  }

  if (!best) {
    throw new AppError(502, "The AI couldn't write a valid problem for that topic. Try rephrasing it.", { code: 'GENERATION_FAILED', problems: feedback.slice(0, 8) });
  }
  return {
    problem: best.problem,
    verification: best.verification,
    dropped: droppedAll.filter((d) => d.attempt === best.attempt),
    meta: { attempts: calls, model, ms: Date.now() - started, dropped: droppedAll.filter((d) => d.attempt === best.attempt).length },
  };
}
