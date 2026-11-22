"use client";

import { MotionConfig } from "motion/react";

// Turns off Motion's movement and layout animation for people who set
// "reduce motion" in their OS. Opacity fades still run, which is fine.
export function MotionPreferences({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
