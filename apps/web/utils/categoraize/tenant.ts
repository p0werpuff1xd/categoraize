import { AsyncLocalStorage } from "node:async_hooks";
import { Prisma } from "@/generated/prisma/client";
import { getAuditContext } from "@/utils/audit/context";
import { createScopedLogger } from "@/utils/logger";

/**
 * Tenant context for row-level security on CategorAIze tables (IAS Phase 11 K).
 *
 * Every query on a CategorAIze model runs in a transaction that first calls
 * set_config('app.current_user_id', <user>, true), so the database policies
 * only show and accept that user's rows. The user comes from the request's
 * audit context, which the route middleware, server actions and webhook
 * validation already set (utils/audit/context.ts): the actor's user id, or the
 * owner of the email account being processed.
 *
 * With no tenant the query runs as is: under a role without BYPASSRLS it then
 * sees no rows and cannot write (fail closed).
 */

const logger = createScopedLogger("categoraize-tenant");

export const TENANT_MODELS = new Set([
  "CategorizeCategory",
  "CategorizeClassification",
  "CategorizeContact",
  "CategorizeDeadlineAlert",
  "CategorizeExtractedSpan",
  "CategorizeFeedbackEvent",
  "CategorizeNotification",
  "CategorizePriorityOverrideLog",
  "CategorizeProposalDecision",
  "CategorizeSenderCategoryCentroid",
  "CategorizeSenderEmbedding",
  "CategorizeUserConsent",
  "CategorizeUserSettings",
  "CategorizeAuditEvent",
]);

type TxClient = Prisma.TransactionClient;
type BaseClient = {
  $transaction: <T>(fn: (tx: TxClient) => Promise<T>) => Promise<T>;
  emailAccount: {
    findUnique: (args: unknown) => Promise<{ userId: string } | null>;
  };
};

// The open tenant transaction, so nested lookups (the encryption extension's
// id resolution) run inside it instead of outside the tenant.
const tenantTx = new AsyncLocalStorage<{ tx: TxClient; userId: string }>();
// An explicit tenant set by withUserContext (scripts, background jobs).
const explicitTenant = new AsyncLocalStorage<{ userId: string }>();

export function getTenantTransaction(): TxClient | undefined {
  return tenantTx.getStore()?.tx;
}

const ownerCache = new Map<string, { userId: string; at: number }>();
const OWNER_TTL_MS = 5 * 60 * 1000;
const warned = new Set<string>();

async function resolveTenantUserId(base: BaseClient): Promise<string | null> {
  const explicit = getExplicitTenantUserId();
  if (explicit) return explicit;
  const context = getAuditContext();
  if (context.userId) return context.userId;
  if (!context.emailAccountId) return null;
  return ownerOf(base, context.emailAccountId);
}

async function setTenant(tx: TxClient, userId: string) {
  await tx.$executeRaw`SELECT set_config('app.current_user_id', ${userId}, true)`;
}

let baseClient: BaseClient | null = null;

/**
 * Runs fn with the tenant fixed to userId (scripts, layouts, background jobs).
 *
 * Prisma queries are lazy: they run when awaited, not when created. fn is
 * therefore awaited INSIDE the context; returning its promise would run the
 * query after the context ended, without a tenant (RLS then hides every row).
 */
export function withUserContext<T>(userId: string, fn: () => Promise<T>) {
  return explicitTenant.run({ userId }, async () => await fn());
}

/** The tenant set by withUserContext/withAccountContext, if any. */
export function getExplicitTenantUserId(): string | undefined {
  return explicitTenant.getStore()?.userId;
}

/**
 * Raw SQL on CategorAIze tables bypasses the Prisma extension: run it through
 * this helper so it executes inside a tenant transaction.
 */
export async function withTenantSql<T>(
  fallback: unknown,
  fn: (db: TxClient) => Promise<T>,
): Promise<T> {
  const open = tenantTx.getStore();
  if (open) return fn(open.tx);
  if (!baseClient) return fn(fallback as TxClient);
  const userId = await resolveTenantUserId(baseClient);
  if (!userId) {
    warnOnce("raw SQL");
    return fn(fallback as TxClient);
  }
  return baseClient.$transaction(async (tx) => {
    await setTenant(tx, userId);
    return tenantTx.run({ tx, userId }, async () => await fn(tx));
  });
}

/**
 * Runs fn with the tenant set to the owner of emailAccountId (background jobs
 * that only know the account). Unknown account: runs without a tenant.
 */
export async function withAccountContext<T>(
  emailAccountId: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (!baseClient) return fn();
  const owner = await ownerOf(baseClient, emailAccountId);
  // Awaited inside the context: see withUserContext.
  return owner
    ? explicitTenant.run({ userId: owner }, async () => await fn())
    : fn();
}

/**
 * Raw SQL for one email account: runs inside a tenant transaction for that
 * account's owner, whatever the ambient context (background jobs included).
 */
export async function withAccountSql<T>(
  fallback: unknown,
  emailAccountId: string,
  fn: (db: TxClient) => Promise<T>,
): Promise<T> {
  const open = tenantTx.getStore();
  if (open) return fn(open.tx);
  if (!baseClient) return fn(fallback as TxClient);
  const owner = await ownerOf(baseClient, emailAccountId);
  if (!owner) return fn(fallback as TxClient);
  return baseClient.$transaction(async (tx) => {
    await setTenant(tx, owner);
    return tenantTx.run({ tx, userId: owner }, async () => await fn(tx));
  });
}

async function ownerOf(base: BaseClient, emailAccountId: string) {
  const cached = ownerCache.get(emailAccountId);
  if (cached && Date.now() - cached.at < OWNER_TTL_MS) return cached.userId;
  const account = await base.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: { userId: true },
  });
  if (!account) return null;
  ownerCache.set(emailAccountId, { userId: account.userId, at: Date.now() });
  return account.userId;
}

function warnOnce(where: string) {
  const key = `${where}:${getAuditContext().source ?? "unknown"}`;
  if (warned.has(key)) return;
  warned.add(key);
  logger.warn(
    "CategorAIze query without a tenant context (rows hidden by RLS)",
    {
      where,
      source: getAuditContext().source,
    },
  );
}

function lowerFirst(name: string) {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

export const tenantContext = Prisma.defineExtension((client) => {
  const base = client as unknown as BaseClient;
  baseClient = base;

  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) return query(args);
          // Already inside a tenant transaction (nested call): run in it.
          if (tenantTx.getStore()) return query(args);

          const userId = await resolveTenantUserId(base);
          if (!userId) {
            warnOnce(`${model}.${operation}`);
            return query(args);
          }

          return base.$transaction(async (tx) => {
            await setTenant(tx, userId);
            return tenantTx.run({ tx, userId }, async () => {
              // Dynamic model lookup: the delegate name comes from the query.
              const delegates = tx as unknown as Record<string, unknown>;
              const delegate = delegates[lowerFirst(model)] as Record<
                string,
                (input: unknown) => Promise<unknown>
              >;
              // Awaited here so nested lookups still see the open transaction.
              return await delegate[operation](args);
            });
          });
        },
      },
    },
  });
});
