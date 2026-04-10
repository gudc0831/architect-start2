---
name: harness-engineering
description: Structured harness-style collaboration for coding and documentation tasks. Use when the user asks for harness-style execution, role-based collaboration, explicit coordination, stronger review, parallel work, or when the task is large enough that coordinator/worker/reviewer separation would reduce risk.
---

# Harness Engineering

Use this skill to run work with explicit coordinator, worker, and reviewer separation.

## Core Rules

- Keep one coordinator responsible for scope, assignment, integration, and final completion.
- Keep this skill as the default orchestrator for the task. Specialized passes and helper skills support coordinator judgment; they do not replace coordinator ownership.
- Treat `choi`, `hy`, `ung`, `ch`, and `ul` as operating labels, not guaranteed runtime entities.
- Split work by file or module ownership first.
- Use branch separation only when file or module ownership is not enough.
- Use delegated sub-agents only when the user explicitly asks for delegation or parallel work and the runtime allows it.
- Keep reviewers read-only unless implementation is explicitly assigned.
- For bugs, test failures, or unexpected behavior, investigate root cause before proposing or applying fixes.
- For non-trivial tasks, the coordinator should create or update a concise task log under `docs/worklogs/` unless the user specifies another location.

## Team Model

- `choi`: coordinator and final owner. Break down the task, assign ownership, integrate outputs, and own the final response.
- `hy`: primary worker. Implement assigned code or documentation changes and report verification.
- `ung`: primary worker. Implement assigned code or documentation changes and report verification.
- `ch`: conditional worker or reviewer. Act as an extra worker when workload is high; otherwise review design, UX, testing, and user-perspective issues.
- `ul`: read-only reviewer. Review code errors, rule compliance, security issues, dead code, and junk or unnecessary files.

## Review Passes

- For substantial work, the coordinator may run one or more review passes before implementation.
- `product pass`: check user value, scope, wedge, and which decisions actually matter.
- `engineering pass`: check architecture, dependencies, failure modes, and the verification path.
- `design pass`: for UI-heavy work, check hierarchy, states, responsive intent, and visual direction before implementation starts.
- Record each pass outcome as `proceed`, `revise`, or `needs user decision`.

## Planning Decision Gate

- Use this gate whenever the task includes plan writing, plan revision, or implementation planning.
- Compare the proposed plan against existing plans, planning sections, worklogs, handoff notes, and other active planning documents before locking direction.
- If you find a conflict with an existing plan, an unresolved option set, an expected bottleneck, or a point where user choice materially changes scope, sequencing, or risk, stop before implementation and ask the user to choose.
- Do not silently reconcile conflicting plans or pick a material option on the user's behalf.
- Present the decision request in this format:
  - `issue`: the conflict, option set, bottleneck, or missing decision.
  - `recommendation`: the recommended option and why it is preferred now.
  - `alt 1`: a distinct alternative and why someone might choose it.
  - `alt 2`: a distinct alternative and why someone might choose it.
  - `alt 3`: a distinct alternative and why someone might choose it.
- Add more alternatives when the real choice set is larger, but never present fewer than three alternatives beside the recommendation.

## Design Direction Expansion

- Use this mode for new UI surfaces, major redesigns, or first-impression-heavy pages.
- When practical, explore 2-3 materially different directions before converging on one.
- Each direction should differ in at least two of: composition, typography, density, color system, motion, imagery, or navigation model.
- Reject superficial variants that only change colors, spacing, or card counts.
- Record the approved direction and its constraints in the task log or design notes for substantial work.

## Design Review Heuristics

- Check hierarchy, states, responsive behavior, accessibility, copy intent, and visual distinctiveness.
- Avoid generic AI-SaaS defaults unless the user explicitly wants them.
- If the UI still feels template-derived, regenerate direction before polishing details.

## Debugging Gate

- For bugs, test failures, and unexpected behavior, do not jump to code changes before reproduction and evidence gathering.
- Gather evidence at system boundaries first: input, state transitions, network, persistence, rendering, and side effects.
- After two failed fix attempts, reassess architecture or assumptions before continuing.
- Prefer existing debugging skills when available, but keep this harness as the coordinator.

## Execution Flow

1. Classify the task.
   - Use a simple path for small, low-risk edits.
   - Use role separation when the task spans multiple files, includes user-facing impact, carries regression risk, or benefits from independent review.
   - Decide whether review passes, the planning decision gate, design direction expansion, or the debugging gate are needed.
2. Run review passes when warranted.
   - Use `product pass` when scope or product tradeoffs are unclear.
   - Use `engineering pass` when architecture, dependency, or verification risk is meaningful.
   - Use `design pass` for UI-heavy work before converging on a visual direction.
3. Resolve planning decision gates when present.
   - For planning or plan-document work, compare the proposed direction with existing plans and active planning notes before proceeding.
   - If conflicts, unresolved options, bottlenecks, or material user-choice points are found, present one recommendation plus at least three alternatives with reasons.
   - Wait for the user's decision before assigning implementation or starting decision-dependent work.
4. Assign ownership.
   - Give each worker a clear file or module boundary.
   - Avoid overlapping edits unless integration clearly requires them.
   - Do not overwrite another worker's changes without coordination.
5. Implement.
   - Preserve existing style and project conventions.
   - Keep diffs minimal and directly tied to the request.
   - For debugging tasks, follow the debugging gate before editing.
   - For new UI, document the selected direction before polishing.
   - Run practical verification for each changed area.
6. Review.
   - Use `ch` for design, UX, testing, and user-perspective feedback when applicable.
   - Use `ul` for correctness, rules, security, and repository hygiene review.
   - For design-heavy work, verify the chosen direction still feels materially distinct from generic defaults.
   - Surface concrete risks before closing the task.
7. Close.
   - Confirm requested deliverables exist.
   - Integrate or reconcile worker outputs.
   - Create or update the task log when the work is non-trivial.
   - Capture project-specific preferences, pitfalls, and reusable decisions after non-trivial work.
   - State what changed, what was verified, and what remains unverified.

## Skill Guidance

- Prefer repo-local or already installed skills before looking for new ones.
- Use `find-skills` only when a required capability is missing or the user asks for broader workflow support.
- Treat skill suggestions as optional recommendations, not mandatory workflow changes.
- Use specialized passes and helper skills as branches inside this harness, not as competing authorities.
- Prefer established project skills for browser verification, data protection, debugging, and other repeated workflows before introducing new defaults.

## Escalation Format

- When blocked or when a user decision is required, report:
- `blocked`: what is preventing progress right now.
- `attempted`: what was checked or tried already.
- `needs context`: the missing fact, preference, or permission.
- `recommendation`: the next best action once the missing piece is resolved.

## Output Expectations

Report:
- assigned ownership
- review passes run, if any
- planning decision requests raised and user choices made, if any
- selected design direction, if any
- changed files or artifacts
- verification performed
- project learnings captured, if any
- open risks or unverified areas
- task log path, if a log was created
