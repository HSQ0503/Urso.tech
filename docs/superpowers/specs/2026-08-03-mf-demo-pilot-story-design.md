# MF Demo Pilot-Decision Design

**Date:** 2026-08-03

**Status:** Approved in conversation; pending review of this written specification

**Primary route:** `/mf`

## 1. Objective

The MF demo must persuade a project sponsor to approve a pilot of Urso on one active, multidisciplinary engineering project.

The presentation must show, in no more than 12 guided minutes with 3 minutes reserved for discussion, that Urso can:

1. connect project context sources to a governed Brain;
2. detect and control a material supplier revision;
3. preserve the correct revision history, evidence, permissions, and approvals;
4. turn controlled project truth into a Harness objective and executable workflow;
5. deliver privilege-specific context and actions to each employee;
6. coordinate dependencies, artifacts, handoffs, and human gates across disciplines;
7. give management a reliable view of risk, progress, and release readiness; and
8. finish with a concrete, low-risk pilot proposal.

The demo is a guided project-rescue story, not a general feature tour.

## 2. Non-goals

This work will not:

- redesign the visual identity, typography, color system, layout language, or presentation shell;
- claim that production Teams, CDE, BIM, schedule, or supplier connectors exist when they do not;
- replace professional engineering judgment or human approval;
- implement a general-purpose production workflow runtime;
- add unrelated Urso product areas or alternate scenarios to the 12-minute path; or
- expand the story beyond the Revision C / EXE-02 workflow.

## 3. Design constraints

### 3.1 Styling lock

The current MF styling is retained. New content must reuse the established:

- black-and-white industrial presentation shell;
- typography and spacing;
- cards, tables, drawers, status pills, rails, and diagram treatment;
- role selector and bilingual Portuguese/English behavior; and
- responsive and reduced-motion behavior.

New visual primitives are allowed only when an existing component cannot express the required information. Any new primitive must match the current visual language.

### 3.2 Truth consistency

One typed scenario manifest is the sole source of truth for:

- Revision B and Revision C values;
- milestone and delivery dates;
- materiality calculations;
- impacted disciplines;
- decisions and approvals;
- workflow tasks and dependencies;
- generated artifacts;
- schedule outcomes;
- scripted fallback answers; and
- acceptance-test expectations.

Visible UI fixtures, seeded Brain claims, Harness state, receipts, and fallback copy must derive from this manifest. Duplicated scenario numbers in components are prohibited.

### 3.3 Honest capability labels

The connected-source registry must label each source as one of:

- **Live Brain ingestion:** evidence is genuinely ingested, authorized, retrieved, and cited by the deployed Brain;
- **Demo adapter:** an adapter exercises the real source contract using synthetic project data; or
- **Pilot integration:** a proposed connection requiring MF credentials and discovery.

The main story may remain deterministic, but it must never imply that a demo adapter is a production connector.

## 4. Fifteen-minute presentation structure

The guided path consumes 12 minutes. The final 3 minutes are reserved for questions or opening proof drawers.

| Time | Scene | Buyer takeaway |
| ---: | --- | --- |
| 0:30 | Executive opening | The project, milestone, 15 disciplines, and business risk are immediately clear. |
| 1:00 | Revision C arrives | A routine supplier revision can quietly threaten the schedule. |
| 2:00 | Urso investigates | Urso compares revisions, verifies sources, and detects material change. |
| 2:00 | Blast radius | Ten affected disciplines, dependencies, and the do-nothing consequence become visible. |
| 1:15 | Human decision | The PM controls the truth transition; engineering authority remains human. |
| 2:00 | Coordinated response | Urso creates an ordered response with owners, deadlines, dependencies, and work packets. |
| 1:30 | Control Tower | Management sees blockers, progress, evidence completeness, and release readiness without chasing. |
| 1:00 | Outcome | Eight days are recovered and the release decision is traceable. |
| 0:45 | Pilot proposal | The next step is one project, one workflow, defined integrations, safeguards, and metrics. |

A persistent story rail communicates:

`Change detected -> Truth controlled -> Impact understood -> Work coordinated -> Release protected`

Every scene directly answers:

- What happened?
- What did Urso do?
- What value did that create?

Technical details remain available through optional **Show the proof** drawers so they do not interrupt the main story.

## 5. Presentation additions

### 5.1 Executive value bar

A compact persistent summary shows:

- milestone being protected;
- current forecast;
- affected disciplines;
- open critical blockers;
- potential delay exposure; and
- days recovered.

These values are derived from scenario and workflow state rather than copied into the presentation.

### 5.2 Connected Sources view

The demo establishes the project context ecosystem before the change occurs. Each source shows:

- system and source type;
- connection mode;
- owner;
- authority level;
- freshness and last successful synchronization;
- ingestion status;
- authorized roles; and
- evidence contributed to the Revision C decision.

Supported demo source categories include supplier communications, controlled documents, BIM/model metadata, schedule and milestones, engineering standards, RFIs and decisions, team communications, and project identity/permissions.

### 5.3 Controlled Change Record

Revision C receives a dedicated record that joins the entire story:

- before-and-after values;
- materiality assessment;
- source evidence;
- affected controlled claims;
- approval state;
- supersession history;
- impacted disciplines;
- conflicts;
- decision receipt; and
- Context Receipt.

The truth transition is explicit:

1. Rev B is current and accepted.
2. Rev C is detected, material, and unresolved.
3. DEC-042 requires PM approval.
4. PM approval makes Rev C current and accepted.
5. Rev B becomes historical and superseded.
6. The transition records evidence, authority, effective time, and audit history.

### 5.4 Harness objective and workflow map

After approval, the Harness creates the objective:

> Protect the EXE-02 release milestone by resolving every Revision C dependency before August 18.

The objective decomposes into an ordered graph of tasks, dependencies, assigned roles, deadlines, artifacts, and human gates. The graph covers controlled-revision confirmation, process layout, electrical demand, chilled-water demand, structural loads, model coordination, multidisciplinary review, and the PM release decision.

Selecting a workflow node opens its evidence, owner, dependencies, employee actions, deliverable, and completion criteria.

### 5.5 Employee Objective Workspace

The existing role selector becomes a demonstration of authorization and personalized work. Switching roles changes both the accessible context and permitted actions.

Each employee workspace contains:

- the employee's objective and next action;
- why the employee is involved;
- what changed;
- a concise, authorized context packet;
- inputs and blocking dependencies;
- employees waiting for the output;
- available workflow actions;
- required artifact;
- validation checklist;
- human approval gate;
- handoff recipient; and
- definition of done.

The interface explicitly states: **Same project event. Different authorized context, objective, and actions.**

Completing work unblocks the correct downstream discipline, creates a workflow receipt, and updates the Control Tower.

### 5.6 Derived Control Tower

The Control Tower derives its presentation from actual Brain and Harness state. It shows:

- objective completion;
- blocked and unblocked disciplines;
- critical-path exposure;
- overdue actions;
- evidence completeness;
- review readiness;
- forecast milestone;
- days recovered; and
- release confidence.

The Control Tower does not keep a separate editable copy of these values.

### 5.7 Outcome comparison

The final outcome contrasts the operating models:

| Without Urso | With Urso |
| --- | --- |
| Change discovered through fragmented communication | Material change identified and evidenced |
| PM manually determines affected parties | Ten affected disciplines mapped |
| Engineers search for current inputs | Authorized context delivered to each role |
| Progress coordinated through meetings and messages | Dependencies and handoffs tracked by the Harness |
| Release readiness is subjective | Evidence-backed readiness is visible |
| Likely ten-day delay | Eight days recovered |

### 5.8 Pilot Proposal screen

The demo finishes with an explicit decision: **Approve the pilot, select the project, and nominate the team.**

The proposal defines:

- one active project;
- one material-change workflow;
- selected project context sources;
- a defined set of engineering roles;
- Brain ingestion and permissions;
- Harness coordination;
- management Control Tower;
- human-controlled approvals;
- pilot sponsor and project manager;
- discipline representatives;
- baseline workflow and schedule data; and
- a weekly review cadence.

Pilot success is measured through detection-to-impact-assessment time, affected-discipline identification time, employee context completeness, action and dependency aging, PM coordination effort, stale-input rework, milestone-risk recovery, correction rate, and adoption.

## 6. System boundaries

### 6.1 Brain responsibilities

The Brain owns connected-source records, documents, versions, controlled claims, temporal supersession, permissions, retrieval, Context Receipts, conflicts, proposals, and decision evidence.

### 6.2 Harness responsibilities

The Harness owns objectives, workflow definitions, work items, dependencies, assignments, human gates, artifacts, handoffs, workflow receipts, and execution progress.

### 6.3 Control Tower responsibilities

The Control Tower is a read model over Brain and Harness state. It does not originate project truth or workflow state.

## 7. Backend design

### 7.1 Scenario manifest

The manifest is a typed, immutable definition. A loader validates it before the application or seed scripts can use it. Scenario-derived helpers provide values to UI fixtures, Brain seeds, deterministic chat responses, workflow initialization, and tests.

### 7.2 Harness persistence

Runtime state is stored separately from Brain truth. The MF demo receives tenant-, project-, and session-scoped persistence for:

- demo sessions;
- source-connection status;
- objectives;
- work items;
- work-item dependencies;
- human-gate decisions; and
- workflow receipts.

A repository interface isolates presentation components from the persistence implementation and keeps a later production Runtime migration possible.

### 7.3 Session isolation

Each presenter session has its own scenario state. Public viewers cannot mutate the presenter's state. Role switching occurs inside an authorized presenter session and requests a server-compiled view for the selected synthetic persona.

Mutation, chat, and learning endpoints receive session authorization, rate limits, and provider-usage ceilings. Administrative indexing remains separately protected.

### 7.4 Atomic transition engine

The client requests a transition with a session identifier, expected current state, target state, and idempotency key.

The server then:

1. validates the session, expected state, and requested transition;
2. updates Brain claims and Harness workflow state through one coordinated operation;
3. creates decision, workflow, and audit receipts exactly once;
4. calculates the resulting Control Tower state;
5. returns the complete authorized snapshot; and
6. advances the UI only after success.

Transitions are deterministic, idempotent, refresh-safe, and reversible. Moving backward reconstructs the correct earlier Brain and Harness state instead of changing only the client view.

### 7.5 Privilege-specific context compilation

Every employee workspace is built server-side from the actual principal, project membership, document authorization, controlled claims, assigned work, and applicable approval rules.

The API returns only authorized evidence and actions. Unauthorized information is not sent to the browser and hidden with CSS.

### 7.6 Live AI and deterministic fallback

Live Brain chat remains available in the Project Brain workspace. It uses authorized retrieval, the Context Compiler, citations, and receipts.

The quick presentation assistant remains deterministic and presentation-safe, but its answers derive from the scenario manifest. The UI distinguishes scripted guidance from live Brain analysis.

## 8. Error handling and demo operations

- The UI does not advance if the server transition fails.
- A failed transition shows a concise retry action without corrupting state.
- Repeated requests with the same idempotency key return the existing result.
- A presenter-only reset reconstructs the exact baseline.
- Refreshing the browser restores the session, role, scene, Brain state, and Harness state.
- A preflight operation verifies manifest validity, source availability, Brain indexing, scenario baseline, provider configuration, and route health before a meeting.
- If live AI is unavailable, the guided story remains fully functional and clearly uses deterministic responses.
- Receipts expose whether an action was live, deterministic, or demo-adapter-backed.

## 9. Security and authorization

- All MF records remain scoped to the MF organization and project.
- Presenter mutation requires a valid demo session.
- Role views use the existing Brain authorization layer.
- Harness work items have explicit role and project scope.
- Service-role access remains server-only.
- External source credentials are not required for the public demo.
- No endpoint accepts an arbitrary role identifier as sufficient authority.
- Rate limits protect chat, learning, transition, and thread creation.

## 10. Testing strategy

### 10.1 Manifest tests

- All referenced sources, roles, claims, tasks, dependencies, artifacts, and dates exist.
- The workflow graph is acyclic where required and every non-terminal task has a valid handoff.
- Schedule recovery and materiality values calculate to the approved narrative.
- No component owns an alternate copy of scenario numbers.

### 10.2 Authorization tests

- Each persona receives only permitted documents, claims, tasks, and actions.
- The PM receives the complete decision view.
- Discipline users cannot access unrelated commercial or discipline-private evidence.
- The browser payload contains no unauthorized records.

### 10.3 Transition tests

- Every forward and backward transition produces the expected Brain and Harness state.
- Refresh restores the current session exactly.
- Duplicate requests do not duplicate receipts or audits.
- Failed transitions leave both systems unchanged.
- Reset always returns to Rev B accepted, Rev C unresolved, and DEC-042 pending.

### 10.4 Story acceptance tests

- Every displayed number matches the scenario manifest and Brain.
- All ten affected disciplines have evidence, a reason, an owner, a task, and a deadline.
- Completing a role's work unblocks the correct dependency.
- Control Tower values are derived from workflow state.
- Every controlled decision and completed workflow produces a receipt.
- The guided path can be completed reliably within 12 minutes.
- Portuguese and English show equivalent facts and workflow state.
- The existing visual language remains intact at desktop and supported responsive sizes.

## 11. Implementation priority

### Phase 1: truth and reliability

1. Introduce the canonical manifest and remove duplicate scenario values.
2. Add presenter sessions and atomic, idempotent transitions.
3. Make refresh, rewind, and reset server-authoritative.
4. Protect mutation and provider-consuming endpoints.

### Phase 2: connected system and employee value

1. Add the source registry and honest connection modes.
2. Add the Controlled Change Record.
3. Persist Harness objectives, work items, dependencies, gates, and receipts.
4. Add server-compiled privilege-specific employee workspaces.
5. Derive the Control Tower from Brain and Harness state.

### Phase 3: commercial close and presentation hardening

1. Add the executive value bar and persistent story rail.
2. Add the outcome comparison and Pilot Proposal screen.
3. Add proof drawers and preflight validation.
4. Complete bilingual, responsive, accessibility, and timed-story acceptance.

## 12. Definition of done

The work is complete when a presenter can run the 12-minute Revision C story from a clean session, show genuine Brain evidence and authorization, switch among privilege-specific employee workflows, complete coordinated Harness work, observe derived Control Tower updates, prove every material transition with receipts, and finish with the one-project pilot proposal—without data contradictions, unauthorized disclosure, presentation-breaking external dependencies, or changes to the established MF visual identity.
