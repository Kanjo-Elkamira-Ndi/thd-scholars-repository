import type { DashboardStats } from '@thd/shared';
import pool from '../db/pool';
import { listAuditLogs } from '../repositories/audit-logs.repository';

const countQuery = async (sql: string): Promise<number> => {
  const { rows } = await pool.query<{ count: string }>(sql);
  return Number(rows[0].count);
};

export const getDashboardStats = async (): Promise<DashboardStats> => {
  const [totalScholars, pendingJoinRequests, pendingAccessReviews, disciplineRows, recent] =
    await Promise.all([
      countQuery(
        `SELECT count(*)::text AS count FROM roster r JOIN users u ON u.id = r.user_id WHERE u.role = 'scholar'`,
      ),
      countQuery(`SELECT count(*)::text AS count FROM join_requests WHERE status = 'pending'`),
      countQuery(`SELECT count(*)::text AS count FROM roster WHERE access_review_pending = true`),
      pool.query<{ discipline_tag: string; count: string }>(
        `SELECT discipline_tag, count(*)::text AS count FROM content_posts
          WHERE deleted_at IS NULL
          GROUP BY discipline_tag
          ORDER BY discipline_tag`,
      ),
      listAuditLogs({ page: 1, pageSize: 10 }),
    ]);

  return {
    totalScholars,
    pendingJoinRequests,
    pendingAccessReviews,
    contentByDiscipline: disciplineRows.rows.map((row) => ({
      discipline: row.discipline_tag as DashboardStats['contentByDiscipline'][number]['discipline'],
      count: Number(row.count),
    })),
    recentActivity: recent.logs,
  };
};
