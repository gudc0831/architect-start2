# 2026-06-05 Harness Engineering Operating Modes

Req: Update `harness-engineering` to reduce small-task overhead, add failure-learning capture, and compare it with current Karpathy-style GitHub guidance.

Diff: Updated global and repo-local `harness-engineering` skill with `Light / Standard / Strict` modes, Karpathy-style assumptions/simplicity/surgical-change rules, an evidence contract, and a failure learning loop. Updated both `openai.yaml` default prompts and added a compact `AGENTS.md` failure-learning rule.

Follow-up approval policy: Added standing approval, explicit-request-as-approval, ask-before-action, and never-without-fresh-approval boundaries to global and repo-local `harness-engineering`. Added the same practical boundary to `AGENTS.md`, and updated both `openai.yaml` prompts so the approval policy is part of the default harness invocation. Approval requests must be written in Korean using `승인 필요`, `작업`, `대상`, `지금 필요한 이유`, `위험`, `되돌리기`, and `검증`.

Follow-up Superpowers boundary: Added a routing boundary so `harness-engineering` remains final owner for scope, approval, integration, verification, and close-out while Superpowers skills can still be used as helper workflows. The boundary preserves Superpowers debugging, planning, and subagent strengths without letting mandatory-skill behavior make `Light` harness tasks unnecessarily heavy.

Why: The previous skill had strong coordination rules but applied too much reporting pressure to small tasks, lacked exact evidence standards, and did not define when failures should become reusable project rules versus task-local worklog notes.

External comparison:

- `karpathy/autoresearch`: official Karpathy repo checked via GitHub/API and README. Relevant difference: it is an autonomous experiment loop with one editable file, fixed 5-minute runs, one metric, keep/discard iteration, and `program.md` as a lightweight agent skill.
- `multica-ai/andrej-karpathy-skills`: community repo derived from Karpathy's LLM coding-pitfall observations. Relevant overlap: assumptions, simplicity, surgical changes, and goal-driven verification. Those principles were folded into this skill, but this skill remains a coordinator/reviewer/worklog harness rather than a single-rule CLAUDE.md pack.

Failure learning:

- failure: Initial Python validation using `import yaml` failed with `ModuleNotFoundError: No module named 'yaml'`.
- cause: The available validation runtime did not include PyYAML, so the validation dependency was missing even though the skill files themselves were readable.
- fix: Switched to dependency-free frontmatter, required-section, and agent YAML text checks; added an `AGENTS.md` rule for this Windows local-skill validation limitation.
- evidence: Dependency-free Python structure check and Node section check both passed for global and repo-local `harness-engineering` files.
- prevention: Do not treat missing `yaml` or encoding trouble as a skill failure by itself; use bundled runtime with `PYTHONUTF8=1` when available or a dependency-free validator, then record the limitation.

Verify/Time: global and repo-local `SKILL.md` hashes match; global and repo-local `openai.yaml` hashes match; dependency-free Python structure check passed after approval-policy and Superpowers-boundary updates; Node section check passed; `npm run codex:skills:list` shows `harness-engineering`; `git diff --check` passed with CRLF warnings only; approval policy sections present in both skill copies and `AGENTS.md`; Superpowers boundary present in both skill copies; Karpathy comparison checked against current GitHub sources in-session | 2026-06-05 KST
