"use client";

import { MotionConfig, motion } from "motion/react";

interface RevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

// Fades and lifts a block into place the first time it scrolls into view.
// reducedMotion="user" turns off the movement for people who ask for less motion.
export function Reveal({ children, className, delay = 0 }: RevealProps) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.5, ease: "easeOut", delay }}
        className={className}
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}
