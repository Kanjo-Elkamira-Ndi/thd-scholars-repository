import type { NotificationEvent, Role } from '@thd/shared';

export interface NotificationRenderInput {
  event: NotificationEvent;
  payload: Record<string, unknown>;
}

export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const ROLE_LABELS: Record<Role, string> = {
  scholar: 'Scholar',
  faculty: 'Faculty',
  registrar: 'Registrar',
  admin: 'Admin',
};

const roleLabel = (value: unknown): string =>
  typeof value === 'string' && value in ROLE_LABELS ? ROLE_LABELS[value as Role] : 'a new role';

const countValue = (payload: Record<string, unknown>, key: string): number => {
  const value = payload[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
};

const plural = (count: number, singular: string, pluralForm: string): string =>
  count === 1 ? singular : pluralForm;

export const renderNotification = ({ event, payload }: NotificationRenderInput): string => {
  switch (event) {
    case 'role_changed':
      return `Your role has been updated to <b>${roleLabel(payload.to)}</b> (previously ${roleLabel(payload.from)}).`;
    case 'member_removal_requested':
      return 'A member removal has been requested for your account. If you believe this is a mistake, contact an Admin.';
    case 'audit_flagged': {
      const total = countValue(payload, 'total');
      return `The quarterly roster audit flagged <b>${total}</b> ${plural(total, 'record', 'records')} needing review.`;
    }
    case 'access_review_reminder': {
      const count = countValue(payload, 'count');
      return `${count} ${plural(count, 'scholar still has', 'scholars still have')} a pending access review.`;
    }
    case 'repeated_registration_failure': {
      const count = countValue(payload, 'failureCount');
      return `Repeated registration failures detected: <b>${count}</b> ${plural(count, 'attempt', 'attempts')} from the same person in the last window.`;
    }
    default:
      return 'You have a new notification.';
  }
};
