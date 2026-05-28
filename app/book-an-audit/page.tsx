import { AuditHero } from "@/components/audit-page/hero";
import { AuditProcess } from "@/components/audit-page/process";
import { AuditDeliverables } from "@/components/audit-page/deliverables";
import { AuditCommitment } from "@/components/audit-page/commitment";
import { AuditForm } from "@/components/audit-page/form";

export default function BookAnAuditPage() {
  return (
    <main className="relative min-h-screen bg-bg text-ink">
      <AuditHero />
      <AuditProcess />
      <AuditDeliverables />
      <AuditCommitment />
      <AuditForm />
    </main>
  );
}
