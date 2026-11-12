"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/utils/prisma";
import { actionClient } from "@/utils/actions/safe-action";
import { isDuplicateError } from "@/utils/prisma-helpers";
import { SafeError } from "@/utils/error";
import { prefixPath } from "@/utils/path";
import { enqueueCategoraiizeCategoryEmbedding } from "@/utils/categorai/processing-queue";
import {
  createCategoraiizeCategory,
  deleteCategoraiizeCategory,
  updateCategoraiizeCategory,
} from "./categoraiize.validation";

const categoriesPath = (emailAccountId: string) =>
  prefixPath(emailAccountId, "/categoraiize/categories");

export const createCategoraiizeCategoryAction = actionClient
  .metadata({ name: "createCategoraiizeCategory" })
  .inputSchema(createCategoraiizeCategory)
  .action(async ({ ctx: { emailAccountId, logger }, parsedInput }) => {
    try {
      const category = await prisma.categorizeCategory.create({
        data: {
          emailAccountId,
          name: parsedInput.name,
          description: parsedInput.description,
        },
        select: { id: true },
      });

      await enqueueCategoraiizeCategoryEmbedding({
        payload: {
          emailAccountId,
          categoryId: category.id,
          name: parsedInput.name,
          description: parsedInput.description,
        },
        logger,
      });

      revalidatePath(categoriesPath(emailAccountId));
      return { id: category.id };
    } catch (error) {
      if (isDuplicateError(error, "name")) {
        throw new SafeError("A category with this name already exists");
      }
      throw error;
    }
  });

export const updateCategoraiizeCategoryAction = actionClient
  .metadata({ name: "updateCategoraiizeCategory" })
  .inputSchema(updateCategoraiizeCategory)
  .action(async ({ ctx: { emailAccountId, logger }, parsedInput }) => {
    const { categoryId, ...data } = parsedInput;
    const category = await prisma.categorizeCategory.findFirst({
      where: { id: categoryId, emailAccountId },
      select: { id: true },
    });
    if (!category) throw new SafeError("Category not found");

    try {
      const updatedCategory = await prisma.categorizeCategory.update({
        where: { id: category.id },
        data,
        select: { id: true, name: true, description: true },
      });

      await enqueueCategoraiizeCategoryEmbedding({
        payload: {
          emailAccountId,
          categoryId: updatedCategory.id,
          name: updatedCategory.name,
          description: updatedCategory.description ?? undefined,
        },
        logger,
      });
    } catch (error) {
      if (isDuplicateError(error, "name")) {
        throw new SafeError("A category with this name already exists");
      }
      throw error;
    }

    revalidatePath(categoriesPath(emailAccountId));
  });

export const deleteCategoraiizeCategoryAction = actionClient
  .metadata({ name: "deleteCategoraiizeCategory" })
  .inputSchema(deleteCategoraiizeCategory)
  .action(async ({ ctx: { emailAccountId }, parsedInput }) => {
    const result = await prisma.categorizeCategory.deleteMany({
      where: { id: parsedInput.categoryId, emailAccountId },
    });
    if (result.count === 0) throw new SafeError("Category not found");

    revalidatePath(categoriesPath(emailAccountId));
  });
