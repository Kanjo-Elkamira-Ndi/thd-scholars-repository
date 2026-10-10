import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';

loadEnv({ path: path.join(__dirname, '..', '..', '..', '.env') });

export interface TestDbInfo {
  url: string;
  databaseName: string;
  adminUrl: string;
}

const quoteIdent = (name: string): string => `"${name.replace(/"/g, '""')}"`;

export const resolveTestDatabaseInfo = (): TestDbInfo => {
  const base = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!base) throw new Error('DATABASE_URL is required to derive the test database');
  const parsed = new URL(base);
  const source = parsed.pathname.replace(/^\//, '');
  const databaseName = source.endsWith('_test') ? source : `${source}_test`;
  if (!databaseName.endsWith('_test')) {
    throw new Error(`Refusing to use non-test database "${databaseName}"`);
  }
  const url = new URL(base);
  url.pathname = `/${databaseName}`;
  const adminUrl = new URL(base);
  adminUrl.pathname = '/postgres';
  return { url: url.toString(), databaseName, adminUrl: adminUrl.toString() };
};

const resolveMigrationsDir = (): string => {
  const candidates = [
    path.join(__dirname, '..', 'migrations'),
    path.join(__dirname, '..', '..', '..', 'src', 'db', 'migrations'),
  ];
  const dir = candidates.find((candidate) => existsSync(candidate));
  if (!dir) throw new Error(`Migrations directory not found: ${candidates.join(', ')}`);
  return dir;
};

export const recreateTestDatabase = async (): Promise<void> => {
  const { adminUrl, databaseName } = resolveTestDatabaseInfo();
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS ${quoteIdent(databaseName)} WITH (FORCE)`);
    await client.query(`CREATE DATABASE ${quoteIdent(databaseName)}`);
  } finally {
    await client.end();
  }
};

export const migrateTestDatabase = async (): Promise<void> => {
  const { url } = resolveTestDatabaseInfo();
  const dir = resolveMigrationsDir();
  const files = (await readdir(dir))
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    for (const file of files) {
      const sql = await readFile(path.join(dir, file), 'utf8');
      await client.query(sql);
    }
  } finally {
    await client.end();
  }
};

export const resetTestDatabase = async (): Promise<void> => {
  const { url } = resolveTestDatabaseInfo();
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rows: settings } = await client.query<{ key: string; value: string }>(
      'SELECT key, value::text AS value FROM settings',
    );
    await client.query(
      'TRUNCATE users, roster, join_requests, invite_links, content_posts, audit_logs RESTART IDENTITY CASCADE',
    );
    for (const row of settings) {
      await client.query('INSERT INTO settings (key, value) VALUES ($1, $2::jsonb)', [
        row.key,
        row.value,
      ]);
    }
  } finally {
    await client.end();
  }
};
