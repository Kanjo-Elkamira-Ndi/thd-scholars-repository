import pool from '../pool';
import { DEV_USERS } from './dev-users';

const main = async (): Promise<void> => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'seed-users is a development-only script; refusing to run with NODE_ENV=production',
    );
  }
  for (const user of DEV_USERS) {
    await pool.query(
      `INSERT INTO users (telegram_id, telegram_username, full_name, role)
       VALUES ($1::bigint, $2, $3, $4)
       ON CONFLICT (telegram_id) DO UPDATE
         SET telegram_username = EXCLUDED.telegram_username,
             role = EXCLUDED.role`,
      [user.telegramId, user.username, user.fullName, user.role],
    );
  }
  const summary = DEV_USERS.map((user) => `${user.role}@${user.telegramId}`).join(', ');
  console.log(`Seeded ${DEV_USERS.length} users: ${summary}`);
};

const run = async (): Promise<void> => {
  try {
    await main();
  } finally {
    await pool.end();
  }
};

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
