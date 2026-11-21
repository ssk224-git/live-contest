// Zod schemas: the shape every request body must have. A body that does not match is rejected
// with a 400 before any route code runs. The AI's JSON is checked with stricter versions (ai/*.js).
import { z } from 'zod';

// ---------- Accounts ----------

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60),
  email: z.email('Enter a valid email').trim().toLowerCase(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100),
});

export const loginSchema = z.object({
  email: z.email('Enter a valid email').trim().toLowerCase(),
  password: z.string().min(1, 'Password is required').max(100),
});

// ---------- MCQ quizzes ----------

// True when no two strings are the same after trimming and lowercasing.
export const allDifferent = (items) => new Set(items.map((s) => s.trim().toLowerCase())).size === items.length;

export const questionSchema = z.object({
  text: z.string().trim().min(1, 'Question text is required').max(300),
  options: z
    .array(z.string().trim().min(1, 'Options cannot be empty').max(120))
    .length(4, 'Each question needs exactly 4 options')
    .refine(allDifferent, 'The 4 options must all be different'),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string().trim().max(400).default(''),
  timeLimitSec: z.number().int().min(5).max(120).default(20),
});

export const quizSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(120),
  topic: z.string().trim().max(200).default(''),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  questions: z.array(questionSchema).min(1, 'Add at least one question').max(15, 'At most 15 questions'),
});

export const generateQuizSchema = z.object({
  topic: z.string().trim().min(2, 'Type a topic').max(200),
  count: z.number().int().min(3).max(15).default(5),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
});

// Turns Zod's error list into short readable lines like "questions.2.options: The 4 options must all be different".
export function formatIssues(error) {
  return error.issues.map((issue) => (issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message));
}
