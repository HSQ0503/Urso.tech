# Urso.tech — Website System Spec v2

Source of truth: `Urso Brand Design Packet v1.0` (vault). This spec translates it into the
build. Where the packet and old site disagree, the packet wins. If a decision isn't covered:
**darker, quieter, fewer elements, less orange.**

---

## 1. Creative direction — "The operating layer"

The site behaves like the thing Urso sells: a calm operating system for a real business.
Black field, hairline structure, mono-labeled instruments, and **exactly one orange signal
per view** marking the move that matters. No decoration that doesn't carry information.
The recurring motif is the **direction line** — a thin orange path, always flowing left → right
(the bear's direction), that marks "the next move" and finally terminates at the CTA.

What a visitor should feel: *this firm is precise, unhurried, and already operating at a level
my business hasn't reached yet.*

Never: mascot energy, AI clichés, SaaS-template tropes, neon, parallax, looping attention-seekers.

## 2. Hard brand rules (from the packet — non-negotiable)

- **Color**: bg `#070707` (token `bg`), raised `#0C0C0C` (`surface`), hairlines white 8% / 14%
  (`edge` / `edge-strong`), text white / 58% / 38% (`ink` / `ink-dim` / `ink-dimmer`).
  Orange `#FE5100` ≤ 10% of any viewport, ONE orange focal point per view. Orange hover
  `#FF6A1F`, press `#E04800`. Light contrast moments: Bone `#F6F5F1` with Ink `#14171C`
  (≤ 1–2 per page). The Ember gradient lives ONLY inside the bear mark.
- **Logo**: use the real artwork only — never rebuild the lockup from parts, never re-typeset
  "Urso", never animate beyond fade/reveal (the old bear-pounce is retired). Trimmed assets:
  `/public/brand/urso-logo-orange-white.png` (lockup, ratio 4.71:1) and
  `/public/brand/urso-mark-gradient.png` (mark, ratio 1.93:1). Nav lockup 28–32px tall,
  footer mark 22–24px. Clear space ≥ 0.5× mark height.
- **Type**: Geist 400/500/600 only — never 700+. Sentence case everywhere, including
  headlines and buttons. ALL CAPS belongs exclusively to Geist Mono micro-labels
  (11–12px, +0.1em tracking). Scale: Display 56–80/1.02/-0.045em · H1 40–48/1.08/-0.03em ·
  H2 28–32/1.15/-0.03em · H3 20–24/1.25/-0.02em · body 16–17/1.6 · caption 12–13.
  Tabular numerals in any KPI/table.
- **Layout**: 12-col grid, content max 1200px, gutter `clamp(20px,4vw,56px)`. 4-pt spacing
  scale. Sections 96–128px apart desktop / 56–72 mobile. Radius 4 (chips) / 8 (buttons,
  inputs) / 12 (cards) / 16 (large panels); pill ONLY for nav CTA + mono sticker labels.
  Hairlines define structure on dark — no shadows. 8/4 asymmetric split: content left,
  data/annotation right.
- **Section grammar**: mono eyebrow (`NN — LABEL`) → H2 → body → proof (number, diagram, or
  screen). One idea per section.
- **CTAs**: primary = orange fill + **black** text, 8px radius (pill in nav only). Exactly one
  orange CTA visible per viewport; secondary = hairline outline; tertiary = text + arrow.
- **Motion**: 200–400ms, ease-out (`cubic-bezier(0.16,1,0.3,1)`), opacity/translate only.
  Reveal once on scroll. No parallax, no loops. `prefers-reduced-motion` respected everywhere.
  Charts: ≤ 200ms draw-in. Page wipe: black panel, thin orange leading hairline (1–2px),
  left → right, 360ms cover / 420ms uncover.
- **Data viz**: series white 28% / 14%, gridlines 7%, axes 40%, exactly one orange focal
  point per chart. Real or plausible numbers only — never lorem charts.
- **Product frames**: Surface bg, 12px radius, 1px edge hairline, flat front-on. Never 3-D tilt.
- **Voice**: plain, terse, second person, anchored in dollars. Short sentences. State findings
  as findings. No hedging, no exclamation points, no hype. Banned: "unlock insights",
  "cutting-edge", "revolutionize", "seamless", "AI-powered transformation", "supercharge",
  "game-changing", "future-proof", "leverage AI" — and any sentence whose subject is our
  technology instead of the client's business. Never frame value as cutting staff.
- **Honesty**: no fake testimonials, logos, case studies, or numbers. Real numbers available:
  *29 months of client POS history · 4 locations · $6.8M validated to the penny* (current
  engagement, anonymized). The before/after case study does not exist yet — say so with
  confidence, never apologize.

## 3. Sitemap & routing

| Route | Page | Notes |
|---|---|---|
| `/` | Home | full narrative, 8 sections |
| `/what-we-do` | What we do | positioning narrative |
| `/how-it-works` | How it works | 4 phases, deep |
| `/capabilities` | Capabilities | 5 groups, one system |
| `/what-we-find` | What we find | proof page (findings ledger) |
| `/contact` | Contact | the business-review form |
| `/login`, `/dashboard`, `/console`, `/reports/*`, `/privacy`, `/terms` | kept | chrome updated only |
| `/about` → `/what-we-do`, `/book-a-diagnostic` → `/contact` | redirects | in `next.config.ts` |

Nav (left → right): lockup · What we do · How it works · Capabilities · What we find ·
`Log in` (text) · `Start the conversation` (pill CTA). Mobile: lockup + menu button →
full-screen quiet panel, links stacked, CTA at bottom.

Footer: mark 24px + "Operational intelligence for people-based businesses." · columns
Site / Engage (Start the conversation, Log in) / Legal (Privacy, Terms) · mono lines:
`© 2026 Urso. All rights reserved.` and `"Urso" — Portuguese for bear.`

## 4. Component system (`components/site/`)

- `chrome.tsx` — `SiteNav` (fixed, bg/85 + blur, hairline bottom; client for mobile menu +
  scrolled state), `SiteFooter`.
- `ui.tsx` — `Eyebrow` (mono index+label), `SectionHead` (eyebrow+h2+lede, 8/4 aware),
  `Cta` (href or button; `variant: "primary" | "hairline" | "text"`), `MonoTag`, `PageHero`
  (eyebrow + H1 display + sub + optional CTAs + optional proof line), `CtaBlock` (shared
  final-CTA section), `BoneSection` (light contrast wrapper; flips tokens via `.bone-scope`).
- `reveal.tsx` — `Reveal`: IntersectionObserver, once, adds `is-in`; CSS does
  opacity 0→1 / translateY(12px)→0, 320ms ease-out, optional `delay` (≤ 240ms stagger).
  With reduced motion: visible immediately.
- `wipe-link.tsx` — `WipeLink`: renders `next/link`, intercepts plain left-clicks to run the
  page wipe; modified clicks fall through.
- `motifs.tsx` — `InstrumentStrip` (hero band: hairline grid, cropped chart path, tick marks,
  mono readouts; draws in once), `ConnectDiagram` (scattered system chips → one orange path
  into URSO OS node), `PhasePath` (Review→Build→Activate→Improve with advancing orange path),
  `SystemSchematic` (5 capability-group nodes on one line).
- `product-frame.tsx` — `ProductFrame` (Surface, radius 12, hairline, mono title row) +
  `DashboardScene` (KPI cards w/ tabular numerals + delta chips, quiet area chart, one
  `InsightCard`: 2px orange left rule, mono `INSIGHT` label, plain finding, action button).
- `ledger.tsx` — `FindingsLedger` (client): rows `[TAG] finding` expandable to
  `WHERE IT HIDES` + `THE MOVE` (orange hairline left rule). Buttons with `aria-expanded`;
  keyboard accessible. `findings-data.ts` holds all entries.
- `contact-form.tsx` — client form, hairline inputs (8px radius, orange focus ring
  1px outline 2px offset), `SlideToConfirm` submit, success panel. POSTs `/api/contact`.

Shared CSS additions in `globals.css`: `.bone-scope` token flip, `.reveal`/`.is-in`,
`.draw-path` (stroke-dash draw, 360ms), nav/wipe keyframes. Old `.brand*` pounce CSS removed.

## 5. Final copy — Home

**Hero**
- eyebrow: `FOR BUSINESSES THAT RUN ON PEOPLE`
- Display: `See everything. Fix the leaks. Grow with control.` (final period orange)
- sub: `Urso connects the data scattered across your business — sales, scheduling, books,
  phones, reviews — into one operating system. Then we work with your team to fix what it
  finds, week after week.`
- CTAs: **Start the conversation** (primary → /contact) · **See what you're missing** (hairline → /what-we-find)
- proof line (mono): `29 MONTHS OF CLIENT POS HISTORY · 4 LOCATIONS · $6.8M VALIDATED TO THE PENNY`
- visual: `InstrumentStrip` — monochrome (no orange; the period and CTA own the budget).

**01 — OUTCOMES** · H2 `More revenue. Better margins. Less chaos.`
lede: `Every engagement is judged the way you judge your business: did the number move.`
1. **Find missed revenue** — `Unanswered calls, empty appointment slots, customers who quietly
   stopped coming back. The money is already in your operation — it's leaking, not gone.
   We find it, size it in dollars, and go get it.`
2. **Make sharper decisions** — `You shouldn't have to guess which location, service, or
   schedule is underperforming. One set of numbers everyone trusts, so the next move is
   obvious instead of debated.`
3. **Operate with control** — `Fewer surprises, fewer fires. Your team runs the same playbook
   at every location, and you can see it working without standing in the room.`

**02 — THE PROBLEM** · H2 `You don't need another dashboard.`
lede: `Your business already produces the data. It's just trapped — in the POS, the books,
the booking system, the phones, the review pages, and your head.`
pain rows:
- `Your reports show what happened. They don't tell your team what to do next.`
- `Data lives everywhere, so decisions still run on instinct.`
- `Revenue leaks hide in scheduling, follow-up, inventory, and inconsistency between locations.`
- `Growth adds locations, people, and noise. Without a stronger operating layer, it adds chaos too.`
visual: `ConnectDiagram` (section's one orange focal).

**03 — THE SYSTEM** (Bone section) · H2 `One partner. Five jobs.`
lede: `Urso is not a software vendor, and not a slide-deck consultancy. We build the
intelligence layer behind your business — then stay to run it with you.`
1. **Connect the data** — `POS, books, payroll, phones, booking, reviews — unified into one
   source of truth and validated against the systems you already run.`
2. **Find the opportunities** — `We read your numbers the way an operator would: where revenue
   leaks, which decisions are overdue, what to fix first — sized in dollars.`
3. **Build the system** — `Dashboards, AI analysis, custom tools, automations — built around
   how your business actually runs, not around a template.`
4. **Activate the team** — `Software nobody uses changes nothing. We implement with your
   managers: process changes, training, and AI handling the busywork.`
5. **Improve continuously** — `We keep watching the numbers, keep finding the next
   opportunity, and keep advising on the move — month after month.`
closing line (H3 weight): `You're not buying software. You're hiring the team that runs it.`

**04 — WHAT WE FIND** · H2 `Proof looks like this.`
lede: `We won't show you a wall of borrowed logos. What we have is a repeatable way of finding
money — these are the patterns we hunt first.` Six ledger rows (see §9, home set) +
text CTA `See the full list →` (→ /what-we-find).

**05 — HOW WE WORK** · H2 `Review. Build. Activate. Improve.`
lede: `Every engagement runs the same arc. No mystery, no black box.`
- **Review** — `We study how the business actually runs: systems, data, workflows, where money
  leaks and decisions stall.`
- **Build** — `We stand up the intelligence layer — data connections, dashboards, automations,
  custom tools — on your real numbers.`
- **Activate** — `We put it to work with your team: implementation, training, process changes,
  AI on the busywork.`
- **Improve** — `We stay on it: tracking performance, surfacing opportunities, advising the
  next move.`
text CTA `How an engagement runs →` (→ /how-it-works). Visual: `PhasePath`.

**06 — THE OPERATING LAYER** · H2 `The software stays in the background. The results don't.`
lede: `Every client runs on a private operating system we build and maintain — every location,
every number, and the next move, on one screen.`
visual: `ProductFrame` + `DashboardScene`, cropped at the right edge. Insight card copy:
`INSIGHT — Tuesday 2–4pm runs well below capacity at 3 of 4 locations. Filling half of those
slots is worth ≈ $2,100/mo.` action: `Assign the fix`.
caption (mono): `EVERY LOCATION · EVERY NUMBER · DEFINED ONCE, TRUE EVERYWHERE`

**07 — WHO IT'S FOR** · H2 `Built for businesses that run on people.`
lede: `If revenue depends on customers showing up, teams executing, and schedules staying
full, Urso fits.`
rows:
- **Multi-location operators** — `You can't be in every store. The numbers can.`
- **Franchise owners** — `Corporate gives you a brand. We build the operating layer around
  how your locations actually run.`
- **Appointment-based businesses** — `Your calendar is your inventory. Empty slots are spoilage.`
- **Repeat-customer businesses** — `The second visit is where the margin lives. We make sure
  it happens.`
- **Scattered-systems businesses** — `Five tools, five logins, no single truth. We end that.`
- **Scaling past founder instinct** — `What got you to three locations won't run ten.
  Instinct doesn't scale. Systems do.`
industries line (mono, dim): `PET CARE · CLINICS · MED SPAS · EDUCATION · HOME SERVICES ·
WELLNESS · CHILDCARE · FITNESS · FRANCHISE GROUPS`

**08 — Final CTA** (`CtaBlock`, shared)
Display: `Own your direction.` (orange period)
sub: `Tell us how your business runs and what's getting harder. We'll come back with what
we'd look at first — specific to your operation, not a pitch.`
primary **Start the conversation** · text **See what we find →**
mono note: `EVERY ENGAGEMENT IS SHAPED AROUND THE BUSINESS, THE SYSTEMS INVOLVED, AND THE
LEVEL OF EXECUTION REQUIRED.`

## 6. Final copy — What we do

Hero — eyebrow `WHAT WE DO`; H1 `An operating partner, not another tool.`;
sub `Urso exists for the gap between "we have the data somewhere" and "we know what to do —
and it's getting done."`

**01 — WHAT URSO IS** · H2 `The intelligence layer behind your business — plus the team that acts on it.`
body: `Urso is a data and AI partner for people-based businesses: companies where revenue
depends on customers, teams, appointments, and repeat visits. We unify the data your business
already produces, build the systems that make it usable, and then stay — implementing,
advising, and executing alongside your team.` / `That last part is the difference. Plenty of
firms will sell you software or a strategy deck. We hold the data layer, find what's leaking,
and stay until the fixes hold.`
is/is-not rows — **Urso is**: `A long-term operating partner that holds your data layer and
fixes what it finds` · `Strategy grounded in your real numbers, implemented hands-on` ·
`Built for businesses that run on people, service, and execution`. **Urso is not**:
`A software vendor selling dashboard seats` · `A consultancy that leaves a deck and walks
away` · `An AI agency selling automations for their own sake`.

**02 — WHY IT EXISTS** · H2 `Scattered data is expensive. You're already paying for it.`
body: `Every system in your business keeps its own version of the truth. The POS knows sales.
The books know costs. The booking system knows gaps. The phones know who never got through.
Nobody sees all of it at once — so the owner becomes the integration layer, and decisions
wait until someone has a free weekend.` / `That delay has a price: leaks that run for months,
strong locations subsidizing weak ones unnoticed, marketing spend disconnected from what
actually books. The data to stop it already exists. It's just not assembled.`

**03 — WHERE DATA AND AI FIT** · H2 `Data is the raw material. AI is leverage. Neither is the point.`
body: `We start by making your numbers trustworthy — unified, reconciled, validated against
the systems you already run. Then AI earns its place: reading the whole operation
continuously, flagging what changed, drafting the weekly brief, handling follow-up busywork
a manager shouldn't burn hours on.` / `What we don't do is bolt automations onto a chaotic
operation and call it transformation. If a piece of AI doesn't move revenue, margin, or
control, it doesn't ship.`

**04 — WHY DASHBOARDS AREN'T ENOUGH** · H2 `A dashboard is a mirror. It doesn't change anything.`
body: `Dashboards show the business; they don't run it. A chart of missed calls doesn't call
anyone back. A retention report doesn't rebook a customer. Most businesses don't suffer from
missing information — they suffer from information that never becomes action.` /
`So we wire every number to a move: an action, an owner, and a date. The dashboard is where
the work is visible — not where it stops.`
diagram: `SIGNAL → SIZED IN $ → THE MOVE → AN OWNER → RESULT` (hairline flow, orange on THE MOVE).

**05 — WHAT TO EXPECT** · H2 `The outcomes we're hired for.`
grid (6): **Revenue** `Recovered leaks, fuller schedules, customers brought back.` ·
**Margin** `Labor, inventory, and spend matched to what the numbers support.` ·
**Decisions** `Weeks of debate become a number and a move.` ·
**Control** `The same playbook at every location — visible without standing in the room.` ·
**Visibility** `One screen that tells you what's actually happening, every morning.` ·
**Direction** `Growth that follows a plan instead of momentum.`

CtaBlock variant — Display `Start with the decisions you're already trying to make.`
sub `Bring the question you keep circling — staffing, a second location, why Tuesdays die.
That's exactly where an engagement starts.`

## 7. Final copy — How it works

Hero — eyebrow `HOW IT WORKS`; H1 `Four phases. One direction.`;
sub `Every engagement runs the same arc: understand the business, build its operating layer,
put it to work, keep improving it. Here's what each phase actually involves.`

**Phase 01 — Review** · H2 `We study the business as it actually runs.`
body: `Not a questionnaire — recon. We look at your operation the way an operator would:
the systems you run, the history they hold, what's observable from the outside in. Then we
pull the data together and reconcile it until the numbers agree with reality.`
You get: `A unified baseline of your business, and a leak report: where money is getting
lost, sized in dollars, ranked by how certain we are.`
Working when (mono): `YOU SEE THE WHOLE BUSINESS IN ONE PLACE FOR THE FIRST TIME.`

**Phase 02 — Build** · H2 `We build your operating layer on your real numbers.`
body: `Data connections, dashboards, AI analysis, automations, custom tools where the
off-the-shelf option doesn't fit. Built around your workflows and your definitions — defined
once, true everywhere. No seats to license, no template to live inside.`
You get: `A private operating system pre-loaded with your own validated data — not an empty
tool you have to feed.`
Working when (mono): `THE MONDAY NUMBERS ARRIVE WITHOUT ANYONE COMPILING THEM.`

**Phase 03 — Activate** · H2 `We put it to work with your team.`
body: `Software nobody uses changes nothing. We implement alongside your managers: the
process changes, the training, the new rhythms — and AI agents on the busywork, so the system
runs without adding headcount to run it. Your people stay on customers; the layer handles
the watching.`
You get: `A team actually operating from the system — same playbook, every location.`
Working when (mono): `YOUR MANAGERS REACH FOR IT WITHOUT BEING ASKED.`

**Phase 04 — Improve** · H2 `We stay on it.`
body: `This is the part that makes the rest worth doing. We keep tracking performance against
baseline, keep hunting the next opportunity, and keep advising on the move — a steady cadence
of finding, fixing, and measuring. The system gets sharper the longer it runs.`
You get: `An ongoing operating partner: monitoring, analysis, advisory, and execution on a
monthly rhythm.`
Working when (mono): `THE SAME LEAK DOESN'T COME BACK TWICE.`

**The first weeks** strip (mono labels): `ACCESS & RECON → BASELINE CAPTURED → LEAK REPORT →
FIRST FIX MEASURED` + body `We move deliberately at the start: a clean baseline is what makes
every later claim provable. You'll know what we found, what we're fixing first, and how the
result will be measured — before we touch anything.`

CtaBlock — Display `See what a review would surface.` sub `The first conversation is a walk
through your operation: what you run, where it strains, and what we'd examine first.`

## 8. Final copy — Capabilities

Hero — eyebrow `CAPABILITIES`; H1 `One system. Many parts.`;
sub `Everything below ships as part of one operating layer — not a menu of services. You
engage Urso; these are the tools the engagement brings.` Visual: `SystemSchematic`.

**01 — INTELLIGENCE** · `See clearly.`
- Data unification — `POS, books, payroll, phones, booking, reviews — one validated source of truth.`
- KPI definition & tracking — `Metrics defined once and true everywhere, so stores compare honestly.`
- Revenue opportunity analysis — `Leaks found and sized in dollars, ranked by certainty.`
- Customer intelligence — `Who's due back, who's slipping away, who's worth a call today.`
- Product & service intelligence — `What sells where, what's ignored where, and what that's worth.`
- Scheduling & utilization analysis — `Where the calendar leaks hours and the chairs sit empty.`

**02 — SYSTEMS** · `Build the layer.`
- Operational dashboards — `Every location, every number, one screen — owner and manager views.`
- Custom internal tools — `Built where off-the-shelf doesn't fit how you run.`
- System integrations — `The tools you already use, finally talking to each other.`
- Data quality & validation — `Reconciled against source systems — to the penny, not roughly.`

**03 — AUTOMATION** · `Remove the busywork.`
- AI agents — `Watching the numbers, drafting the brief, chasing the follow-up — quietly.`
- Workflow automation — `The repeatable steps between systems, done without a human relay.`
- Alerts & monitoring — `Silent until there's a move to make. Then specific.`
- Automated reporting — `The weekly brief written before Monday opens.`

**04 — EXECUTION** · `Make it stick.`
- Implementation — `We install the fixes with your team — not a recommendations PDF.`
- Team process improvement — `The best location's playbook, made standard at all of them.`
- Training & adoption — `Managers who use the system because it's faster than not using it.`
- Operations support — `A standing partner when something breaks, drifts, or changes.`

**05 — GROWTH** · `Scale with direction.`
- Ongoing advisory — `An operator across the table every month, looking at the same numbers.`
- Margin improvement — `Labor, inventory, and spend tuned against what the data supports.`
- Location benchmarking — `What your best store proves, rolled out to the rest.`
- Expansion readiness — `Open the next location on systems, not adrenaline.`

CtaBlock — Display `The parts only matter assembled.` sub `Tell us what you run today and
we'll tell you which of these your operation actually needs — and in what order.`

## 9. Final copy — What we find (+ ledger data)

Hero — eyebrow `WHAT WE FIND`; H1 `The money is already in the building.`;
sub `We're a young firm, and we won't fake a wall of case studies. Here's something better:
the actual patterns we hunt, where they hide, and the move each one unlocks.`
proof bar (mono): `CURRENT ENGAGEMENT · 4-LOCATION FRANCHISE OPERATOR · 29 MONTHS OF POS
HISTORY · $6.8M VALIDATED TO THE PENNY`

Ledger groups & entries (full set; ★ = also on home):

**MISSED REVENUE**
- ★ `[CAPTURE]` Calls that ring after close and never come back. → HIDES: in a phone system
  nobody audits — the caller books elsewhere, and there's no record anyone called. → MOVE:
  `Track every missed call, text back within minutes, count the recovered bookings in dollars.`
- `[CONVERT]` Booking friction nobody inside notices. → HIDES: in plain sight — like a top
  location being the only one without a "book online" button on its own profile. → MOVE:
  `Walk the customer's path from search to booked, from the outside in. Fix what blocks it
  within the week.`

**CUSTOMER BEHAVIOR**
- ★ `[RETENTION]` Customers who should be back every six weeks — and quietly aren't. →
  HIDES: in averages. Overall revenue looks fine while your best customers slip out the back. →
  MOVE: `A win-back list ranked by customer value, worked weekly, measured in rebooked dollars.`
- `[FOLLOW-UP]` First-time customers who never get a reason to return. → HIDES: between
  systems — the POS knows it was a first visit; nobody acts on it. → MOVE: `A first-visit
  follow-up that runs itself, and a number tracking who came back.`

**TEAM CONSISTENCY**
- ★ `[CONSISTENCY]` One team member's clients come back at twice the rate of another's. →
  HIDES: behind "everyone has their own style." Rebook rate by person tells the real story. →
  MOVE: `Find what the best one does. Make it the standard. Watch the spread close.`
- `[PLAYBOOK]` Each location running its own version of the business. → HIDES: in the gap
  between what the manual says and what each manager actually does. → MOVE: `Compare
  locations on the same definitions, then standardize what the winner proves.`

**PRODUCT & SERVICE GAPS**
- ★ `[PRODUCT]` A product selling hard at one location and sitting on the shelf at another. →
  HIDES: in inventory reports nobody reads side by side. → MOVE: `Rank the gap in dollars.
  Push what one store proves everywhere it isn't happening.`
- `[MIX]` High-margin services undersold because nobody's asked the data which customers
  want them. → HIDES: in the order history — buying patterns show who'd say yes. → MOVE:
  `Put the right offer in front of the right customer at booking, and measure attach rate.`

**SCHEDULING & UTILIZATION**
- ★ `[SCHEDULE]` Open slots at 2pm on Tuesdays — every Tuesday. → HIDES: in a calendar
  that's "always been like that." Empty capacity expires the moment it passes. → MOVE:
  `Fill the valley with targeted offers instead of discounting the peak.`
- `[LABOR]` Staffing that ignores the demand curve. → HIDES: in schedules built from habit —
  overstaffed Mondays, slammed Saturdays. → MOVE: `Match labor to the curve the data already
  shows. Margin moves within a month.`

**DATA DISCONNECTS**
- `[SPEND]` Marketing judged on clicks while the POS knows what actually booked. → HIDES:
  between the ad account and the register — they've never met. → MOVE: `Tie spend to booked
  revenue. Cut what doesn't convert. Double what does.`
- `[INVENTORY]` Ordering driven by habit instead of demand. → HIDES: in the storeroom —
  cash sleeping on shelves next to stockouts of what sells. → MOVE: `Order from the demand
  data. Free the cash. Stop the stockouts.`

**DECISION BOTTLENECKS**
- ★ `[DECISION]` Reports that get exported, attached, and never acted on. → HIDES: in the
  weekly routine — information moves, nothing else does. → MOVE: `Every number ends in a
  decision: an action, an owner, a date.`
- `[INSTINCT]` Calls the owner keeps making from the gut when the data already knows. →
  HIDES: in the gap between what the systems record and what reaches the person deciding. →
  MOVE: `Put the answer where the decision happens — sized, current, and impossible to miss.`

Closing block — H2 `When the first before/after is done, it goes here.`
body `Our current engagement is mid-flight: baseline captured cleanly, first fix in
implementation, result to be measured against 29 months of validated history. It will be
published the way we run it — baseline first, methodology shown. Until then, we'd rather show
you what we'd find in your operation than dress ours up.`
Field notes row (text links to /reports — 3 items, mono eyebrow `FIELD NOTES`).
CtaBlock — Display `Find yours.` sub `Every operation leaks somewhere. Thirty minutes on how
yours runs, and we'll tell you where we'd look first.`

## 10. Final copy — Contact

Hero — eyebrow `CONTACT`; H1 `Start the conversation.`;
sub `This is the beginning of a business review, not a sales funnel. Tell us how the business
runs; we'll come back with what we'd look at first.`

What happens next (mono indexes):
1. **We read it.** `A founder reads every note. There's no inbox triage team to get past.`
2. **We look from the outside.** `Before we talk, we do recon an operator would respect:
   your public surfaces, booking flow, reviews — what a customer actually hits.`
3. **We talk.** `Thirty minutes on your operation and what we'd examine first. If we're not
   the right fit, we'll say so.`

Form fields: Name* · Work email* · Company* · Website · Business type (select: Appointment-
based services / Multi-location or franchise / Clinic or practice / Education or childcare /
Home services / Fitness or wellness / Other) · Locations (select: 1 / 2–3 / 4–9 / 10–24 / 25+) ·
`What's getting harder as you grow?` (textarea) · `What runs the business today?` (text,
placeholder `POS, books, scheduling, phones…`).
Submit: SlideToConfirm `Slide to start the conversation`.
Success: mono `RECEIVED` + `You'll hear back from a founder — usually within two business
days.` + text link `While you wait, see what we find →`.
API: `POST /api/contact` (same stub pattern as request-diagnostic: validate, log, Resend
block commented).

## 11. Metadata

- Root: title `Urso — Operational intelligence for people-based businesses`, description
  `Urso connects the data scattered across your business into one operating system — then
  works with your team to fix what it finds. More revenue, sharper decisions, less chaos.`
- Per page: `What we do — Urso`, `How it works — Urso`, `Capabilities — Urso`,
  `What we find — Urso`, `Start the conversation — Urso` with section-specific descriptions.
- `app/sitemap.ts` + `app/robots.ts` (exclude /dashboard, /console, /login, /api).

## 12. Build ownership map

| Owner | Files |
|---|---|
| core (done first) | brand assets, globals.css, components/site/* shared, app/layout.tsx, app/page.tsx, next.config.ts, wipe-transition |
| agent A | app/what-we-do/page.tsx |
| agent B | app/how-it-works/page.tsx |
| agent C | app/capabilities/page.tsx |
| agent D | app/what-we-find/page.tsx |
| agent E | app/contact/page.tsx, app/api/contact/route.ts |
| agent F | login/privacy/terms chrome retrofit, sitemap.ts, robots.ts, delete dead marketing components, opengraph refresh |

Verification gate: `npm run lint` && `npm run build`, then served-page spot checks.
