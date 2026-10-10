import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

export const registrationRateLimiter = rateLimit({
  windowMs: env.REGISTRATION_RATE_LIMIT_WINDOW_SECONDS * 1000,
  max: env.REGISTRATION_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user ? String(req.user.telegramId) : 'anonymous'),
  handler: (_req, res) => {
    res
      .status(429)
      .json({ error: { code: 'RATE_LIMITED', message: 'Too many registration attempts' } });
  },
});
