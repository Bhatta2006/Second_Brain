"use client";

import { motion, type Variants, type HTMLMotionProps } from "framer-motion";
import { forwardRef } from "react";

/* ───────────────────────────────────────────────────────────────────────────
   Shared motion vocabulary — the whole app animates from this single source
   so timing, easing, and feel stay consistent. "Rich & expressive": spring
   physics, staggered entrances, soft fades.
─────────────────────────────────────────────────────────────────────────── */

export const EASE_OUT = [0.16, 1, 0.3, 1] as const;
export const SPRING = { type: "spring", stiffness: 380, damping: 32 } as const;
export const SPRING_SOFT = { type: "spring", stiffness: 260, damping: 30 } as const;

/** Container that staggers its children in. */
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.04 },
  },
};

/** A single item that fades+rises into place. Pair with staggerContainer. */
export const fadeUpItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE_OUT } },
};

export const scaleItem: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.25, ease: EASE_OUT } },
};

/** Fade + rise a whole section on mount. */
export function FadeUp({
  children,
  delay = 0,
  className,
  ...rest
}: { delay?: number } & HTMLMotionProps<"div">) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE_OUT, delay }}
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** Staggered list wrapper. */
export function Stagger({
  children,
  className,
  ...rest
}: HTMLMotionProps<"div">) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export const MotionDiv = forwardRef<HTMLDivElement, HTMLMotionProps<"div">>(
  function MotionDiv(props, ref) {
    return <motion.div ref={ref} {...props} />;
  }
);
