import { AuditHero } from "@/components/audit-page/hero";
import { AuditProblem } from "@/components/audit-page/problem";
import { AuditProcess } from "@/components/audit-page/process";
import { AuditDeliverables } from "@/components/audit-page/deliverables";
import { AuditWhoItsFor } from "@/components/audit-page/who-its-for";
import { AuditForm } from "@/components/audit-page/form";

export default function BookAnAuditPage() {
  return (
    <main className="relative min-h-screen bg-bg text-ink">
      <AuditHero />
      <AuditProblem />
      <AuditProcess />
      <AuditDeliverables />
      <AuditWhoItsFor />
      <AuditForm />
    </main>
  );
}
