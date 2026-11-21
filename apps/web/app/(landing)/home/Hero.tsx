import Link from "next/link";
import { Badge } from "@/components/new-landing/common/Badge";
import { Heading } from "@/components/new-landing/common/Typography";
import { HeroReveal } from "@/components/new-landing/common/HeroReveal";
import { Button } from "@/components/new-landing/common/Button";
import { SquaresPattern } from "@/app/(landing)/home/SquaresPattern";

export function Hero() {
  return (
    <div className="relative overflow-hidden pt-16 pb-20 md:pt-24 md:pb-28 text-center">
      <SquaresPattern />

      <div className="relative z-10 mx-auto max-w-4xl px-6">
        <HeroReveal>
          <Badge variant="blue">AI email sorting · P1–P5 priority</Badge>
        </HeroReveal>

        <HeroReveal delay={0.05} className="mt-6">
          <Heading className="mx-auto max-w-[820px]">
            Sort your inbox by{" "}
            <span className="bg-gradient-to-r from-[#4F46E5] to-[#6366F1] bg-clip-text text-transparent">
              priority, language & context
            </span>
          </Heading>
        </HeroReveal>

        <HeroReveal delay={0.1} className="mt-5">
          <p className="font-geist text-[#848484] text-lg md:text-xl mx-auto max-w-[600px]">
            CategorAIze reads your Gmail in English, Filipino and Taglish, ranks
            every message from P1 (urgent) to P5 (noise), and surfaces tasks and
            deadlines before you even open the thread.
          </p>
        </HeroReveal>

        <HeroReveal
          delay={0.15}
          className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3"
        >
          <Button size="xl" asChild>
            <Link href="/login">Get started free</Link>
          </Button>
          <Button size="xl" variant="secondary" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
        </HeroReveal>
      </div>
    </div>
  );
}
