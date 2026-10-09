import pino from 'pino';

export const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport:
    process.env.NODE_ENV === 'production'
      ? undefined
      : { target: 'pino-pretty', options: { colorize: true } },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers["x-internal-token"]',
      'DATABASE_URL',
      'API_INTERNAL_TOKEN',
    ],
    remove: true,
  },
});
