const GONE_MARKERS = ['hide_requester_missing', 'user_already_participant', 'no join request'];

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
