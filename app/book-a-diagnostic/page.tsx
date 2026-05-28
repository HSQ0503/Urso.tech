import { DiagnosticHero } from "@/components/diagnostic-page/hero";
import { DiagnosticFlow } from "@/components/diagnostic-page/flow";

export default function BookADiagnosticPage() {
  return (
    <main className="relative min-h-screen bg-bg text-ink">
      <DiagnosticHero />
      <DiagnosticFlow />
    </main>
  );
}
