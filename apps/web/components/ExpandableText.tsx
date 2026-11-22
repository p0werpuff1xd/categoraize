"use client";

import type { MouseEvent } from "react";
import { useState } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/utils";

export function ExpandableText({
  text,
  maxLength = 280,
  className,
}: {
  text: string;
  maxLength?: number;
  className?: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Only add expand/collapse if content is long enough
  if (text.length < maxLength) {
    return <TextWrapper className={className}>{text}</TextWrapper>;
  }

  return (
    <TextWrapper className={className}>
      <div className="relative overflow-hidden">
        {/* Always render the full text but add a mask when collapsed */}
        <motion.div
          initial={{ height: "4rem" }}
          animate={{ height: isExpanded ? "auto" : "4rem" }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className={isExpanded ? "" : "overflow-hidden"}
        >
          {text}
        </motion.div>

        {/* Add a gradient overlay to indicate more content when collapsed */}
        {!isExpanded && (
          <div className="absolute bottom-0 left-0 h-6 w-full bg-gradient-to-t from-background to-transparent" />
        )}
      </div>

      <button
        type="button"
        onClick={(e: MouseEvent<HTMLButtonElement>) => {
          e.stopPropagation();
          setIsExpanded(!isExpanded);
        }}
        className="mt-1 flex items-center text-xs text-muted-foreground transition-[color,transform] duration-150 hover:scale-105 hover:text-primary active:scale-95 motion-reduce:transform-none"
      >
        {isExpanded ? (
          <>
            <ChevronUpIcon className="mr-1 h-3 w-3" />
            Less
          </>
        ) : (
          <>
            <ChevronDownIcon className="mr-1 h-3 w-3" />
            More
          </>
        )}
      </button>
    </TextWrapper>
  );
}

function TextWrapper({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("whitespace-pre-wrap break-words", className)}>
      {children}
    </div>
  );
}
