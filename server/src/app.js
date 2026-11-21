// Builds the Express app: security headers, CORS, JSON bodies, the REST routes and error handling.
// Kept separate from index.js so tests can create an app without opening a port.
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import { dbConnected } from './db.js';
import { AppError } from './utils/AppError.js';
import { authRouter } from './routes/auth.js';
import { quizzesRouter } from './routes/quizzes.js';
import { sessionsRouter } from './routes/sessions.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // Render puts a proxy in front; this makes req.ip the real visitor IP

  app.use(helmet());
  app.use(cors({ origin: config.clientUrls }));
  app.use(express.json({ limit: '1mb' })); // problems with test cases can be a few hundred KB

  // Quick check that the server (and database) are up. Render pings this.
  app.get('/api/health', (req, res) => {
    res.json({ ok: true, db: dbConnected(), time: Date.now() });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/quizzes', quizzesRouter);
  app.use('/api/sessions', sessionsRouter);

  // Unknown /api route.
  app.use('/api', (req, res, next) => next(new AppError(404, 'Not found')));

  // Turns any thrown error into a JSON reply. Unknown errors become a generic 500.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof AppError) {
      return res.status(err.status).json({ error: err.message, ...err.extra });
    }
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'The request body is not valid JSON' });
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'The request is too large' });
    console.error('[error]', err);
    res.status(500).json({ error: 'Something went wrong on the server' });
  });

  return app;
}
