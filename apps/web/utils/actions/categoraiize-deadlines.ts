"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/utils/prisma";
import { actionClient } from "@/utils/actions/safe-action";
import { SafeError } from "@/utils/error";
import { prefixPath } from "@/utils/path";
import { updateCategoraiizeDeadline } from "./categoraiize-deadlines.validation";

const taskSheetPath = (emailAccountId: string) =>
  prefixPath(emailAccountId, "/categoraiize/task-sheet");

export const confirmCategoraiizeDeadlineAction = actionClient
  .metadata({ name: "confirmCategoraiizeDeadline" })
  .inputSchema(updateCategoraiizeDeadline)
  .action(async ({ ctx: { emailAccountId }, parsedInput }) => {
    const result = await prisma.categorizeDeadlineAlert.updateMany({
      where: { id: parsedInput.deadlineId, emailAccountId },
      data: {
        needsReview: false,
        confirmedAt: new Date(),
        ...(parsedInput.dueDate
          ? { dueDate: new Date(parsedInput.dueDate) }
          : {}),
      },
    });
    if (result.count === 0) throw new SafeError("Deadline not found");
    revalidatePath(taskSheetPath(emailAccountId));
  });

export const completeCategoraiizeDeadlineAction = actionClient
  .metadata({ name: "completeCategoraiizeDeadline" })
  .inputSchema(updateCategoraiizeDeadline.pick({ deadlineId: true }))
  .action(async ({ ctx: { emailAccountId }, parsedInput }) => {
    const result = await prisma.categorizeDeadlineAlert.updateMany({
      where: { id: parsedInput.deadlineId, emailAccountId },
      data: { status: "COMPLETED" },
    });
    if (result.count === 0) throw new SafeError("Deadline not found");
    revalidatePath(taskSheetPath(emailAccountId));
  });

export const dismissCategoraiizeDeadlineAction = actionClient
  .metadata({ name: "dismissCategoraiizeDeadline" })
  .inputSchema(updateCategoraiizeDeadline.pick({ deadlineId: true }))
  .action(async ({ ctx: { emailAccountId }, parsedInput }) => {
    const result = await prisma.categorizeDeadlineAlert.updateMany({
      where: { id: parsedInput.deadlineId, emailAccountId },
      data: { status: "DISMISSED" },
    });
    if (result.count === 0) throw new SafeError("Deadline not found");
    revalidatePath(taskSheetPath(emailAccountId));
  });
