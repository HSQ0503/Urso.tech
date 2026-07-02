// Shared renderer for the analysts' plain-prose answers (graph chats + the
// strategy console). The model writes prose with **bold**, occasional *italic* /
// `code`, "- " or "* " bullets, and sometimes a stray #/numbered line — this
// turns all of that into real formatting instead of literal asterisks. It is
// size/color-agnostic: the parent sets text-[..]/text-ink, this just structures.

import type { ReactNode } from "react";

// Inline marks: **bold**, *italic*, `code`. ***x*** is normalized to bold first.
// A lone "*" (multiplication, bullet marker, unbalanced mid-stream) is left as
// plain text rather than mangled.
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const normalized = text.replace(/\*\*\*(.+?)\*\*\*/g, "**$1**");
  const re = /(\*\*([^*]+?)\*\*|\*([^*\s][^*]*?)\*|`([^`]+?)`)/g;
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized)) !== null) {
    if (m.index > last) out.push(normalized.slice(last, m.index));
    if (m[2] !== undefined) out.push(<strong key={`${keyPrefix}-b${i}`} className="font-semibold text-ink">{m[2]}</strong>);
    else if (m[3] !== undefined) out.push(<em key={`${keyPrefix}-i${i}`} className="italic">{m[3]}</em>);
    else if (m[4] !== undefined) out.push(<code key={`${keyPrefix}-c${i}`} className="rounded bg-raise px-1 py-0.5 font-mono text-[0.9em]">{m[4]}</code>);
    last = m.index + m[0].length;
    i++;
  }
  if (last < normalized.length) out.push(normalized.slice(last));
  return out;
}

// Inline-only variant for AI prose that lives inside an existing text element
// (report headlines, list items): renders the marks without imposing block
// structure, and strips a stray leading bullet marker so "- " never prints.
export function RichInline({ text }: { text: string }) {
  return <>{renderInline(text.replace(/^\s*[-•*]\s+/, ""), "in")}</>;
}

type Block = { type: "p" | "ul" | "h"; items: string[] };

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) continue; // blank line = block separator
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    // Bullet = "-", "•", or "*" FOLLOWED BY A SPACE (so it never eats *italic*).
    const bullet = line.match(/^\s*[-•*]\s+(.*)$/);
    if (heading) {
      blocks.push({ type: "h", items: [heading[1]] });
    } else if (bullet) {
      const last = blocks[blocks.length - 1];
      if (last && last.type === "ul") last.items.push(bullet[1]);
      else blocks.push({ type: "ul", items: [bullet[1]] });
    } else {
      blocks.push({ type: "p", items: [line] });
    }
  }
  return blocks;
}

export function RichText({ text, className = "" }: { text: string; className?: string }) {
  const blocks = parseBlocks(text);
  if (!blocks.length) return null;
  return (
    <div className={`space-y-2.5 leading-[1.65] ${className}`}>
      {blocks.map((b, i) => {
        if (b.type === "ul") {
          return (
            <ul key={i} className="space-y-1.5">
              {b.items.map((it, j) => (
                <li key={j} className="flex gap-2.5">
                  <span className="mt-[0.6em] size-[5px] shrink-0 rounded-full bg-orange/70" />
                  <span className="min-w-0">{renderInline(it, `${i}-${j}`)}</span>
                </li>
              ))}
            </ul>
          );
        }
        if (b.type === "h") return <p key={i} className="font-semibold text-ink">{renderInline(b.items[0], `h${i}`)}</p>;
        return <p key={i}>{renderInline(b.items[0], `${i}`)}</p>;
      })}
    </div>
  );
}
