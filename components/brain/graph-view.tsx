"use client";

// The vault graph — every doc a node, every [[wikilink]] an edge, exactly like
// Obsidian's graph view but living in the brain. Hand-rolled force simulation
// on canvas (no dependencies): repulsion + edge springs + center gravity, with
// pan/zoom, hover highlighting, and click-through to the doc.

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export type GraphNode = {
  path: string;
  title: string;
  project: string | null;
  department: string | null;
  type: "core" | "doc" | "rule";
  origin: "vault" | "brain";
};

const PROJECT_COLORS: Record<string, string> = {
  "woof-gang": "#f0b429",
  canes: "#fe5100",
  "1500-blueprint": "#5aa7f7",
  "health-monitor-one": "#3ecf8e",
  "urso-brain": "#b78af7",
};
const FALLBACK_PROJECT = "#8a94a6";

function nodeColor(n: GraphNode): string {
  if (n.type === "core") return "#f5f5f5";
  if (n.type === "rule") return "#f4506e";
  if (n.project) return PROJECT_COLORS[n.project] ?? FALLBACK_PROJECT;
  if (n.department) return "#7f8ea3";
  return FALLBACK_PROJECT;
}

export function GraphLegend({ projects }: { projects: { id: string; name: string }[] }) {
  const items: { color: string; label: string }[] = [
    { color: "#f5f5f5", label: "Company core" },
    { color: "#f4506e", label: "Standing rules" },
    ...projects.map((p) => ({ color: PROJECT_COLORS[p.id] ?? FALLBACK_PROJECT, label: p.name })),
    { color: "#7f8ea3", label: "Departments" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim">
          <span className="size-2 rounded-full" style={{ background: i.color }} /> {i.label}
        </span>
      ))}
    </div>
  );
}

type Sim = { x: number; y: number; vx: number; vy: number }[];

export function GraphView({ nodes, edges }: { nodes: GraphNode[]; edges: [number, number][] }) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const n = nodes.length;
    // Degree drives node size + which labels are always on.
    const degree = new Array<number>(n).fill(0);
    for (const [s, t] of edges) {
      degree[s]++;
      degree[t]++;
    }
    const neighbors: Set<number>[] = Array.from({ length: n }, () => new Set());
    for (const [s, t] of edges) {
      neighbors[s].add(t);
      neighbors[t].add(s);
    }
    const radius = (i: number) => 3 + Math.sqrt(degree[i]) * 1.6;

    // Deterministic-ish spiral seed keeps the layout stable across visits.
    const sim: Sim = nodes.map((_, i) => {
      const a = i * 2.399963; // golden angle
      const r = 22 * Math.sqrt(i + 1);
      return { x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0 };
    });

    let width = 0;
    let height = 0;
    let scale = 1;
    let panX = 0;
    let panY = 0;
    let alpha = 1;
    let raf = 0;
    // Hover lives entirely inside this effect (nothing in JSX depends on it) —
    // the rAF loop redraws every frame anyway.
    let hover: number | null = null;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      width = rect.width;
      height = Math.max(420, rect.height);
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const tick = () => {
      // Repulsion (O(n²) — fine at vault scale) + springs + gravity.
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const dx = sim[j].x - sim[i].x;
          const dy = sim[j].y - sim[i].y;
          const d2 = dx * dx + dy * dy + 0.01;
          const f = Math.min(1200 / d2, 6);
          const d = Math.sqrt(d2);
          const fx = (dx / d) * f;
          const fy = (dy / d) * f;
          sim[i].vx -= fx;
          sim[i].vy -= fy;
          sim[j].vx += fx;
          sim[j].vy += fy;
        }
      }
      for (const [s, t] of edges) {
        const dx = sim[t].x - sim[s].x;
        const dy = sim[t].y - sim[s].y;
        const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
        const f = (d - 70) * 0.015;
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        sim[s].vx += fx;
        sim[s].vy += fy;
        sim[t].vx -= fx;
        sim[t].vy -= fy;
      }
      for (const p of sim) {
        p.vx -= p.x * 0.004; // gravity toward center
        p.vy -= p.y * 0.004;
        p.x += p.vx * alpha;
        p.y += p.vy * alpha;
        p.vx *= 0.82;
        p.vy *= 0.82;
      }
      alpha = Math.max(0.02, alpha * 0.995);
    };

    const toScreen = (x: number, y: number): [number, number] => [width / 2 + panX + x * scale, height / 2 + panY + y * scale];

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      const hov = hover;

      ctx.lineWidth = 1;
      for (const [s, t] of edges) {
        const [x1, y1] = toScreen(sim[s].x, sim[s].y);
        const [x2, y2] = toScreen(sim[t].x, sim[t].y);
        const lit = hov !== null && (s === hov || t === hov);
        ctx.strokeStyle = lit ? "rgba(254,81,0,0.55)" : "rgba(255,255,255,0.07)";
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      for (let i = 0; i < n; i++) {
        const [x, y] = toScreen(sim[i].x, sim[i].y);
        const r = radius(i) * Math.min(scale, 1.4);
        const dimmed = hov !== null && i !== hov && !neighbors[hov].has(i);
        ctx.globalAlpha = dimmed ? 0.25 : 1;
        ctx.fillStyle = nodeColor(nodes[i]);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        if (nodes[i].origin === "brain") {
          ctx.strokeStyle = "#fe5100";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(x, y, r + 2.5, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      ctx.font = "10.5px ui-monospace, monospace";
      ctx.textAlign = "center";
      for (let i = 0; i < n; i++) {
        const always = degree[i] >= 6;
        if (!always && i !== hov) continue;
        const [x, y] = toScreen(sim[i].x, sim[i].y);
        const label = nodes[i].title.length > 34 ? `${nodes[i].title.slice(0, 33)}…` : nodes[i].title;
        ctx.fillStyle = i === hov ? "#ffffff" : "rgba(255,255,255,0.45)";
        ctx.fillText(label, x, y - radius(i) * Math.min(scale, 1.4) - 6);
      }
    };

    const loop = () => {
      if (alpha > 0.025) tick();
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const nodeAt = (mx: number, my: number): number | null => {
      let best: number | null = null;
      let bestD = 14 * 14;
      for (let i = 0; i < n; i++) {
        const [x, y] = toScreen(sim[i].x, sim[i].y);
        const d = (x - mx) ** 2 + (y - my) ** 2;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return best;
    };

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let moved = false;

    const onDown = (e: PointerEvent) => {
      dragging = true;
      moved = false;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      if (dragging) {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
        panX += dx;
        panY += dy;
        lastX = e.clientX;
        lastY = e.clientY;
      } else {
        hover = nodeAt(mx, my);
        canvas.style.cursor = hover !== null ? "pointer" : "grab";
      }
    };
    const onUp = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (dragging && !moved) {
        const hit = nodeAt(e.clientX - rect.left, e.clientY - rect.top);
        if (hit !== null) router.push(`/brain/docs/view?path=${encodeURIComponent(nodes[hit].path)}`);
      }
      dragging = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const next = Math.min(3, Math.max(0.35, scale * (e.deltaY < 0 ? 1.12 : 0.9)));
      scale = next;
      alpha = Math.max(alpha, 0.05); // keep rendering
    };
    const onLeave = () => {
      hover = null;
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("pointerleave", onLeave);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, [nodes, edges, router]);

  return (
    <div ref={wrapRef} className="h-[68vh] min-h-[420px] w-full overflow-hidden rounded-none border border-edge bg-panel">
      <canvas ref={canvasRef} aria-label="Vault graph — every doc a node, every wikilink an edge" role="img" />
    </div>
  );
}
