"use client";

import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useId, useRef } from "react";
import { cn } from "@/utils";

export const frequencies = [
  {
    value: "monthly" as const,
    label: msg`Monthly`,
    priceSuffix: msg`/month, billed monthly`,
  },
  {
    value: "annually" as const,
    label: msg`Annually`,
    priceSuffix: msg`/month, billed annually`,
  },
];

export type Frequency = (typeof frequencies)[number];

export function PricingFrequencyToggle({
  frequency,
  setFrequency,
  className,
  children,
}: {
  frequency: Frequency;
  setFrequency: (frequency: Frequency) => void;
  className?: string;
  children?: React.ReactNode;
}) {
  const { i18n } = useLingui();
  const labelId = useId();
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Radio group keyboard pattern: arrow keys move and select, focus follows.
  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = (index + step + frequencies.length) % frequencies.length;
    setFrequency(frequencies[next]);
    optionRefs.current[next]?.focus();
  };

  return (
    <div className={cn("flex items-center justify-center", className)}>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="grid grid-cols-2 gap-x-1 rounded-full p-1 text-center text-xs font-semibold leading-5 ring-1 ring-inset ring-gray-200"
      >
        <span id={labelId} className="sr-only">
          <Trans>Payment frequency</Trans>
        </span>
        {frequencies.map((option, index) => {
          const checked = frequency.value === option.value;
          return (
            <button
              key={option.value}
              ref={(node) => {
                optionRefs.current[index] = node;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              onClick={() => setFrequency(option)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={cn(
                checked ? "bg-black text-white" : "text-gray-500",
                "cursor-pointer rounded-full px-2.5 py-1",
              )}
            >
              <span>{i18n._(option.label)}</span>
            </button>
          );
        })}
      </div>
      {children}
    </div>
  );
}

export function DiscountBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-indigo-600/10 px-2.5 py-1 text-xs font-semibold leading-5 text-indigo-600">
      {children}
    </span>
  );
}
