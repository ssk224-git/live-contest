// POST /api/auth/register and /api/auth/login: host accounts.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { User } from '../models/User.js';
import { signToken, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { registerSchema, loginSchema } from '../validation/schemas.js';
import { AppError } from '../utils/AppError.js';

export const authRouter = Router();

// At most 30 login/register attempts per 15 minutes per IP (slows down password guessing).
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

// Creates an account and logs the new host in.
authRouter.post('/register', limiter, validateBody(registerSchema), async (req, res) => {
  const { name, email, password } = req.body;
  if (await User.exists({ email })) throw new AppError(409, 'An account with this email already exists');
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ name, email, passwordHash });
  res.status(201).json({ token: signToken(user), user: user.toPublic() });
});

// Checks the password and returns a token.
authRouter.post('/login', limiter, validateBody(loginSchema), async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  // Same message for "no such email" and "wrong password", so nobody can probe which emails exist.
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new AppError(401, 'Wrong email or password');
  }
  res.json({ token: signToken(user), user: user.toPublic() });
});

// Who am I? Used by the client to check a saved token is still valid.
authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) throw new AppError(401, 'Please log in');
  res.json({ user: user.toPublic() });
});
