import { ServiceCancellation } from "../components/service-cancellation";
export const metadata = {
  title: "Manage recurring service",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export const maxDuration = 60;
export default function CancellationPage() {
  return (
    <main className="mx-auto max-w-xl px-5 py-8">
      <p className="mb-5 text-sm text-[var(--cp-muted)]">
        Canes Pressure Washing
      </p>
      <ServiceCancellation />
    </main>
  );
}
