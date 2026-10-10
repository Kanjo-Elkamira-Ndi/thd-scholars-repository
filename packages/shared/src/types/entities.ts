import type { ContentFormat, DisciplineTag, JoinRequestStatus, Role, RosterStatus } from './enums';

export interface User {
  id: string;
  telegramId: number;
  telegramUsername: string | null;
  fullName: string;
  email: string | null;
  role: Role;
  createdAt: string;
  updatedAt: string;
}

export interface RosterEntry {
  id: string;
  userId: string | null;
  registrationId: string;
  cohortYear: number;
  programTrack: string;
  supervisorName: string | null;
  status: RosterStatus;
  accessReviewPending: boolean;
  accessReviewFlaggedAt: string | null;
  updatedBy: string | null;
  updatedAt: string;
  createdAt: string;
}

export interface JoinRequest {
  id: string;
  userId: string;
  status: JoinRequestStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  reason: string | null;
  createdAt: string;
}

export interface InviteLink {
  id: string;
  link: string;
  createdForUserId: string;
  expiresAt: string;
  used: boolean;
  createdAt: string;
}

export interface ContentPost {
  id: string;
  title: string;
  disciplineTag: DisciplineTag;
  formatTag: ContentFormat;
  cohortTag: number | null;
  postedBy: string;
  telegramMessageId: number | null;
  driveLink: string | null;
  fileSizeBytes: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface UserStatusResponse {
  user: User;
  roster: RosterEntry | null;
}
