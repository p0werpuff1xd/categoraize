"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/new-landing/common/Button";
import { cn } from "@/utils";

export function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-100 bg-white/90 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-6 lg:px-8 xl:px-0 flex h-14 items-center justify-between">
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center shrink-0 bg-gray-900 rounded-md px-3 py-1"
        >
          <Image
            src="/logo-wordmark.svg"
            alt="CategorAIze"
            width={140}
            height={32}
            className="h-8 w-auto"
            priority
            unoptimized
          />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-600">
          <a href="#features" className="hover:text-gray-900 transition-colors">
            Features
          </a>
          <Link
            href="/privacy"
            className="hover:text-gray-900 transition-colors"
          >
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-gray-900 transition-colors">
            Terms
          </Link>
        </nav>

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-2">
          <Button variant="secondary" size="md" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button size="md" asChild>
            <Link href="/login">Get started</Link>
          </Button>
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          className="md:hidden p-2 text-gray-600"
          aria-label="Toggle menu"
          onClick={() => setOpen((v) => !v)}
        >
          <span
            className={cn(
              "block w-5 h-0.5 bg-current mb-1 transition-all",
              open && "rotate-45 translate-y-1.5",
            )}
          />
          <span
            className={cn(
              "block w-5 h-0.5 bg-current mb-1 transition-all",
              open && "opacity-0",
            )}
          />
          <span
            className={cn(
              "block w-5 h-0.5 bg-current transition-all",
              open && "-rotate-45 -translate-y-1.5",
            )}
          />
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-gray-100 bg-white px-6 py-4 flex flex-col gap-4 text-sm font-medium text-gray-700">
          <a href="#features" className="hover:text-gray-900">
            Features
          </a>
          <Link href="/privacy" className="hover:text-gray-900">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-gray-900">
            Terms
          </Link>
          <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
            <Button variant="secondary" size="md" auto asChild>
              <Link href="/login">Sign in</Link>
            </Button>
            <Button size="md" auto asChild>
              <Link href="/login">Get started</Link>
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
