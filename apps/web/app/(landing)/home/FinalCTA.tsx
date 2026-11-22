import Link from "next/link";
import { Button } from "@/components/new-landing/common/Button";
import { PatternBanner } from "@/components/new-landing/PatternBanner";
import { Reveal } from "@/components/new-landing/common/Reveal";

export function FinalCTA() {
  return (
    <PatternBanner
      title="Reclaim your focus. Start sorting smarter."
      subtitle="Stop guessing which email needs you now. CategorAIze handles the triage—you handle what matters."
    >
      <Reveal>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button size="xl" asChild>
            <Link href="/login">Get started free</Link>
          </Button>
        </div>
      </Reveal>
    </PatternBanner>
  );
}
