"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpenText,
  BriefcaseBusiness,
  Building2,
  ChevronsDownUp,
  CircleHelp,
  FilePlus,
  Files,
  Folder,
  FolderPlus,
  Home,
  LogOut,
  Menu,
  MessageSquare,
  Network,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  X,
} from "lucide-react";
import type { BrainRole } from "@/lib/brain/types";
import { FileTree, type VaultFile } from "./file-tree";
import { SignOutButton } from "./sign-out";

const BARE_ROUTES = ["/brain/login", "/brain/welcome"];

const primaryNavigation = [
  { href: "/brain/chat", label: "New chat", icon: Plus },
  { href: "/brain", label: "Home", icon: Home },
  { href: "/brain/projects", label: "Projects", icon: BriefcaseBusiness },
  { href: "/brain/departments", label: "Departments", icon: Building2 },
  { href: "/brain/docs", label: "Knowledge", icon: Search },
  { href: "/brain/graph", label: "Knowledge map", icon: Network },
] as const;

function isActiveRoute(pathname: string, href: string) {
  if (href === "/brain") return pathname === href;
  if (href === "/brain/docs") return pathname.startsWith("/brain/docs");
  return pathname === href;
}

function roleLabel(role: BrainRole | null) {
  if (!role) return "Governed access";
  return role.replaceAll("_", " ");
}

function SanaSidebar({
  files,
  pathname,
  role,
  canEdit,
  onNavigate,
}: {
  files: VaultFile[];
  pathname: string;
  role: BrainRole | null;
  canEdit: boolean;
  onNavigate?: () => void;
}) {
  const folders = useMemo(
    () =>
      Array.from(new Set(files.map((file) => file.path.split("/")[0]).filter(Boolean))).slice(0, 5),
    [files],
  );

  return (
    <>
      <div className="sana-brand-row">
        <Link href="/brain" className="sana-brand" onClick={onNavigate}>
          <Image
            src="/brand/urso-mark-gradient.png"
            alt=""
            width={30}
            height={30}
            className="sana-brand-mark"
          />
          <span>Urso Brain</span>
        </Link>
      </div>

      <nav className="sana-nav" aria-label="Brain workspace">
        {primaryNavigation.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={`sana-nav-link ${isActiveRoute(pathname, href) ? "is-active" : ""}`}
          >
            <Icon size={18} strokeWidth={1.8} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>

      <div className="sana-folder-section">
        <p className="sana-side-label">Knowledge spaces</p>
        <div className="sana-folder-list">
          {folders.map((folder) => (
            <Link
              key={folder}
              href="/brain/docs"
              onClick={onNavigate}
              className="sana-folder-link"
              title={folder}
            >
              <Folder size={17} strokeWidth={1.7} />
              <span>{folder.replace(/^\d+\s*-\s*/, "")}</span>
            </Link>
          ))}
        </div>
        <Link href="/brain/docs" onClick={onNavigate} className="sana-folder-link sana-view-all">
          <span aria-hidden>•••</span>
          <span>View all</span>
        </Link>
      </div>

      <div className="sana-sidebar-bottom">
        <div className="sana-scope-card">
          <span className="sana-scope-icon">
            <ShieldCheck size={18} />
          </span>
          <p>{files.length} permitted sources</p>
          <span>Company knowledge in your current scope</span>
          <Link href="/brain/docs" onClick={onNavigate}>
            Open knowledge
          </Link>
        </div>

        {canEdit && (
          <Link href="/brain/docs/new" onClick={onNavigate} className="sana-footer-link">
            <FilePlus size={17} />
            <span>New knowledge</span>
          </Link>
        )}
        <Link href="/brain/settings" onClick={onNavigate} className="sana-footer-link">
          <Settings size={17} />
          <span>Settings</span>
          <span className="sana-footer-meta">{roleLabel(role)}</span>
        </Link>
        <SignOutButton className="sana-footer-link sana-signout">
          <LogOut size={17} />
          <span>Sign out</span>
        </SignOutButton>
      </div>
    </>
  );
}

function GraphShell({
  files,
  canEdit,
  children,
}: {
  files: VaultFile[];
  canEdit: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const docPath = search.get("path");
  const [sidebarWidth, setSidebarWidth] = useState(284);
  const [collapseSignal, setCollapseSignal] = useState(0);
  const dragging = useRef(false);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!dragging.current) return;
      setSidebarWidth(Math.min(480, Math.max(220, event.clientX - 48)));
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

  return (
    <div className="ob-app graph-shell">
      <a href="#brain-main-content" className="brain-skip-link">
        Skip to knowledge map
      </a>
      <nav className="ob-ribbon graph-ribbon" aria-label="Brain navigation">
        <Link href="/brain" className="ob-rib-btn" title="Home">
          <Home size={17} />
        </Link>
        <Link href="/brain/chat" className="ob-rib-btn" title="Ask Brain">
          <MessageSquare size={17} />
        </Link>
        <Link href="/brain/projects" className="ob-rib-btn" title="Projects">
          <BriefcaseBusiness size={17} />
        </Link>
        <Link href="/brain/docs" className="ob-rib-btn" title="Knowledge">
          <BookOpenText size={17} />
        </Link>
        <Link href="/brain/graph" className="ob-rib-btn is-active" title="Knowledge map">
          <Network size={17} />
        </Link>
        <div className="flex-1" />
        <Link href="/brain/settings" className="ob-rib-btn" title="Settings">
          <Settings size={17} />
        </Link>
      </nav>

      <aside className="ob-sidebar graph-explorer" style={{ width: sidebarWidth }}>
        <div className="ob-side-head">
          <span className="ob-side-tab is-active" title="Vault files">
            <Files size={16} />
          </span>
          <Link href="/brain/docs" className="ob-side-tab" title="Search knowledge">
            <Search size={16} />
          </Link>
          <Link href="/brain/graph" className="ob-side-tab" title="Knowledge map">
            <Network size={16} />
          </Link>
        </div>
        <div className="ob-nav-actions">
          {canEdit && (
            <>
              <Link href="/brain/docs/new" className="ob-nav-btn" title="New knowledge">
                <FilePlus size={15} />
              </Link>
              <Link href="/brain/docs/new" className="ob-nav-btn" title="New folder">
                <FolderPlus size={15} />
              </Link>
            </>
          )}
          <button
            type="button"
            className="ob-nav-btn"
            title="Collapse all"
            onClick={() => setCollapseSignal((value) => value + 1)}
          >
            <ChevronsDownUp size={15} />
          </button>
        </div>
        <FileTree
          files={files}
          activePath={docPath}
          collapseSignal={collapseSignal}
          onOpenFile={(file) => router.push(`/brain/docs/view?path=${encodeURIComponent(file.path)}`)}
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

      <main id="brain-main-content" className="ob-main" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}

export function BrainShell({
  files,
  children,
  canEdit,
  role,
}: {
  files: VaultFile[];
  children: React.ReactNode;
  canEdit: boolean;
  role: BrainRole | null;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (BARE_ROUTES.includes(pathname)) {
    return <div className="ob-app grid place-items-center">{children}</div>;
  }

  if (pathname === "/brain/graph") {
    return (
      <GraphShell files={files} canEdit={canEdit}>
        {children}
      </GraphShell>
    );
  }

  return (
    <div className="ob-app sana-shell">
      <a href="#brain-main-content" className="brain-skip-link">
        Skip to workspace
      </a>

      <aside className="sana-sidebar">
        <SanaSidebar files={files} pathname={pathname} role={role} canEdit={canEdit} />
      </aside>

      <div
        className={`sana-mobile-overlay ${mobileOpen ? "is-open" : ""}`}
        onClick={() => setMobileOpen(false)}
        aria-hidden={!mobileOpen}
      />
      <aside className={`sana-mobile-drawer ${mobileOpen ? "is-open" : ""}`}>
        <button
          type="button"
          className="sana-drawer-close"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
        >
          <X size={20} />
        </button>
        <SanaSidebar
          files={files}
          pathname={pathname}
          role={role}
          canEdit={canEdit}
          onNavigate={() => setMobileOpen(false)}
        />
      </aside>

      <main id="brain-main-content" className="sana-main" tabIndex={-1}>
        <header className="sana-mobile-header">
          <Link href="/brain" className="sana-mobile-brand">
            <Image src="/brand/urso-mark-gradient.png" alt="" width={27} height={27} />
            <span>Urso Brain</span>
          </Link>
          <button type="button" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <Menu size={21} />
          </button>
        </header>
        {children}
      </main>
    </div>
  );
}
