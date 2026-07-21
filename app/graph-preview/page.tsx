// TEMPORARY verification harness for components/brain/graph-view.tsx.
// Outside /brain so the proxy auth matcher doesn't gate it. Delete after use.

import { GraphLegend, GraphView, type GraphNode } from "@/components/brain/graph-view";

const RAW: [string, string, string | null, string | null, GraphNode["type"], GraphNode["origin"]][] = [
  ["00 - Start Here", "00 - Start Here", null, null, "core", "vault"],
  ["What Urso Is", "What Urso Is", null, null, "core", "vault"],
  ["The Model", "The Model", null, null, "core", "vault"],
  ["Who We Serve", "Who We Serve", null, null, "core", "vault"],
  ["How I Work", "How I Work", null, null, "rule", "vault"],
  ["The Operating System", "The Operating System", null, null, "core", "vault"],
  ["The Audit Playbook", "The Audit Playbook", null, "ops", "doc", "vault"],
  ["Operations Runbook", "Operations Runbook", null, "ops", "doc", "vault"],
  ["Open Items", "Open Items", null, "ops", "doc", "brain"],
  ["Meeting Notes", "Meeting Notes", null, "ops", "doc", "vault"],
  ["Gotchas & Decisions Log", "Gotchas & Decisions Log", null, "eng", "doc", "brain"],
  ["Code Map", "Code Map — Files & Responsibilities", null, "eng", "doc", "brain"],
  ["wikilinks", "wikilinks", null, "eng", "doc", "brain"],
  ["WG Overview", "Woof Gang Overview", "woof-gang", null, "doc", "vault"],
  ["WG Pilot", "The Pilot", "woof-gang", null, "doc", "vault"],
  ["WG Stores", "The Stores", "woof-gang", null, "doc", "vault"],
  ["WG Leaks", "Suspected Leaks", "woof-gang", null, "doc", "vault"],
  ["WG Systems", "Systems Designed", "woof-gang", null, "doc", "vault"],
  ["WG Sources", "Data Sources & Integrations", "woof-gang", null, "doc", "vault"],
  ["WG Pitch", "Woof Gang Pitch", "woof-gang", null, "doc", "vault"],
  ["WG Handoff", "Dashboard — Build Handoff", "woof-gang", null, "doc", "vault"],
  ["WG Rebuild", "Dashboard — Rebuild Plan", "woof-gang", null, "doc", "brain"],
  ["WG Manager", "Manager Dashboard — Spec", "woof-gang", null, "doc", "vault"],
  ["WG Auth", "Manager Dashboard & Auth — Build Plan", "woof-gang", null, "doc", "vault"],
  ["WG Supabase", "Dashboard — Supabase Backend", "woof-gang", null, "doc", "vault"],
  ["INT FranPOS", "Integration — FranPOS", "woof-gang", null, "doc", "vault"],
  ["INT QBO", "Integration — QuickBooks", "woof-gang", null, "doc", "vault"],
  ["INT Twilio", "Integration — Twilio", "woof-gang", null, "doc", "vault"],
  ["INT GBP", "Integration — Google Business Profile", "woof-gang", null, "doc", "vault"],
  ["INT Arch", "Integration Architecture — Connecting the Sources", null, "eng", "doc", "vault"],
  ["INT Access", "Integration — Access Runbook (Owner Meeting)", "woof-gang", null, "doc", "vault"],
  ["Pipeline", "Data Pipeline — FranPOS Handoff", "woof-gang", null, "doc", "vault"],
  ["Canes Overview", "Canes Pressure Washing Overview", "canes", null, "doc", "vault"],
  ["Canes Spec", "Platform — Product Spec", "canes", null, "doc", "vault"],
  ["Canes Auth", "Platform — Multi-Tenancy & Auth", "canes", null, "doc", "vault"],
  ["Canes Runbook", "Phase 1 Runbook", "canes", null, "doc", "vault"],
  ["Canes Tests", "Phase 1 — Test Plan", "canes", null, "doc", "vault"],
  ["Canes P2", "Phase 2 — System Test Plan", "canes", null, "doc", "vault"],
  ["Canes P5", "Phase 5 — Growth Build & Handoff", "canes", null, "doc", "vault"],
  ["Canes Est", "Estimates — Phase 2 Build Plan", "canes", null, "doc", "brain"],
  ["Canes Tel", "Telephony — Twilio, GHL Migration & A2P", "canes", null, "doc", "vault"],
  ["Canes Meet", "Meeting Notes — Canes", "canes", null, "doc", "vault"],
  ["Canes Handoff", "_Handoff", "canes", null, "doc", "vault"],
  ["HM One", "Health Monitor One Overview", "health-monitor-one", null, "doc", "vault"],
  ["HM Spec", "Health Monitor — Product Spec", "health-monitor-one", null, "doc", "vault"],
  ["1500 Start", "1500 — Start Here", "1500-blueprint", null, "doc", "vault"],
  ["1500 Drills", "1500 Blueprint Drills Overview", "1500-blueprint", null, "doc", "vault"],
  ["1500 Product", "1500 — Product & Build", "1500-blueprint", null, "doc", "vault"],
  ["1500 Brand", "1500 — Brand & Styling", "1500-blueprint", null, "doc", "vault"],
  ["1500 Board", "1500 — Community Board", "1500-blueprint", null, "doc", "vault"],
  ["1500 Open", "1500 — Open Items", "1500-blueprint", null, "doc", "vault"],
  ["1500 Practice", "1500 — Practice Test Platform (Bluebook Emulator)", "1500-blueprint", null, "doc", "vault"],
  ["Brain Spec", "Urso Brain — Product & v1 Spec", "urso-brain", null, "doc", "vault"],
  ["Brain Arch", "Architecture — How the Brain Works", "urso-brain", null, "doc", "brain"],
  ["AI Layer", "AI Layer — urso.ai Analyst", "urso-brain", null, "doc", "vault"],
  ["Money", "Money — Profit & Cost Layer", "urso-brain", null, "doc", "brain"],
  ["Sales Play", "Sales — Discovery Call Script", null, "sales", "doc", "vault"],
  ["Pricing", "Pricing & Packaging", null, "sales", "rule", "vault"],
  ["Brand Rules", "Brand — Voice & Tone", null, "brand", "rule", "vault"],
  ["Sec Rules", "Security — Key Handling", null, "eng", "rule", "vault"],
  ["Nimbus", "Nimbus Logistics Overview", "nimbus-logistics", null, "doc", "vault"],
  ["Harbor", "Harbor Dental Overview", "harbor-dental", null, "doc", "vault"],
];

const LINKS: [string, string][] = [
  ["00 - Start Here", "What Urso Is"], ["00 - Start Here", "The Model"], ["00 - Start Here", "Who We Serve"],
  ["00 - Start Here", "How I Work"], ["00 - Start Here", "The Operating System"], ["00 - Start Here", "The Audit Playbook"],
  ["00 - Start Here", "Operations Runbook"], ["00 - Start Here", "Open Items"], ["00 - Start Here", "Meeting Notes"],
  ["00 - Start Here", "WG Overview"], ["00 - Start Here", "Canes Overview"], ["00 - Start Here", "HM One"],
  ["00 - Start Here", "1500 Start"], ["00 - Start Here", "Brain Spec"], ["00 - Start Here", "Code Map"],
  ["00 - Start Here", "Gotchas & Decisions Log"], ["00 - Start Here", "AI Layer"], ["00 - Start Here", "WG Sources"],
  ["00 - Start Here", "WG Systems"], ["00 - Start Here", "WG Stores"], ["00 - Start Here", "WG Leaks"],
  ["00 - Start Here", "Pipeline"], ["00 - Start Here", "Canes Handoff"], ["00 - Start Here", "INT GBP"],
  ["00 - Start Here", "Sales Play"], ["00 - Start Here", "Brand Rules"],
  ["What Urso Is", "The Model"], ["What Urso Is", "Who We Serve"], ["The Model", "The Operating System"],
  ["The Model", "The Audit Playbook"], ["The Model", "WG Overview"], ["Who We Serve", "WG Overview"],
  ["The Operating System", "WG Sources"], ["The Operating System", "INT Arch"], ["The Operating System", "WG Systems"],
  ["WG Overview", "WG Pilot"], ["WG Overview", "WG Stores"], ["WG Overview", "WG Leaks"], ["WG Overview", "WG Systems"],
  ["WG Overview", "WG Sources"], ["WG Overview", "WG Pitch"], ["WG Pilot", "WG Handoff"], ["WG Pilot", "WG Manager"],
  ["WG Handoff", "WG Rebuild"], ["WG Handoff", "WG Supabase"], ["WG Handoff", "WG Manager"], ["WG Manager", "WG Auth"],
  ["WG Auth", "WG Supabase"], ["WG Sources", "INT FranPOS"], ["WG Sources", "INT QBO"], ["WG Sources", "INT Twilio"],
  ["WG Sources", "INT GBP"], ["WG Sources", "INT Access"], ["INT Arch", "INT FranPOS"], ["INT Arch", "INT QBO"],
  ["INT Arch", "INT Twilio"], ["INT FranPOS", "Pipeline"], ["Pipeline", "WG Supabase"], ["WG Leaks", "Money"],
  ["INT QBO", "Money"], ["Money", "AI Layer"], ["WG Rebuild", "WG Supabase"], ["INT Access", "INT Twilio"],
  ["Canes Overview", "Canes Spec"], ["Canes Overview", "Canes Auth"], ["Canes Overview", "Canes Runbook"],
  ["Canes Overview", "Canes Est"], ["Canes Overview", "Canes Tel"], ["Canes Overview", "Canes Meet"],
  ["Canes Overview", "Canes Handoff"], ["Canes Spec", "Canes Auth"], ["Canes Spec", "Canes Runbook"],
  ["Canes Spec", "Canes P2"], ["Canes Spec", "Canes P5"], ["Canes Runbook", "Canes Tests"], ["Canes Tests", "Canes P2"],
  ["Canes P2", "Canes P5"], ["Canes Est", "Canes P2"], ["Canes Tel", "INT Twilio"], ["Canes Handoff", "Canes Runbook"],
  ["Canes Handoff", "Canes Meet"], ["Canes Auth", "WG Auth"],
  ["HM One", "HM Spec"], ["HM One", "The Audit Playbook"], ["HM Spec", "Canes Spec"],
  ["1500 Start", "1500 Drills"], ["1500 Start", "1500 Product"], ["1500 Start", "1500 Brand"],
  ["1500 Start", "1500 Board"], ["1500 Start", "1500 Open"], ["1500 Start", "1500 Practice"],
  ["1500 Drills", "1500 Product"], ["1500 Product", "1500 Practice"], ["1500 Product", "1500 Board"],
  ["Brain Spec", "Brain Arch"], ["Brain Spec", "AI Layer"], ["Brain Arch", "wikilinks"], ["Brain Arch", "Code Map"],
  ["wikilinks", "Code Map"], ["Gotchas & Decisions Log", "Code Map"], ["Sec Rules", "Brain Arch"],
  ["Sales Play", "Pricing"], ["Pricing", "The Model"], ["Brand Rules", "1500 Brand"],
  ["Nimbus", "The Audit Playbook"], ["Harbor", "The Audit Playbook"], ["Nimbus", "The Operating System"],
  ["Meeting Notes", "Canes Meet"], ["Operations Runbook", "The Audit Playbook"], ["Open Items", "1500 Open"],
];

export default function GraphPreviewPage() {
  const nodes: GraphNode[] = RAW.map(([path, title, project, department, type, origin]) => ({
    path,
    title,
    project,
    department,
    type,
    origin,
  }));
  const idx = new Map(nodes.map((n, i) => [n.path, i]));
  const edges: [number, number][] = LINKS.map(([a, b]) => [idx.get(a)!, idx.get(b)!]);

  const projects = [
    { id: "woof-gang", name: "Woof Gang" },
    { id: "canes", name: "Canes" },
    { id: "1500-blueprint", name: "1500 Blueprint" },
    { id: "health-monitor-one", name: "Health Monitor One" },
    { id: "urso-brain", name: "Urso Brain" },
    { id: "nimbus-logistics", name: "Nimbus Logistics" },
    { id: "harbor-dental", name: "Harbor Dental" },
  ];

  return (
    <div className="theme-scope min-h-screen bg-bg px-6 py-5">
      <div className="mx-auto w-full max-w-[1180px]">
        <div className="mb-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-orange">Urso Brain · Graph</div>
          <h1 className="mt-1.5 text-[22px] font-bold tracking-[-0.02em] text-ink">The vault graph</h1>
          <p className="mt-1 text-[13px] text-ink-dim">
            {nodes.length} docs · {edges.length} connections. Hover to trace, click to open, drag a node to pull it out,
            scroll to zoom, double-click to refit.
          </p>
        </div>
        <GraphView nodes={nodes} edges={edges} />
        <div className="mt-3">
          <GraphLegend projects={projects} />
        </div>
      </div>
    </div>
  );
}
