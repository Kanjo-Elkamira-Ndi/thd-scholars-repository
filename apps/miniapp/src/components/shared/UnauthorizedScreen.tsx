import { ShieldAlert } from 'lucide-react';

/**
 * Shown when the API rejects us as unauthenticated (401) — e.g. the Mini App
 * was opened outside Telegram in a build where mocking is disabled.
 */
export function UnauthorizedScreen() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-card px-6 py-10 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-destructive/15 text-destructive">
        <ShieldAlert className="size-5" aria-hidden="true" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-semibold">Sign-in required</p>
        <p className="text-sm text-muted-foreground">
          Open this Mini App from Telegram to verify your identity. If you are developing locally,
          set <code className="font-mono text-xs">VITE_MOCK_USER</code> and enable the API mock.
        </p>
      </div>
    </div>
  );
}
