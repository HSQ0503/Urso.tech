# Homepage "Research" section

Lives at anchor `#work` on the homepage. Four report cards in a responsive grid.

## Section header copy

- **Eyebrow:** `02 Research`
- **Headline:** `Notes from inside the *work*.` (the word "work" is italicized)
- **Deck:**
  > Short, honest pieces about what actually moves the needle for founder-led service businesses written while we build, not after. No gated PDFs, no fake stats.

## Card grid

- `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` with `gap-5 lg:gap-6`
- Each card is a link to `/reports/<slug>`

## Card anatomy

```
┌─────────────────────────────┐
│                             │
│       cover art (SVG)       │   ← aspect-[4/5], one of 4 tone gradients
│         62% × 62%           │
│                             │
├─────────────────────────────┤
│ EYEBROW (mono · uppercase)  │
│                             │
│ Headline, 20–22px, -0.01em  │
│                             │
│ ─────────────────────────   │
│ 6 min read           Read → │   ← "Read →" fades in on hover
└─────────────────────────────┘
```

### Card classes (Tailwind, current production)

Outer `<a>`:
```
group relative flex flex-col overflow-hidden rounded-[18px] bg-[var(--bone)] no-underline
transition-[transform,box-shadow] duration-[var(--t-mid)] ease-[var(--ease-out)]
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--urso-blue-bright)]
focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--urso-navy)]
hover:-translate-y-1 hover:shadow-[0_28px_60px_-24px_rgba(0,0,0,0.55)]
motion-reduce:transition-none motion-reduce:hover:translate-y-0
```

Art container:
```
relative flex aspect-[4/5] items-center justify-center overflow-hidden
<TONE CLASS>   ← one of tone-blue / tone-bright / tone-bone / tone-navy
```

Art highlight overlay (radial wash, top):
```
pointer-events-none absolute inset-0
bg-[radial-gradient(120%_80%_at_50%_0%,rgba(255,255,255,0.08),transparent_60%)]
```

Text block:
```
flex flex-1 flex-col gap-3 p-6 md:p-7
```

Eyebrow:
```
font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ink-3)]
```

Title:
```
m-0 text-[20px] md:text-[22px] font-[450] leading-[1.2] tracking-[-0.01em] text-[var(--ink)]
```

Foot row (meta · "Read →"):
```
mt-auto flex items-center justify-between border-t border-[var(--line)] pt-4
font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--ink-3)]
```

"Read →" reveal:
```
flex items-center gap-1 text-[var(--urso-blue)]
opacity-0 transition-opacity duration-[var(--t-fast)]
group-hover:opacity-100 group-focus-visible:opacity-100
```

## The four cards (in order)

| # | Slug                  | Eyebrow          | Meta         | Tone   |
|---|-----------------------|------------------|--------------|--------|
| 1 | `after-hours-leak`    | Research report  | 6 min read   | blue   |
| 2 | `review-response-gap` | Perspective      | 5 min read   | bone   |
| 3 | `three-seconds`       | Field note       | 7 min read   | navy   |
| 4 | `first-90-days`       | Research report  | 8 min read   | bright |

## Cover-art SVGs

All four art pieces are inline `<svg viewBox="0 0 200 200" aria-hidden="true">`. They're abstract, monochrome on their tone background. See each report file for its exact SVG source kept in the frontmatter `cover_art` field.
