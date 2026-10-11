import type {
  ContentAction,
  ContentFormat,
  DisciplineTag,
  RegistrationDecision,
} from './enums';

export interface JoinRequestDeliveryTask {
  id: string;
  decision: RegistrationDecision;
  reason: string | null;
  telegramId: number;
  telegramUserId: number;
  fullName: string;
  chatId: number | null;
  attempts: number;
}

export interface ClaimJoinRequestsResponse {
  items: JoinRequestDeliveryTask[];
  inviteLinkExpirySeconds: number;
}

export interface ContentDeliveryTask {
  id: string;
  action: ContentAction;
  title: string;
  disciplineTag: DisciplineTag;
  formatTag: ContentFormat;
  cohortTag: number | null;
  telegramMessageId: number | null;
  driveLink: string | null;
  hasStagedFile: boolean;
  stagedMimeType: string | null;
  stagedOriginalName: string | null;
}

export interface ClaimContentTasksResponse {
  items: ContentDeliveryTask[];
}

export interface MembershipReconcileTarget {
  userId: string;
  telegramId: number;
}

export interface MembershipSnapshotEntry {
  telegramId: number;
  isMember: boolean;
  memberStatus: string | null;
}

export interface MemberRemovalTask {
  id: string;
  userId: string;
  telegramId: number;
  attempts: number;
}

export interface ClaimMemberRemovalsResponse {
  items: MemberRemovalTask[];
}

export interface MembershipReconcileTargetsResponse {
  targets: MembershipReconcileTarget[];
}
