import "server-only";

// The ONE module where the Woof Gang analyst touches the Urso HQ Brain. All
// cross-project composition lives here so the boundary stays auditable:
//   - the organization is the literal "woof-gang", resolved server-side —
//     never client-supplied, never the Brain's default org
//   - identity maps a Woof Gang dashboard session to a provisioned twin
//     principal (`wg:<auth uid>` in brain_memberships/brain_profiles, written
//     by scripts/provision-users.mjs --brain-twins); resolution stays the
//     Brain's own fail-closed resolveBrainPrincipal
//   - THIS FILE holds the fusion's only fail-open catch: any Brain-side
//     failure degrades the console to its pre-fusion behavior with a warn-log
//     canary. Do NOT migrate this catch into /api/brain/* — the Brain's own
//     routes keep their fail-closed (503, receipt-before-answer) semantics.
//
// scripts/check-brain-hosts.mjs lints these rules; see the fusion plan in the
// vault AI Layer doc.

import { resolveBrainPrincipal, getAuthorizedDocManifest } from "@/lib/brain/authorization";
import { buildBrainTools } from "@/lib/brain/tools";
import { ursoDbSafe } from "@/lib/brain/supabase";
import type { BrainPrincipal } from "@/lib/brain/types";
import { BUSINESS_SECTION_KEYS, type BusinessSection } from "@/lib/ai/business";
import type { SessionUser } from "@/lib/auth";

const WG_ORG = "woof-gang";
const CORPUS_PREFIX = "08 - Woof Gang Client Corpus/";
// If the live corpus outgrows this, fall back to the generated snapshot rather
// than blowing up the console's prompt budget (the F3 compiler is the real
// answer to a big corpus, and it unlocks on corpus growth anyway).
const MAX_CORPUS_TOKENS = 9_000;

export type WgBrainContext = {
  principal: BrainPrincipal;
  // Live business_context sections from the Brain corpus — an approved
  // proposal reaches the next conversation with no deploy. undefined = serve
  // the generated snapshot (missing docs, oversized corpus).
  liveSections: BusinessSection[] | undefined;
  // Exactly the proposal tool, nothing else from the Brain belt in v1 — the
  // model proposes, the steward publishes at /brain?org=woof-gang.
  proposalTools: { propose_knowledge_update: ReturnType<typeof buildBrainTools>["propose_knowledge_update"] };
};

const est = (s: string) => Math.ceil(s.length / 4);

// Resolve the fusion context for a Woof Gang session, or null (= run the
// console exactly as before fusion). Null paths: flag off, env missing, no
// twin provisioned, Brain unreachable.
export async function resolveWgBrainContext(user: SessionUser): Promise<WgBrainContext | null> {
  if (process.env.AI_BRAIN_FUSION !== "1") return null;
  const admin = ursoDbSafe();
  if (!admin) {
    console.warn("[brain-bridge] URSO_* env missing — console running without the knowledge layer");
    return null;
  }

  try {
    const principal = await resolveBrainPrincipal(
      admin,
      { id: `wg:${user.id}`, email: user.email, name: user.name },
      WG_ORG,
    );
    if (!principal) {
      // Canary, not an error: a session without a twin (new hire not yet
      // provisioned) just gets the pre-fusion console.
      console.warn(`[brain-bridge] no woof-gang twin for ${user.email} — run provision-users.mjs --brain-twins`);
      return null;
    }

    const [manifest, liveSections] = await Promise.all([
      getAuthorizedDocManifest(admin, principal, null),
      loadLiveSections(admin),
    ]);

    const tools = buildBrainTools({
      admin,
      principal,
      authorizedDocs: manifest,
      // v1 runs without the Context Compiler, so there is no receipt and no
      // E# evidence — proposals are gated by the steward's review alone.
      contextEvidence: [],
      projectId: null,
    });

    return { principal, liveSections, proposalTools: { propose_knowledge_update: tools.propose_knowledge_update } };
  } catch (e) {
    // The fusion's ONLY fail-open catch (see header): Brain down must never
    // take the owner's console down with it.
    console.warn(`[brain-bridge] Brain unreachable — console degrading to pre-fusion behavior: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

type CorpusRow = { path: string; title: string; description: string; content: string };

// The corpus docs, mapped by the export contract (key = basename minus .md,
// summary = description) and returned in the canonical business.ts order so
// live and generated sections stay interchangeable.
async function loadLiveSections(admin: NonNullable<ReturnType<typeof ursoDbSafe>>): Promise<BusinessSection[] | undefined> {
  const { data, error } = await admin
    .from("brain_docs")
    .select("path, title, description, content")
    .eq("organization_id", WG_ORG)
    .eq("doc_type", "doc")
    .is("deleted_at", null)
    .like("path", `${CORPUS_PREFIX}%`);
  if (error) throw new Error(`corpus read failed: ${error.message}`);
  const rows = (data ?? []) as CorpusRow[];
  if (!rows.length) return undefined; // corpus not synced yet → generated snapshot

  // The corpus contract assumes a FLAT folder of lowercase .md files (key =
  // basename minus .md, matching wg-knowledge-export.mjs exactly). A nested or
  // oddly-named doc would silently diverge from the generated snapshot's keys,
  // so refuse it loudly instead of serving a section nobody can request.
  const flat = rows.filter((r) => {
    const rel = r.path.slice(CORPUS_PREFIX.length);
    const ok = !rel.includes("/") && /\.md$/i.test(rel);
    if (!ok) console.warn(`[brain-bridge] corpus doc outside the flat contract, skipping: ${r.path}`);
    return ok;
  });

  const sections: BusinessSection[] = flat.map((r) => ({
    key: r.path.split("/").pop()!.replace(/\.md$/i, ""),
    title: r.title,
    summary: r.description,
    body: r.content,
  }));

  const total = sections.reduce((s, x) => s + est(x.body), 0);
  if (total > MAX_CORPUS_TOKENS) {
    console.warn(`[brain-bridge] live corpus ~${total} tokens exceeds ${MAX_CORPUS_TOKENS} — serving the generated snapshot`);
    return undefined;
  }

  const order = new Map(BUSINESS_SECTION_KEYS.map((k, i) => [k, i]));
  return sections.sort((a, b) => (order.get(a.key) ?? 99) - (order.get(b.key) ?? 99) || (a.key < b.key ? -1 : 1));
}
