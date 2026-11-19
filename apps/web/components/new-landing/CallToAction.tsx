"use client";

import Link from "next/link";
import { Button } from "@/components/new-landing/common/Button";

interface CallToActionProps {
  size?: "md" | "lg" | "xl";
}

export function CallToAction({ size = "lg" }: CallToActionProps) {
  return (
    <div className="flex flex-col sm:flex-row items-center gap-3">
      <Button size={size} asChild>
        <Link href="/login">Get started free</Link>
      </Button>
      <Button size={size} variant="secondary" asChild>
        <Link href="/login">Sign in</Link>
      </Button>
    </div>
  );
}
