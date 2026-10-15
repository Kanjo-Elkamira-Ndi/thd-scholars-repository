import type {
  ContentAction,
  ContentDeliveryStatus,
  ContentFormat,
  DisciplineTag,
  JoinRequestDeliveryStatus,
  JoinRequestStatus,
  MemberRemovalInitiator,
  MemberRemovalStatus,
  NotificationEvent,
  NotificationStatus,
  JobRunStatus,
  Role,
  RosterStatus,
} from './enums';

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
  chatId: number | null;
  telegramUserId: number | null;
  joinRequestedAt: string | null;
  deliveryStatus: JoinRequestDeliveryStatus;
  deliveryAttempts: number;
  nextAttemptAt: string | null;
  deliveredAt: string | null;
  deliveryError: string | null;
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
  pendingAction: ContentAction;
  deliveryStatus: ContentDeliveryStatus;
  deliveryAttempts: number;
  deletedAt: string | null;
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

export interface ChannelMembership {
  isMember: boolean;
  memberStatus: string | null;
  checkedAt: string;
}

export interface MemberRemoval {
  id: string;
  userId: string;
  requestedBy: string | null;
  initiatedByRole: MemberRemovalInitiator;
  reason: string | null;
  status: MemberRemovalStatus;
  attempts: number;
  nextAttemptAt: string | null;
  claimedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  processedAt: string | null;
}

export interface MemberSummary {
  user: {
    id: string;
    telegramId: number;
    fullName: string;
    role: Role;
  };
  roster: {
    registrationId: string;
    status: RosterStatus;
    cohortYear: number;
  } | null;
  membership: ChannelMembership | null;
}

export type RosterAuditIssue =
  | 'active_not_member'
  | 'inactive_still_member'
  | 'membership_unknown';

export interface RosterAuditEntry {
  roster: {
    id: string;
    userId: string;
    registrationId: string;
    status: RosterStatus;
    cohortYear: number;
  };
  membership: ChannelMembership | null;
  issue: RosterAuditIssue;
}

export interface Notification {
  id: string;
  recipientUserId: string;
  event: NotificationEvent;
  payload: Record<string, unknown>;
  dedupeKey: string;
  status: NotificationStatus;
  attempts: number;
  nextAttemptAt: string | null;
  claimedAt: string | null;
  sentAt: string | null;
  lastError: string | null;
  createdAt: string;
}

export interface JobRun {
  id: string;
  job: string;
  runKey: string;
  status: JobRunStatus;
  details: Record<string, unknown> | null;
  lastError: string | null;
  startedAt: string;
  finishedAt: string | null;
}
