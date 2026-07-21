"use client";

// The Obsidian shell. Structure, left to right, exactly as Obsidian lays it out:
//
//   ribbon      44px icon rail — the app's verbs
//   sidebar     pane tabs, explorer actions, the vault file tree, vault footer
//   resizer     drag handle
//   main        tab bar → view header (nav + breadcrumbs) → scrolling content
//
// Tabs are real: opening a doc adds one, closing falls back to its neighbour.
// They live in component state, which survives navigation because this shell is
// mounted by the layout and only the children below it re-render.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  ChevronsDownUp,
  CircleHelp,
  FilePlus,
  Files,
  FileText,
  FolderPlus,
  LogOut,
  MessageSquare,
  Network,
  Plus,
  Search,
  Settings,
  X,
} from "lucide-react";
import { FileTree, type VaultFile } from "./file-tree";
import { SignOutButton } from "./sign-out";

type Tab = { href: string; label: string; kind: "doc" | "view" };

const BARE = ["/brain/login", "/brain/welcome"];

export function BrainShell({ files, children }: { files: VaultFile[]; children: React.ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const docPath = search.get("path");

  const href = docPath ? `${pathname}?path=${encodeURIComponent(docPath)}` : pathname;

  // What the current route is called, for the tab and the breadcrumb tail.
  const titleOf = useCallback(
    (p: string) => files.find((f) => f.path === p)?.title ?? (p.split("/").pop() ?? p).replace(/\.md$/i, ""),
    [files],
  );
  let label = "Urso Brain";
  let kind: Tab["kind"] = "view";
  if (pathname === "/brain") label = "Chat";
  else if (pathname === "/brain/graph") label = "Graph view";
  else if (pathname === "/brain/docs") label = "Vault";
  else if (pathname === "/brain/docs/new") label = "New doc";
  else if (pathname === "/brain/settings") label = "Settings";
  else if (pathname === "/brain/docs/view" && docPath) {
    label = titleOf(docPath);
    kind = "doc";
  } else if (pathname === "/brain/docs/edit" && docPath) {
    label = `${titleOf(docPath)} — editing`;
    kind = "doc";
  }

  const [tabs, setTabs] = useState<Tab[]>([]);
  const [sidebar, setSidebar] = useState(250);
  const [collapseSignal, setCollapseSignal] = useState(0);
  const dragging = useRef(false);

  useEffect(() => {
    if (BARE.includes(pathname)) return;
    setTabs((prev) => (prev.some((t) => t.href === href) ? prev : [...prev, { href, label, kind }]));
  }, [href, label, kind, pathname]);

  // Sidebar drag-resize.
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!dragging.current) return;
      setSidebar(Math.min(480, Math.max(180, e.clientX - 44)));
    };
    const up = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, []);

  // Sign-in and onboarding have no vault to browse — they render bare.
  if (BARE.includes(pathname)) {
    return <div className="ob-app grid place-items-center">{children}</div>;
  }

  const closeTab = (h: string) => {
    const idx = tabs.findIndex((t) => t.href === h);
    const next = tabs.filter((t) => t.href !== h);
    setTabs(next);
    if (h === href) router.push(next[Math.min(idx, next.length - 1)]?.href ?? "/brain");
  };

  const crumbs = kind === "doc" && docPath ? docPath.replace(/\.md$/i, "").split("/") : [label];

  return (
    <div className="ob-app">
      <nav className="ob-ribbon">
        <Link href="/brain" className={`ob-rib-btn ${pathname === "/brain" ? "is-active" : ""}`} title="Chat">
          <MessageSquare size={17} />
        </Link>
        <Link href="/brain/graph" className={`ob-rib-btn ${pathname === "/brain/graph" ? "is-active" : ""}`} title="Graph view">
          <Network size={17} />
        </Link>
        <Link href="/brain/docs" className={`ob-rib-btn ${pathname === "/brain/docs" ? "is-active" : ""}`} title="Vault">
          <Files size={17} />
        </Link>
        <Link href="/brain/docs/new" className={`ob-rib-btn ${pathname === "/brain/docs/new" ? "is-active" : ""}`} title="New doc">
          <FilePlus size={17} />
        </Link>
        <div className="flex-1" />
        <Link href="/brain/settings" className={`ob-rib-btn ${pathname === "/brain/settings" ? "is-active" : ""}`} title="Settings">
          <Settings size={17} />
        </Link>
        <SignOutButton className="ob-rib-btn">
          <LogOut size={17} />
        </SignOutButton>
      </nav>

      <aside className="ob-sidebar" style={{ width: sidebar }}>
        <div className="ob-side-head">
          <span className="ob-side-tab is-active" title="Files">
            <Files size={16} />
          </span>
          <Link href="/brain/docs" className="ob-side-tab" title="Search the vault">
            <Search size={16} />
          </Link>
          <Link href="/brain/graph" className="ob-side-tab" title="Graph view">
            <Bookmark size={16} />
          </Link>
        </div>
        <div className="ob-nav-actions">
          <Link href="/brain/docs/new" className="ob-nav-btn" title="New doc">
            <FilePlus size={15} />
          </Link>
          <Link href="/brain/docs/new" className="ob-nav-btn" title="New folder">
            <FolderPlus size={15} />
          </Link>
          <button type="button" className="ob-nav-btn" title="Collapse all" onClick={() => setCollapseSignal((n) => n + 1)}>
            <ChevronsDownUp size={15} />
          </button>
        </div>
        <FileTree
          files={files}
          activePath={docPath}
          collapseSignal={collapseSignal}
          onOpenFile={(f) => router.push(`/brain/docs/view?path=${encodeURIComponent(f.path)}`)}
        />
        <div className="ob-vault">
          <span className="ob-vault-name">Urso Brain</span>
          <Link href="/brain/docs" className="ob-nav-btn" title="Help">
            <CircleHelp size={15} />
          </Link>
          <Link href="/brain/settings" className="ob-nav-btn" title="Settings">
            <Settings size={15} />
          </Link>
        </div>
      </aside>

      <div
        className="ob-resizer"
        onPointerDown={() => {
          dragging.current = true;
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
        }}
      />

      <main className="ob-main">
        <div className="ob-tabbar">
          {tabs.map((t) => (
            <div key={t.href} className={`ob-tab ${t.href === href ? "is-active" : ""}`}>
              <Link href={t.href} className="flex min-w-0 items-center gap-2">
                {t.kind === "doc" ? <FileText size={14} /> : <MessageSquare size={14} />}
                <span className="ob-tab-label">{t.label}</span>
              </Link>
              <button type="button" className="ob-tab-x" onClick={() => closeTab(t.href)} aria-label={`Close ${t.label}`}>
                <X size={13} />
              </button>
            </div>
          ))}
          <Link href="/brain/docs/new" className="ob-tab-new" title="New doc">
            <Plus size={16} />
          </Link>
        </div>

        <div className="ob-viewhead">
          <button type="button" className="ob-icon-btn" onClick={() => router.back()} aria-label="Back">
            <ArrowLeft size={16} />
          </button>
          <button type="button" className="ob-icon-btn" onClick={() => router.forward()} aria-label="Forward">
            <ArrowRight size={16} />
          </button>
          <div className="ob-crumbs">
            {crumbs.map((c, i) => (
              <span key={i}>
                {i > 0 && <span className="ob-crumb-sep">/</span>}
                <span className={i === crumbs.length - 1 ? "ob-crumb-cur" : undefined}>{c}</span>
              </span>
            ))}
          </div>
          <div className="w-[52px]" />
        </div>

        {children}
      </main>
    </div>
  );
}
