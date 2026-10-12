import type { Transition, Variants } from 'framer-motion';

/** Snappy, restrained spring — institutional, not playful. */
export const springSoft: Transition = {
  type: 'spring',
  stiffness: 320,
  damping: 30,
  mass: 0.9,
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.18, ease: 'easeOut' } },
};

/** Shared page transition used by every route. */
export const pageVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: springSoft },
  exit: { opacity: 0, y: -6, transition: { duration: 0.14, ease: 'easeIn' } },
};

/** Staggered list/grid reveal for cards. */
export const listVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

export const listItemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: springSoft },
};
