import { AnnouncementBar } from "@/components/announcement-bar";
import { Nav } from "@/components/nav";
import { Hero } from "@/components/hero";
import { OperatingSystem } from "@/components/operating-system";
import { Research } from "@/components/research";
import { AuditCta } from "@/components/audit-cta";
import { Footer } from "@/components/footer";

export default function Home() {
  return (
    <main className="bg-bg text-ink">
      <AnnouncementBar />
      <Nav />
      <Hero />
      <OperatingSystem />
      <Research />
      <AuditCta />
      <Footer />
    </main>
  );
}
