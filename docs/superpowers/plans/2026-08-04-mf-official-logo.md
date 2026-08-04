# MF Official Logo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the provisional MF SVG with the supplied official transparent PNG across every MF demo surface.

**Architecture:** Keep `MfLogo` as the single shared logo boundary. Serve the unchanged asset from `public/brand`, render it with Next Image, and use the existing `.mf-logo-mark` responsive sizing hook to crop the transparent square padding and invert the black artwork to white on dark MF surfaces.

**Tech Stack:** Next.js 16 App Router, React, `next/image`, CSS, Node contract assertions.

---

### Task 1: Lock the official-logo contract

**Files:**
- Modify: `scripts/brain-mf-demo-contracts.mjs`
- Test: `scripts/brain-mf-demo-contracts.mjs`

- [ ] **Step 1: Write the failing contract**

Read `components/mf/mf-logo.tsx` and assert that the shared component points to the official public asset, uses the dedicated image class, and no longer contains the provisional SVG or placeholder wording:

```js
const mfLogoSource = readFileSync(new URL("../components/mf/mf-logo.tsx", import.meta.url), "utf8");
assert.match(mfLogoSource, /from ["']next\/image["']/);
assert.match(mfLogoSource, /src=["']\/brand\/mf-logo\.png["']/);
assert.match(mfLogoSource, /className=["']mf-logo-image["']/);
assert.doesNotMatch(mfLogoSource, /<svg|Logo provisório|Placeholder logo/);
```

- [ ] **Step 2: Run the contract and verify RED**

Run:

```powershell
npm run brain:mf:contracts
```

Expected: FAIL because `mf-logo.tsx` still contains the provisional inline SVG and does not reference `/brand/mf-logo.png`.

### Task 2: Install and render the official asset

**Files:**
- Create: `public/brand/mf-logo.png`
- Modify: `components/mf/mf-logo.tsx`
- Modify: `app/mf/mf.css`

- [ ] **Step 1: Copy and verify the supplied asset**

Copy `C:\Users\HSQ05\Downloads\MFLogo.png` to `public\brand\mf-logo.png`, then compare SHA-256 hashes:

```powershell
Copy-Item -LiteralPath 'C:\Users\HSQ05\Downloads\MFLogo.png' -Destination 'public\brand\mf-logo.png'
Get-FileHash 'C:\Users\HSQ05\Downloads\MFLogo.png','public\brand\mf-logo.png' -Algorithm SHA256
```

Expected: both hashes are identical.

- [ ] **Step 2: Replace the provisional SVG**

Use Next Image inside the existing accessible component:

```tsx
import Image from "next/image";
import { useMfLanguage } from "./mf-language";

export function MfLogo({ compact = false }: MfLogoProps) {
  const { language } = useMfLanguage();
  return (
    <div className="mf-logo" aria-label="Minerbo-Fuchs Engenharia">
      <span className="mf-logo-mark" aria-hidden="true">
        <Image
          src="/brand/mf-logo.png"
          alt=""
          width={1024}
          height={1024}
          className="mf-logo-image"
        />
      </span>
      {!compact ? (
        <span className="mf-logo-copy">
          <strong>minerbo–fuchs</strong>
          <span>engenharia s.a.</span>
        </span>
      ) : null}
      <span className="sr-only">
        {language === "pt" ? "Logo da Minerbo-Fuchs Engenharia" : "Minerbo-Fuchs Engenharia logo"}
      </span>
    </div>
  );
}
```

Keep the existing company-name copy unchanged.

- [ ] **Step 3: Fit the transparent square asset into the existing mark box**

Replace the old SVG sizing rule and add the image rule:

```css
.mf-logo-mark {
  position: relative;
  display: block;
  overflow: hidden;
  width: 64px;
  aspect-ratio: 124 / 46;
  flex: 0 0 auto;
}

.mf-logo-image {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 165%;
  height: auto;
  max-width: none;
  transform: translate(-52%, -45.5%);
  filter: brightness(0) invert(1);
}
```

The existing breakpoint rules continue to set `.mf-logo-mark` widths.

- [ ] **Step 4: Run the contract and verify GREEN**

Run:

```powershell
npm run brain:mf:contracts
```

Expected: PASS.

### Task 3: Verify the real demo

**Files:**
- Verify: `components/mf/mf-logo.tsx`
- Verify: `app/mf/mf.css`
- Verify: `public/brand/mf-logo.png`

- [ ] **Step 1: Run static verification**

```powershell
npx tsc --noEmit
npx eslint components/mf/mf-logo.tsx
npm run build
```

Expected: every command exits 0; pre-existing warnings outside the touched files may remain.

- [ ] **Step 2: Render and inspect `/mf`**

Start the built application with the repository environment, open `/mf`, and capture desktop and mobile screenshots. Confirm:

- the official mark is white and sharp;
- no square background is visible;
- the header, lobby, and compact navigation all use the same image;
- surrounding Project Intelligence copy does not shift or clip.

- [ ] **Step 3: Preserve unrelated work**

Compare `git status --short` and the final diff against the pre-change snapshot. The only new logo changes must be the asset, `mf-logo.tsx`, the dedicated CSS rules, and the logo contract assertions. Do not stage or rewrite the existing Brain/provider changes.
