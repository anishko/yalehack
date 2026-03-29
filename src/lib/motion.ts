// ─── Shared Motion Variants ──────────────────────────────────────────────────
// Central animation definitions for the entire app. All Framer Motion
// components reference these to keep motion language consistent.

export const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] },
  },
};

export const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3, ease: 'easeOut' } },
};

export const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};

export const cardHover = {
  rest: { scale: 1, y: 0, boxShadow: '0 1px 3px rgba(0,0,0,0.3)' },
  hover: {
    scale: 1.005,
    y: -2,
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] },
  },
};

export const springTransition = {
  type: 'spring' as const,
  stiffness: 280,
  damping: 30,
  mass: 0.8,
};

export const pageTransition = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
  transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] },
};

export const tabContent = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1], delay: 0.05 },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: 0.15 },
  },
};
