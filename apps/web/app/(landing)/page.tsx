import { redirect } from "next/navigation";
import { Nav } from "@/app/(landing)/home/Nav";
import { Hero } from "@/app/(landing)/home/Hero";
import { Features } from "@/app/(landing)/home/Features";
import { FinalCTA } from "@/app/(landing)/home/FinalCTA";
import { Footer } from "@/app/(landing)/home/Footer";

export default async function LandingPage() {
  let session = null;
  try {
    const { auth } = await import("@/utils/auth");
    session = await auth();
  } catch {
    // Auth may fail in dev when provider env vars are absent; show landing page
  }

  if (session?.user?.email) {
    redirect("/accounts");
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Nav />
      <main className="flex-1">
        <div className="max-w-6xl mx-auto px-6 lg:px-8 xl:px-0">
          <Hero />
          <Features />
        </div>
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
