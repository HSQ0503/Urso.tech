# Urso Reports Export

Portable copy of the four research reports currently published on the Urso site, plus the styling system they use. Self-contained so you can drop the text into another CMS, newsletter, or design surface without touching the Next.js project.

## Contents

```
exports/reports/
├── README.md                         ← this file
├── listing.md                        ← homepage "Research" section copy + card layout
├── styling-guide.md                  ← layout, type scale, Tailwind classes, hero gradient
├── design-tokens.css                 ← CSS variables (colors, motion, spacing) the reports rely on
├── report-01-after-hours-leak.md     ← "Research report" · blue tone
├── report-02-review-response-gap.md  ← "Perspective" · bone tone
├── report-03-three-seconds.md        ← "Field note" · navy tone
└── report-04-first-90-days.md        ← "Research report" · bright tone
```

Each report file has:
1. **YAML frontmatter** slug, eyebrow, title, deck, read time, publish date, status, tone, authors, cover-art notes.
2. **Body** clean markdown (`##` for section headings, `**bold**`, `-` bullets). Smart quotes restored, HTML entities unescaped.
3. **Sources** numbered list of every citation used.

## Editorial rules (don't break these on porting)

- Voice: sharp modern studio. Confident, tight, concrete. No big-consultancy jargon.
- Never state firm size. No "$1.2B / 41 markets" puffery, no "we're just two guys" smallness either.
- No bear/pack metaphors beyond the name + mark. ("the pack", "how we hunt", "follow the tracks" all banned.)
- Don't fabricate stats. Every percentage in these files traces to a source listed at the bottom.
- Hook line if you need one: *"If you left your business today, could it still run?"*
- Primary CTA: **Request a diagnostic** → `mailto:hsq0503@gmail.com` (or `/book-a-diagnostic` route on the live site).

## Authors

- Shouqi Han Co-founder, Urso
- Gustavo Campos Co-founder, Urso

Orlando, FL. Studio founded May 2026.

## Publish state

All four reports listed as `status: published`, dated **May 20, 2026**.
