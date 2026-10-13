import { Check } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { successPop } from '@/motion/transitions';

/** Animated approved-registration mark: a springing disc with one soft ring pulse. */
export function SuccessMark() {
  const reduceMotion = useReducedMotion();

  return (
    <div aria-hidden="true" className="relative flex size-20 items-center justify-center">
      {reduceMotion ? null : (
        <motion.span
          initial={{ opacity: 0.35, scale: 0.7 }}
          animate={{ opacity: 0, scale: 1.7 }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
          className="absolute inset-0 rounded-full bg-success/30"
        />
      )}
      <motion.span
        variants={successPop}
        initial="hidden"
        animate="visible"
        className="flex size-16 items-center justify-center rounded-full bg-success text-success-foreground"
      >
        <Check className="size-8" strokeWidth={3} aria-hidden="true" />
      </motion.span>
    </div>
  );
}
