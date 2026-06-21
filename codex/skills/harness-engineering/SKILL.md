---
name: harness-engineering
description: Structured harness-style collaboration for coding and documentation tasks. Use when the user asks for harness-style execution, role-based collaboration, explicit coordination, stronger review, parallel work, or when the task is large enough that coordinator/worker/reviewer separation would reduce risk.
---

# Harness Engineering

Use this skill to run work with explicit coordinator, worker, and reviewer separation.

## Operating Modes

- `Light`: Use for small, low-risk, reversible work. Keep one coordinator, skip formal role reports, and close with changed files plus verification.
- `Standard`: Use for multi-step work, multiple files, user-facing behavior, documentation deliverables, or meaningful regression risk. Assign role labels, run relevant review passes, verify changed areas, and create a worklog when the work is non-trivial.
- `Strict`: Use for releases, branch integration, deployment verification, authentication/data/security work, plan conflicts, major UI changes, failed prior attempts, or explicit user requests for harness-style rigor. Use explicit decision gates, stronger evidence, failure learning, and final risk reporting.
- Default to the lightest mode that still protects the user from likely mistakes. Escalate mode when evidence shows more risk than initially expected.

## Core Rules

- Keep one coordinator responsible for scope, assignment, integration, and final completion.
- Keep this skill as the default orchestrator for the task. Specialized passes and helper skills support coordinator judgment; they do not replace coordinator ownership.
- Treat `choi`, `hy`, `ung`, `ch`, and `ul` as operating labels, not guaranteed runtime entities.
- Split work by file or module ownership first.
- Use branch separation only when file or module ownership is not enough.
- Use delegated sub-agents only when the user explicitly asks for delegation or parallel work and the runtime allows it.
- Keep reviewers read-only unless implementation is explicitly assigned.
- State material assumptions before acting. If multiple interpretations materially change scope, sequence, or risk, surface the choice instead of silently picking one.
- Prefer the simplest implementation that satisfies the request and can be verified. Do not add speculative flexibility, one-off abstractions, or unrequested features.
- Make surgical changes. Every changed line should trace to the user request, verification need, or cleanup caused by this task.
- For bugs, test failures, or unexpected behavior, investigate root cause before proposing or applying fixes.
- For non-trivial tasks, the coordinator should create or update a concise task log under `docs/worklogs/` unless the user specifies another location.

## Approval Policy

Use this policy to decide when the coordinator may proceed and when the user must approve.

### Standing Approval

Unless the user explicitly blocks it, proceed with:

- Read-only investigation, `rg`, `git status`, `git diff`, and log inspection.
- Local tests, lint, builds, validators, and structure checks.
- Small file edits inside the requested scope.
- `docs/worklogs/` entries for non-trivial work.
- Read-only Vercel, Git, and GitHub checks needed to confirm exact URLs, branches, commits, deployment aliases, or SHAs.

### Explicit Request Counts As Approval

If the user explicitly asks to push, deploy, repair an alias, merge to `main`, or publish a branch, treat that as approval to complete that action end to end.

Still perform the safety checks first:

- Validate before push when a repo validation gate exists or a practical validation command is available.
- Check branch divergence before merge or push.
- Confirm the deployment or alias target URL before changing it.
- Report exact SHA, URL, alias, or deployment evidence after completion.

### Ask Before Action

If the user has not explicitly requested the action, ask before:

- `git push`, merge to `main`, tag creation, or release creation.
- Vercel deploy, alias changes, deployment protection changes, or auth setting changes.
- DB migrations or production/staging data changes.
- Dependency install/upgrade or global CLI install.
- `.env`, secret, token, or auth profile changes.
- `AGENTS.md`, global skill, or repo operating rule changes.
- Long-running or potentially billable work.

### Never Without Fresh Explicit Approval

Always ask for fresh explicit approval before:

- `git reset --hard`, force push, or branch deletion.
- Recursive delete or recursive move.
- Production DB writes or deletes.
- Printing secret values.
- Loosening PowerShell execution policy.
- Permission, authentication, or security policy changes.

### AGENTS.md Exception

Update `AGENTS.md` or the repo's equivalent operating instructions only when an important failure actually occurred, the cause/fix/evidence are recorded in the worklog, and the prevention rule is durable, project-wide, and likely to prevent repeated mistakes. Otherwise keep the lesson in the worklog only.

### Korean Approval Request Format

When approval is required, write the request in Korean using this format:

```text
승인 필요:
- 작업:
- 대상:
- 지금 필요한 이유:
- 위험:
- 되돌리기:
- 검증:
```

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
- Add more alternatives when the real choice set is larger. If fewer than three material alternatives exist, present the real choices and explicitly say why inventing extra options would be misleading.

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

## Evidence Contract

- Define success criteria for non-trivial work before closing: what must exist, what command or UI path proves it, and what state must be observed.
- When the user asks for exactness, report exact paths, URLs, branches, commits, deployment aliases, route names, command names, and timestamps when available.
- For preview or deployment verification, sign off only on the requested URL or explicitly state that a different target was checked.
- For branch or push work, verify local and remote refs when practical and report the exact SHA relationship.
- For code changes, run the narrowest meaningful verification first, then broader validation when the blast radius is larger.

## Failure Learning Loop

- Treat a failure as important when it caused a wrong conclusion, wasted iteration, broken verification, deployment confusion, data/auth/security risk, branch mistake, repeated tool error, or a user-visible regression.
- When an important failure happens, record in the task log:
  - `failure`: the symptom and where it appeared.
  - `cause`: the root cause or best-supported diagnosis.
  - `fix`: the action that resolved it.
  - `evidence`: the command, URL, log, diff, or observation proving the fix.
  - `prevention`: the reusable rule or check that would have avoided it.
- Update `AGENTS.md` or the repo's equivalent operating instructions only when the prevention is durable, project-wide, and likely to prevent repeated mistakes. Keep the new rule short, actionable, and evidence-backed in the worklog.
- Keep one-off, task-specific, or uncertain lessons in the worklog only. Do not inflate `AGENTS.md` with transient failures, speculative theories, or rules that only applied once.
- If the reusable lesson belongs in personal memory or a global skill, ask or wait for an explicit user request before writing memory; otherwise capture it in local project artifacts.
- Never record secret values in worklogs or instructions. Record only secret names, presence, status, or redacted evidence.

## Execution Flow

1. Classify the task.
   - Select `Light`, `Standard`, or `Strict`.
   - Use a simple path for small, low-risk edits.
   - Use role separation when the task spans multiple files, includes user-facing impact, carries regression risk, or benefits from independent review.
   - Decide whether review passes, the planning decision gate, design direction expansion, or the debugging gate are needed.
2. Define success criteria.
   - Convert the request into verifiable outcomes.
   - For multi-step tasks, pair each major step with a verification check.
3. Run review passes when warranted.
   - Use `product pass` when scope or product tradeoffs are unclear.
   - Use `engineering pass` when architecture, dependency, or verification risk is meaningful.
   - Use `design pass` for UI-heavy work before converging on a visual direction.
4. Resolve planning decision gates when present.
   - For planning or plan-document work, compare the proposed direction with existing plans and active planning notes before proceeding.
   - If conflicts, unresolved options, bottlenecks, or material user-choice points are found, present the recommendation and real alternatives with reasons.
   - Wait for the user's decision before assigning implementation or starting decision-dependent work.
5. Assign ownership.
   - Give each worker a clear file or module boundary.
   - Avoid overlapping edits unless integration clearly requires them.
   - Do not overwrite another worker's changes without coordination.
6. Implement.
   - Preserve existing style and project conventions.
   - Keep diffs minimal and directly tied to the request.
   - For debugging tasks, follow the debugging gate before editing.
   - For new UI, document the selected direction before polishing.
   - Run practical verification for each changed area.
7. Review.
   - Use `ch` for design, UX, testing, and user-perspective feedback when applicable.
   - Use `ul` for correctness, rules, security, and repository hygiene review.
   - For design-heavy work, verify the chosen direction still feels materially distinct from generic defaults.
   - Surface concrete risks before closing the task.
8. Capture failures and lessons when applicable.
   - If an important failure happened, add the failure learning fields to the worklog.
   - If the prevention is durable and project-wide, update `AGENTS.md` or the repo equivalent with a compact rule and keep the evidence in the worklog.
9. Close.
   - Confirm requested deliverables exist.
   - Integrate or reconcile worker outputs.
   - Create or update the task log when the work is non-trivial.
   - Capture project-specific preferences, pitfalls, and reusable decisions after non-trivial work.
   - State what changed, what was verified, and what remains unverified.

## Superpowers Boundary

- Keep `harness-engineering` as the coordinator and final authority for scope, approval, integration, verification, and close-out.
- Use Superpowers skills as helper workflows inside the selected harness mode when they directly improve the task.
- Do not let Superpowers' mandatory-skill style make `Light` tasks unnecessarily heavy.
- Use `superpowers:systematic-debugging` when root-cause discipline is needed for bugs, test failures, or unexpected behavior.
- Use `superpowers:writing-plans`, `superpowers:executing-plans`, or `superpowers:subagent-driven-development` when the task is explicitly plan-driven or has independent implementation tasks.
- Keep plan artifacts under `docs/superpowers/plans/` when using Superpowers planning workflows, and keep execution logs under `docs/worklogs/`.
- Superpowers may increase rigor, but it must not override the user's explicit request, the harness approval policy, or the coordinator's final responsibility.

## Skill Guidance

- Prefer repo-local or already installed skills before looking for new ones.
- Use `find-skills` only when a required capability is missing or the user asks for broader workflow support.
- Treat skill suggestions as optional recommendations, not mandatory workflow changes.
- Use specialized passes and helper skills as branches inside this harness, not as competing authorities.
- Prefer established project skills for browser verification, data protection, debugging, and other repeated workflows before introducing new defaults.

## Escalation Format

- When blocked, after repeated failure, or when a user decision is required, report:
- `blocked`: what is preventing progress right now.
- `attempted`: what was checked or tried already.
- `needs context`: the missing fact, preference, or permission.
- `recommendation`: the next best action once the missing piece is resolved.

## Output Expectations

Report only the fields that matter for the selected mode and the user's request.

- `Light`: changed files or answer, verification performed, and anything not verified.
- `Standard`: ownership summary, changed files or artifacts, verification, worklog path when created, and open risks.
- `Strict`: assigned ownership, review passes, decision gates and user choices, selected design direction if any, changed files or artifacts, verification evidence, failure learning captured, `AGENTS.md` or worklog updates, open risks, and task log path.
