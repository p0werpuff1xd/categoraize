import type React from "react";

/** Plain wrapper for the draft Terms and Privacy Notice pages. */
export function LegalDraftPage({
  title,
  version,
  children,
}: {
  title: string;
  version: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 text-foreground">
      <p className="mb-6 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
        Draft for review (version {version}). This text was written by the
        project team and has not been reviewed by a lawyer.
      </p>
      <h1 className="font-title text-3xl">{title}</h1>
      <div className="mt-8 space-y-6 text-sm leading-relaxed [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1">
        {children}
      </div>
    </main>
  );
}
