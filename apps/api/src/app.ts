import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { errorHandler } from './middlewares/error-handler';
import healthRoutes from './routes/health-routes';
import { logger } from './utils/logger';

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.MINIAPP_ORIGIN,
    credentials: false,
  }),
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

app.use((req, _res, next) => {
  (req as any).id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  next();
});

app.use('/api', healthRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
});

app.use(errorHandler);

export default app;
