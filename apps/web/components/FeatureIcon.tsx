import { cn } from "@/utils";

export function FeatureIcon({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex rounded-lg bg-gradient-to-b from-indigo-100 to-indigo-200 p-px shadow-sm",
        className,
      )}
    >
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[7px] bg-gradient-to-b from-indigo-50 to-indigo-100 text-indigo-600 shadow-sm">
        {children}
      </div>
    </div>
  );
}
