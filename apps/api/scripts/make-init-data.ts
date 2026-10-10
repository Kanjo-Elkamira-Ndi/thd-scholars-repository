import path from 'node:path';
import { config } from 'dotenv';
import { signInitData } from '../src/auth/telegram-init-data';
import { DEV_USERS } from '../src/db/seeds/dev-users';

config({ path: path.join(__dirname, '..', '.env') });

const main = (): void => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('make-init-data is a development-only script');
  }
  const botToken = process.env.BOT_TOKEN;
  if (!botToken) {
    throw new Error('BOT_TOKEN is not set in apps/api/.env; add it before generating initData');
  }

  const roleArg = process.argv.find((arg) => arg.startsWith('--role='))?.slice('--role='.length);
  const identity =
    DEV_USERS.find((user) => user.role === roleArg) ??
    DEV_USERS.find((user) => user.role === 'admin');
  if (!identity) {
    throw new Error('no dev fixture found to sign');
  }

  const [firstName, ...rest] = identity.fullName.split(' ');
  const initData = signInitData(
    {
      telegramId: identity.telegramId,
      username: identity.username,
      firstName,
      lastName: rest.join(' '),
    },
    botToken,
  );

  console.log(`Role: ${identity.role} (telegram_id: ${identity.telegramId})`);
  console.log(`Authorization: tma ${initData}`);
};

try {
  main();
} catch (error: unknown) {
  console.error(error);
  process.exitCode = 1;
}
