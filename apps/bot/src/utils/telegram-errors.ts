const GONE_MARKERS = ['hide_requester_missing', 'user_already_participant', 'no join request'];
const MESSAGE_GONE_MARKERS = ['message to delete not found', 'message not found'];
const USER_NOT_IN_CHAT_MARKERS = [
  'user not found',
  'user_not_participant',
  'participant not found',
  'chat member not found',
];

const extractDescription = (err: unknown): string => {
  if (typeof err !== 'object' || err === null) {
    return typeof err === 'string' ? err : '';
  }
  const candidate = err as {
    description?: unknown;
    message?: unknown;
    response?: { description?: unknown };
  };
  const parts = [candidate.description, candidate.response?.description, candidate.message];
  return parts.filter((part): part is string => typeof part === 'string').join(' ');
};

export const isJoinRequestGone = (err: unknown): boolean => {
  const description = extractDescription(err).toLowerCase();
  if (description === '') {
    return false;
  }
  return GONE_MARKERS.some((marker) => description.includes(marker));
};

export const isMessageGone = (err: unknown): boolean => {
  const description = extractDescription(err).toLowerCase();
  if (description === '') {
    return false;
  }
  return MESSAGE_GONE_MARKERS.some((marker) => description.includes(marker));
};

export const isUserNotInChat = (err: unknown): boolean => {
  const description = extractDescription(err).toLowerCase();
  if (description === '') {
    return false;
  }
  return USER_NOT_IN_CHAT_MARKERS.some((marker) => description.includes(marker));
};
