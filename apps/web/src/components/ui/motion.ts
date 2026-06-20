/**
 * Shared motion/animation constants for framer-motion transitions.
 * Import these everywhere instead of defining inline transition objects.
 */

import type { Transition } from "framer-motion";

/** Spring transition — use for layout animations, toggles, modal entries. */
export const SPRING: Transition = {
  type: "spring",
  stiffness: 380,
  damping: 30,
  mass: 0.8,
};

/** Smooth ease-out — use for fade-ins, content appearing. */
export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** Quick pop — use for small interactive element feedback. */
export const POP: Transition = {
  type: "spring",
  stiffness: 500,
  damping: 28,
};
