// AI quiz drafts you can trust: prompt -> Gemini (JSON schema) -> strict validation
// -> retry once with the list of problems -> shuffle options -> draft for the host to review.
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { generateJson } from './gemini.js';
import { logAttempt } from './aiLog.js';
import { allDifferent, formatIssues } from '../validation/schemas.js';
import { AppError } from '../utils/AppError.js';
import { config } from '../config.js';

const MAX_ATTEMPTS = 2; // first try + one retry with feedback

// The JSON shape we ask Gemini for (JSON Schema). Gemini mostly follows it,
// but we still check everything ourselves with Zod below.
export const quizJsonSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          options: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4 },
          correctIndex: { type: 'integer', minimum: 0, maximum: 3 },
          explanation: { type: 'string' },
        },
        required: ['text', 'options', 'correctIndex', 'explanation'],
      },
    },
  },
  required: ['title', 'questions'],
};

// Strict rules for one AI question (stricter than for hand-written ones).
const BANNED = /\b(all|none) of the above\b/i;
export const aiQuestionSchema = z.object({
  text: z.string().trim().min(10, 'text must be 10-200 characters').max(200, 'text must be 10-200 characters'),
  options: z
    .array(
      z
        .string()
        .trim()
        .min(1, 'options cannot be empty')
        .max(80, 'each option must be at most 80 characters')
        .refine((o) => !BANNED.test(o), 'do not use "All of the above" or "None of the above"'),
    )
    .length(4, 'exactly 4 options are required')
    .refine(allDifferent, 'the 4 options must all be different'),
  correctIndex: z.number().int('correctIndex must be 0, 1, 2 or 3').min(0, 'correctIndex must be 0-3').max(3, 'correctIndex must be 0-3'),
  explanation: z.string().trim().min(1, 'explanation is required').max(300),
});

// Checks a whole AI answer. Returns { title, questions (only the valid ones), problems }.
// problems is empty only when the draft is perfect (right count, every question valid, no duplicates).
export function validateQuizDraft(raw, count) {
  const problems = [];
  if (!raw || typeof raw !== 'object' || raw.__notJson !== undefined) {
    return { title: '', questions: [], problems: ['The response was not valid JSON'] };
  }
  const list = Array.isArray(raw.questions) ? raw.questions : [];
  if (!Array.isArray(raw.questions)) problems.push('"questions" must be an array');
  else if (list.length !== count) problems.push(`there must be exactly ${count} questions, got ${list.length}`);

  const questions = [];
  const seenText = new Set();
  list.forEach((item, i) => {
    const result = aiQuestionSchema.safeParse(item);
    if (!result.success) {
      problems.push(...formatIssues(result.error).map((p) => `question ${i + 1}: ${p}`));
      return;
    }
    const key = result.data.text.toLowerCase();
    if (seenText.has(key)) {
      problems.push(`question ${i + 1}: duplicate of an earlier question`);
      return;
    }
    seenText.add(key);
    questions.push(result.data);
  });

  const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim().slice(0, 120) : '';
  return { title, questions: questions.slice(0, count), problems };
}

// Shuffles the 4 options and moves correctIndex with them (models like to put the answer in the same spot).
export function shuffleOptions(question, rand = randomInt) {
  const order = [0, 1, 2, 3];
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = rand(i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { ...question, options: order.map((k) => question.options[k]), correctIndex: order.indexOf(question.correctIndex) };
}

// The instruction from the spec, plus feedback from the previous attempt (if any).
export function quizPrompt({ topic, count, difficulty }, problems = []) {
  let prompt =
    `Write ${count} multiple-choice questions about "${topic}" at ${difficulty} level for students. ` +
    'Each question has exactly 4 options and exactly one correct answer. ' +
    'Wrong options must be plausible but clearly wrong to someone who knows the topic. ' +
    'Do not use "All of the above" or "None of the above". ' +
    'Keep each question under 200 characters and each option under 80. ' +
    'Add a one-sentence explanation of the correct answer. ' +
    'Also give the quiz a short title. ' +
    'Return JSON: {"title": string, "questions": [{"text": string, "options": [4 strings], "correctIndex": 0-3, "explanation": string}]}.';
  if (problems.length) {
    prompt += `\n\nYour last answer had these problems: ${problems.slice(0, 15).join('; ')}. Fix all of them.`;
  }
  return prompt;
}

// Main entry: returns { draft: { title, questions }, meta: { attempts, model, ms, dropped } }.
// ai is injectable so tests can use a fake model.
export async function generateQuiz({ topic, count, difficulty }, { ai = generateJson } = {}) {
  const started = Date.now();
  let problems = [];
  let best = { title: '', questions: [] };
  let model = '';
  let attempts = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    attempts = attempt;
    const reply = await ai(quizPrompt({ topic, count, difficulty }, problems), {
      schema: quizJsonSchema,
      temperature: 0.7,
      models: config.geminiQuizModels,
    });
    model = reply.model;
    const result = validateQuizDraft(reply.data, count);
    problems = result.problems;
    logAttempt({ kind: 'quiz', topic, attempt, valid: problems.length === 0, problems, model, ms: reply.ms });
    if (result.questions.length > best.questions.length || problems.length === 0) best = result;
    if (problems.length === 0) break;
  }

  // After the retries: keep the valid questions if there are at least 3, otherwise give up.
  if (best.questions.length < Math.min(3, count)) {
    throw new AppError(502, "The AI couldn't write a valid quiz for that topic. Try rephrasing it.", {
      code: 'GENERATION_FAILED',
      problems: problems.slice(0, 10),
    });
  }
  return {
    draft: {
      title: best.title || `${topic} quiz`,
      questions: best.questions.map((q) => ({ ...shuffleOptions(q), timeLimitSec: 20 })),
    },
    meta: { attempts, model, ms: Date.now() - started, dropped: count - best.questions.length },
  };
}
