import type {
  AuditAction,
  AuditTargetType,
  ContentByDiscipline,
  DashboardPayload,
  DisciplineTag,
  User,
} from '@thd/shared';
import pool from '../db/pool';
import type { Db } from '../db/transaction';
import * as auditRepo from '../repositories/audit-logs.repository';
import * as contentRepo from '../repositories/content.repository';
import * as joinRepo from '../repositories/join-requests.repository';
import * as rosterRepo from '../repositories/roster.repository';

const PENDING_WINDOW_DAYS = 30;
const RECENT_LIMIT = 10;
const SCHOLAR_CONTENT_LIMIT = 10;

export const getDashboard = async (
  actor: Pick<User, 'id' | 'role'>,
  db: Db = pool,
): Promise<DashboardPayload> => {
  switch (actor.role) {
    case 'scholar': {
      const roster = await rosterRepo.getRosterByUserId(actor.id, db);
      const recentContent =
        roster?.status === 'active'
          ? await contentRepo.listRecentByAuthor(actor.id, SCHOLAR_CONTENT_LIMIT, db)
          : [];
      return { role: 'scholar', roster, recentContent };
    }
    case 'faculty': {
      const [myContentCount, failedDeliveries, recentContent] = await Promise.all([
        contentRepo.countByAuthor(actor.id, db),
        contentRepo.countFailedByAuthor(actor.id, db),
        contentRepo.listRecentByAuthor(actor.id, RECENT_LIMIT, db),
      ]);
      return { role: 'faculty', myContentCount, failedDeliveries, recentContent };
    }
    case 'registrar': {
      const [totalScholars, pendingAccessReviews, myPendingAccessReviews] = await Promise.all([
        rosterRepo.countActiveScholars(db),
        rosterRepo.countAccessReviewPending(db),
        rosterRepo.countAccessReviewPendingBy(actor.id, db),
      ]);
      return {
        role: 'registrar',
        totalScholars,
        pendingAccessReviews,
        myPendingAccessReviews,
        rosterAuditIssues: pendingAccessReviews,
      };
    }
    default: {
      const since = new Date(Date.now() - PENDING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
      const [totalScholars, pendingJoinRequests, pendingAccessReviews, disciplineRows, recent] =
        await Promise.all([
          rosterRepo.countActiveScholars(db),
          joinRepo.countPendingSince(since, db),
          rosterRepo.countAccessReviewPending(db),
          db.query<{ discipline_tag: string; count: string }>(
            `SELECT discipline_tag, count(*)::text AS count FROM content_posts
              WHERE deleted_at IS NULL GROUP BY discipline_tag ORDER BY discipline_tag`,
          ),
          auditRepo.listAuditLogs({ page: 1, pageSize: RECENT_LIMIT }, db),
        ]);

      return {
        role: 'admin',
        totalScholars,
        pendingJoinRequests,
        pendingAccessReviews,
        contentByDiscipline: disciplineRows.rows.map(
          (row): ContentByDiscipline => ({
            discipline: row.discipline_tag as DisciplineTag,
            count: Number(row.count),
          }),
        ),
        recentActivity: recent.logs.map((log) => ({
          action: log.action as AuditAction,
          actorUserId: log.actorUserId,
          targetType: log.targetType as AuditTargetType,
          createdAt: log.createdAt,
        })),
      };
    }
  }
};
