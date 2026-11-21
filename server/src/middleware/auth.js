// Login tokens (JWT) for hosts. The browser sends "Authorization: Bearer <token>".
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { AppError } from '../utils/AppError.js';

// The secret that signs tokens. Without one, nobody can log in.
function secret() {
  if (!config.jwtSecret) throw new AppError(503, 'JWT_SECRET is not set on the server');
  return config.jwtSecret;
}

// Makes a token that proves "this is user <id>" for 7 days.
export const signToken = (user) => jwt.sign({ sub: user._id.toString(), name: user.name }, secret(), { expiresIn: '7d' });

// Returns { id, name } from a token, or null if it is missing, expired or forged.
export function readToken(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, secret());
    return { id: payload.sub, name: payload.name };
  } catch {
    return null;
  }
}

// Route guard: only logged-in hosts get past this. Sets req.user = { id, name }.
export function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const user = readToken(token);
  if (!user) return next(new AppError(401, 'Please log in'));
  req.user = user;
  next();
}
