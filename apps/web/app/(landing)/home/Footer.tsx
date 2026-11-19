import Image from "next/image";
import Link from "next/link";
import { SUPPORT_EMAIL } from "@/utils/branding";

export function Footer() {
  return (
    <footer className="border-t border-gray-100 bg-white">
      <div className="max-w-6xl mx-auto px-6 lg:px-8 xl:px-0 py-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        {/* Brand */}
        <div className="flex flex-col gap-2">
          <Link href="/" className="inline-flex">
            <Image
              src="/logo-wordmark.svg"
              alt="CategorAIze"
              width={130}
              height={30}
              className="h-9 w-auto"
              unoptimized
            />
          </Link>
          <p className="text-sm text-gray-500">
            AI email sorting for English, Filipino &amp; Taglish.
          </p>
        </div>

        {/* Links */}
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-500">
          <Link
            href="/privacy"
            className="hover:text-gray-900 transition-colors"
          >
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-gray-900 transition-colors">
            Terms
          </Link>
          {SUPPORT_EMAIL ? (
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="hover:text-gray-900 transition-colors"
            >
              {SUPPORT_EMAIL}
            </a>
          ) : null}
        </nav>
      </div>
    </footer>
  );
}
