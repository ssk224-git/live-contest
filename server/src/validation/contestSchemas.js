// Zod schemas for coding contests and problems (request bodies).
import { z } from 'zod';
import { LANGUAGE_KEYS } from '../judge/languages.js';

export const MAX_PROBLEMS = 4;
export const MAX_EXAMPLES = 3;
export const MAX_TESTS = 15; // examples + tests must fit in one Judge0 batch (20)

const text = (max, label) => z.string().max(max, `${label} is too long (max ${max} characters)`).default('');
const ioText = (label) => z.string().max(50_000, `${label} is too long (max 50,000 characters)`);

export const exampleSchema = z.object({
  input: ioText('Example input'),
  output: ioText('Example output').refine((s) => s.trim().length > 0, 'Example output cannot be empty'),
  explanation: text(1000, 'Explanation'),
});

export const testSchema = z.object({
  input: ioText('Test input'),
  output: ioText('Test output').refine((s) => s.trim().length > 0, 'Test output cannot be empty'),
});

export const languageSchema = z.enum(LANGUAGE_KEYS);

export const problemSchema = z.object({
  title: z.string().trim().min(1, 'Problem title is required').max(100),
  statement: z.string().trim().min(1, 'Problem statement is required').max(8000),
  inputFormat: text(2000, 'Input format'),
  outputFormat: text(2000, 'Output format'),
  constraints: text(2000, 'Constraints'),
  examples: z.array(exampleSchema).min(1, 'Add at least one example').max(MAX_EXAMPLES, `At most ${MAX_EXAMPLES} examples`),
  tests: z.array(testSchema).min(1, 'Add at least one hidden test').max(MAX_TESTS, `At most ${MAX_TESTS} hidden tests`),
  referenceSolution: z
    .object({ language: languageSchema.default('python'), code: z.string().max(64 * 1024).default('') })
    .default({ language: 'python', code: '' }),
  timeLimitSec: z.number().min(1).max(5).default(2),
  verification: z
    .object({
      status: z.enum(['unverified', 'verified', 'flagged']).default('unverified'),
      checkedAt: z.coerce.date().optional(),
      fingerprint: z.string().optional(),
      notes: z.array(z.string()).default([]),
    })
    .optional(),
});

export const contestSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(120),
  durationMin: z.number().int().min(5, 'At least 5 minutes').max(300, 'At most 300 minutes').default(60),
  penaltyMin: z.number().int().min(0).max(60).default(5),
  languages: z.array(languageSchema).min(1, 'Pick at least one language').default(LANGUAGE_KEYS),
  problems: z.array(problemSchema).min(1, 'Add at least one problem').max(MAX_PROBLEMS, `At most ${MAX_PROBLEMS} problems`),
});

// Verify can run on an unfinished draft, so only the parts it needs are required.
export const verifyBodySchema = z.object({
  problem: problemSchema.extend({
    title: z.string().max(100).default(''),
    statement: z.string().max(8000).default(''),
  }),
});

export const generateProblemSchema = z.object({
  topic: z.string().trim().min(2, 'Type a topic').max(300),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('easy'),
});
