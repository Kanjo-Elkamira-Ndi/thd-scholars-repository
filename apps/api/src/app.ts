import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { authUser } from './middleware/auth';
import { errorHandler } from './middleware/error-handler';
import { internalServiceToken } from './middleware/internal-token';
import authRoutes from './routes/auth-routes';
import contentRoutes from './routes/content-routes';
import healthRoutes from './routes/health-routes';
import internalRoutes from './routes/internal-routes';
import registrationsRoutes from './routes/registrations-routes';
import adminRoutes from './routes/admin-routes';
import dashboardRoutes from './routes/dashboard-routes';
import rosterRoutes from './routes/roster-routes';

const app = express();

/* Behind a reverse proxy (nginx / pm2) the proxy IP must be trusted, otherwise
   every client shares the proxy's IP for rate limiting and logs. Set
   TRUST_PROXY to the number of proxy hops in front of the API (0 = none). */
app.set('trust proxy', env.TRUST_PROXY);

app.use((req, _res, next) => {
  req.id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  next();
});

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

app.use('/api', healthRoutes);

app.use('/api', authUser, authRoutes);
app.use('/api', authUser, registrationsRoutes);
app.use('/api', authUser, contentRoutes);
app.use('/api', authUser, dashboardRoutes);
app.use('/api', authUser, adminRoutes);
app.use('/api', authUser, rosterRoutes);
app.use('/internal', internalServiceToken, internalRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
});

app.use(errorHandler);

export default app;
