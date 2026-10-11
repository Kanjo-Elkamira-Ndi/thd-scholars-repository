export type Role = 'scholar' | 'faculty' | 'registrar' | 'admin';

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
