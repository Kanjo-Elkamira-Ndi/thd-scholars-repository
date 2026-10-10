import {
  migrateTestDatabase,
  recreateTestDatabase,
  resolveTestDatabaseInfo,
} from './test-database';

export default async function setup(): Promise<void> {
  process.env.DATABASE_URL = resolveTestDatabaseInfo().url;
  await recreateTestDatabase();
  await migrateTestDatabase();
}
