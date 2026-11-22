// Seeds CategorAIze demo data for one email account: categories (embedded via
// /embed), contacts with roles and a VIP, and 45 bilingual emails classified
// through the NLP service and stored like real mail.
//
// The NLP service must be running and CATEGORAIZE_* must be set in apps/web/.env.
// From apps/web:
//   pnpm categoraize:seed -- --email you@example.com [--reset]
//
// --reset deletes previously seeded emails (messageId "seed-*") first. Real
// mail and categories you created yourself are never touched.

import { parseArgs } from "node:util";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { isCategoraizeEnabled } from "@/utils/categoraize/client";
import { embedCategoryDescription } from "@/utils/categoraize/categories";
import { classifyAndStoreEmail } from "@/utils/categoraize/process-email";
import {
  SEED_CATEGORIES,
  SEED_CONTACTS,
  SEED_EMAILS,
} from "./categoraize-seed-data";

const SEED_PREFIX = "seed-";
const logger = createScopedLogger("categoraize-seed");

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      reset: { type: "boolean", default: false },
    },
  });
  if (!values.email) throw new Error("Pass --email <your email account>");
  if (!isCategoraizeEnabled()) {
    throw new Error(
      "Set CATEGORAIZE_ENABLED, CATEGORAIZE_SERVICE_URL and CATEGORAIZE_INTERNAL_KEY first",
    );
  }

  const emailAccount = await prisma.emailAccount.findFirst({
    where: { email: values.email },
    select: { id: true },
  });
  if (!emailAccount) throw new Error(`No email account for ${values.email}`);
  const emailAccountId = emailAccount.id;

  if (values.reset) {
    const deleted = await prisma.categorizeClassification.deleteMany({
      where: { emailAccountId, messageId: { startsWith: SEED_PREFIX } },
    });
    console.log(`Deleted ${deleted.count} seeded emails`);
  }

  for (const seed of SEED_CATEGORIES) {
    const category = await prisma.categorizeCategory.upsert({
      where: { emailAccountId_name: { emailAccountId, name: seed.name } },
      create: { emailAccountId, ...seed },
      update: {
        description: seed.description,
        basePriority: seed.basePriority,
      },
      select: { id: true, name: true, description: true },
    });
    const embedded = await embedCategoryDescription({
      emailAccountId,
      category,
      resetCentroid: true,
      logger,
    });
    console.log(
      `Category ${seed.name}: ${embedded ? "embedded" : "NOT embedded"}`,
    );
  }

  for (const { email, ...contact } of SEED_CONTACTS) {
    await prisma.categorizeContact.upsert({
      where: { emailAccountId_email: { emailAccountId, email } },
      create: { emailAccountId, email, ...contact },
      update: contact,
    });
  }
  console.log(`Contacts: ${SEED_CONTACTS.length}`);

  const now = Date.now();
  const tally = new Map<string, number>();
  for (const seed of SEED_EMAILS) {
    const { result } = await classifyAndStoreEmail({
      emailAccountId,
      logger,
      email: {
        threadId: `${SEED_PREFIX}thread-${seed.key}`,
        messageId: `${SEED_PREFIX}${seed.key}`,
        subject: seed.subject,
        from: seed.from,
        body: seed.body,
        receivedAt: new Date(now - seed.hoursAgo * 60 * 60 * 1000),
      },
    });
    const label = result.category
      ? `category ${result.category.id.slice(-6)}`
      : `suggest ${result.suggested_label?.name ?? "none"}`;
    console.log(
      `S${seed.scenario} ${seed.key.padEnd(24)} P${result.priority.level} ${result.language.padEnd(7)} ${label} spans=${result.spans.length}`,
    );
    const key = result.category ? "categorized" : "uncategorized";
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }

  console.log(
    `Seeded ${SEED_EMAILS.length} emails: ${[...tally].map(([key, count]) => `${count} ${key}`).join(", ")}`,
  );
}
