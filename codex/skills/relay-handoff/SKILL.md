---
name: relay-handoff
description: Create a precise continue-work handoff for the next agent or worker. Use when the user asks what files to read next, what is already done, where to resume, which blockers or coupled areas remain, or wants a short copy-ready prompt to hand work to someone else.
---

# Relay Handoff

Use this skill to turn the current repository state into a clean continuation brief plus a copy-ready handoff prompt.

## When To Use

- The user wants to continue the same task in another session, another agent, or another worker.
- The user asks which files the next worker should read first.
- The user asks what is done, what remains, and where to restart.
- The user asks for blockers, unresolved issues, or areas intentionally left untouched because they are coupled to other work.
- The user wants a short handoff prompt that can be pasted directly to the next worker.

## Workflow

1. Establish the active context.
   - Read `AGENTS.md` if present.
   - Read `PLAN.md` if present.
   - Read the most relevant docs under `docs/`.
   - Read the most recent relevant worklog(s) under `docs/worklogs/` if they exist.
   - Check `git status --short` and `git diff --stat`.

2. Inspect the actual implementation surface.
   - Read the files in the active diff, not just the docs.
   - Identify entry points, shared helpers, routes, tests, and config touched by the current work.
   - Separate task-specific changes from unrelated dirty worktree changes when possible.

3. Build the continuation brief.
   - Name the files the next worker should read first.
   - State what is already done.
   - State the next safe starting point.
   - Call out blockers, regressions, failed validation, or partial integrations.
   - Call out related areas that were intentionally not changed because they were too coupled, out of scope, or risky.

4. Produce the copy-ready handoff prompt.
   - Include repo path and branch if known.
   - Include the read order.
   - Include the exact current state, next target, and cautions.
   - Keep it short enough to paste directly into a new thread.

## Evidence Rules

- Ground every claim in files you actually read or commands you actually ran.
- If something is inferred, label it as an inference.
- If validation was not run, say so explicitly.
- Do not present a guessed next step as if it were confirmed.
- If the repo is dirty, note whether unrelated changes may exist.

## Output Contract

Default to two outputs:

1. `Continuation Brief`
   - `Read first`: 3-10 files or docs, ordered.
   - `Done`: what is already implemented or decided.
   - `Next`: the next safe slice to start from.
   - `Issues`: blockers, failed checks, partial integrations, or risky assumptions.
   - `Untouched but related`: coupled areas intentionally left alone.
   - `Verify`: checks that passed, failed, or were not run.

2. `Handoff Prompt`
   - A short paste-ready prompt for the next worker.
   - Include cwd/branch when known.
   - Include the required reading order.
   - Include the current completion point and next target.
   - Include warnings about dirty worktree, incomplete validation, or coupled untouched areas.

## Strong Defaults

- Prefer concise, operator-style wording over narrative explanation.
- Prefer file paths that match the actual continuation surface, not every touched file.
- Prefer start-here-next guidance over generic future ideas.
- If a worklog exists for the task, include it in the read-first list.
- If current docs and code diverge, say so plainly.

## Minimal Prompt Pattern

When the user only wants the short version, compress to:

- read first
- done
- next
- issues
- handoff prompt

## Example Trigger Requests

- "Which files should the next worker read first?"
- "Summarize what is done and where the next worker should resume."
- "Include blockers, partial integrations, and related areas you intentionally did not touch."
- "Create a short handoff prompt I can paste to the next worker."
