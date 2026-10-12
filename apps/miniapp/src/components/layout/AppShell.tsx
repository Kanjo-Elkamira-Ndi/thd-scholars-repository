import { Outlet } from 'react-router';
import { BottomNav } from '@/components/shared/BottomNav';
import { AppHeader } from '@/components/shared/AppHeader';
import { useTheme } from '@/hooks/use-telegram';

/**
 * The Mini App chrome: theme sync, sticky header, scrollable content, tab bar.
 * Constrained to a phone-width column so it reads well inside Telegram desktop too.
 */
export function AppShell() {
  useTheme();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background">
      <AppHeader />
      <main className="flex-1 px-4 pb-28 pt-4">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
