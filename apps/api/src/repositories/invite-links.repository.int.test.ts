import { beforeEach, describe, expect, it } from 'vitest';
import pool from '../db/pool';
import { createUser } from '../db/testing/fixtures';
import { resetTestDatabase } from '../db/testing/test-database';
import {
  listActiveInviteLinksForUser,
  revokeActiveInviteLinksForUser,
} from './invite-links.repository';

beforeEach(resetTestDatabase);

const insertInviteLink = async (
  userId: string,
  link: string,
  options: { used?: boolean; expiresInHours?: number } = {},
): Promise<string> => {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO invite_links (link, created_for_user_id, expires_at, used)
     VALUES ($1, $2, now() + make_interval(hours => $3), $4) RETURNING id`,
    [link, userId, options.expiresInHours ?? 24, options.used ?? false],
  );
  return rows[0].id;
};

describe('invite-links repository', () => {
  it('lists only active links', async () => {
    const user = await createUser(9301, 'scholar');
    await insertInviteLink(user.id, 'https://t.me/+used', { used: true });
    const activeId = await insertInviteLink(user.id, 'https://t.me/+active');
    await insertInviteLink(user.id, 'https://t.me/+expired', { expiresInHours: -1 });

    const links = await listActiveInviteLinksForUser(user.id);

    expect(links).toHaveLength(1);
    expect(links[0].id).toBe(activeId);
  });

  it('revokes active links and is idempotent', async () => {
    const user = await createUser(9302, 'scholar');
    await insertInviteLink(user.id, 'https://t.me/+one');
    await insertInviteLink(user.id, 'https://t.me/+two');

    const revoked = await revokeActiveInviteLinksForUser(user.id);
    expect(revoked).toHaveLength(2);

    const again = await revokeActiveInviteLinksForUser(user.id);
    expect(again).toHaveLength(0);
    expect(await listActiveInviteLinksForUser(user.id)).toHaveLength(0);
  });
});
