"use client";

// The vault graph — every doc a node, every [[wikilink]] an edge, in the spirit
// of Obsidian's graph view. Hand-rolled on canvas, no dependencies:
//
//   forces   Barnes-Hut repulsion + d3-style link springs + centring, run on a
//            d3 alpha schedule. The layout is pre-warmed off-screen and fitted
//            to the viewport, so the graph opens settled instead of crawling
//            into shape while you watch.
//   input    pan, zoom-to-cursor, pinch, drag-a-node, click-through to the doc.
//   focus    hovering eases every unrelated node/edge/label down to a whisper
//            and lights the neighbourhood — Obsidian's signature read.
//
// Colours are CSS tokens (globals.css, .theme-scope) read off the wrapper's
// computed style and re-read when data-theme flips. Canvas cannot resolve
// var(), and this is the seam that keeps it inside the one-palette rule.

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

// ---------------------------------------------------------------- palette ---

// Projects are identified by hue only; the theme supplies saturation and
// lightness, which is what lets one hue stay legible on both #0b0b0b and white.
// Ids are dynamic (brain_projects grows), so anything unlisted gets a stable
// hash-derived hue rotated clear of the reserved ones — a new client can never
// render as an existing one, which the old fixed map could not promise.
const PROJECT_HUES: Record<string, number> = {
  "woof-gang": 43,
  canes: 20,
  "1500-blueprint": 212,
  "health-monitor-one": 158,
  "urso-brain": 272,
};
const RULE_HUE = 350;
const RESERVED = [...Object.values(PROJECT_HUES), RULE_HUE];

const hueGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

export function projectHue(id: string): number {
  const known = PROJECT_HUES[id];
  if (known !== undefined) return known;
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  let hue = (h >>> 0) % 360;
  for (let guard = 0; guard < 24 && RESERVED.some((r) => hueGap(hue, r) < 26); guard++) hue = (hue + 47) % 360;
  return hue;
}

type Palette = {
  bg: string;
  node: string;
  nodeSoft: string;
  core: string;
  edge: string;
  label: string;
  labelStrong: string;
  focus: string;
  sat: string;
  light: string;
  font: string;
};

function readPalette(el: HTMLElement): Palette {
  const cs = getComputedStyle(el);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    bg: v("--graph-bg", "#0b0b0b"),
    node: v("--graph-node", "rgba(255,255,255,0.66)"),
    nodeSoft: v("--graph-node-soft", "rgba(255,255,255,0.34)"),
    core: v("--graph-core", "rgba(255,255,255,0.95)"),
    edge: v("--graph-edge", "rgba(255,255,255,0.14)"),
    label: v("--graph-label", "rgba(255,255,255,0.58)"),
    labelStrong: v("--graph-label-strong", "#ffffff"),
    focus: v("--graph-focus", "#fe5100"),
    sat: v("--graph-sat", "62%"),
    light: v("--graph-light", "62%"),
    // Resolved stack, not the --font-sans token: that token nests another
    // var(), which ctx.font cannot parse.
    font: cs.fontFamily || "system-ui, sans-serif",
  };
}

// Departments stay neutral and projects stay chromatic — that separation is
// what fixes the old #8a94a6 / #7f8ea3 collision, where "unknown project" and
// "department" were the same grey to the eye.
function nodeColor(n: GraphNode, p: Palette): string {
  if (n.type === "core") return p.core;
  if (n.type === "rule") return `hsl(${RULE_HUE} ${p.sat} ${p.light})`;
  if (n.project) return `hsl(${projectHue(n.project)} ${p.sat} ${p.light})`;
  if (n.department) return p.node;
  return p.nodeSoft;
}

// ----------------------------------------------------------------- legend ---

export function GraphLegend({ projects }: { projects: { id: string; name: string }[] }) {
  const swatch = (hue: number) => `hsl(${hue} var(--graph-sat) var(--graph-light))`;
  const items: { color: string; label: string; ring?: boolean }[] = [
    { color: "var(--graph-core)", label: "Company core" },
    { color: swatch(RULE_HUE), label: "Standing rules" },
    ...projects.map((p) => ({ color: swatch(projectHue(p.id)), label: p.name })),
    { color: "var(--graph-node)", label: "Departments" },
    { color: "var(--graph-node-soft)", label: "Brain-written", ring: true },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5 text-[11px] text-[var(--ob-faint)]">
          <span
            className="size-2 rounded-full"
            style={
              i.ring
                ? { background: i.color, boxShadow: "0 0 0 1.5px var(--graph-bg), 0 0 0 3px var(--graph-focus)" }
                : { background: i.color }
            }
          />
          {i.label}
        </span>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ forces ---

// Tuned as a set — changing one wants a look at the others. REPEL is a 1/d law
// (d3-force's manyBody), not 1/d²: in 2D the log potential is what keeps a
// sparse graph from blowing apart while a dense one stays readable.
const REPEL = 340;
const LINK_DIST = 55;
const GRAVITY = 0.045;
// Floor on the squared distance used for repulsion. Without a generous one the
// close-range term delivers kicks big enough to fling the graph apart on the
// first ticks, and gravity then packs the wreckage into a ball. Overlap is the
// separation term's job, not this one's.
const MIN_D2 = 25;
const VELOCITY_KEEP = 0.6;
const THETA2 = 0.81; // Barnes-Hut θ = 0.9, squared
const ALPHA_MIN = 0.001;
const ALPHA_DECAY = 1 - Math.pow(ALPHA_MIN, 1 / 300);
const PREWARM_TICKS = 260;
const DIM = 0.09; // what an unrelated node fades to while another is focused

export function GraphView({ nodes, edges }: { nodes: GraphNode[]; edges: [number, number][] }) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const n = nodes.length;
    if (n === 0) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let pal = readPalette(wrap);
    let colors = nodes.map((d) => nodeColor(d, pal));
    // Gravity is split per axis so the settled blob can be stretched to the
    // panel's aspect — see resize(). Equal until the real width is known.
    let gx = GRAVITY;
    let gy = GRAVITY;

    // ---- topology -------------------------------------------------------
    const degree = new Int32Array(n);
    for (const [s, t] of edges) {
      degree[s]++;
      degree[t]++;
    }
    const neighbors: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
    for (const [s, t] of edges) {
      neighbors[s].add(t);
      neighbors[t].add(s);
    }
    // Hubs read ~2.5× a leaf, which is the proportion that makes the shape of
    // the vault legible at a glance.
    const rad = new Float64Array(n);
    for (let i = 0; i < n; i++) rad[i] = Math.min(16, 3.6 + Math.sqrt(degree[i]) * 2.2);

    // d3's link model: springs between hubs are stiffer, and the bias makes the
    // leaf travel rather than the hub.
    const eCount = edges.length;
    const eStrength = new Float64Array(eCount);
    const eBias = new Float64Array(eCount);
    for (let i = 0; i < eCount; i++) {
      const [s, t] = edges[i];
      eStrength[i] = 1 / Math.min(degree[s], degree[t]);
      eBias[i] = degree[s] / (degree[s] + degree[t]);
    }

    // ---- state (flat typed arrays — property access on an array of objects
    // dominated the old frame cost) --------------------------------------
    const px = new Float64Array(n);
    const py = new Float64Array(n);
    const vx = new Float64Array(n);
    const vy = new Float64Array(n);
    const focus = new Float64Array(n).fill(1); // eased hover falloff
    const labelAlpha = new Float64Array(n);

    // Golden-angle spiral seed: deterministic, so the same vault lays out the
    // same way on every visit.
    for (let i = 0; i < n; i++) {
      const a = i * 2.399963;
      const r = 22 * Math.sqrt(i + 1);
      px[i] = Math.cos(a) * r;
      py[i] = Math.sin(a) * r;
    }

    // ---- Barnes-Hut quadtree --------------------------------------------
    // Flat arrays, rebuilt each tick. A cell is an empty leaf (body -1, no
    // children), a leaf holding one body, or internal. Turns the old O(n²)
    // all-pairs pass into O(n log n), which is where the frame budget went.
    const CAP = Math.max(64, n * 12);
    const qChild = new Int32Array(CAP * 4);
    const qBody = new Int32Array(CAP);
    const qMass = new Float64Array(CAP);
    const qCx = new Float64Array(CAP);
    const qCy = new Float64Array(CAP);
    const qX = new Float64Array(CAP);
    const qY = new Float64Array(CAP);
    const qS = new Float64Array(CAP);
    const stack = new Int32Array(256);
    let qCount = 0;

    const quadOf = (cell: number, x: number, y: number) => {
      const half = qS[cell] / 2;
      return (x >= qX[cell] + half ? 1 : 0) | (y >= qY[cell] + half ? 2 : 0);
    };

    const subdivide = (cell: number) => {
      const half = qS[cell] / 2;
      for (let q = 0; q < 4; q++) {
        const c = qCount++;
        qChild[cell * 4 + q] = c;
        qChild[c * 4] = -1;
        qChild[c * 4 + 1] = -1;
        qChild[c * 4 + 2] = -1;
        qChild[c * 4 + 3] = -1;
        qBody[c] = -1;
        qMass[c] = 0;
        qX[c] = qX[cell] + (q & 1 ? half : 0);
        qY[c] = qY[cell] + (q & 2 ? half : 0);
        qS[c] = half;
      }
    };

    const insert = (i: number) => {
      let cell = 0;
      for (let depth = 0; depth < 26; depth++) {
        if (qChild[cell * 4] !== -1) {
          cell = qChild[cell * 4 + quadOf(cell, px[i], py[i])];
          continue;
        }
        if (qBody[cell] === -1) {
          qBody[cell] = i;
          return;
        }
        const resident = qBody[cell];
        // No room or too deep: stack them. The far-field error is negligible
        // and it beats subdividing forever.
        if (qCount + 4 > CAP) return;
        // Exactly coincident bodies would subdivide without end. Nudge by an
        // index-derived amount so the tie breaks and the layout stays
        // reproducible (a random jitter would not).
        if (px[resident] === px[i] && py[resident] === py[i]) {
          px[i] += 1e-3 * (1 + (i % 13));
          py[i] += 1e-3 * (1 + (i % 11));
        }
        qBody[cell] = -1;
        subdivide(cell);
        qBody[qChild[cell * 4 + quadOf(cell, px[resident], py[resident])]] = resident;
        cell = qChild[cell * 4 + quadOf(cell, px[i], py[i])];
      }
    };

    const buildTree = () => {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < n; i++) {
        if (px[i] < minX) minX = px[i];
        if (py[i] < minY) minY = py[i];
        if (px[i] > maxX) maxX = px[i];
        if (py[i] > maxY) maxY = py[i];
      }
      qCount = 1;
      qChild[0] = -1;
      qChild[1] = -1;
      qChild[2] = -1;
      qChild[3] = -1;
      qBody[0] = -1;
      qMass[0] = 0;
      qX[0] = minX;
      qY[0] = minY;
      qS[0] = Math.max(maxX - minX, maxY - minY, 1) * 1.05;
      for (let i = 0; i < n; i++) insert(i);

      // Centres of mass, bottom-up. Children are always allocated after their
      // parent, so descending index order is a valid post-order.
      for (let c = qCount - 1; c >= 0; c--) {
        if (qChild[c * 4] === -1) {
          const b = qBody[c];
          if (b === -1) {
            qMass[c] = 0;
          } else {
            qMass[c] = 1;
            qCx[c] = px[b];
            qCy[c] = py[b];
          }
          continue;
        }
        let m = 0;
        let sx = 0;
        let sy = 0;
        for (let q = 0; q < 4; q++) {
          const ch = qChild[c * 4 + q];
          const cm = qMass[ch];
          if (cm > 0) {
            m += cm;
            sx += qCx[ch] * cm;
            sy += qCy[ch] * cm;
          }
        }
        qMass[c] = m;
        if (m > 0) {
          qCx[c] = sx / m;
          qCy[c] = sy / m;
        }
      }
    };

    const repel = (i: number, alpha: number) => {
      let fx = 0;
      let fy = 0;
      let sp = 0;
      stack[sp++] = 0;
      while (sp > 0) {
        const c = stack[--sp];
        const m = qMass[c];
        if (m === 0) continue;
        const leaf = qChild[c * 4] === -1;
        if (leaf && qBody[c] === i) continue;
        const dx = qCx[c] - px[i];
        const dy = qCy[c] - py[i];
        let d2 = dx * dx + dy * dy;
        if (!leaf && qS[c] * qS[c] >= THETA2 * d2) {
          for (let q = 0; q < 4; q++) stack[sp++] = qChild[c * 4 + q];
          continue;
        }
        if (d2 < MIN_D2) d2 = MIN_D2;
        const w = (REPEL * m * alpha) / d2;
        fx -= dx * w;
        fy -= dy * w;
        // Short-range separation. The traversal is already down at the leaves
        // whenever two nodes are close, so keeping nodes from overlapping costs
        // nothing extra here — and overlap is the thing that makes a force
        // graph look cheap.
        if (leaf) {
          const rsum = rad[i] + rad[qBody[c]] + 5;
          if (d2 < rsum * rsum) {
            const d = Math.sqrt(d2);
            const push = ((rsum - d) / d) * 0.42;
            fx -= dx * push;
            fy -= dy * push;
          }
        }
      }
      vx[i] += fx;
      vy[i] += fy;
    };

    const tick = (alpha: number) => {
      buildTree();
      for (let i = 0; i < n; i++) repel(i, alpha);

      for (let i = 0; i < eCount; i++) {
        const [s, t] = edges[i];
        let dx = px[t] + vx[t] - px[s] - vx[s];
        let dy = py[t] + vy[t] - py[s] - vy[s];
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const l = ((d - LINK_DIST) / d) * alpha * eStrength[i];
        dx *= l;
        dy *= l;
        const b = eBias[i];
        vx[t] -= dx * b;
        vy[t] -= dy * b;
        vx[s] += dx * (1 - b);
        vy[s] += dy * (1 - b);
      }

      let cx = 0;
      let cy = 0;
      for (let i = 0; i < n; i++) {
        vx[i] -= px[i] * gx * alpha;
        vy[i] -= py[i] * gy * alpha;
        if (i === dragNode) {
          vx[i] = 0;
          vy[i] = 0;
          continue;
        }
        vx[i] *= VELOCITY_KEEP;
        vy[i] *= VELOCITY_KEEP;
        px[i] += vx[i];
        py[i] += vy[i];
        cx += px[i];
        cy += py[i];
      }
      // Re-centre so the graph never drifts out of frame (d3's forceCenter).
      cx /= n;
      cy /= n;
      for (let i = 0; i < n; i++) {
        px[i] -= cx;
        py[i] -= cy;
      }
    };

    // ---- view state ------------------------------------------------------
    let width = 0;
    let height = 0;
    let scale = 1;
    let scaleTo = 1;
    // The scale at which the layout exactly fills the viewport. Node and label
    // sizing key off scale/fitScale, not scale, so how spread out the layout
    // happens to be never changes how big a node is drawn — only the user's own
    // zoom does. Coupling the two is what made a compact vault render as a knot
    // of pinheads.
    let fitScale = 1;
    // Nodes drawn at their desktop size on a phone-sized canvas swamp the
    // layout, so radii take a mild cut on small panels. Draw and hit-test only
    // — the simulation's separation term keeps working in its own units.
    let sizeK = 1;
    let panX = 0;
    let panY = 0;
    let panXTo = 0;
    let panYTo = 0;
    let alpha = 1;
    let hover: number | null = null;
    let dragNode: number | null = null;
    let fitted = false;
    let userMoved = false; // once true the camera is the reader's, not ours
    let raf = 0;
    let disposed = false;

    const toScreenX = (x: number) => width / 2 + panX + x * scale;
    const toScreenY = (y: number) => height / 2 + panY + y * scale;

    // Fit the settled layout to the viewport. Without this the graph opens as a
    // knot in the middle of an empty box and every visit starts with a hunt.
    const fit = (animate: boolean) => {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < n; i++) {
        if (px[i] - rad[i] < minX) minX = px[i] - rad[i];
        if (py[i] - rad[i] < minY) minY = py[i] - rad[i];
        if (px[i] + rad[i] > maxX) maxX = px[i] + rad[i];
        if (py[i] + rad[i] > maxY) maxY = py[i] + rad[i];
      }
      const pad = 58;
      const k = Math.min((width - pad * 2) / Math.max(maxX - minX, 1), (height - pad * 2) / Math.max(maxY - minY, 1));
      scaleTo = Math.min(6, Math.max(0.2, k));
      fitScale = scaleTo;
      panXTo = -((minX + maxX) / 2) * scaleTo;
      panYTo = -((minY + maxY) / 2) * scaleTo;
      // Opening a hair under the target and easing up reads as the graph
      // settling into place rather than snapping.
      scale = animate ? scaleTo * 0.93 : scaleTo;
      panX = panXTo;
      panY = panYTo;
    };

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      width = rect.width;
      height = Math.max(420, rect.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // The first measurement can land before layout has settled (the wrapper
      // reports its 2px of border), which would bake a nonsense scale in for
      // good. Wait for a real width, and keep re-framing on resize until the
      // reader takes the camera over.
      if (width > 40) {
        sizeK = Math.min(1.1, Math.max(0.5, Math.min(width, height) / 520));
        if (!fitted) {
          // The real aspect is only knowable here. A round blob in a 2.3:1
          // panel leaves most of the panel empty and forces the fit down until
          // the nodes are pinheads, so re-settle the layout against per-axis
          // gravity whose ratio is the panel's. Equilibrium spread goes as
          // 1/sqrt(k), hence k split by a and not sqrt(a). The range spans both
          // sides of 1 — a phone in portrait needs a tall layout as much as a
          // desktop panel needs a wide one.
          const a = Math.min(2.4, Math.max(0.45, width / height));
          gx = GRAVITY / a;
          gy = GRAVITY * a;
          warm(170);
          fit(!reduced);
          fitted = true;
        } else if (!userMoved) {
          fit(false);
        }
      }
      kick();
    };

    // ---- pre-warm --------------------------------------------------------
    // Run the schedule to convergence before the first paint. A few ms of
    // synchronous work buys an opening frame that is already the right shape,
    // instead of the reader watching a spiral untangle itself.
    const warm = (ticks: number) => {
      let a = 1;
      for (let i = 0; i < ticks; i++) {
        a += (0 - a) * ALPHA_DECAY;
        tick(a);
      }
    };
    warm(PREWARM_TICKS);
    // Leave a little heat so it breathes into place instead of arriving dead.
    alpha = reduced ? 0 : 0.12;

    // ---- draw ------------------------------------------------------------
    const labelBoxes: number[] = []; // flat x0,y0,x1,y1 — greedy overlap culling
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => degree[b] - degree[a]);
    // Screen positions, resolved once per frame and reused by every pass.
    const sx = new Float64Array(n);
    const sy = new Float64Array(n);

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      const hov = hover;
      const rel = scale / fitScale; // 1 = fitted; >1 = the user zoomed in
      const nodeScale = Math.min(2.2, Math.max(0.6, Math.pow(rel, 0.72)));
      for (let i = 0; i < n; i++) {
        sx[i] = toScreenX(px[i]);
        sy[i] = toScreenY(py[i]);
      }

      // Focus falloff, eased rather than switched — the transition is most of
      // what makes hovering feel expensive.
      let focusMoving = false;
      for (let i = 0; i < n; i++) {
        const target = hov === null || i === hov || neighbors[hov].has(i) ? 1 : DIM;
        const d = target - focus[i];
        if (Math.abs(d) > 0.002) {
          focus[i] += d * 0.24;
          focusMoving = true;
        } else {
          focus[i] = target;
        }
      }

      // Edges. With no focus active every edge shares one alpha, so the whole
      // set is a single path and a single stroke — the common case stays cheap
      // no matter how dense the vault gets.
      ctx.lineWidth = 1;
      if (hov === null && !focusMoving) {
        ctx.strokeStyle = pal.edge;
        ctx.beginPath();
        for (let i = 0; i < eCount; i++) {
          const [s, t] = edges[i];
          ctx.moveTo(sx[s], sy[s]);
          ctx.lineTo(sx[t], sy[t]);
        }
        ctx.stroke();
      } else {
        // globalAlpha is read at stroke() time, not per subpath, so a fading
        // field has to be stroked edge by edge. Only ever the hover case.
        ctx.strokeStyle = pal.edge;
        for (let i = 0; i < eCount; i++) {
          const [s, t] = edges[i];
          if (hov !== null && (s === hov || t === hov)) continue;
          const a = Math.min(focus[s], focus[t]);
          if (a < 0.02) continue;
          ctx.globalAlpha = a;
          ctx.beginPath();
          ctx.moveTo(sx[s], sy[s]);
          ctx.lineTo(sx[t], sy[t]);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        // Lit edges last so they sit above the field.
        if (hov !== null) {
          ctx.strokeStyle = pal.focus;
          ctx.globalAlpha = 0.7;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          for (let i = 0; i < eCount; i++) {
            const [s, t] = edges[i];
            if (s !== hov && t !== hov) continue;
            ctx.moveTo(sx[s], sy[s]);
            ctx.lineTo(sx[t], sy[t]);
          }
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.lineWidth = 1;
        }
      }

      // Nodes.
      for (let i = 0; i < n; i++) {
        const x = sx[i];
        const y = sy[i];
        const r = rad[i] * nodeScale * sizeK;
        if (x < -40 || x > width + 40 || y < -40 || y > height + 40) continue;
        ctx.globalAlpha = focus[i];

        if (i === hov) {
          ctx.fillStyle = pal.focus;
          ctx.globalAlpha = focus[i] * 0.18;
          ctx.beginPath();
          ctx.arc(x, y, r + 9, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = focus[i];
        }

        ctx.fillStyle = i === hov ? pal.focus : colors[i];
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();

        if (nodes[i].origin === "brain") {
          // Gap ring: a background-coloured stroke, then the accent outside it.
          // Without the gap the ring vanishes on the orange-hued projects, which
          // is exactly where "the brain wrote this" matters most.
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = pal.bg;
          ctx.beginPath();
          ctx.arc(x, y, r + 1.4, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = pal.focus;
          ctx.beginPath();
          ctx.arc(x, y, r + 2.9, 0, Math.PI * 2);
          ctx.stroke();
          ctx.lineWidth = 1;
        }
        ctx.globalAlpha = 1;
      }

      // Labels. Obsidian sets them under the node; the bar for showing one
      // drops as you zoom in, so detail arrives as you ask for it.
      const fontPx = 12.5 * Math.min(1.4, Math.max(0.9, Math.pow(rel, 0.35)));
      ctx.font = `${fontPx}px ${pal.font}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      // Fitted, every label is a candidate and the overlap cull decides what
      // survives. Zooming out raises the bar by degree; zooming in only ever
      // adds. Detail arrives as you ask for it.
      const cutoff = Math.max(0, (1 - rel) * 7);
      const zoomFade = Math.min(1, Math.max(0, (rel - 0.45) / 0.25));
      labelBoxes.length = 0;
      let drawn = 0;

      // Two passes so the focused neighbourhood claims its slots first, but is
      // still subject to the cull — exempting it just stacked 20 labels on the
      // hub. Within each pass the order stays highest-degree-first.
      for (let pass = 0; pass < 2; pass++)
      for (const i of order) {
        if (drawn > 110) break;
        const lit = i === hov || (hov !== null && neighbors[hov].has(i));
        if (pass === 0 ? !lit : lit) continue;
        const target = lit ? 1 : Math.min(1, Math.max(0, degree[i] - cutoff + 1)) * zoomFade * focus[i];
        const d = target - labelAlpha[i];
        if (Math.abs(d) > 0.002) {
          labelAlpha[i] += d * 0.24;
          focusMoving = true;
        } else {
          labelAlpha[i] = target;
        }
        if (labelAlpha[i] < 0.04) continue;

        const x = sx[i];
        const y = sy[i] + rad[i] * nodeScale * sizeK + 5;
        if (x < -120 || x > width + 120 || y < -20 || y > height + 20) continue;
        const text = nodes[i].title.length > 34 ? `${nodes[i].title.slice(0, 33)}…` : nodes[i].title;
        const w = ctx.measureText(text).width;
        const x0 = x - w / 2 - 3;
        const x1 = x + w / 2 + 3;
        const y1 = y + fontPx + 2;

        // Greedy overlap cull, highest-degree first — against other labels AND
        // against the nodes themselves. Obsidian lets both collide; dropping
        // the loser is strictly more readable than stacking text on a dot.
        if (i !== hov) {
          let blocked = false;
          for (let b = 0; b < labelBoxes.length && !blocked; b += 4) {
            if (x0 < labelBoxes[b + 2] && x1 > labelBoxes[b] && y < labelBoxes[b + 3] && y1 > labelBoxes[b + 1]) blocked = true;
          }
          for (let j = 0; j < n && !blocked; j++) {
            if (j === i) continue;
            const nr = rad[j] * nodeScale * sizeK + 1.5;
            if (sx[j] + nr > x0 && sx[j] - nr < x1 && sy[j] + nr > y && sy[j] - nr < y1) blocked = true;
          }
          if (blocked) continue;
        }
        labelBoxes.push(x0, y, x1, y1);
        drawn++;

        ctx.globalAlpha = labelAlpha[i];
        ctx.fillStyle = lit ? pal.labelStrong : pal.label;
        ctx.fillText(text, x, y);
        ctx.globalAlpha = 1;
      }

      return focusMoving;
    };

    // ---- loop ------------------------------------------------------------
    // Stops itself once physics, camera and focus have all settled. The old
    // loop redrew an identical frame at 60fps forever.
    const loop = () => {
      raf = 0;
      if (disposed) return;

      if (alpha > ALPHA_MIN) {
        alpha += (0 - alpha) * ALPHA_DECAY;
        tick(alpha);
      } else {
        alpha = 0;
      }

      const ds = scaleTo - scale;
      const dpx = panXTo - panX;
      const dpy = panYTo - panY;
      const camMoving = Math.abs(ds) > 0.0004 || Math.abs(dpx) > 0.15 || Math.abs(dpy) > 0.15;
      if (camMoving) {
        scale += ds * 0.2;
        panX += dpx * 0.2;
        panY += dpy * 0.2;
      } else {
        scale = scaleTo;
        panX = panXTo;
        panY = panYTo;
      }

      const focusMoving = draw();
      if (alpha > ALPHA_MIN || camMoving || focusMoving || dragNode !== null) raf = requestAnimationFrame(loop);
    };

    function kick() {
      if (!raf && !disposed) raf = requestAnimationFrame(loop);
    }

    const reheat = (to: number) => {
      alpha = Math.max(alpha, to);
      kick();
    };

    // Sizing runs here, not at declaration: resize() calls kick(), which closes
    // over `loop` — reaching it any earlier is a TDZ error.
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    canvas.style.opacity = reduced ? "1" : "0";
    canvas.style.transition = reduced ? "" : "opacity 420ms cubic-bezier(0.16, 1, 0.3, 1)";
    kick();
    if (!reduced) requestAnimationFrame(() => requestAnimationFrame(() => (canvas.style.opacity = "1")));

    // ---- input -----------------------------------------------------------
    const nodeAt = (mx: number, my: number): number | null => {
      const nodeScale = Math.min(2.2, Math.max(0.6, Math.pow(scale / fitScale, 0.72)));
      let best: number | null = null;
      let bestD = Infinity;
      for (let i = 0; i < n; i++) {
        const dx = toScreenX(px[i]) - mx;
        const dy = toScreenY(py[i]) - my;
        // Hit area tracks the drawn size (plus a small forgiving margin) rather
        // than the old fixed 14px, which under-reached when zoomed in and
        // grabbed the wrong node when zoomed out.
        const r = rad[i] * nodeScale * sizeK + 5;
        const d = dx * dx + dy * dy;
        if (d < r * r && d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return best;
    };

    const pointers = new Map<number, { x: number; y: number }>();
    let panning = false;
    let moved = false;
    let lastX = 0;
    let lastY = 0;
    let downX = 0;
    let downY = 0;
    let pinchDist = 0;

    const zoomAt = (mx: number, my: number, factor: number) => {
      // Bounds are relative to the fit, so the zoom range means the same thing
      // whatever size the layout settled at.
      const next = Math.min(fitScale * 6, Math.max(fitScale * 0.35, scaleTo * factor));
      // Anchor the point under the cursor: solve pan so its screen position is
      // unchanged at the new scale. Centre-anchored zoom is what made the old
      // wheel feel like it was fighting you.
      const sx = (mx - width / 2 - panXTo) / scaleTo;
      const sy = (my - height / 2 - panYTo) / scaleTo;
      panXTo = mx - width / 2 - sx * next;
      panYTo = my - height / 2 - sy * next;
      scaleTo = next;
      userMoved = true;
      kick();
    };

    const local = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onDown = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      canvas.setPointerCapture(e.pointerId);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
        panning = false;
        dragNode = null;
        return;
      }
      const { x, y } = local(e);
      moved = false;
      lastX = e.clientX;
      lastY = e.clientY;
      downX = e.clientX;
      downY = e.clientY;
      const hit = nodeAt(x, y);
      if (hit !== null) {
        dragNode = hit;
        hover = hit;
        canvas.style.cursor = "grabbing";
        reheat(0.3);
      } else {
        panning = true;
        canvas.style.cursor = "grabbing";
      }
    };

    const onMove = (e: PointerEvent) => {
      const { x, y } = local(e);
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist > 0) {
          const rect = canvas.getBoundingClientRect();
          zoomAt((a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top, d / pinchDist);
        }
        pinchDist = d;
        moved = true;
        return;
      }

      if (dragNode !== null) {
        // A click carries a few pixels of jitter between down and up; without
        // this dead zone it counted as a drag and the click-through to the doc
        // never fired. Inside the zone the node holds still and stays a click.
        if (!moved && Math.hypot(e.clientX - downX, e.clientY - downY) < 4) return;
        moved = true;
        px[dragNode] = (x - width / 2 - panX) / scale;
        py[dragNode] = (y - height / 2 - panY) / scale;
        vx[dragNode] = 0;
        vy[dragNode] = 0;
        reheat(0.32);
        return;
      }

      if (panning) {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
        panX += dx;
        panY += dy;
        panXTo += dx;
        panYTo += dy;
        lastX = e.clientX;
        lastY = e.clientY;
        userMoved = true;
        kick();
        return;
      }

      const next = nodeAt(x, y);
      if (next !== hover) {
        hover = next;
        kick();
      }
      canvas.style.cursor = hover !== null ? "pointer" : "grab";
    };

    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchDist = 0;
      const wasDrag = dragNode;
      if (!moved) {
        const { x, y } = local(e);
        const hit = nodeAt(x, y);
        if (hit !== null) router.push(`/brain/docs/view?path=${encodeURIComponent(nodes[hit].path)}`);
      }
      if (wasDrag !== null) reheat(0.18);
      dragNode = null;
      panning = false;
      canvas.style.cursor = hover !== null ? "pointer" : "grab";
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      // Continuous factor so a trackpad reads smooth instead of stepped.
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.0022));
    };

    const onLeave = () => {
      if (dragNode !== null || panning) return;
      if (hover !== null) {
        hover = null;
        kick();
      }
    };

    const onDouble = (e: MouseEvent) => {
      e.preventDefault();
      fit(false);
      scale = scaleTo * 0.97;
      userMoved = false; // hands the camera back — resizes re-frame again
      kick();
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("dblclick", onDouble);

    // Canvas cannot inherit a var() palette, so re-read on the theme flip.
    const themeObserver = new MutationObserver(() => {
      pal = readPalette(wrap);
      colors = nodes.map((d) => nodeColor(d, pal));
      kick();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      themeObserver.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("dblclick", onDouble);
    };
  }, [nodes, edges, router]);

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden">
      <canvas
        ref={canvasRef}
        className="block touch-none select-none"
        style={{ cursor: "grab" }}
        aria-label={`Vault graph — ${nodes.length} docs connected by wikilinks. The same docs are listed at /brain/docs.`}
        role="img"
      />
    </div>
  );
}
