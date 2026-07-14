import { canesDb } from "@/lib/canes/supabase";
import { isDemo, getSettings } from "@/lib/canes/data";
import { DEMO_INVOICE_REWARDS } from "@/lib/canes/fixtures";
import type { CanesSettings, InvoiceReward, InvoiceRewardKind } from "@/lib/canes/types";

// Reads for the review-rewards layer (0012). Mirrors lib/canes/invoices.ts:
// demo-safe reads with a fixtures fallback; every WRITE lives in actions.ts
// (claim / approve / decline / toggle) where the money math and guards are.

export async function listInvoiceRewards(invoiceId: string): Promise<InvoiceReward[]> {
  if (isDemo()) {
    return DEMO_INVOICE_REWARDS.filter((r) => r.invoice_id === invoiceId);
  }
  const { data, error } = await canesDb()
    .from("invoice_rewards")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: true })
    .limit(10);
  if (error) throw new Error(`listInvoiceRewards: ${error.message}`);
  return (data ?? []) as InvoiceReward[];
}

// Per-kind offer defaults derived from Settings. `configured` gates seeding and
// the toggles: an offer with no destination link can never reach a customer.
export type RewardConfig = Record<
  InvoiceRewardKind,
  { label: string; cents: number; configured: boolean; urls: { label: string; url: string }[] }
>;

export function rewardConfigFrom(s: CanesSettings): RewardConfig {
  const r = s.review_rewards;
  return {
    google_review: {
      label: "Google review",
      cents: r.google_cents,
      configured: Boolean(r.google_url) && r.google_cents > 0,
      urls: r.google_url ? [{ label: "Write a Google review", url: r.google_url }] : [],
    },
    facebook_review: {
      label: "Facebook review",
      cents: r.facebook_cents,
      configured: Boolean(r.facebook_url) && r.facebook_cents > 0,
      urls: r.facebook_url ? [{ label: "Review us on Facebook", url: r.facebook_url }] : [],
    },
    social_follow: {
      label: "Instagram + Facebook follow",
      cents: r.follow_cents,
      configured: Boolean(r.instagram_url || r.facebook_url) && r.follow_cents > 0,
      urls: [
        ...(r.instagram_url ? [{ label: "Follow on Instagram", url: r.instagram_url }] : []),
        ...(r.facebook_url ? [{ label: "Follow on Facebook", url: r.facebook_url }] : []),
      ],
    },
  };
}

export async function getRewardConfig(): Promise<RewardConfig> {
  return rewardConfigFrom(await getSettings());
}
