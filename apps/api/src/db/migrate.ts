import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import pool from './pool';

const resolveMigrationsDir = (): string => {
  const candidates = [
    path.join(__dirname, 'migrations'),
    path.join(__dirname, '..', '..', 'src', 'db', 'migrations'),
  ];
  const dir = candidates.find((candidate) => existsSync(candidate));
  if (!dir) {
    throw new Error(`Migrations directory not found. Looked in: ${candidates.join(', ')}`);
  }
  return dir;
};

const main = async (): Promise<void> => {
  const dir = resolveMigrationsDir();

  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);

  const { rows } = await pool.query<{ name: string }>('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map((row) => row.name));

  const files = (await readdir(dir))
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));

  const client = await pool.connect();
  try {
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`skip ${file} (already applied)`);
        continue;
      }
      const sql = await readFile(path.join(dir, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Migration ${file} failed and was rolled back: ${message}`, {
          cause: error,
        });
      }
      console.log(`applied ${file}`);
    }
  } finally {
    client.release();
  }

  console.log('All migrations are up to date.');
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
