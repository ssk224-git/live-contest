// /api/sessions: create a live room, check a room code, list finished sessions, export CSV.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { Quiz } from '../models/Quiz.js';
import { Session } from '../models/Session.js';
import { findOwned } from '../utils/findOwned.js';
import { AppError } from '../utils/AppError.js';
import { createRoom, getRoom } from '../live/rooms.js';
import { newQuizRoomFields } from '../live/quizSocket.js';
import { createContestRoom } from '../live/contestSocket.js';
import { sessionCsv } from '../live/csv.js';

export const sessionsRouter = Router();

// Students check a code before joining. Public, so it is rate-limited to stop code guessing.
const existsLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

sessionsRouter.get('/:code/exists', existsLimiter, (req, res) => {
  const room = getRoom(req.params.code);
  res.json(room ? { exists: true, kind: room.kind, phase: room.phase, title: room.title } : { exists: false });
});

// Everything below needs a logged-in host.
sessionsRouter.use(requireAuth);

const createSchema = z.object({ kind: z.enum(['quiz', 'contest']), id: z.string().min(1) });

// Opens a live room for one of the host's quizzes or contests. Returns { code }.
sessionsRouter.post('/', validateBody(createSchema), async (req, res) => {
  const { kind, id } = req.body;
  if (kind === 'quiz') {
    const quiz = await findOwned(Quiz, id, req.user.id, 'Quiz');
    if (!quiz.questions.length) throw new AppError(400, 'This quiz has no questions');
    const room = createRoom({ kind, hostUserId: req.user.id, title: quiz.title, ...newQuizRoomFields(quiz.toObject()) });
    return res.status(201).json({ code: room.code });
  }
  const room = await createContestRoom(id, req.user.id);
  res.status(201).json({ code: room.code });
});

// The host's finished sessions, newest first.
sessionsRouter.get('/', async (req, res) => {
  const sessions = await Session.find({ owner: req.user.id }).sort({ endedAt: -1 }).limit(100).lean();
  res.json({
    sessions: sessions.map((s) => ({
      id: s._id,
      kind: s.kind,
      title: s.title,
      code: s.code,
      endedAt: s.endedAt,
      playerCount: s.players.length,
      winner: s.players[0]?.nickname || null,
    })),
  });
});

// One finished session with full results.
sessionsRouter.get('/:id', async (req, res) => {
  const session = await findOwned(Session, req.params.id, req.user.id, 'Session');
  res.json({ session });
});

// CSV download: one row per student.
sessionsRouter.get('/:id/export.csv', async (req, res) => {
  const session = await findOwned(Session, req.params.id, req.user.id, 'Session');
  const filename = `${(session.title || 'results').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${session.code}.csv`;
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(sessionCsv(session.toObject()));
});
