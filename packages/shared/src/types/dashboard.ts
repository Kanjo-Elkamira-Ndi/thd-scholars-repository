import type { AuditAction, AuditTargetType } from '../constants/audit';
import type { DisciplineTag, Role } from './enums';
import type { ContentPost, RosterEntry } from './entities';

export interface DashboardActivityItem {
  action: AuditAction;
  actorUserId: string | null;
  targetType: AuditTargetType;
  createdAt: string;
}

export interface ContentByDiscipline {
  discipline: DisciplineTag;
  count: number;
}

export interface ScholarDashboard {
  role: 'scholar';
  roster: RosterEntry | null;
  recentContent: ContentPost[];
}

export interface FacultyDashboard {
  role: 'faculty';
  myContentCount: number;
  failedDeliveries: number;
  recentContent: ContentPost[];
}

export interface RegistrarDashboard {
  role: 'registrar';
  totalScholars: number;
  pendingAccessReviews: number;
  myPendingAccessReviews: number;
  rosterAuditIssues: number;
}

export interface AdminDashboard {
  role: 'admin';
  totalScholars: number;
  pendingJoinRequests: number;
  pendingAccessReviews: number;
  contentByDiscipline: ContentByDiscipline[];
  recentActivity: DashboardActivityItem[];
}

export type DashboardPayload =
  | ScholarDashboard
  | FacultyDashboard
  | RegistrarDashboard
  | AdminDashboard;

export type DashboardRole = Role;
