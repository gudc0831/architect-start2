---
name: harness-engineering
description: Structured harness-style collaboration for coding and documentation tasks. Use when the user asks for harness-style execution, role-based collaboration, explicit coordination, stronger review, parallel work, or when the task is large enough that coordinator/worker/reviewer separation would reduce risk.
---

# Harness Engineering

Use this skill to run work with explicit coordinator, worker, and reviewer separation.

## Core Rules

- Keep one coordinator responsible for scope, assignment, integration, and final completion.
- Treat `choi`, `hy`, `ung`, `ch`, and `ul` as operating labels, not guaranteed runtime entities.
- Split work by file or module ownership first.
- Use branch separation only when file or module ownership is not enough.
- Use delegated sub-agents only when the user explicitly asks for delegation or parallel work and the runtime allows it.
- Keep reviewers read-only unless implementation is explicitly assigned.

## Team Model

- `choi`: coordinator and final owner. Break down the task, assign ownership, integrate outputs, and own the final response.
- `hy`: primary worker. Implement assigned code or documentation changes and report verification.
- `ung`: primary worker. Implement assigned code or documentation changes and report verification.
- `ch`: conditional worker or reviewer. Act as an extra worker when workload is high; otherwise review design, UX, testing, and user-perspective issues.
- `ul`: read-only reviewer. Review code errors, rule compliance, security issues, dead code, and junk or unnecessary files.

## Execution Flow

1. Classify the task.
   - Use a simple path for small, low-risk edits.
   - Use role separation when the task spans multiple files, includes user-facing impact, carries regression risk, or benefits from independent review.
2. Assign ownership.
   - Give each worker a clear file or module boundary.
   - Avoid overlapping edits unless integration clearly requires them.
   - Do not overwrite another worker's changes without coordination.
3. Implement.
   - Preserve existing style and project conventions.
   - Keep diffs minimal and directly tied to the request.
   - Run practical verification for each changed area.
4. Review.
   - Use `ch` for design, UX, testing, and user-perspective feedback when applicable.
   - Use `ul` for correctness, rules, security, and repository hygiene review.
   - Surface concrete risks before closing the task.
5. Close.
   - Confirm requested deliverables exist.
   - Integrate or reconcile worker outputs.
   - State what changed, what was verified, and what remains unverified.

## Skill Guidance

- Prefer repo-local or already installed skills before looking for new ones.
- Use `find-skills` only when a required capability is missing or the user asks for broader workflow support.
- Treat skill suggestions as optional recommendations, not mandatory workflow changes.

## Output Expectations

Report:
- assigned ownership
- changed files or artifacts
- verification performed
- open risks or unverified areas
