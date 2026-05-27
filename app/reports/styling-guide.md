# Styling guide — Urso reports

Two surfaces to recreate: the **card** (homepage grid, see `listing.md`) and the **article page** (one per report). Article page is the meatier one — covered here.

Built with **Tailwind CSS v4 utilities** + the design tokens in `design-tokens.css`. No external CSS framework, no shadcn/ui in this section.

## Page shell

```html
<main class="relative min-h-screen bg-[var(--urso-navy)] text-white">
  <ReportNav />          <!-- absolute, top, transparent over hero -->
  <article>
    <section> ...header... </section>
    <section> ...body... </section>
    <MoreResearch />     <!-- bottom: 3 sibling reports -->
  </article>
</main>
```

Background is **`--urso-navy` (#060b1f)** throughout. White text. The card-tone gradient does NOT carry into the article page — the tone is a card-only signal.

## Top nav

Absolute, padded top.

```
absolute left-0 right-0 top-0 z-50 pt-9
```

Inner container: `mx-auto flex max-w-[var(--max-w)] items-center gap-9 px-[var(--gutter)]`.

- Brand: 28px Manrope wordmark `urso` with `tracking-[-0.04em]`, paired with a 63×34 white `urso-mark-white-tight.png` to its left.
- Three center nav links (Research, What we do, Process) → mono, 12px, uppercase, `tracking-[0.18em]`, `text-white/70` → `hover:text-white`.
- Right CTA "Request an audit →" → pill: `rounded-full border border-white/20 bg-white/5 px-5 py-2.5`, mono 11px, hover lifts both border and bg to `/40` / `/10`.

## Header section

```
relative px-[var(--gutter)] pb-16 pt-[140px] md:pb-24 md:pt-[180px]
```

12-col grid inside `max-w-[var(--max-w)]`:
- **Left 8 cols** — back-link, eyebrow, title, deck, meta row, spectrum bar.
- **Right 4 cols** — author panel, left-bordered on lg.

### Type scale (header)

| Element       | Classes                                                                                                                    |
|---------------|----------------------------------------------------------------------------------------------------------------------------|
| Back-link     | `font-mono text-[11px] uppercase tracking-[0.22em] text-white/55 hover:text-white`                                         |
| Eyebrow       | `font-mono text-[12px] uppercase tracking-[0.22em] text-white/60`                                                          |
| Title (H1)    | `text-[clamp(38px,6.5vw,80px)] font-[500] leading-[1.02] tracking-[-0.02em] text-white`                                    |
| Deck          | `max-w-[60ch] text-[19px] md:text-[21px] leading-[1.5] text-white/75`                                                      |
| Meta row      | `flex flex-wrap gap-x-10 gap-y-3 font-mono text-[11px] uppercase tracking-[0.18em] text-white/55`                          |
| Spectrum bar  | `h-[6px] w-full rounded-full bg-[linear-gradient(90deg,var(--urso-blue-bright)_0%,#5b8cff_28%,#a7c0ff_60%,var(--bone)_100%)]` |

### Author panel (right column)

```
col-span-12 lg:col-span-4 lg:border-l lg:border-white/10 lg:pl-10
```

Heading "Written by" → mono 11px, `tracking-[0.22em]`, `text-white/55`.
Each author: name `text-[17px] font-[500] text-white`, role `text-[14px] text-white/65`.

## Body section

```
px-[var(--gutter)] pb-24 md:pb-32
```

12-col grid, body sits in `col-span-12 lg:col-span-8`, max prose width **`max-w-[68ch]`**, base color `text-white/80`.

The body is rendered via descendant-selector Tailwind on a wrapper div — the report content itself is just `<p>`, `<h2>`, `<strong>`, `<ul>`, `<li>`. Wrapper:

```
[&>p]:mb-6 [&>p]:text-[17px] [&>p]:leading-[1.65] md:[&>p]:text-[19px]

[&>h2]:mt-16 [&>h2]:mb-6
[&>h2]:text-[26px] md:[&>h2]:text-[32px]
[&>h2]:font-[500] [&>h2]:leading-[1.18] [&>h2]:tracking-[-0.015em]
[&>h2]:text-white
[&>h2:first-child]:mt-0

[&_strong]:font-[600] [&_strong]:text-white

[&>ul]:my-8 [&>ul]:list-none [&>ul]:space-y-3 [&>ul]:pl-0
[&>ul>li]:relative [&>ul>li]:pl-6
[&>ul>li]:text-[17px] [&>ul>li]:leading-[1.55] [&>ul>li]:text-white/80
[&>ul>li]:before:absolute [&>ul>li]:before:left-0 [&>ul>li]:before:top-[0.05em]
[&>ul>li]:before:font-mono [&>ul>li]:before:text-[var(--urso-blue-bright)]
[&>ul>li]:before:content-['→']
```

Translation:
- Body paragraphs: 17px → 19px on md, 1.65 line-height.
- H2 section headings: 26px → 32px on md, 500 weight, tight tracking, lots of top space.
- Bold runs are 600 and pure white (vs `white/80` for body).
- Bulleted lists drop the disc and use a **blue `→` mono arrow** as marker.

## Sources block

Sits below body content, separated by a hairline. Same `max-w-[68ch]`.

```
mt-20 max-w-[68ch] border-t border-white/10 pt-10
```

Heading: `font-mono text-[11px] uppercase tracking-[0.22em] text-white/55` → "Sources".
Each item: `font-mono text-[12px] leading-[1.55] text-white/55`, stacked with `space-y-3`.

## "More from the field" footer

Lives below the article. Section:

```
border-t border-white/10 bg-[var(--urso-navy)] px-[var(--gutter)] py-20 md:py-24
```

Eyebrow `Keep reading` (mono 11px), headline:

```
mt-6 max-w-[18ch] text-[clamp(28px,3.5vw,42px)] font-[500] leading-[1.08] tracking-[-0.015em] text-white
```

Three sibling-report tiles in a `grid-cols-1 md:grid-cols-3 gap-6`. Each tile is a vertical stack with a top hairline:

```
group flex h-full flex-col gap-4 border-t border-white/15 pt-5
hover:border-white/40
```

Inside each:
- Eyebrow (mono 11px, `tracking-[0.18em]`, `text-white/55`).
- H3: `text-[20px] md:text-[22px] font-[450] leading-[1.22] tracking-[-0.01em] text-white`.
- Hover-reveal "Read →" in `text-[var(--urso-blue-bright)]`, mono 11px.

## Fonts

- **Display:** Manrope (variable, weights 400–600 used).
- **Mono:** JetBrains Mono (eyebrows, meta, list markers, sources).

Font weights are quirky: titles use `font-[500]`, sub-headlines use `font-[450]`. Stick with those rather than the conventional 400/500/600 — the half-step gives the editorial look.

## Spacing rules of thumb

- Section vertical padding: `py-20 md:py-24` for footer-ish blocks; the header section uses `pt-[140px] md:pt-[180px]` to clear the absolute nav.
- Generous H2 spacing (`mt-16 mb-6`) is what makes the long-form reads feel calm.
- Don't go past `max-w-[68ch]` on prose. Decks cap at `max-w-[60ch]`. Footer headlines cap at `max-w-[18ch]`.

## Motion

- All hovers use `--t-fast` (220ms) or `--t-mid` (360ms) with `--ease-out` (`cubic-bezier(0.16, 1, 0.3, 1)`).
- The "Read →" reveal: opacity fades in, arrow translates 0.5 units right on `group-hover`. Both respect `motion-reduce:*`.
