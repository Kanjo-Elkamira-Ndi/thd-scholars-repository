import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from '@thd/shared';

const SRC_ROOT = join(__dirname, '..');

const walk = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith('.ts') && !full.endsWith('.test.ts') && !full.endsWith('.int.test.ts')) {
      out.push(full);
    }
  }
  return out;
};

const ACTIONS = new Set<string>(Object.values(AUDIT_ACTIONS));
const TARGETS = new Set<string>(Object.values(AUDIT_TARGET_TYPES));

describe('audit enum consistency (source scan)', () => {
  it('no audit action/target literal is used that is absent from the shared enums', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC_ROOT)) {
      const source = readFileSync(file, 'utf8');
      const patterns: Array<[RegExp, Set<string>, string]> = [
        [/\b(?:action|ACTION)\s*[:=]\s*'([a-z_]+)'/g, ACTIONS, 'action'],
        [/\b(?:targetType|TARGET_TYPE)\s*[:=]\s*'([a-z_]+)'/g, TARGETS, 'targetType'],
      ];
      for (const [regex, allowed, label] of patterns) {
        for (const match of source.matchAll(regex)) {
          const value = match[1];
          if (!allowed.has(value)) {
            offenders.push(`${relative(SRC_ROOT, file)}: ${label} '${value}' not in enum`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
