import { beforeEach, describe, expect, it } from 'vitest';
import pool from '../pool';
import { resetTestDatabase } from '../testing/test-database';
import { createUser } from '../testing/fixtures';

beforeEach(resetTestDatabase);

describe('migration 0010 admin membership', () => {
  it('creates channel_membership and member_removals', async () => {
    const { rows } = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_name IN ('channel_membership', 'member_removals')`,
    );
    expect(rows.map((row) => row.table_name).sort()).toEqual(['channel_membership', 'member_removals']);
  });

  it('adds revoked_at to invite_links', async () => {
    const { rows } = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'invite_links'`,
    );
    expect(rows.map((row) => row.column_name)).toContain('revoked_at');
  });

  it('enforces a single open removal per user', async () => {
    const user = await createUser(7001, 'scholar');
    await pool.query(
      `INSERT INTO member_removals (user_id, initiated_by_role) VALUES ($1, 'admin')`,
      [user.id],
    );
    await expect(
      pool.query(`INSERT INTO member_removals (user_id, initiated_by_role) VALUES ($1, 'admin')`, [
        user.id,
      ]),
    ).rejects.toThrow();
  });
});

describe('audit_logs immutability', () => {
  it('rejects updates to an existing audit log', async () => {
    const user = await createUser(7002, 'admin');
    await pool.query(
      `INSERT INTO audit_logs (actor_user_id, action, target_type) VALUES ($1, 'x', 'users')`,
      [user.id],
    );
    await expect(pool.query(`UPDATE audit_logs SET action = 'y'`)).rejects.toThrow(/immutable/i);
  });

  it('rejects deletes of audit logs', async () => {
    const user = await createUser(7003, 'admin');
    await pool.query(
      `INSERT INTO audit_logs (actor_user_id, action, target_type) VALUES ($1, 'x', 'users')`,
      [user.id],
    );
    await expect(pool.query(`DELETE FROM audit_logs`)).rejects.toThrow(/immutable/i);
  });
});
