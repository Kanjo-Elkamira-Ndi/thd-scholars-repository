import { ErrorState } from '@/components/shared/ErrorState';
import { CardSkeleton } from '@/components/shared/LoadingSkeletons';
import { PageTransition } from '@/components/shared/PageTransition';
import { useMe } from '@/hooks/use-me';
import { useTelegramUser } from '@/hooks/use-telegram';
import { formatTelegramName } from '@/lib/telegram';
import { ProfileCard } from './ProfileCard';
import { RoleActions } from './RoleActions';
import { StatusCard } from './StatusCard';

export function HomeScreen() {
  const { data, isPending, isError, refetch } = useMe();
  const telegramUser = useTelegramUser();

  if (isPending) {
    return (
      <div className="space-y-4">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorState
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  const name = data.user.fullName || formatTelegramName(telegramUser);
  const handle = data.user.telegramUsername
    ? `@${data.user.telegramUsername}`
    : telegramUser?.username
      ? `@${telegramUser.username}`
      : null;

  return (
    <PageTransition className="space-y-4">
      <ProfileCard name={name} handle={handle} role={data.user.role} />
      <StatusCard roster={data.roster} />
      <RoleActions role={data.user.role} />
    </PageTransition>
  );
}
