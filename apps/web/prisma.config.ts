import "dotenv/config";
import { defineConfig } from "prisma/config";

const migrationUrl =
  process.env.PREVIEW_DATABASE_URL_UNPOOLED ||
  process.env.PREVIEW_DATABASE_URL ||
  process.env.DIRECT_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL;

export default defineConfig({
  schema: "./prisma/schema.prisma",
  datasource: {
    url: migrationUrl,
  },
  migrations: {
    path: "./prisma/migrations",
  },
});
