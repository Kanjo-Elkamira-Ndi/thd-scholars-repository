import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { pageVariants } from '@/motion/transitions';
import { cn } from '@/lib/utils';

/** Wraps route content with the shared, reduced-motion-aware page transition. */
export function PageTransition({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={pageVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className={cn(className)}
    >
      {children}
    </motion.div>
  );
}
