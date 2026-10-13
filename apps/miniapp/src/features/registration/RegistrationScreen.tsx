import type { RegistrationResult } from '@thd/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PageTransition } from '@/components/shared/PageTransition';
import { ScreenSkeleton } from '@/components/shared/LoadingSkeletons';
import { meQueryKey, useMe } from '@/hooks/use-me';
import { useTelegramUser } from '@/hooks/use-telegram';
import { AlreadyRegisteredCard } from './AlreadyRegisteredCard';
import { RegistrationForm } from './RegistrationForm';
import { RegistrationResult as RegistrationResultPanel } from './RegistrationResult';

export function RegistrationScreen() {
  const { data } = useMe();
  const telegramUser = useTelegramUser();
  const queryClient = useQueryClient();
  const [result, setResult] = useState<RegistrationResult | null>(null);
  const [showFormForActive, setShowFormForActive] = useState(false);

  if (!data) return <ScreenSkeleton />;

  const defaultTelegramUsername = data.user.telegramUsername ?? telegramUser?.username ?? '';

  if (result) {
    return <RegistrationResultPanel result={result} onTryAgain={() => setResult(null)} />;
  }

  if (data.roster?.status === 'active' && !showFormForActive) {
    return (
      <AlreadyRegisteredCard roster={data.roster} onUpdate={() => setShowFormForActive(true)} />
    );
  }

  return (
    <PageTransition>
      <RegistrationForm
        defaultFullName={data.user.fullName}
        defaultTelegramUsername={defaultTelegramUsername}
        onSuccess={(next) => {
          setResult(next);
          if (next.decision === 'approved') {
            void queryClient.invalidateQueries({ queryKey: meQueryKey });
          }
        }}
      />
    </PageTransition>
  );
}
