"use client";

import { useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/Badge";
import {
  PriorityBadge,
  PriorityFactorBreakdown,
} from "@/components/CategoraizePriority";
import {
  DeadlineStatus,
  HighlightedText,
  SpanLegend,
  formatDeadline,
} from "@/components/CategoraizeSpans";
import { toastError } from "@/components/Toast";
import { useAccount } from "@/providers/EmailAccountProvider";
import { previewCategoraizeClassificationAction } from "@/utils/actions/categoraize-classification";
import { getActionErrorMessage } from "@/utils/error";

const EXAMPLES = [
  {
    label: "Taglish request",
    subject: "Weekly report",
    body: "Hi team, paki-send ang final weekly report bukas. Salamat!",
  },
  {
    label: "English deadline",
    subject: "Accreditation documents",
    body: "Please send the accreditation documents for your department by Friday.",
  },
  {
    label: "Filipino",
    subject: "Lab report",
    body: "Class, ipasa ninyo ang lab report bukas ng umaga. Hindi na tatanggapin ang late submissions.",
  },
];

const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  tl: "Filipino",
  mixed: "Taglish (mixed)",
  unknown: "Unknown",
};

export function ClassificationSandbox() {
  const { emailAccountId } = useAccount();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [from, setFrom] = useState("");

  const { execute, result, input, isExecuting } = useAction(
    previewCategoraizeClassificationAction.bind(null, emailAccountId),
    {
      onError: (error) =>
        toastError({ description: getActionErrorMessage(error.error) }),
    },
  );
  const preview = result.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sandbox</CardTitle>
        <CardDescription>
          Paste an email to see how it would be labeled and prioritized. Nothing
          is saved.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            execute({ subject, body, from });
          }}
        >
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((example) => (
              <Button
                key={example.label}
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setSubject(example.subject);
                  setBody(example.body);
                }}
              >
                {example.label}
              </Button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="sandbox-subject">Subject</Label>
              <Input
                id="sandbox-subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sandbox-from">Sender email (optional)</Label>
              <Input
                id="sandbox-from"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                placeholder="Uses the sender's role and VIP status"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="sandbox-body">Body</Label>
            <Textarea
              id="sandbox-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={5}
              required
              placeholder="Paki-check naman ang report bago mag Biyernes..."
            />
          </div>
          <Button type="submit" loading={isExecuting} disabled={!body.trim()}>
            Classify
          </Button>
        </form>

        {preview && (
          <SandboxResult
            preview={preview}
            subject={input?.subject ?? subject}
            body={input?.body ?? body}
          />
        )}
      </CardContent>
    </Card>
  );
}

type Preview = NonNullable<
  Awaited<ReturnType<typeof previewCategoraizeClassificationAction>>
>["data"];

function SandboxResult({
  preview,
  subject,
  body,
}: {
  preview: NonNullable<Preview>;
  subject: string;
  body: string;
}) {
  const { result, categories, timezone } = preview;
  const nameById = new Map(categories.map(({ id, name }) => [id, name]));
  const subjectSpans = result.spans.filter((span) => span.source === "subject");
  const bodySpans = result.spans.filter((span) => span.source === "body");
  const dates = result.spans.filter((span) => span.label === "DATE");
  const topSimilarity = Math.max(
    result.threshold,
    ...result.ranked.map(({ similarity }) => similarity),
  );

  return (
    <div className="space-y-5 border-t pt-4">
      <section className="flex flex-wrap items-center gap-2">
        {result.category ? (
          <Badge color="indigo">
            {nameById.get(result.category.id)} ·{" "}
            {result.category.similarity.toFixed(2)} similarity
          </Badge>
        ) : (
          <Badge color="gray">Uncategorized</Badge>
        )}
        <PriorityBadge level={result.priority.level} />
        <Badge color="purple">{LANGUAGE_LABELS[result.language]}</Badge>
        <span className="text-xs text-muted-foreground">
          {Math.round(result.timings_ms.total ?? 0)} ms
        </span>
      </section>

      {!result.category && result.suggested_label && (
        <p className="rounded-md bg-muted p-3 text-sm">
          No label matched. A new label <b>{result.suggested_label.name}</b>{" "}
          would fit ({result.suggested_label.similarity.toFixed(2)}). You can
          create it from the Priority Inbox; nothing is created automatically.
        </p>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Tasks and dates</h3>
          <SpanLegend />
        </div>
        {subject && (
          <HighlightedText
            text={subject}
            spans={subjectSpans}
            className="font-medium"
          />
        )}
        <HighlightedText text={body} spans={bodySpans} />
        {result.spans.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No tasks or dates found.
          </p>
        )}
        {dates.length > 0 && (
          <ul className="space-y-1 text-sm">
            {dates.map((span) => (
              <li
                key={`${span.source}-${span.start}`}
                className="flex flex-wrap items-center gap-2"
              >
                <span className="font-medium">"{span.text}"</span>
                <span>
                  →{" "}
                  {span.resolved
                    ? formatDeadline(span.resolved, timezone)
                    : "could not resolve"}
                </span>
                <DeadlineStatus
                  ambiguous={span.ambiguous}
                  isDeadline={span.is_deadline}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Why this priority</h3>
        <PriorityFactorBreakdown
          factors={result.priority.factors}
          level={result.priority.level}
        />
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">
          Similarity to every label (threshold {result.threshold.toFixed(2)})
        </h3>
        <ul className="space-y-1.5">
          {result.ranked.map((item) => {
            const passes = item.similarity >= result.threshold;
            return (
              <li key={item.id} className="text-sm">
                <div className="flex justify-between gap-2">
                  <span>{nameById.get(item.id) ?? item.id}</span>
                  <span className="font-mono tabular-nums">
                    {item.similarity.toFixed(3)}
                    {passes ? "" : " (below threshold)"}
                  </span>
                </div>
                <div className="relative mt-0.5 h-1.5 rounded bg-muted">
                  <div
                    className={
                      passes
                        ? "h-1.5 rounded bg-indigo-500"
                        : "h-1.5 rounded bg-gray-400"
                    }
                    style={{
                      width: `${Math.max(0, (item.similarity / topSimilarity) * 100)}%`,
                    }}
                  />
                  <div
                    className="absolute top-[-2px] h-2.5 w-px bg-foreground"
                    style={{
                      left: `${(result.threshold / topSimilarity) * 100}%`,
                    }}
                    title="Threshold"
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
