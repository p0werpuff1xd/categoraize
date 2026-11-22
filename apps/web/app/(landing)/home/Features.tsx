import { Badge } from "@/components/new-landing/common/Badge";
import {
  Section,
  SectionContent,
} from "@/components/new-landing/common/Section";
import {
  SectionHeading,
  SectionSubtitle,
} from "@/components/new-landing/common/Typography";
import { Card } from "@/components/new-landing/common/Card";
import { Reveal } from "@/components/new-landing/common/Reveal";

const features = [
  {
    badge: { label: "Multilingual", variant: "blue" as const },
    title: "English, Filipino & Taglish",
    description:
      "Our model understands code-switching natively. Whether a message is in pure English, pure Filipino, or a mix of both, it reads intent accurately and classifies it the same way.",
  },
  {
    badge: { label: "Priority", variant: "purple" as const },
    title: "P1 to P5 priority scoring",
    description:
      "Every message gets a priority from P1 (respond now) down to P5 (noise). The score weighs sender importance, deadlines, your calendar load, and task signals—not just keywords.",
  },
  {
    badge: { label: "Extraction", variant: "green" as const },
    title: "Tasks & deadlines from email",
    description:
      "CategorAIze pulls action items and due dates out of message text, so you never lose a request buried in a long thread. Tasks land in your summary view, ready to act on.",
  },
  {
    badge: { label: "Calendar-aware", variant: "dark-blue" as const },
    title: "Context from your schedule",
    description:
      "Priority scoring considers what's already on your calendar. A meeting request on a free afternoon scores differently from one that creates a conflict—keeping your day manageable.",
  },
  {
    badge: { label: "Privacy", variant: "gray" as const },
    title: "Privacy-first by design",
    description:
      "Your email content never trains shared models. Processing runs against your own account only. We follow data-minimisation principles and store nothing beyond what the UI needs.",
  },
  {
    badge: { label: "Automation", variant: "orange" as const },
    title: "Rules that act on priority",
    description:
      "Build AI-powered rules that trigger on priority level, category, language or sender. Auto-archive P5 noise, label P1 messages, and get out of the way of everything in between.",
  },
];

export function Features() {
  return (
    <Section id="features">
      <SectionHeading>Everything your inbox needs</SectionHeading>
      <SectionSubtitle>
        Purpose-built for inboxes that mix languages, senders and urgency
        levels.
      </SectionSubtitle>
      <SectionContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-left">
          {features.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 0.08}>
              <Card className="flex h-full flex-col gap-3 p-6">
                <Badge variant={f.badge.variant}>{f.badge.label}</Badge>
                <h3 className="font-title text-[#242424] text-lg font-semibold">
                  {f.title}
                </h3>
                <p className="font-geist text-sm text-[#848484] leading-relaxed">
                  {f.description}
                </p>
              </Card>
            </Reveal>
          ))}
        </div>
      </SectionContent>
    </Section>
  );
}
