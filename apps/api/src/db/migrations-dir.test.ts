import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { pickMigrationsDir, resolveMigrationsDir } from './migrations-dir';

const created: string[] = [];

const makeDir = (files: string[]): string => {
  const dir = mkdtempSync(path.join(tmpdir(), 'thd-migrations-'));
  created.push(dir);
  for (const file of files) writeFileSync(path.join(dir, file), '');
  return dir;
};

const sqlFiles = (dir: string): string[] =>
  readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('pickMigrationsDir', () => {
  it('skips an existing directory that contains no .sql migrations', () => {
    const staleDist = makeDir([]);
    const sqlDir = makeDir(['0001_init_users_roster.sql']);

    expect(pickMigrationsDir([staleDist, sqlDir])).toBe(sqlDir);
  });

  it('throws when no candidate contains any .sql migration', () => {
    const staleDist = makeDir([]);
    const emptySource = makeDir(['migrate.js']);

    expect(() => pickMigrationsDir([staleDist, emptySource])).toThrow(/migrations/i);
  });
});

describe('resolveMigrationsDir', () => {
  it('resolves to a directory that actually contains .sql migrations', () => {
    expect(sqlFiles(resolveMigrationsDir()).length).toBeGreaterThan(0);
  });

  it('exposes every migration shipped in src/db/migrations', () => {
    const srcDir = path.join(__dirname, 'migrations');

    expect(sqlFiles(resolveMigrationsDir())).toEqual(sqlFiles(srcDir));
  });
});
