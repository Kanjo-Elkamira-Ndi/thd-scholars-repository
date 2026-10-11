import type { RegistrationDecision } from './enums';

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
