import "server-only";

import { createHash } from "node:crypto";
import prisma from "@/utils/prisma";
import { discoverClusters } from "@/utils/categoraize/client";
import { withAccountSql } from "@/utils/categoraize/tenant";
import { parseVector } from "@/utils/categoraize/vectors";

// Category discovery (master plan amendment 2026-11-17): cluster the user's
// uncategorized emails and suggest categories. The NLP service sees only ids
// and vectors; names come from this user's own subjects and the closest
// curated label. Nothing is created until the user confirms.

export const DISCOVERY_MIN_EMAILS = 6;
const MIN_CLUSTER_SIZE = 3;
const MAX_EMAILS = 500;
const SAMPLE_COUNT = 3;
const SAMPLE_CHARS = 90;

const STOPWORDS = new Set(
  (
    "the and for you your our are with this that from have has was were will can not but all any its " +
    "please thanks thank hello dear regards about into just also more new now get got re fwd fw " +
    "ang mga ng sa na at ay ni si ko mo po opo ka kayo kami tayo siya ito iyan iyon para pag kung " +
    "lang din rin naman pa ba nga yung yun mag nag hindi wala may meron salamat "
  )
    .trim()
    .split(/\s+/),
);

export type CategorySuggestion = {
  key: string;
  memberIds: string[];
  size: number;
  cohesion: number;
  names: string[];
  samples: string[];
};

export type DiscoveryResult =
  | { status: "not_enough"; uncategorized: number; needed: number }
  | { status: "ok"; uncategorized: number; suggestions: CategorySuggestion[] };

export function clusterKey(memberIds: string[]) {
  const digest = createHash("sha256")
    .update([...memberIds].sort().join(","))
    .digest("hex");
  return `cluster:${digest.slice(0, 24)}`;
}

export async function findCategorySuggestions(
  emailAccountId: string,
): Promise<DiscoveryResult> {
  const rows = await withAccountSql(
    prisma,
    emailAccountId,
    (db) => db.$queryRaw<Array<{ id: string; embedding: string | null }>>`
    SELECT "id", "embedding"::text AS "embedding"
    FROM "CategorizeClassification"
    WHERE "emailAccountId" = ${emailAccountId}
      AND "categoryId" IS NULL
      AND "embedding" IS NOT NULL
    ORDER BY "receivedAt" DESC NULLS LAST
    LIMIT ${MAX_EMAILS}
  `,
  );
  const vectors = rows.flatMap((row) => {
    const vector = parseVector(row.embedding);
    return vector ? [{ id: row.id, vector }] : [];
  });
  if (vectors.length < DISCOVERY_MIN_EMAILS) {
    return {
      status: "not_enough",
      uncategorized: vectors.length,
      needed: DISCOVERY_MIN_EMAILS,
    };
  }

  const { clusters } = await discoverClusters({
    vectors,
    minClusterSize: MIN_CLUSTER_SIZE,
  });
  const dismissed = new Set(
    (
      await prisma.categorizeProposalDecision.findMany({
        where: { emailAccountId, key: { startsWith: "cluster:" } },
        select: { key: true },
      })
    ).map(({ key }) => key),
  );
  const open = clusters
    .map((cluster) => ({ ...cluster, key: clusterKey(cluster.member_ids) }))
    .filter((cluster) => !dismissed.has(cluster.key));

  const members = await prisma.categorizeClassification.findMany({
    where: {
      emailAccountId,
      id: { in: open.flatMap((cluster) => cluster.member_ids) },
    },
    select: { id: true, subject: true, suggestedLabel: true },
  });
  const byId = new Map(members.map((member) => [member.id, member]));

  const suggestions = open
    .map((cluster) => {
      const emails = cluster.member_ids.flatMap((id) => {
        const email = byId.get(id);
        return email ? [email] : [];
      });
      const subjects = emails.map((email) => email.subject ?? "");
      const templateName = commonTemplateName(
        emails.map((email) => email.suggestedLabel),
      );
      const termsName = nameFromTerms(subjects);
      const names = [...new Set([templateName, termsName].filter(Boolean))];
      return {
        key: cluster.key,
        memberIds: cluster.member_ids,
        size: cluster.member_ids.length,
        cohesion: Math.round(cluster.cohesion * 100) / 100,
        names: names.length ? (names as string[]) : ["New category"],
        samples: subjects
          .filter(Boolean)
          .slice(0, SAMPLE_COUNT)
          .map((subject) =>
            subject.length > SAMPLE_CHARS
              ? `${subject.slice(0, SAMPLE_CHARS)}…`
              : subject,
          ),
      };
    })
    .sort((a, b) => b.size - a.size);

  return { status: "ok", uncategorized: vectors.length, suggestions };
}

/** Normalized mean of the members' embeddings: the new category's starting centroid. */
export async function clusterCentroid(
  emailAccountId: string,
  memberIds: string[],
) {
  const rows = await withAccountSql(
    prisma,
    emailAccountId,
    (db) => db.$queryRaw<Array<{ embedding: string | null }>>`
    SELECT "embedding"::text AS "embedding"
    FROM "CategorizeClassification"
    WHERE "emailAccountId" = ${emailAccountId}
      AND "id" = ANY(${memberIds})
      AND "embedding" IS NOT NULL
  `,
  );
  const vectors = rows.flatMap((row) => {
    const vector = parseVector(row.embedding);
    return vector ? [vector] : [];
  });
  if (!vectors.length) return null;
  const mean = vectors[0].map(
    (_, index) =>
      vectors.reduce((sum, vector) => sum + vector[index], 0) / vectors.length,
  );
  const norm = Math.sqrt(mean.reduce((sum, value) => sum + value * value, 0));
  return norm ? mean.map((value) => value / norm) : null;
}

export function nameFromTerms(subjects: string[]) {
  const counts = new Map<string, number>();
  for (const subject of subjects) {
    const terms = new Set(
      (subject.toLowerCase().match(/[\p{L}][\p{L}\p{N}'-]{2,}/gu) ?? []).filter(
        (term) => !STOPWORDS.has(term),
      ),
    );
    for (const term of terms) counts.set(term, (counts.get(term) ?? 0) + 1);
  }
  const minimum = Math.max(2, Math.ceil(subjects.length * 0.3));
  const top = [...counts.entries()]
    .filter(([, count]) => count >= minimum)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 2)
    .map(([term]) => term.charAt(0).toUpperCase() + term.slice(1));
  return top.join(" & ");
}

function commonTemplateName(labels: unknown[]) {
  const counts = new Map<string, number>();
  for (const label of labels) {
    const name = (label as { name?: unknown } | null)?.name;
    if (typeof name === "string" && name) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  const [best] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return best && best[1] * 2 >= labels.length ? best[0] : "";
}
