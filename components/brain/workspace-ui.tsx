import Link from "next/link";
import {
  ArrowRight,
  BookOpenText,
  Building2,
  FileText,
  type LucideIcon,
} from "lucide-react";
import type { BrainDocMeta } from "@/lib/brain/types";

export function BrainAccessNotice({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-0 flex-1 place-items-center bg-bg px-5 py-10 text-ink">
      <div className="w-full max-w-[460px] text-center">
        <span className="mx-auto grid size-10 place-items-center rounded-md bg-raise text-orange">
          <BookOpenText className="size-5" />
        </span>
        <h1 className="mt-4 text-[18px] font-semibold tracking-[-0.02em]">{title}</h1>
        <div className="mt-2 text-[14px] leading-6 text-ink-dim">{children}</div>
      </div>
    </div>
  );
}

export function WorkspacePage({
  eyebrow,
  title,
  description,
  action,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="ob-content bg-bg text-ink">
      <div className="ob-workspace">
        <header className="ob-page-head">
          <div className="min-w-0 max-w-[760px]">
            <p className="sr-only">{eyebrow}</p>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
          {action && <div className="ob-page-action">{action}</div>}
        </header>
        {children}
      </div>
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  href,
  hrefLabel = "View all",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  href?: string;
  hrefLabel?: string;
}) {
  return (
    <div className="ob-section-heading">
      <div>
        {eyebrow && (
          <p className="ob-section-eyebrow">{eyebrow}</p>
        )}
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {href && (
        <Link href={href} className="ob-section-link">
          {hrefLabel}
          <ArrowRight className="size-3.5" />
        </Link>
      )}
    </div>
  );
}

export function WorkspaceCard({
  icon: Icon,
  eyebrow,
  title,
  description,
  children,
  href,
}: {
  icon: LucideIcon;
  eyebrow?: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
  href?: string;
}) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-4">
        <span className="grid size-10 shrink-0 place-items-center border border-edge bg-raise text-ink-dim transition-colors group-hover:text-orange">
          <Icon className="size-[18px]" />
        </span>
        {href && <ArrowRight className="mt-1 size-4 text-ink-dimmer transition-colors group-hover:text-orange" />}
      </div>
      {eyebrow && (
        <p className="mt-5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink-dimmer">
          {eyebrow}
        </p>
      )}
      <h3 className={`${eyebrow ? "mt-2" : "mt-5"} text-[16px] font-semibold tracking-[-0.02em]`}>
        {title}
      </h3>
      {description && <p className="mt-2 text-[13px] leading-5 text-ink-dim">{description}</p>}
      {children}
    </>
  );

  const className =
    "group flex min-h-[190px] flex-col rounded-[24px] bg-panel p-6 transition-colors hover:bg-raise";

  return href ? (
    <Link href={href} className={`${className} cursor-pointer focus-visible:outline-none`}>
      {content}
    </Link>
  ) : (
    <article className={className}>{content}</article>
  );
}

export function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: number | string;
  detail: string;
}) {
  return (
    <div className="ob-metric min-w-0">
      <p className="truncate">{value}</p>
      <p>{label}</p>
      <p className="hidden truncate sm:block">{detail}</p>
    </div>
  );
}

const typeLabel: Record<BrainDocMeta["doc_type"], string> = {
  core: "Company core",
  rule: "Standing rule",
  doc: "Knowledge",
};

export function DocumentRow({
  doc,
  context,
}: {
  doc: BrainDocMeta;
  context?: string;
}) {
  return (
    <Link
      href={`/brain/docs/view?path=${encodeURIComponent(doc.path)}`}
      className="ob-document-row group"
    >
      <span className="ob-document-icon">
        <FileText className="size-[21px]" />
      </span>
      <span className="ob-document-copy">
        <span>{doc.title}</span>
        <span>
          {context ? `${typeLabel[doc.doc_type]} · ${context}` : typeLabel[doc.doc_type]}
        </span>
      </span>
      {doc.current_version && (
        <span className="ob-document-version">
          v{doc.current_version}
        </span>
      )}
      <ArrowRight className="ob-document-arrow" />
    </Link>
  );
}

export function EmptyKnowledge({
  title,
  description,
  kind = "knowledge",
}: {
  title: string;
  description: string;
  kind?: "knowledge" | "department";
}) {
  const Icon = kind === "department" ? Building2 : FileText;
  return (
    <div className="rounded-[22px] border border-dashed border-edge px-6 py-10 text-center">
      <Icon className="mx-auto size-5 text-ink-dimmer" />
      <h3 className="mt-3 text-[13px] font-semibold">{title}</h3>
      <p className="mx-auto mt-1 max-w-[380px] text-[12px] leading-5 text-ink-dim">{description}</p>
    </div>
  );
}
