export const ROLES = ['scholar', 'faculty', 'registrar', 'admin'] as const;

export type Role = (typeof ROLES)[number];

export type RosterStatus = 'active' | 'graduated' | 'withdrawn' | 'pending';

export type JoinRequestStatus = 'approved' | 'declined' | 'pending';

export type JoinRequestDeliveryStatus = 'pending' | 'processing' | 'delivered' | 'failed';

export type ContentFormat = 'audio_lecture' | 'video_seminar' | 'ebook' | 'research_pdf';

export type ContentAction = 'publish' | 'delete';

export type ContentDeliveryStatus = 'pending' | 'processing' | 'posted' | 'failed';

export type DisciplineTag =
  | 'SystematicTheology'
  | 'BiblicalStudies'
  | 'HistoricalTheology'
  | 'PracticalTheology'
  | 'Hermeneutics'
  | 'Missiology'
  | 'Apologetics';

export type RegistrationDecision = Exclude<JoinRequestStatus, 'pending'>;

export type MemberRemovalStatus = 'pending' | 'processing' | 'done' | 'failed' | 'cancelled';

export type MemberRemovalInitiator = 'admin' | 'registrar';

export type NotificationStatus = 'pending' | 'processing' | 'sent' | 'failed';

export type JobRunStatus = 'started' | 'completed' | 'failed';

export type NotificationEvent =
  | 'role_changed'
  | 'member_removal_requested'
  | 'audit_flagged'
  | 'access_review_reminder'
  | 'repeated_registration_failure';
