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
import { AlertCircleIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/Badge";
import {
  PriorityBadge,
  PriorityFactorBreakdown,
  deadlineStateFromSpans,
} from "@/components/CategoraizePriority";
import { serviceUnavailableReason } from "@/components/CategoraizeStates";
import {
  useCategoraizeCategories,
  useCategoraizeServiceStatus,
} from "@/hooks/useCategoraize";
import { cn } from "@/utils";
import {
  DeadlineStatus,
  HighlightedText,
  SpanLegend,
  formatDeadline,
} from "@/components/CategoraizeSpans";
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

// Matches the action's validation limit and the stored bodyText limit.
const MAX_BODY_CHARS = 20_000;
const STORED_BODY_CHARS = 8000;

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

  const categories = useCategoraizeCategories();
  const service = useCategoraizeServiceStatus();
  const { execute, result, input, isExecuting, hasErrored } = useAction(
    previewCategoraizeClassificationAction.bind(null, emailAccountId),
  );
  const preview = result.data;
  const errorMessage = hasErrored ? getActionErrorMessage(result) : null;

  const disabledReason = !body.trim()
    ? "Paste some email text first"
    : body.length > MAX_BODY_CHARS
      ? `Shorten the text to ${MAX_BODY_CHARS.toLocaleString()} characters`
      : categories.data && categories.data.categories.length === 0
        ? "Add a label first, so there is something to match against"
        : serviceUnavailableReason(service.data?.status);
  const longText = body.length > STORED_BODY_CHARS;

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
              aria-describedby="sandbox-body-help"
              placeholder="Paki-check naman ang report bago mag Biyernes..."
            />
            <p
              id="sandbox-body-help"
              className={cn(
                "text-xs text-muted-foreground",
                body.length > MAX_BODY_CHARS && "text-destructive",
              )}
            >
              {body.length.toLocaleString()} / {MAX_BODY_CHARS.toLocaleString()}{" "}
              characters
              {longText &&
                body.length <= MAX_BODY_CHARS &&
                ". Long text: the label match uses the subject and the first 23 sentences, and inbox copies keep the first 8,000 characters."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              loading={isExecuting}
              disabled={Boolean(disabledReason)}
            >
              {isExecuting ? "Analyzing…" : "Classify"}
            </Button>
            {disabledReason && !isExecuting && (
              <span className="text-xs text-muted-foreground">
                {disabledReason}.
              </span>
            )}
          </div>
        </form>

        {errorMessage && !isExecuting && (
          <Alert variant="destructive" role="alert">
            <AlertCircleIcon className="size-4" />
            <AlertTitle>Couldn't classify this text</AlertTitle>
            <AlertDescription>
              <p>{errorMessage}</p>
              {input && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() => execute(input)}
                >
                  Retry
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}

        {preview && !hasErrored && (
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
        <PriorityBadge
          level={result.priority.level}
          vipPinned={result.priority.factors.vip_pin > 0}
        />
        <Badge color={result.language === "unknown" ? "gray" : "purple"}>
          Language: {LANGUAGE_LABELS[result.language]}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {Math.round(result.timings_ms.total ?? 0)} ms
        </span>
      </section>

      {result.language === "unknown" && (
        <p className="text-xs text-muted-foreground">
          The language couldn't be identified, so Taglish clean-up was skipped.
          Labels and dates still work on the text as written.
        </p>
      )}

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
                  resolvedAt={span.resolved}
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
          deadlineState={deadlineStateFromSpans(
            result.spans.map((span) => ({
              label: span.label,
              ambiguous: span.ambiguous,
              isDeadline: span.is_deadline,
            })),
          )}
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
