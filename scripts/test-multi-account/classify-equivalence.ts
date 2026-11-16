// T-MAIL: run the same CATZ-TEST content through the CategorAIze service with
// each account's own context (categories, centroids, timezone, contacts,
// calendar busy) and compare. Uses previewCategoraizeEmail: nothing is stored.
// Also lists any CATZ-TEST emails the app already classified from each mailbox.
import prisma from "@/utils/prisma";
import { previewCategoraizeEmail } from "@/utils/categoraize/process-email";
import { header, listTestAccounts, run } from "./lib";

export const CATZ_EMAILS = [
  {
    subject: "CATZ-TEST 1 deadline",
    body: "Hi, please send the signed budget report by Friday 5pm. Thanks!",
  },
  {
    subject: "CATZ-TEST 2 newsletter",
    body: "This week's product digest: new features, tips and upcoming webinars. Unsubscribe anytime.",
  },
  {
    subject: "CATZ-TEST 3 taglish request",
    body: "Hello po, pakisend naman yung updated schedule bago mag-Thursday. Salamat!",
  },
];
const FROM = "CATZ Sender <catz-sender@example.com>";

type Row = {
  category: string;
  priority: number;
  factors: string;
  deadline: string;
  spans: string;
  language: string;
  register: string;
};

run(async () => {
  const accounts = await listTestAccounts();
  const results: Record<string, Record<string, Row>> = {};

  for (const a of accounts) {
    header(`[${a.provider}] ${a.masked} timezone=${a.timezone ?? "NULL -> UTC"}`);
    results[a.id] = {};
    for (const e of CATZ_EMAILS) {
      const { result, timezone, categories } = await previewCategoraizeEmail({
        emailAccountId: a.id,
        subject: e.subject,
        body: e.body,
        from: FROM,
      });
      const r = result as Record<string, any>;
      const catName =
        categories.find((c) => c.id === r.category?.id)?.name ?? "(none)";
      const row: Row = {
        category: catName,
        priority: r.priority?.level,
        factors: JSON.stringify(r.priority?.factors),
        deadline: r.priority?.deadline ?? "-",
        spans: (r.spans ?? [])
          .map((s: any) => `${s.label}:"${s.text}"${s.resolved ? `=>${s.resolved}` : ""}`)
          .join("; "),
        language: r.language ?? "-",
        register: r.register ?? r.formality ?? "-",
      };
      results[a.id][e.subject] = row;
      console.log(`\n${e.subject}  (request timezone=${timezone})`);
      for (const [k, v] of Object.entries(row)) console.log(`  ${k}: ${v}`);
    }

    const stored = await prisma.categorizeClassification.findMany({
      where: { emailAccountId: a.id, subject: { startsWith: "CATZ-TEST" } },
      select: {
        subject: true,
        categoryName: true,
        priorityBand: true,
        detectedLang: true,
        processingStatus: true,
        calendarFactor: true,
      },
    });
    console.log(`\nstored CATZ-TEST classifications from the mailbox: ${stored.length}`);
    for (const s of stored) console.log(`  ${JSON.stringify(s)}`);
  }

  if (accounts.length === 2) {
    header("Comparison (same content, account A vs account B)");
    const [A, B] = accounts;
    for (const e of CATZ_EMAILS) {
      const ra = results[A.id][e.subject];
      const rb = results[B.id][e.subject];
      const diffs = (Object.keys(ra) as Array<keyof Row>).filter(
        (k) => String(ra[k]) !== String(rb[k]),
      );
      console.log(
        `${e.subject}: ${diffs.length ? `DIFFERENT in ${diffs.join(", ")}` : "IDENTICAL"}`,
      );
      for (const k of diffs)
        console.log(`  ${k}: ${A.provider}=${ra[k]} | ${B.provider}=${rb[k]}`);
    }
  }
});
