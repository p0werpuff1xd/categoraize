import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "@/env";
import { PrismaClient } from "@/generated/prisma/client";
import { encryptedTokens } from "@/utils/prisma-extensions";
import { encryptedEmailFields } from "@/utils/categoraize/field-encryption-extension";
import { tenantContext } from "@/utils/categoraize/tenant";
import { auditPrismaQueries } from "@/utils/audit/prisma-extension";

declare global {
  var prisma: PrismaClient | undefined;
}

// Create the Prisma client with extensions, but cast it back to PrismaClient for type compatibility
function createClient() {
  const raw = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: env.DATABASE_URL,
    }),
  });
  return (
    raw
      .$extends(encryptedTokens)
      .$extends(encryptedEmailFields)
      .$extends(auditPrismaQueries)
      // Last: wraps CategorAIze queries in a row-level-security tenant
      // transaction on the RAW client, so the extensions above run only once.
      .$extends(tenantContext(raw)) as unknown as PrismaClient
  );
}

const _prisma = global.prisma || createClient();

if (env.NODE_ENV === "development") global.prisma = _prisma;

export default _prisma;
