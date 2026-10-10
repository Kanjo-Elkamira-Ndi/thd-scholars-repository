import pino from 'pino';

const scrub = (value: string): string => {
  let result = value.replace(/bot\d+:[A-Za-z0-9_-]+/g, 'bot[redacted]');
  for (const secret of [process.env.BOT_TOKEN, process.env.API_INTERNAL_TOKEN]) {
    if (secret && secret.length >= 6) {
      result = result.split(secret).join('[redacted]');
    }
  }
  return result;
};

export const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport:
    process.env.NODE_ENV === 'production'
      ? undefined
      : { target: 'pino-pretty', options: { colorize: true } },
  redact: {
    paths: ['BOT_TOKEN', 'API_INTERNAL_TOKEN', 'headers.x-internal-token'],
    remove: true,
  },
  serializers: {
    err: (err: Error) => ({
      type: err.name,
      message: scrub(err.message),
      stack: scrub(err.stack ?? ''),
    }),
  },
});
