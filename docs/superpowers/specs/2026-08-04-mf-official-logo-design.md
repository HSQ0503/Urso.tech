# MF Official Logo Integration Design

## Objective

Replace the provisional inline MF mark in the shared MF demo logo component with the supplied official `MFLogo.png`, without changing the demo's established layout, typography, navigation, or interaction design.

## Approved treatment

- Preserve the supplied PNG pixels exactly; do not redraw or regenerate the logo.
- Copy the source asset into `public/brand/mf-logo.png` so the demo owns a stable, deployable asset.
- Render the black transparent mark as white on the MF demo's dark surfaces using CSS. Transparency must remain intact.
- Retain the existing responsive lockup and the separate “Project Intelligence” / “Powered by Urso” product copy.
- Use the same shared component for the desktop header, mobile navigation, and presentation lobby so every MF surface receives the official mark consistently.

## Component and styling changes

`components/mf/mf-logo.tsx` will use Next's local image component instead of the provisional inline SVG. The existing `.mf-logo-mark` box remains the layout boundary, with overflow clipping and centered scaling to account for the transparent padding in the square source file. `.mf-logo-image` will carry the white-on-dark filter. Existing responsive width rules continue to control the mark's visible size.

The accessible name remains “Minerbo-Fuchs Engenharia.” The screen-reader-only copy will describe the real company logo rather than calling it provisional.

## Alternatives considered

1. **Approved: exact PNG with a white CSS treatment.** Preserves official geometry and works with every existing dark MF surface.
2. **Original black PNG on a light backing plate.** Preserves source color but adds a new visual block that conflicts with the current header and lobby styling.
3. **Redraw or preprocess a separate white asset.** Can reduce runtime styling, but risks changing the supplied geometry or introducing another derivative asset to maintain.

## Verification

- Add a contract assertion that the shared MF logo references `/brand/mf-logo.png`, uses the image class, and no longer contains the provisional SVG or placeholder wording.
- Confirm the copied public asset matches the supplied file byte-for-byte.
- Run the MF contract suite, TypeScript, targeted lint, and production build.
- Render `/mf` at desktop and mobile widths and confirm the official mark is legible in the header, lobby, and compact navigation without shifting surrounding content.

## Scope guardrails

- Do not change the supplied logo artwork.
- Do not modify the broader MF visual system.
- Do not alter Brain, Harness, workflow, role, scenario, or demo-state behavior.
- Preserve all unrelated uncommitted work already present in the repository.
