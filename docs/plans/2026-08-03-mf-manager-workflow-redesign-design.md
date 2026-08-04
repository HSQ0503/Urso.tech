# MF Manager and Agent Workflow Redesign

Date: 2026-08-03  
Status: Approved  
Route scope: `/mf` only

## Decision

Use the approved hybrid direction:

1. The decision-first manager cockpit is the default **Project Today / My Day** experience.
2. The team command center is the secondary **My Team / Team Work** experience.
3. Agent workflows use a left-to-right **connected systems → Brain → agents and tools → human gate → controlled outputs** flow.

The existing MF visual identity remains: high-contrast black and warm white, compact industrial typography, cyan as the Urso intelligence accent, restrained status color, and thin technical borders. The redesign simplifies hierarchy rather than changing the brand.

## Goals

- Let a Project Manager understand the current situation, required decision, and downstream consequence in under five seconds.
- Replace duplicated KPI, story, objective, and task card walls with one primary visual per scene.
- Make manager decisions and personal to-dos concrete, time-bound, and evidence-backed.
- Show how Brain connects to real project systems and enforces role-specific context boundaries.
- Show what each specialized agent does, which tool it can use, and whether that permission is read, query, draft, or write.
- Keep human approval visibly mandatory for material truth changes and official issuance.
- Make the 15-minute pilot story easier to present without removing the deterministic demo controls.

## Non-goals

- Rebranding the MF demo.
- Replacing the existing canonical scenario manifest or deterministic Harness runtime.
- Adding real third-party credentials or production integrations.
- Removing the existing role switcher, audit trail, Brain workspace, or presentation controls.
- Implying that agents automatically issue engineering work.

## Information Architecture

The persistent shell keeps the project identity, role switcher, primary navigation, language control, and demo controls. Inside the main canvas:

- A compact project pulse replaces the six-stat KPI wall and separate story rail.
- Each view starts with one short situation statement and one state badge.
- Supporting facts appear only where they explain a decision or action.
- Detailed evidence remains available through existing drawers, artifact views, and Brain navigation.

Primary navigation labels remain familiar but the content hierarchy changes:

- **Project Today:** decision-first manager cockpit.
- **Change & Approval:** controlled change evidence and approval.
- **Project Brain:** connected truth, sources, and role-aware context.
- **My Team:** team command center and handoff chain.
- **Work with Urso:** workflow catalog and system-to-outcome workflow canvas.
- **Decisions & History:** receipts and audit evidence.

## Project Today: Decision-first Manager Cockpit

The manager landing page contains four layers, in this order:

### 1. Manager briefing

A single headline describes the state of the project, for example:

> Revision C needs one decision.

The supporting sentence explains what Urso has already done and what remains under human control.

### 2. Three-value pulse

Only three values remain visible:

- decisions requiring the manager;
- teams or disciplines affected;
- milestone exposure or recovery opportunity.

Values change with the deterministic scenario step.

### 3. Primary decision

The first actionable decision is shown with:

- decision identifier and due state;
- clear decision verb;
- why the manager is responsible;
- four material deltas from Revision B to Revision C;
- downstream consequence of approving or waiting;
- evidence-review and approval actions.

At later steps, the primary decision advances from controlled truth to recovery scenario and finally release readiness.

### 4. Manager queue and downstream sequence

Manager-owned work is grouped into:

- **Now:** ready and requiring the manager;
- **Next:** unlocked by the current decision;
- **Waiting on team:** blocked by discipline handoffs;
- **Done:** completed decisions and releases.

Each item includes state, owner, timing, dependency, and the reason it matters. A short four-step strip explains what the current decision unlocks next.

## My Team: Team Command Center

The team command view is the secondary operational layer. It shows impacted teams only rather than all 15 disciplines at equal weight.

The view contains:

- one row per affected role or discipline;
- the role objective and current work;
- accountable person or role;
- state: needs manager, ready, in progress, waiting, at risk, or complete;
- a manager decision rail for current and upcoming decisions;
- a critical handoff chain from controlled truth to EXE-02.

The existing full 15-discipline map remains available as supporting detail, not the first visual.

## Agent Workflow Canvas

The selected workflow reads left to right in five numbered stages.

### 1. Connected context

Technology nodes use recognizable product badges and explicit connection modes:

- Slack — supplier communication;
- Common Data Environment — controlled documents;
- Autodesk Revit — BIM models;
- Primavera P6 — schedule;
- Microsoft Teams — coordination;
- Urso identity and policy services where applicable.

Each node indicates `live`, `demo adapter`, or `pilot integration`. This prevents simulated connectors from being mistaken for production integrations.

### 2. Brain boundary

The Brain node shows:

- current controlled truth;
- proposed evidence versus accepted truth;
- role and privilege scope;
- affected dependency traversal;
- policy that prevents material truth changes without a human gate.

### 3. Specialized agents and tools

Each agent is paired directly with its permitted tool and action level. For the project-change workflow:

- Change Agent → document comparison → read;
- Dependency Agent → Brain graph → query;
- Planning Agent → planning sandbox → draft.

Other workflow selections swap the agents, tools, sources, and outcome while retaining the same visual contract.

### 4. Human gate

The accountable MF role, required decision, evidence count, and affected-team count are shown in one prominent gate. The workflow cannot visually advance to official issuance without the human decision.

### 5. Controlled outputs

Outputs are concrete and verifiable:

- decision receipt;
- impact plan;
- role-specific briefs;
- technical drafts or checklists.

A receipt rail explains that every source read, context delivery, agent/tool action, human decision, and output returns to the Brain audit trail.

## Role-specific Delivery

Below the workflow, the selected scenario shows what each employee receives after the gate:

- role objective;
- next action;
- authorized context sources;
- deliverable;
- action count and source count.

The data comes from the canonical manifest and `getMfRoleWorkspace`, preserving server-authoritative privileges rather than duplicating role logic in presentation components.

## Story and Demo Progression

The deterministic nine-step scenario remains intact. Visual state changes follow the existing snapshot:

- Step 0: stable baseline and monitored systems.
- Step 1: supplier signal detected.
- Step 2: material deltas found; Rev. B remains current.
- Step 3: manager approves Rev. C.
- Step 4: impact plan and affected teams become visible.
- Step 5: role-specific work is distributed.
- Step 6: agent outputs await technical review.
- Step 7: technical reviews complete; release decision remains.
- Step 8: EXE-02 is ready with receipts and recovered schedule.

The presentation controls, URL session protection, and deterministic transitions remain unchanged.

## Responsive and Accessibility Behavior

- Desktop uses the full left-to-right workflow and manager split layout.
- Narrow desktop/tablet collapses secondary manager detail below the primary decision.
- Mobile converts the workflow into a numbered vertical sequence without changing semantics.
- Status is communicated through label and icon as well as color.
- Buttons retain explicit accessible names and visible focus styles.
- Tiny six-to-eight-pixel workflow copy is removed; primary workflow labels target normal readable UI sizes.

## Backend and Data Changes

- Extend the canonical workflow definitions with system badge identity, connection mode, agent/tool permission, and explicit output metadata.
- Add pure runtime selectors for manager decisions, queue groups, and handoff state.
- Keep selectors deterministic and derived from `MfHarnessSnapshot`.
- Do not add client-owned workflow state beyond view selection.
- Keep all approval and step mutation server-authoritative.

## Acceptance Criteria

- The Project Manager sees a specific decision and personal queue at every scenario step.
- The manager queue accurately reflects task dependencies and human gates.
- The team command view distinguishes manager-owned decisions from delegated discipline work.
- The workflow shows technology sources, connection modes, Brain policy scope, agents, tools, permission levels, human gate, outputs, and receipt.
- Every role receives only sources authorized by the canonical manifest.
- Existing scenario, isolation, Brain authorization, and acceptance tests still pass.
- New unit tests cover manager queue derivation and workflow presentation metadata.
- Desktop and mobile screenshots confirm no overlaps, clipped controls, unreadably small labels, or duplicate dominant status layers.

