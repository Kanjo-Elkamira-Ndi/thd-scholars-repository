import type { RegistrationResult as RegistrationDecision } from '@thd/shared';
import { motion, useReducedMotion } from 'framer-motion';
import { Home, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { resultVariants } from '@/motion/transitions';
import { getRegistrarContact } from './contact';
import { SuccessMark } from './SuccessMark';

interface RegistrationResultProps {
  result: RegistrationDecision;
  onTryAgain: () => void;
}

export function RegistrationResult({ result, onTryAgain }: RegistrationResultProps) {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const approved = result.decision === 'approved';
  const contact = getRegistrarContact();

  return (
    <motion.div
      variants={resultVariants}
      initial={reduceMotion ? false : 'hidden'}
      animate="visible"
      className="flex flex-col items-center gap-4 text-center"
    >
      {approved ? (
        <SuccessMark />
      ) : (
        <span className="flex size-16 items-center justify-center rounded-full bg-destructive/15 text-destructive">
          <UserRound className="size-8" aria-hidden="true" />
        </span>
      )}

      <div className="space-y-2" aria-live="polite">
        <h1 className="text-lg font-semibold">
          {approved ? "You're approved" : "We couldn't approve this registration"}
        </h1>
        {approved ? (
          <p className="text-sm text-muted-foreground">
            Your details are on the roster. The bot is sending your channel invite — check your
            Telegram chats.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              This usually means your DIBI Registration ID wasn't found on the Registrar's roster,
              or your record isn't active.
            </p>
            {result.reason ? (
              <Card className="text-left">
                <CardContent className="p-3 text-sm">
                  <span className="text-muted-foreground">Reason: </span>
                  {result.reason}
                </CardContent>
              </Card>
            ) : null}
            {contact ? (
              <p className="text-sm text-muted-foreground">
                Need help? Contact the registrar at{' '}
                <a
                  className="font-medium text-primary underline underline-offset-4"
                  href={contact.href}
                >
                  {contact.label}
                </a>
              </p>
            ) : null}
          </>
        )}
      </div>

      {approved ? (
        <Button className="w-full" onClick={() => navigate('/')}>
          <Home className="size-4" aria-hidden="true" />
          Go to home
        </Button>
      ) : (
        <div className="flex w-full flex-col gap-2">
          <Button variant="secondary" className="w-full" onClick={onTryAgain}>
            Try again
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => navigate('/')}>
            Back to home
          </Button>
        </div>
      )}
    </motion.div>
  );
}
