import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';

const appRoot = path.join(__dirname, '..');
const sourceDir = path.join(appRoot, 'src', 'db', 'migrations');
const targetDir = path.join(appRoot, 'dist', 'db', 'migrations');

if (!existsSync(sourceDir)) {
  console.error(`Migration source directory not found: ${sourceDir}`);
  process.exit(1);
}

mkdirSync(targetDir, { recursive: true });

const migrations = readdirSync(sourceDir).filter((entry) => entry.endsWith('.sql'));
for (const migration of migrations) {
  cpSync(path.join(sourceDir, migration), path.join(targetDir, migration));
}

console.log(`Copied ${migrations.length} migration file(s) to ${path.relative(appRoot, targetDir)}`);
