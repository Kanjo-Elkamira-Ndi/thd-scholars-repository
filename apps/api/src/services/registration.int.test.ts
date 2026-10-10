import { beforeEach, describe, expect, it } from 'vitest';
import pool from '../db/pool';
import { createUser, insertRosterRow } from '../db/testing/fixtures';
import { resetTestDatabase } from '../db/testing/test-database';
import { submitRegistration } from './registration.service';

const payload = {
  fullName: 'Dev Scholar',
  registrationId: 'DIBI-THD-0042',
  cohortYear: 2025,
  email: 'dev@example.com',
  telegramUsername: 'dev_scholar',
  programTrack: 'Theology',
  declarationAccepted: true,
};

beforeEach(resetTestDatabase);

describe('submitRegistration (integration)', () => {
  it('approves an active match and writes join_request + audit_log', async () => {
    const user = await createUser(1111111111, 'scholar');
    const rosterId = await insertRosterRow({ registrationId: 'DIBI-THD-0042', status: 'active' });

    const result = await submitRegistration({ user, payload });

    expect(result).toEqual({ decision: 'approved', reason: null });

    const jr = await pool.query<{ status: string; decided_by: string | null }>(
      'SELECT status, decided_by FROM join_requests WHERE user_id = $1',
      [user.id],
    );
    expect(jr.rows).toHaveLength(1);
    expect(jr.rows[0].status).toBe('approved');
    expect(jr.rows[0].decided_by).toBeNull();

    const audit = await pool.query<{ action: string; target_id: string }>(
      `SELECT action, target_id FROM audit_logs WHERE target_type = 'join_requests'`,
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].action).toBe('approve_join_request');
    expect(audit.rows[0].target_id).toBe(jr.rows[0].status ? audit.rows[0].target_id : '');

    const roster = await pool.query<{ user_id: string | null }>(
      'SELECT user_id FROM roster WHERE id = $1',
      [rosterId],
    );
    expect(roster.rows[0].user_id).toBe(user.id);

    const updatedUser = await pool.query<{ email: string | null; full_name: string }>(
      'SELECT email, full_name FROM users WHERE id = $1',
      [user.id],
    );
    expect(updatedUser.rows[0].email).toBe('dev@example.com');
    expect(updatedUser.rows[0].full_name).toBe('Dev Scholar');
  });

  it('declines when there is no matching roster entry', async () => {
    const user = await createUser(1111111112, 'scholar');

    const result = await submitRegistration({ user, payload });

    expect(result).toEqual({ decision: 'declined', reason: 'No matching roster entry found' });

    const jr = await pool.query<{ status: string; reason: string }>(
      'SELECT status, reason FROM join_requests WHERE user_id = $1',
      [user.id],
    );
    expect(jr.rows[0].status).toBe('declined');
    expect(jr.rows[0].reason).toBe('No matching roster entry found');

    const audit = await pool.query<{ action: string }>(
      `SELECT action FROM audit_logs WHERE target_type = 'join_requests'`,
    );
    expect(audit.rows[0].action).toBe('decline_join_request');
  });

  it.each(['pending', 'graduated', 'withdrawn'] as const)(
    'declines a non-active match (status: %s) without stamping the profile',
    async (status) => {
      const user = await createUser(1222222222 + status.length, 'scholar');
      await insertRosterRow({ registrationId: 'DIBI-THD-0042', status });

      const result = await submitRegistration({ user, payload });

      expect(result).toEqual({
        decision: 'declined',
        reason: `Roster record is not active (status: ${status})`,
      });

      const stamped = await pool.query<{ email: string | null }>(
        'SELECT email FROM users WHERE id = $1',
        [user.id],
      );
      expect(stamped.rows[0].email).toBeNull();
    },
  );

  it('throws VALIDATION_ERROR and writes nothing for an invalid payload', async () => {
    const user = await createUser(1333333333, 'scholar');
    await insertRosterRow({ registrationId: 'DIBI-THD-0042', status: 'active' });

    await expect(
      submitRegistration({ user, payload: { ...payload, registrationId: 'bad-id' } }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', status: 400 });

    const { rows } = await pool.query('SELECT id FROM join_requests');
    expect(rows).toHaveLength(0);
  });
});
