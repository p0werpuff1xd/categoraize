import { cn } from "@/utils";
import { Header } from "@/components/new-landing/sections/Header";

const LAYOUT_CLASSNAME = "max-w-6xl mx-auto px-6 lg:px-8 xl:px-0";

export function BasicLayout(props: { children: React.ReactNode }) {
  return (
    <div>
      <Header className={LAYOUT_CLASSNAME} />
      <main className={cn("isolate", LAYOUT_CLASSNAME)}>{props.children}</main>
    </div>
  );
}
