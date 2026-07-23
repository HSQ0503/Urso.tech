export type BrainChunk = {
  ordinal: number;
  heading: string;
  content: string;
  tokenCount: number;
};

const estimateTokens = (value: string): number => Math.max(1, Math.ceil(value.length / 4));

function splitLargeBlock(block: string, maxCharacters: number): string[] {
  if (block.length <= maxCharacters) return [block];
  const words = block.split(/\s+/);
  const parts: string[] = [];
  let current = "";

  for (const word of words) {
    if (current && current.length + word.length + 1 > maxCharacters) {
      parts.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) parts.push(current);
  return parts;
}

// Markdown-aware chunks keep the active heading trail so retrieved fragments
// retain meaning even when removed from the original document.
export function chunkMarkdown(
  markdown: string,
  opts: { targetTokens?: number; overlapTokens?: number } = {},
): BrainChunk[] {
  const targetTokens = opts.targetTokens ?? 420;
  const overlapTokens = opts.overlapTokens ?? 48;
  const maxCharacters = targetTokens * 4;
  const overlapCharacters = overlapTokens * 4;
  const headingTrail: string[] = [];
  const blocks: { heading: string; text: string }[] = [];
  let paragraph: string[] = [];

  const flush = () => {
    const text = paragraph.join("\n").trim();
    if (text) blocks.push({ heading: headingTrail.join(" › "), text });
    paragraph = [];
  };

  for (const line of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (heading) {
      flush();
      const depth = heading[1].length;
      headingTrail.splice(depth - 1);
      headingTrail[depth - 1] = heading[2].trim();
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    paragraph.push(line);
  }
  flush();

  const chunks: BrainChunk[] = [];
  let current = "";
  let currentHeading = "";

  const push = () => {
    const content = current.trim();
    if (!content) return;
    chunks.push({
      ordinal: chunks.length,
      heading: currentHeading,
      content,
      tokenCount: estimateTokens(content),
    });
    current = content.slice(Math.max(0, content.length - overlapCharacters));
  };

  for (const block of blocks) {
    for (const part of splitLargeBlock(block.text, maxCharacters)) {
      const prefixed = block.heading ? `${block.heading}\n${part}` : part;
      if (current && current.length + prefixed.length + 2 > maxCharacters) push();
      currentHeading = block.heading || currentHeading;
      current = current ? `${current}\n\n${prefixed}` : prefixed;
    }
  }
  push();

  return chunks.length
    ? chunks
    : [{ ordinal: 0, heading: "", content: markdown.trim(), tokenCount: estimateTokens(markdown) }];
}

export function estimatedTokenCount(value: string): number {
  return estimateTokens(value);
}
