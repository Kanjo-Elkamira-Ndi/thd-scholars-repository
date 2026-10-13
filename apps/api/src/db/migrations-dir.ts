import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

export const containsMigrations = (dir: string): boolean =>
  existsSync(dir) && readdirSync(dir).some((entry) => entry.endsWith('.sql'));

export const pickMigrationsDir = (candidates: string[]): string => {
  const dir = candidates.find(containsMigrations);
  if (!dir) {
    throw new Error(
      `Migrations directory containing .sql files not found. Looked in: ${candidates.join(', ')}`,
    );
  }
  return dir;
};

export const defaultMigrationsDirCandidates = (): string[] => [
  path.join(__dirname, 'migrations'),
  path.join(__dirname, '..', '..', 'src', 'db', 'migrations'),
];

export const resolveMigrationsDir = (): string =>
  pickMigrationsDir(defaultMigrationsDirCandidates());
