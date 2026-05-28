import { AuditHero } from "@/components/audit-page/hero";
import { AuditProblem } from "@/components/audit-page/problem";
import { AuditProcess } from "@/components/audit-page/process";

export default function BookAnAuditPage() {
  return (
    <main className="relative min-h-screen bg-bg text-ink">
      <AuditHero />
      <AuditProblem />
      <AuditProcess />
    </main>
  );
}
