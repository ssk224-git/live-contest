// /api/quizzes: a host's MCQ quizzes. Every route needs a logged-in host.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { Quiz } from '../models/Quiz.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { quizSchema, generateQuizSchema } from '../validation/schemas.js';
import { findOwned } from '../utils/findOwned.js';
import { generateQuiz } from '../ai/quizGenerator.js';

export const quizzesRouter = Router();
quizzesRouter.use(requireAuth);

// AI calls cost quota: at most 15 drafts per 10 minutes per host.
const aiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 15,
  keyGenerator: (req) => req.user.id,
  message: { error: 'Too many AI drafts. Wait a few minutes and try again.' },
});

// Asks the AI for a draft. Nothing is saved: the host reviews it first.
quizzesRouter.post('/generate', aiLimiter, validateBody(generateQuizSchema), async (req, res) => {
  const result = await generateQuiz(req.body);
  res.json(result);
});

// The host's quizzes, newest first (without the questions, to keep the list small).
quizzesRouter.get('/', async (req, res) => {
  const quizzes = await Quiz.find({ owner: req.user.id }).sort({ updatedAt: -1 }).lean();
  res.json({
    quizzes: quizzes.map((q) => ({
      id: q._id,
      title: q.title,
      topic: q.topic,
      difficulty: q.difficulty,
      questionCount: q.questions.length,
      updatedAt: q.updatedAt,
    })),
  });
});

// Saves a new quiz (hand-written, or an AI draft the host reviewed).
quizzesRouter.post('/', validateBody(quizSchema), async (req, res) => {
  const quiz = await Quiz.create({ ...req.body, owner: req.user.id });
  res.status(201).json({ quiz });
});

// One quiz, with answers (only its owner can see it).
quizzesRouter.get('/:id', async (req, res) => {
  const quiz = await findOwned(Quiz, req.params.id, req.user.id, 'Quiz');
  res.json({ quiz });
});

// Replaces a quiz with the edited version.
quizzesRouter.put('/:id', validateBody(quizSchema), async (req, res) => {
  const quiz = await findOwned(Quiz, req.params.id, req.user.id, 'Quiz');
  quiz.set(req.body);
  await quiz.save();
  res.json({ quiz });
});

quizzesRouter.delete('/:id', async (req, res) => {
  const quiz = await findOwned(Quiz, req.params.id, req.user.id, 'Quiz');
  await quiz.deleteOne();
  res.status(204).end();
});
