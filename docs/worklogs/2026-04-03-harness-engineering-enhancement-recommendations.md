# 2026-04-03 Harness Engineering Enhancement Recommendations

## User request

- Based on the earlier comparison, identify what content would be worth adding to the existing `harness-engineering` skill.
- Evaluate whether design-direction diversity ideas from `gstack` should be incorporated.

## Sources checked

- `C:\Users\hcchoi\.codex\skills\harness-engineering\SKILL.md`
- `https://raw.githubusercontent.com/garrytan/gstack/refs/heads/main/README.md`
- `https://raw.githubusercontent.com/garrytan/gstack/refs/heads/main/office-hours/SKILL.md`
- `https://raw.githubusercontent.com/garrytan/gstack/refs/heads/main/plan-ceo-review/SKILL.md`
- `https://raw.githubusercontent.com/garrytan/gstack/refs/heads/main/plan-eng-review/SKILL.md`
- `https://raw.githubusercontent.com/garrytan/gstack/refs/heads/main/plan-design-review/SKILL.md`
- `https://raw.githubusercontent.com/garrytan/gstack/refs/heads/main/design-consultation/SKILL.md`
- `https://raw.githubusercontent.com/garrytan/gstack/refs/heads/main/design-review/SKILL.md`
- `https://raw.githubusercontent.com/obra/superpowers/refs/heads/main/skills/using-superpowers/SKILL.md`
- `https://raw.githubusercontent.com/obra/superpowers/refs/heads/main/skills/systematic-debugging/SKILL.md`
- `https://raw.githubusercontent.com/obra/superpowers/refs/heads/main/skills/subagent-driven-development/SKILL.md`

## Recommendation summary

- Add `decision gates`, `review passes`, `design diversity mode`, and `learning capture` to `harness-engineering`.
- Do not import `superpowers`-style mandatory skill-first rules or default subagent dispatch into `harness-engineering`.
- Treat design diversity as an explicit mode for UI-heavy work, not a global default for all tasks.

## High-value additions

- A planning triage section:
  - product framing pass
  - engineering plan pass
  - design plan pass for UI work
- A design-direction exploration mode:
  - require 2-3 materially different directions before converging on one for substantial new UI
  - force rationale for what differs and why
  - reject generic SaaS defaults explicitly
- A structured design review checklist:
  - hierarchy
  - states
  - responsive intent
  - accessibility
  - AI-slop blacklist
- A learning-capture section:
  - record project-specific preferences, pitfalls, and operational quirks after non-trivial work
- An escalation format:
  - blocked
  - needs context
  - attempted
  - recommendation

## Boundaries to keep

- `harness-engineering` should remain the only default orchestrator.
- Specialized passes should be optional branches inside the harness, not separate competing authorities.
- Subagents should remain opt-in or workload-driven, consistent with the current skill and repo policy.

## Verification

- Read the local `harness-engineering` skill.
- Read the referenced `gstack` and `superpowers` skill documents relevant to planning, design, and orchestration.

## Remaining risks

- No patch was applied to `harness-engineering`; this log records recommendations only.
- Some `gstack` behaviors assume external binaries and artifact storage conventions that should not be copied directly into this repo without adaptation.
