import { AnnouncementBar } from "@/components/announcement-bar";
import { Nav } from "@/components/nav";
import { Hero } from "@/components/hero";
import { HowItWorks } from "@/components/how-it-works";
import { OperatingSystem } from "@/components/operating-system";
import { Modules } from "@/components/modules";
import { Research } from "@/components/research";
import { AuditCta } from "@/components/audit-cta";
import { Footer } from "@/components/footer";

export default function Home() {
  return (
    <main className="bg-bg text-ink">
      <AnnouncementBar />
      <Nav />
      <Hero />
      <HowItWorks />
      <OperatingSystem />
      <Modules />
      <Research />
      <AuditCta />
      <Footer />
    </main>
  );
}
