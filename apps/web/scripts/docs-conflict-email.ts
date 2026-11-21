// Documentation only: classifies ONE synthetic email whose deadline falls
// inside an existing calendar event, through the normal pipeline
// (classifyAndStoreEmail), so the Priority Inbox shows a real calendar
// conflict for Figure 17. Run after categoraize-seed with the same env.
//   node --import tsx scripts/docs-conflict-email.ts --email <account> --at <ISO deadline>

import { parseArgs } from "node:util";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { classifyAndStoreEmail } from "@/utils/categoraize/process-email";

const logger = createScopedLogger("docs-conflict-email");

async function main() {
  const { values } = parseArgs({
    options: { email: { type: "string" }, at: { type: "string" } },
  });
  if (!values.email || !values.at) throw new Error("--email and --at are required");
  const account = await prisma.emailAccount.findUnique({
    where: { email: values.email },
    select: { id: true, timezone: true },
  });
  if (!account) throw new Error(`No email account ${values.email}`);
  const timeZone = account.timezone || "UTC";
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(values.at));

  const { result } = await classifyAndStoreEmail({
    emailAccountId: account.id,
    logger,
    email: {
      threadId: "seed-thread-docs-conflict",
      messageId: "seed-docs-conflict",
      subject: "Paki-submit ang final budget report today",
      from: "Ana Reyes <ana.reyes@example.com>",
      body: `Hi! Paki-submit ang final budget report today at ${time}. Kailangan ko ito bago ang board review. Salamat!\n\nAna`,
      receivedAt: new Date(Date.now() - 30 * 60 * 1000),
    },
  });
  console.log(
    `conflict email: P${result.priority.level} calendar=${result.priority.factors.calendar} deadline=${result.priority.deadline} tz=${timeZone} spans=${result.spans.map((s) => `${s.label}:${s.text}`).join(" | ")}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
