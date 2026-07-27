"use client";

import {
  ArrowRight,
  Eye,
  FileText,
  Focus,
  Maximize2,
  Network,
  Search,
  Sparkles,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { brainDocHref } from "@/lib/brain/links";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";

export type GraphNode = {
  path: string;
  title: string;
  project: string | null;
  projectName: string | null;
  department: string | null;
  departmentName: string | null;
  type: "core" | "doc" | "rule";
  origin: "vault" | "brain";
  accessProjectId: string | null;
};

type GroupKind = "core" | "rule" | "project" | "department" | "shared";
type EdgeMode = "overview" | "connections";

type MapGroup = {
  id: string;
  title: string;
  kind: GroupKind;
  nodeIndexes: number[];
  x: number;
  y: number;
  width: number;
  height: number;
};

type MapNode = {
  index: number;
  groupId: string;
  x: number;
  y: number;
  radius: number;
  isHub: boolean;
};

type MapLayout = {
  groups: MapGroup[];
  nodes: MapNode[];
  width: number;
  height: number;
};

type Camera = {
  x: number;
  y: number;
  scale: number;
};

const GROUP_WIDTH = 440;
const GROUP_GAP = 40;
const WORLD_PADDING = 46;
const COLUMN_COUNT = 3;

const kindOrder: Record<GroupKind, number> = {
  core: 0,
  rule: 1,
  project: 2,
  department: 3,
  shared: 4,
};

const kindLabel: Record<GroupKind, string> = {
  core: "Company foundation",
  rule: "Governance",
  project: "Active project",
  department: "Knowledge owner",
  shared: "Shared reference",
};

const typeLabel: Record<GraphNode["type"], string> = {
  core: "Company core",
  rule: "Standing rule",
  doc: "Knowledge",
};

const groupAccent: Record<GroupKind, string> = {
  core: "var(--kg-core)",
  rule: "var(--kg-rule)",
  project: "var(--kg-project)",
  department: "var(--kg-department)",
  shared: "var(--kg-shared)",
};

function groupForNode(node: GraphNode): { id: string; title: string; kind: GroupKind } {
  if (node.type === "core") return { id: "company-core", title: "Company core", kind: "core" };
  if (node.type === "rule") return { id: "standing-rules", title: "Standing rules", kind: "rule" };
  if (node.project) {
    return {
      id: `project:${node.project}`,
      title: node.projectName ?? node.project,
      kind: "project",
    };
  }
  if (node.department) {
    return { id: "departments", title: "Departments", kind: "department" };
  }
  return { id: "shared", title: "Shared knowledge", kind: "shared" };
}

function groupHeight(count: number) {
  if (count <= 1) return 230;
  if (count <= 7) return 270;
  if (count <= 19) return 330;
  return 390;
}

function buildMapLayout(nodes: GraphNode[], degree: Int32Array): MapLayout {
  const grouped = new Map<string, Omit<MapGroup, "x" | "y" | "width" | "height">>();

  nodes.forEach((node, index) => {
    const group = groupForNode(node);
    const current = grouped.get(group.id);
    if (current) current.nodeIndexes.push(index);
    else grouped.set(group.id, { ...group, nodeIndexes: [index] });
  });

  const ordered = [...grouped.values()].sort(
    (a, b) =>
      kindOrder[a.kind] - kindOrder[b.kind] ||
      b.nodeIndexes.length - a.nodeIndexes.length ||
      a.title.localeCompare(b.title),
  );
  const columnY = Array.from({ length: COLUMN_COUNT }, () => WORLD_PADDING);
  const groups: MapGroup[] = [];

  ordered.forEach((group, orderIndex) => {
    const preferredColumn =
      orderIndex < COLUMN_COUNT
        ? orderIndex
        : columnY.indexOf(Math.min(...columnY));
    const height = groupHeight(group.nodeIndexes.length);
    const x = WORLD_PADDING + preferredColumn * (GROUP_WIDTH + GROUP_GAP);
    const y = columnY[preferredColumn];
    groups.push({ ...group, x, y, width: GROUP_WIDTH, height });
    columnY[preferredColumn] += height + GROUP_GAP;
  });

  const positioned: MapNode[] = Array.from({ length: nodes.length });
  for (const group of groups) {
    const sorted = [...group.nodeIndexes].sort(
      (a, b) => degree[b] - degree[a] || nodes[a].title.localeCompare(nodes[b].title),
    );
    const centerX = group.x + group.width / 2;
    const centerY = group.y + 64 + (group.height - 78) / 2;
    const hub = sorted[0];
    positioned[hub] = {
      index: hub,
      groupId: group.id,
      x: centerX,
      y: centerY,
      radius: Math.min(15, 8.5 + Math.sqrt(degree[hub]) * 1.4),
      isHub: true,
    };

    const remaining = sorted.slice(1);
    if (remaining.length === 0) continue;
    const capacities = [6, 12, 18, 24];
    const rings: number[][] = [];
    let cursor = 0;
    for (const capacity of capacities) {
      if (cursor >= remaining.length) break;
      rings.push(remaining.slice(cursor, cursor + capacity));
      cursor += capacity;
    }
    if (cursor < remaining.length) rings.push(remaining.slice(cursor));

    const maxRadius = Math.min(group.width / 2 - 34, (group.height - 104) / 2 - 10);
    rings.forEach((ring, ringIndex) => {
      const orbit = maxRadius * ((ringIndex + 1) / rings.length);
      const offset = ringIndex % 2 === 0 ? -Math.PI / 2 : -Math.PI / 2 + Math.PI / ring.length;
      ring.forEach((nodeIndex, index) => {
        const angle = offset + (index / ring.length) * Math.PI * 2;
        positioned[nodeIndex] = {
          index: nodeIndex,
          groupId: group.id,
          x: centerX + Math.cos(angle) * orbit,
          y: centerY + Math.sin(angle) * orbit,
          radius: Math.min(10, 5.5 + Math.sqrt(degree[nodeIndex]) * 1.05),
          isHub: false,
        };
      });
    });
  }

  return {
    groups,
    nodes: positioned,
    width: WORLD_PADDING * 2 + COLUMN_COUNT * GROUP_WIDTH + (COLUMN_COUNT - 1) * GROUP_GAP,
    height: Math.max(...columnY) - GROUP_GAP + WORLD_PADDING,
  };
}

function edgePath(source: MapNode, target: MapNode, sameGroup: boolean) {
  if (sameGroup) return `M ${source.x} ${source.y} L ${target.x} ${target.y}`;
  const midX = (source.x + target.x) / 2;
  const midY = (source.y + target.y) / 2;
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const bend = Math.min(54, Math.hypot(dx, dy) * 0.08);
  const length = Math.hypot(dx, dy) || 1;
  const controlX = midX - (dy / length) * bend;
  const controlY = midY + (dx / length) * bend;
  return `M ${source.x} ${source.y} Q ${controlX} ${controlY} ${target.x} ${target.y}`;
}

function nodeOwner(node: GraphNode) {
  if (node.type === "core") return "Company-wide";
  if (node.type === "rule") return "Applies by audience";
  return node.projectName ?? node.departmentName ?? "Shared knowledge";
}

export function GraphView({ nodes, edges }: { nodes: GraphNode[]; edges: [number, number][] }) {
  const router = useRouter();
  const stageRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; camera: Camera } | null>(null);
  const userMovedRef = useRef(false);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, scale: 1 });
  const [fitScale, setFitScale] = useState(1);
  const [selected, setSelected] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [edgeMode, setEdgeMode] = useState<EdgeMode>("overview");

  const topology = useMemo(() => {
    const degree = new Int32Array(nodes.length);
    const neighbors = Array.from({ length: nodes.length }, () => new Set<number>());
    edges.forEach(([source, target]) => {
      degree[source]++;
      degree[target]++;
      neighbors[source].add(target);
      neighbors[target].add(source);
    });
    return { degree, neighbors };
  }, [edges, nodes.length]);

  const layout = useMemo(
    () => buildMapLayout(nodes, topology.degree),
    [nodes, topology.degree],
  );
  const groupById = useMemo(
    () => new Map(layout.groups.map((group) => [group.id, group])),
    [layout.groups],
  );

  const normalizedQuery = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!normalizedQuery) return new Set<number>();
    return new Set(
      nodes.flatMap((node, index) =>
        [node.title, node.path, node.projectName, node.departmentName]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(normalizedQuery))
          ? [index]
          : [],
      ),
    );
  }, [nodes, normalizedQuery]);

  const fitToSize = useCallback((width: number, height: number) => {
    if (!width || !height) return;
    const nextScale = Math.min(
      1.18,
      Math.max(
        0.28,
        Math.min(
          (width - 52) / layout.width,
          (height - 52) / layout.height,
        ),
      ),
    );
    setFitScale(nextScale);
    setCamera({
      scale: nextScale,
      x: (width - layout.width * nextScale) / 2,
      y: (height - layout.height * nextScale) / 2,
    });
  }, [layout.height, layout.width]);

  const fit = useCallback(() => {
    userMovedRef.current = false;
    fitToSize(stageSize.width, stageSize.height);
  }, [fitToSize, stageSize.height, stageSize.width]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      const height = entry.contentRect.height;
      setStageSize({ width, height });
      if (!userMovedRef.current) fitToSize(width, height);
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [fitToSize]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSelected(null);
      setQuery("");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const focusIndex = hovered ?? selected;
  const zoom = (factor: number, centerX = stageSize.width / 2, centerY = stageSize.height / 2) => {
    userMovedRef.current = true;
    setCamera((current) => {
      const nextScale = Math.min(fitScale * 5, Math.max(fitScale * 0.65, current.scale * factor));
      const worldX = (centerX - current.x) / current.scale;
      const worldY = (centerY - current.y) / current.scale;
      return {
        scale: nextScale,
        x: centerX - worldX * nextScale,
        y: centerY - worldY * nextScale,
      };
    });
  };

  const onStagePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      camera,
    };
  };

  const onStagePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    userMovedRef.current = true;
    setCamera({
      ...drag.camera,
      x: drag.camera.x + event.clientX - drag.x,
      y: drag.camera.y + event.clientY - drag.y,
    });
  };

  const onStagePointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const onWheel = (event: ReactWheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    zoom(
      Math.exp(-event.deltaY * 0.0015),
      event.clientX - rect.left,
      event.clientY - rect.top,
    );
  };

  const selectedNode = selected === null ? null : nodes[selected];
  const selectedNeighbors =
    selected === null
      ? []
      : [...topology.neighbors[selected]].sort(
          (a, b) => topology.degree[b] - topology.degree[a] || nodes[a].title.localeCompare(nodes[b].title),
        );
  const detailVisible = camera.scale > fitScale * 1.45;
  const hoveredMapNode = hovered === null ? null : layout.nodes[hovered];
  const hoveredNode = hovered === null ? null : nodes[hovered];
  const hoverScreen = hoveredMapNode
    ? {
        x: Math.min(
          Math.max(145, camera.x + hoveredMapNode.x * camera.scale),
          Math.max(145, stageSize.width - 145),
        ),
        y: camera.y + hoveredMapNode.y * camera.scale,
        below: camera.y + hoveredMapNode.y * camera.scale < 92,
      }
    : null;

  return (
    <div className="kg-workspace">
      <header className="kg-toolbar">
        <div className="kg-title">
          <span>
            <Network size={18} />
          </span>
          <div>
            <h1>Knowledge map</h1>
            <p>Organized by ownership and active work</p>
          </div>
        </div>

        <label className="kg-search">
          <Search size={17} />
          <span className="sr-only">Search the knowledge map</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a document"
          />
          {normalizedQuery && <span>{matches.size}</span>}
        </label>

        <div className="kg-toolbar-actions">
          <div className="kg-mode-switch" aria-label="Connection visibility">
            <button
              type="button"
              className={edgeMode === "overview" ? "is-active" : ""}
              onClick={() => setEdgeMode("overview")}
            >
              <Focus size={15} />
              Overview
            </button>
            <button
              type="button"
              className={edgeMode === "connections" ? "is-active" : ""}
              onClick={() => setEdgeMode("connections")}
            >
              <Eye size={15} />
              Connections
            </button>
          </div>
          <div className="kg-zoom-controls">
            <button type="button" onClick={() => zoom(1.25)} aria-label="Zoom in">
              <ZoomIn size={17} />
            </button>
            <button type="button" onClick={() => zoom(0.8)} aria-label="Zoom out">
              <ZoomOut size={17} />
            </button>
            <button type="button" onClick={fit} aria-label="Fit map to view">
              <Maximize2 size={16} />
            </button>
          </div>
        </div>
      </header>

      <div className="kg-body">
        <div ref={stageRef} className="kg-stage">
          <svg
            ref={svgRef}
            width="100%"
            height="100%"
            role="group"
            aria-label={`Knowledge map with ${nodes.length} documents in ${layout.groups.length} groups`}
            onPointerDown={onStagePointerDown}
            onPointerMove={onStagePointerMove}
            onPointerUp={onStagePointerUp}
            onPointerCancel={onStagePointerUp}
            onWheel={onWheel}
          >
            <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.scale})`}>
              <g className="kg-cross-edges">
                {edges.map(([sourceIndex, targetIndex], edgeIndex) => {
                  const source = layout.nodes[sourceIndex];
                  const target = layout.nodes[targetIndex];
                  if (source.groupId === target.groupId) return null;
                  const connected = focusIndex === sourceIndex || focusIndex === targetIndex;
                  if (connected) return null;
                  if (edgeMode !== "connections") return null;
                  return (
                    <path
                      key={`cross:${edgeIndex}`}
                      d={edgePath(source, target, false)}
                    />
                  );
                })}
              </g>

              {layout.groups.map((group) => (
                <g key={group.id} className={`kg-group kg-group-${group.kind}`}>
                  <rect
                    className="kg-group-card"
                    x={group.x}
                    y={group.y}
                    width={group.width}
                    height={group.height}
                    rx={24}
                  />
                  <circle
                    cx={group.x + 24}
                    cy={group.y + 29}
                    r={4}
                    fill={groupAccent[group.kind]}
                  />
                  <text className="kg-group-title" x={group.x + 38} y={group.y + 34}>
                    {group.title}
                  </text>
                  <text className="kg-group-kind" x={group.x + 20} y={group.y + 54}>
                    {kindLabel[group.kind]}
                  </text>
                  <text
                    className="kg-group-count"
                    x={group.x + group.width - 20}
                    y={group.y + 34}
                    textAnchor="end"
                  >
                    {group.nodeIndexes.length} {group.nodeIndexes.length === 1 ? "source" : "sources"}
                  </text>
                </g>
              ))}

              <g className="kg-internal-edges">
                {edges.map(([sourceIndex, targetIndex], edgeIndex) => {
                  const source = layout.nodes[sourceIndex];
                  const target = layout.nodes[targetIndex];
                  if (source.groupId !== target.groupId) return null;
                  const connected = focusIndex === sourceIndex || focusIndex === targetIndex;
                  return (
                    <path
                      key={`internal:${edgeIndex}`}
                      d={edgePath(source, target, true)}
                      className={connected ? "is-focused" : focusIndex !== null ? "is-dimmed" : ""}
                    />
                  );
                })}
              </g>

              {focusIndex !== null && (
                <g className="kg-cross-edges kg-cross-focus">
                  {edges.map(([sourceIndex, targetIndex], edgeIndex) => {
                    const source = layout.nodes[sourceIndex];
                    const target = layout.nodes[targetIndex];
                    if (
                      source.groupId === target.groupId ||
                      (focusIndex !== sourceIndex && focusIndex !== targetIndex)
                    ) {
                      return null;
                    }
                    return (
                      <path
                        key={`focused-cross:${edgeIndex}`}
                        d={edgePath(source, target, false)}
                        className="is-focused"
                      />
                    );
                  })}
                </g>
              )}

              <g className="kg-nodes">
                {layout.nodes.map((mapNode) => {
                  const node = nodes[mapNode.index];
                  const group = groupById.get(mapNode.groupId)!;
                  const isSelected = selected === mapNode.index;
                  const isHovered = hovered === mapNode.index;
                  const isNeighbor =
                    focusIndex !== null && topology.neighbors[focusIndex].has(mapNode.index);
                  const isMatch = matches.has(mapNode.index);
                  const dimmedByFocus =
                    focusIndex !== null && focusIndex !== mapNode.index && !isNeighbor;
                  const dimmedBySearch = normalizedQuery.length > 0 && !isMatch;
                  const showLabel =
                    isSelected ||
                    isMatch ||
                    mapNode.isHub ||
                    (detailVisible && topology.degree[mapNode.index] > 1);
                  const opacity = dimmedByFocus || dimmedBySearch ? 0.16 : 1;
                  const truncatedTitle =
                    node.title.length > 30 ? `${node.title.slice(0, 29)}…` : node.title;

                  return (
                    <g
                      key={node.path}
                      className={`kg-node ${isSelected ? "is-selected" : ""}`}
                      style={{ opacity }}
                      role="button"
                      tabIndex={0}
                      aria-label={`${node.title}, ${typeLabel[node.type]}, ${topology.degree[mapNode.index]} connections`}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => setSelected(mapNode.index)}
                      onDoubleClick={() =>
                        router.push(brainDocHref(node.path, node.accessProjectId))
                      }
                      onPointerEnter={() => setHovered(mapNode.index)}
                      onPointerLeave={() => setHovered(null)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelected(mapNode.index);
                        }
                      }}
                    >
                      {(isSelected || isMatch) && (
                        <circle
                          className="kg-node-halo"
                          cx={mapNode.x}
                          cy={mapNode.y}
                          r={mapNode.radius + 8}
                        />
                      )}
                      {node.type === "rule" ? (
                        <rect
                          className="kg-node-shape kg-node-rule"
                          x={mapNode.x - mapNode.radius * 0.72}
                          y={mapNode.y - mapNode.radius * 0.72}
                          width={mapNode.radius * 1.44}
                          height={mapNode.radius * 1.44}
                          rx={2}
                          transform={`rotate(45 ${mapNode.x} ${mapNode.y})`}
                          fill={groupAccent[group.kind]}
                        />
                      ) : (
                        <circle
                          className="kg-node-shape"
                          cx={mapNode.x}
                          cy={mapNode.y}
                          r={mapNode.radius}
                          fill={groupAccent[group.kind]}
                        />
                      )}
                      {node.origin === "brain" && (
                        <circle
                          className="kg-ai-ring"
                          cx={mapNode.x}
                          cy={mapNode.y}
                          r={mapNode.radius + 3.5}
                        />
                      )}
                      {showLabel && (
                        <text
                          className={`kg-node-label ${isSelected || isHovered ? "is-strong" : ""}`}
                          x={mapNode.x}
                          y={mapNode.y + mapNode.radius + 15}
                          textAnchor="middle"
                        >
                          {truncatedTitle}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            </g>
          </svg>

          {hoveredNode && hoveredMapNode && hoverScreen && (
            <div
              className={`kg-hover-tooltip ${hoverScreen.below ? "is-below" : ""}`}
              style={{
                left: hoverScreen.x,
                top: hoverScreen.below
                  ? hoverScreen.y + hoveredMapNode.radius * camera.scale + 12
                  : hoverScreen.y - hoveredMapNode.radius * camera.scale - 12,
              }}
              role="tooltip"
            >
              <strong>{hoveredNode.title}</strong>
              <span>
                {typeLabel[hoveredNode.type]} · {nodeOwner(hoveredNode)}
              </span>
            </div>
          )}

          <div className="kg-map-key">
            <span><i className="is-core" /> Core</span>
            <span><i className="is-rule" /> Rule</span>
            <span><i className="is-project" /> Project</span>
            <span><i className="is-department" /> Department</span>
            <span><i className="is-ai" /> Brain-written</span>
          </div>
          <p className="kg-map-hint">Select a node to trace its connections · Double-click to open</p>
        </div>

        {selectedNode && selected !== null && (
          <aside className="kg-inspector" aria-label="Selected document">
            <header>
              <div>
                <span>{typeLabel[selectedNode.type]}</span>
                <h2>{selectedNode.title}</h2>
              </div>
              <button type="button" onClick={() => setSelected(null)} aria-label="Close details">
                <X size={18} />
              </button>
            </header>

            <div className="kg-inspector-scroll">
              <div className="kg-selected-mark">
                {selectedNode.origin === "brain" ? <Sparkles size={20} /> : <FileText size={20} />}
              </div>
              <dl className="kg-node-facts">
                <div>
                  <dt>Owned by</dt>
                  <dd>{nodeOwner(selectedNode)}</dd>
                </div>
                <div>
                  <dt>Connections</dt>
                  <dd>{topology.degree[selected]}</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>{selectedNode.origin === "brain" ? "Brain-written" : "Canonical vault"}</dd>
                </div>
                <div>
                  <dt>Location</dt>
                  <dd title={selectedNode.path}>{selectedNode.path}</dd>
                </div>
              </dl>

              <button
                type="button"
                className="kg-open-source"
                onClick={() =>
                  router.push(brainDocHref(selectedNode.path, selectedNode.accessProjectId))
                }
              >
                Open source
                <ArrowRight size={16} />
              </button>

              <section className="kg-neighbors">
                <div>
                  <h3>Direct connections</h3>
                  <span>{selectedNeighbors.length}</span>
                </div>
                {selectedNeighbors.length > 0 ? (
                  <ul>
                    {selectedNeighbors.slice(0, 12).map((neighborIndex) => (
                      <li key={nodes[neighborIndex].path}>
                        <button type="button" onClick={() => setSelected(neighborIndex)}>
                          <span>
                            <i
                              style={{
                                background:
                                  groupAccent[groupById.get(layout.nodes[neighborIndex].groupId)!.kind],
                              }}
                            />
                            <span>
                              <strong>{nodes[neighborIndex].title}</strong>
                              <small>{nodeOwner(nodes[neighborIndex])}</small>
                            </span>
                          </span>
                          <ArrowRight size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>This source has no direct links in the current map.</p>
                )}
              </section>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
