// Reading view for vault markdown. The dashboard's RichText is built for AI
// prose — it flattens every heading to a bold paragraph and knows nothing about
// [[wikilinks]], which are the vault's whole connective tissue. This renders the
// subset of Markdown the vault actually uses, and resolves wikilinks the same
// way lib/brain/links.ts does so a link that works in Obsidian works here.
//
// Styling lives entirely in .ob-md (globals.css) — this only builds structure.

import Link from "next/link";
import type { ReactNode } from "react";

export type LinkTarget = { path: string; title: string };

const docHref = (path: string) => `/brain/docs/view?path=${encodeURIComponent(path)}`;

// Same resolution order as resolveLinks(): exact title, then filename stem,
// then the last segment of a path-style link.
function makeResolver(targets: LinkTarget[]) {
  const byTitle = new Map<string, string>();
  const byStem = new Map<string, string>();
  const norm = (s: string) => s.toLowerCase().trim();
  const stemOf = (p: string) => norm((p.split("/").pop() ?? p).replace(/\.md$/i, ""));
  for (const t of targets) {
    if (!byTitle.has(norm(t.title))) byTitle.set(norm(t.title), t.path);
    if (!byStem.has(stemOf(t.path))) byStem.set(stemOf(t.path), t.path);
  }
  return (name: string) => byTitle.get(norm(name)) ?? byStem.get(norm(name)) ?? byStem.get(stemOf(name)) ?? null;
}

type Resolver = (name: string) => string | null;

// Inline pass: [[wikilink]] / [[link|alias]], [text](url), **bold**, *italic*,
// `code`. Wikilinks are matched first so their inner text is never chewed up by
// the emphasis rules.
function inline(text: string, resolve: Resolver, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re =
    /(!?\[\[([^\][|#]+)(?:#[^\][|]*)?(?:\|([^\][]*))?\]\])|(\[([^\]]+)\]\(([^)\s]+)\))|(\*\*(.+?)\*\*)|(\*([^*\s][^*]*?)\*)|(`([^`]+?)`)/g;
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      const name = m[2].trim();
      const label = m[3]?.trim() || name;
      const target = resolve(name);
      out.push(
        target ? (
          <Link key={`${key}-w${i}`} href={docHref(target)}>
            {label}
          </Link>
        ) : (
          // Obsidian greys unresolved links rather than hiding them — they mark
          // the docs worth writing next.
          <span key={`${key}-w${i}`} className="ob-unresolved" title="No doc with this name yet">
            {label}
          </span>
        ),
      );
    } else if (m[4] !== undefined) {
      const href = m[6];
      const external = /^https?:\/\//i.test(href);
      out.push(
        <a key={`${key}-a${i}`} href={href} {...(external && { target: "_blank", rel: "noreferrer" })}>
          {m[5]}
        </a>,
      );
    } else if (m[7] !== undefined) {
      out.push(<strong key={`${key}-b${i}`}>{inline(m[8], resolve, `${key}-b${i}`)}</strong>);
    } else if (m[9] !== undefined) {
      out.push(<em key={`${key}-i${i}`}>{m[10]}</em>);
    } else if (m[11] !== undefined) {
      out.push(<code key={`${key}-c${i}`}>{m[12]}</code>);
    }
    last = m.index + m[0].length;
    i++;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type ListItem = { depth: number; text: string; ordered: boolean };

// Rebuild a nested <ul>/<ol> from indent depth.
function renderList(items: ListItem[], resolve: Resolver, key: string): ReactNode {
  const build = (start: number, depth: number): [ReactNode[], number] => {
    const nodes: ReactNode[] = [];
    let i = start;
    while (i < items.length && items[i].depth >= depth) {
      if (items[i].depth > depth) {
        const [child, next] = build(i, items[i].depth);
        const prev = nodes.pop();
        nodes.push(
          <li key={`${key}-n${i}`}>
            {prev && typeof prev === "object" && "props" in prev ? (prev as React.ReactElement<{ children?: ReactNode }>).props.children : null}
            {items[i].ordered ? <ol>{child}</ol> : <ul>{child}</ul>}
          </li>,
        );
        i = next;
        continue;
      }
      nodes.push(<li key={`${key}-l${i}`}>{inline(items[i].text, resolve, `${key}-l${i}`)}</li>);
      i++;
    }
    return [nodes, i];
  };
  const [nodes] = build(0, items[0].depth);
  return items[0].ordered ? <ol key={key}>{nodes}</ol> : <ul key={key}>{nodes}</ul>;
}

export function VaultMarkdown({ content, targets }: { content: string; targets: LinkTarget[] }) {
  const resolve = makeResolver(targets);
  const lines = content.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let k = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    // Fenced code — consumed verbatim, no inline parsing inside.
    const fence = line.match(/^\s*```(\w*)\s*$/);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) body.push(lines[i++]);
      i++;
      blocks.push(
        <pre key={k++}>
          <code>{body.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push(<hr key={k++} />);
      i++;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const Tag = `h${level}` as "h1";
      blocks.push(<Tag key={k}>{inline(heading[2], resolve, `h${k++}`)}</Tag>);
      i++;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ""));
      blocks.push(<blockquote key={k}>{inline(body.join(" "), resolve, `q${k++}`)}</blockquote>);
      continue;
    }

    // Table: a header row followed by a |---|---| separator.
    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const cells = (r: string) =>
        r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = cells(lines[i]);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(cells(lines[i++]));
      blocks.push(
        <table key={k}>
          <thead>
            <tr>{head.map((c, j) => <th key={j}>{inline(c, resolve, `th${k}-${j}`)}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>{r.map((c, j) => <td key={j}>{inline(c, resolve, `td${k}-${ri}-${j}`)}</td>)}</tr>
            ))}
          </tbody>
        </table>,
      );
      k++;
      continue;
    }

    const bullet = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    if (bullet) {
      const items: ListItem[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
        if (!m) break;
        items.push({ depth: Math.floor(m[1].length / 2), text: m[3], ordered: /\d/.test(m[2]) });
        i++;
      }
      blocks.push(renderList(items, resolve, `ul${k++}`));
      continue;
    }

    // Paragraph — soft-wrapped lines join until a blank line or a new block.
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,6}\s|\s*>|\s*```|\s*\|)/.test(lines[i]) &&
      !/^(\s*)([-*+]|\d+[.)])\s+/.test(lines[i]) &&
      !/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i])
    ) {
      para.push(lines[i++]);
    }
    if (para.length) blocks.push(<p key={k}>{inline(para.join(" "), resolve, `p${k++}`)}</p>);
    else i++;
  }

  return <div className="ob-md">{blocks}</div>;
}

// Word count for the status bar, ignoring markdown punctuation.
export function countWords(text: string): number {
  return text.replace(/[#*`>[\]|_-]/g, " ").split(/\s+/).filter(Boolean).length;
}
