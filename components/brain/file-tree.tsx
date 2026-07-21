"use client";

// The vault explorer — Obsidian's file tree, built from brain_docs.path. Vault
// paths are real folder paths ("02 - Woof Gang/The Pilot.md"), so the folder
// structure the team sees in Obsidian is the structure that renders here; there
// is no second taxonomy to keep in sync.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";

export type VaultFile = { path: string; title: string };

type Node = {
  name: string;
  key: string;
  file?: VaultFile;
  children?: Node[];
};

function buildTree(files: VaultFile[]): Node[] {
  const root: Node = { name: "", key: "", children: [] };
  for (const f of files) {
    const parts = f.path.split("/");
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts.slice(0, i + 1).join("/");
      let next = cur.children!.find((c) => c.children && c.key === key);
      if (!next) {
        next = { name: parts[i], key, children: [] };
        cur.children!.push(next);
      }
      cur = next;
    }
    cur.children!.push({ name: f.title, key: f.path, file: f });
  }
  // Folders before files, then alphabetical — Obsidian's default sort.
  const sort = (n: Node) => {
    if (!n.children) return;
    n.children.sort((a, b) => {
      const af = a.children ? 0 : 1;
      const bf = b.children ? 0 : 1;
      return af !== bf ? af - bf : a.name.localeCompare(b.name, undefined, { numeric: true });
    });
    n.children.forEach(sort);
  };
  sort(root);
  return root.children ?? [];
}

const EXT = /\.(pdf|html?|png|jpe?g|csv|xlsx?|docx?|json|ya?ml)$/i;

function Row({
  node,
  depth,
  open,
  toggle,
  activePath,
  onOpenFile,
}: {
  node: Node;
  depth: number;
  open: Set<string>;
  toggle: (k: string) => void;
  activePath: string | null;
  onOpenFile: (f: VaultFile) => void;
}) {
  if (node.file) {
    const ext = node.file.path.match(EXT)?.[1];
    return (
      <button
        type="button"
        onClick={() => onOpenFile(node.file!)}
        className={`ob-row ${node.file.path === activePath ? "is-active" : ""}`}
        title={node.file.path}
      >
        <span className="ob-chev" aria-hidden />
        <span className="ob-row-label">{node.name}</span>
        {ext && <span className="ob-ext">{ext}</span>}
      </button>
    );
  }
  const isOpen = open.has(node.key);
  return (
    <>
      <button type="button" onClick={() => toggle(node.key)} className="ob-row ob-row-folder" aria-expanded={isOpen}>
        <span className={`ob-chev ${isOpen ? "is-open" : ""}`}>
          <ChevronRight size={12} strokeWidth={2.4} />
        </span>
        <span className="ob-row-label">{node.name}</span>
      </button>
      {isOpen && node.children && (
        <div className="ob-children">
          {node.children.map((c) => (
            <Row
              key={c.key}
              node={c}
              depth={depth + 1}
              open={open}
              toggle={toggle}
              activePath={activePath}
              onOpenFile={onOpenFile}
            />
          ))}
        </div>
      )}
    </>
  );
}

export function FileTree({
  files,
  activePath,
  onOpenFile,
  collapseSignal,
}: {
  files: VaultFile[];
  activePath: string | null;
  onOpenFile: (f: VaultFile) => void;
  collapseSignal: number;
}) {
  const tree = useMemo(() => buildTree(files), [files]);
  const router = useRouter();
  void router;

  // Open the ancestors of whatever doc is showing, so the tree always reveals
  // where you are; everything else starts closed.
  const initial = useMemo(() => {
    const s = new Set<string>();
    if (activePath) {
      const parts = activePath.split("/");
      for (let i = 0; i < parts.length - 1; i++) s.add(parts.slice(0, i + 1).join("/"));
    }
    return s;
  }, [activePath]);

  const [open, setOpen] = useState<Set<string>>(initial);
  const [seed, setSeed] = useState(collapseSignal);
  // Collapse-all resets the set; a later navigation re-reveals the active doc.
  if (seed !== collapseSignal) {
    setSeed(collapseSignal);
    setOpen(new Set());
  }
  const [seenPath, setSeenPath] = useState(activePath);
  if (seenPath !== activePath) {
    setSeenPath(activePath);
    setOpen((prev) => new Set([...prev, ...initial]));
  }

  const toggle = (k: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  if (!files.length) {
    return (
      <div className="ob-tree">
        <p className="px-2 py-3 text-[12.5px] leading-[1.5] text-[var(--ob-faint)]">
          No docs synced yet. Run <code>node scripts/brain-sync.mjs</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="ob-tree">
      {tree.map((n) => (
        <Row key={n.key} node={n} depth={0} open={open} toggle={toggle} activePath={activePath} onOpenFile={onOpenFile} />
      ))}
    </div>
  );
}
