import { beforeEach, describe, expect, it } from 'vitest';
import pool from '../db/pool';
import { createUser, insertRosterRow } from '../db/testing/fixtures';
import { resetTestDatabase } from '../db/testing/test-database';
import { createRosterEntry, listRoster, updateRosterEntry } from './roster.service';

beforeEach(resetTestDatabase);

describe('roster service (integration)', () => {
  it('creates an entry and writes a create_roster_entry audit log', async () => {
    const registrar = await createUser(2111111111, 'registrar');

    const entry = await createRosterEntry({
      actorUserId: registrar.id,
      input: { registrationId: 'DIBI-THD-0101', cohortYear: 2025, programTrack: 'Theology' },
    });

    expect(entry).toMatchObject({
      registrationId: 'DIBI-THD-0101',
      cohortYear: 2025,
      programTrack: 'Theology',
      status: 'pending',
      accessReviewPending: false,
      supervisorName: null,
    });

    const audit = await pool.query<{ action: string; target_type: string }>(
      `SELECT action, target_type FROM audit_logs WHERE target_type = 'roster'`,
    );
    expect(audit.rows[0].action).toBe('create_roster_entry');
  });

  it('maps a duplicate registration_id to CONFLICT', async () => {
    const registrar = await createUser(2111111112, 'registrar');
    await createRosterEntry({
      actorUserId: registrar.id,
      input: { registrationId: 'DIBI-THD-0101', cohortYear: 2025, programTrack: 'Theology' },
    });

    await expect(
      createRosterEntry({
        actorUserId: registrar.id,
        input: { registrationId: 'DIBI-THD-0101', cohortYear: 2025, programTrack: 'Theology' },
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });
  });

  it('lists and searches by registrationId, linked full_name, and filters/pagination', async () => {
    const scholar = await createUser(2111111113, 'scholar');
    await insertRosterRow({ registrationId: 'DIBI-THD-0201', status: 'active', cohortYear: 2025 });
    await insertRosterRow({
      registrationId: 'DIBI-THD-0202',
      status: 'graduated',
      cohortYear: 2024,
      userId: scholar.id,
    });
    await insertRosterRow({ registrationId: 'DIBI-THD-0203', status: 'active', cohortYear: 2025 });

    const byRegId = await listRoster({ search: '0201', page: 1, pageSize: 20 });
    expect(byRegId.items.map((i) => i.registrationId)).toEqual(['DIBI-THD-0201']);

    const byName = await listRoster({ search: 'Dev scholar', page: 1, pageSize: 20 });
    expect(byName.items.map((i) => i.registrationId)).toEqual(['DIBI-THD-0202']);

    const byStatus = await listRoster({ status: 'active', page: 1, pageSize: 20 });
    expect(byStatus.total).toBe(2);

    const byCohort = await listRoster({ cohortYear: 2024, page: 1, pageSize: 20 });
    expect(byCohort.items.map((i) => i.registrationId)).toEqual(['DIBI-THD-0202']);

    const paged = await listRoster({ page: 1, pageSize: 1 });
    expect(paged.items).toHaveLength(1);
    expect(paged.total).toBe(3);
  });

  it('flags access review on active→graduated and clears it on graduated→active', async () => {
    const registrar = await createUser(2111111114, 'registrar');
    const id = await insertRosterRow({ registrationId: 'DIBI-THD-0301', status: 'active' });

    const graduated = await updateRosterEntry({
      actorUserId: registrar.id,
      id,
      patch: { status: 'graduated' },
    });
    expect(graduated).toMatchObject({ status: 'graduated', accessReviewPending: true });
    expect(graduated?.accessReviewFlaggedAt).not.toBeNull();

    const flaggedAudit = await pool.query<{ action: string; details: Record<string, unknown> }>(
      `SELECT action, details FROM audit_logs WHERE action = 'update_roster_status' ORDER BY created_at DESC LIMIT 1`,
    );
    expect(flaggedAudit.rows[0].action).toBe('update_roster_status');
    expect(flaggedAudit.rows[0].details).toMatchObject({
      from: 'active',
      to: 'graduated',
      accessReviewPending: true,
    });

    const reactivated = await updateRosterEntry({
      actorUserId: registrar.id,
      id,
      patch: { status: 'active' },
    });
    expect(reactivated).toMatchObject({ status: 'active', accessReviewPending: false });
    expect(reactivated?.accessReviewFlaggedAt).toBeNull();

    const clearedRow = await pool.query<{ access_review_flagged_at: Date | null }>(
      'SELECT access_review_flagged_at FROM roster WHERE id = $1',
      [id],
    );
    expect(clearedRow.rows[0].access_review_flagged_at).toBeNull();
  });
});
