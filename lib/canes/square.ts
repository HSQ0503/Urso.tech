import { squareConfigured } from "@/lib/canes/supabase";
import type { Estimate } from "@/lib/canes/types";

// Square deposit links — stubbed until the Square credentials are connected.
// approveEstimate calls this to offer a deposit checkout; while Square is not
// configured it returns { url: null, skipped } and the UI just omits the button.
export async function createDepositLink(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  estimate: Estimate,
): Promise<{ url: string | null; skipped?: string }> {
  if (!squareConfigured()) return { url: null, skipped: "Square not connected yet" };
  // Real Square Checkout link creation lands in a later phase; the deposit
  // amount is estimate.deposit_cents against CANES_SQUARE_LOCATION_ID.
  return { url: null, skipped: "Square deposit links not implemented yet" };
}
