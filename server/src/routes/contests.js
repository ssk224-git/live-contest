// /api/contests: a host's coding contests (max 4 problems), plus Verify and AI drafts for problems.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { Contest } from '../models/Contest.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { contestSchema, verifyBodySchema, generateProblemSchema } from '../validation/contestSchemas.js';
import { findOwned } from '../utils/findOwned.js';
import { verifyProblem, refreshVerification } from '../judge/verifyProblem.js';
import { generateProblem } from '../ai/problemGenerator.js';

export const contestsRouter = Router();
contestsRouter.use(requireAuth);

// Verify and AI drafts call Judge0 / Gemini: limit them per host.
const heavyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  keyGenerator: (req) => req.user.id,
  message: { error: 'Too many checks in a short time. Wait a few minutes.' },
});

// A problem's "verified" badge survives a save only if its tests and solution did not change.
const withFreshChecks = (body) => ({ ...body, problems: body.problems.map((p) => ({ ...p, verification: refreshVerification(p) })) });

contestsRouter.get('/', async (req, res) => {
  const contests = await Contest.find({ owner: req.user.id }, { title: 1, durationMin: 1, updatedAt: 1, 'problems.title': 1, 'problems.verification.status': 1 })
    .sort({ updatedAt: -1 })
    .lean();
  res.json({
    contests: contests.map((c) => ({
      id: c._id,
      title: c.title,
      durationMin: c.durationMin,
      problemCount: c.problems.length,
      unverified: c.problems.filter((p) => p.verification?.status !== 'verified').length,
      updatedAt: c.updatedAt,
    })),
  });
});

contestsRouter.post('/', validateBody(contestSchema), async (req, res) => {
  const contest = await Contest.create({ ...withFreshChecks(req.body), owner: req.user.id });
  res.status(201).json({ contest });
});

// Runs the reference solution on every example and test (works on unsaved drafts too).
contestsRouter.post('/verify-problem', heavyLimiter, validateBody(verifyBodySchema), async (req, res) => {
  const result = await verifyProblem(req.body.problem, { minTests: 1 });
  res.json(result);
});

// AI draft of one problem, already cross-checked by its own reference solution. Not saved.
contestsRouter.post('/generate-problem', heavyLimiter, validateBody(generateProblemSchema), async (req, res) => {
  const result = await generateProblem(req.body);
  res.json(result);
});

contestsRouter.get('/:id', async (req, res) => {
  const contest = await findOwned(Contest, req.params.id, req.user.id, 'Contest');
  res.json({ contest });
});

contestsRouter.put('/:id', validateBody(contestSchema), async (req, res) => {
  const contest = await findOwned(Contest, req.params.id, req.user.id, 'Contest');
  contest.set(withFreshChecks(req.body));
  await contest.save();
  res.json({ contest });
});

contestsRouter.delete('/:id', async (req, res) => {
  const contest = await findOwned(Contest, req.params.id, req.user.id, 'Contest');
  await contest.deleteOne();
  res.status(204).end();
});
