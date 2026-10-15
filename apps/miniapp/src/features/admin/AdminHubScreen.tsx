import { Settings, ShieldCheck, UserCog, Users } from 'lucide-react';
import { ActionCard } from '@/components/shared/ActionCard';
import { PageTransition } from '@/components/shared/PageTransition';
import { ADMIN_COPY } from './labels';

const CARDS = [
  {
    to: '/admin/users',
    title: ADMIN_COPY.hubUsers,
    description: ADMIN_COPY.hubUsersDescription,
    icon: Users,
  },
  {
    to: '/admin/members',
    title: ADMIN_COPY.hubMembers,
    description: ADMIN_COPY.hubMembersDescription,
    icon: UserCog,
  },
  {
    to: '/admin/audit',
    title: ADMIN_COPY.hubAudit,
    description: ADMIN_COPY.hubAuditDescription,
    icon: ShieldCheck,
  },
  {
    to: '/admin/settings',
    title: ADMIN_COPY.hubSettings,
    description: ADMIN_COPY.hubSettingsDescription,
    icon: Settings,
  },
];

/** Administrative hub: large tap targets into the four admin tools. */
export default function AdminHubScreen() {
  return (
    <PageTransition className="space-y-3">
      {CARDS.map((card) => (
        <ActionCard key={card.to} {...card} />
      ))}
    </PageTransition>
  );
}
