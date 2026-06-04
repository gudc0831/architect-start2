# Warm Studio Theme Contract

## Summary

- Internal `themeId`: `posthog`
- User-facing name: `Warm Studio`
- Scope: authenticated service routes only
- Preview rule: `/preview/*` remains pinned to `classic`
- Source: integrated from the former `D:\architect - posthog` worktree and normalized for multi-theme runtime use

## Brand Direction

Warm Studio keeps the PostHog-inspired mood but uses it as a service theme rather than a one-off override. The target feel is warm parchment canvas, olive text, darker workspace chrome, and diagnostic orange reserved for interaction and state emphasis.

The theme should read as an analytics workspace, not a marketing page. Decorative personality is allowed around chrome and framing, but dense task surfaces must optimize for scanning, editing, and keyboard use first.

## Visual Tokens

- Canvas: warm parchment backgrounds with soft sage surface separation
- Text: olive-leaning neutrals instead of pure black
- Accent: `#f54e00` for hover, selected, focus, warning, and active diagnostic cues
- Strong action surface: near-black `#1e1f23`
- Border system: sage-tinted borders rather than neutral gray
- Radius: restrained, mostly `6px`, with pill radius reserved for status and fact chips

## Typography Floors

| Role | Desktop Min | Mobile Min | Notes |
|---|---:|---:|---|
| Body / input / button | 16px | 15px | Never drop below this on dense task screens |
| Secondary label / helper | 13px | 13px | Prefer sentence case and clear contrast |
| Meta / badge / timestamp | 12px | 12px | Must stay readable inside pills and tables |
| Section title | 28px | 22px | Large headers stay in workspace intro only |
| Decorative display cap | 56px | 40px | Do not use inside board cards or task forms |

## Usability Overrides

- Preserve the warm editorial tone, but prioritize Korean readability and fast scanning when brand styling conflicts with usability.
- Use IBM Plex as the primary voice, but keep dense work surfaces calm and readable.
- Treat orange as a meaningful interaction color, not a passive decoration.
- Keep selection, drag, dirty, focus, and warning states legible through at least two signals.
- Preserve touch and pointer affordance with `44px` control height on primary controls.

## Interaction Rules

| State | Required Signal Stack |
|---|---|
| Hover | Accent or surface shift plus border or outline change |
| Selected | Surface fill plus stronger border |
| Focus-visible | Clear 2px focus ring with outer offset |
| Disabled | Reduced contrast and reduced saturation |
| Warning / error | Warm semantic tint plus stronger outline |
| Empty | Framed explanatory surface with a next action |

## Motion Policy

- Keep transitions short and functional, targeting `180ms` or less.
- Remove lift and animated polish under `prefers-reduced-motion`.
- Never rely on motion alone for selection, save, drag, or focus feedback.

## Structural Theme Branches

The following structural changes are theme-gated and must not alter the default path for the other three themes:

- `src/components/layout/project-shell.tsx`
  - Ambient frame and content frame wrappers exist for all themes, but only `posthog` styles activate them.
- `src/components/layout/sidebar.tsx`
  - `posthog` uses control-tower navigation treatment, section labels, status pills, and indexed nav links.
- `src/components/tasks/task-workspace.tsx`
  - `posthog` uses enhanced workspace header chrome, facts, mode pills, detail summary hierarchy, and trash action emphasis.
- `src/app/globals.css`
  - All PostHog-derived surface, typography, spacing, focus, motion, and state rules are scoped to `[data-theme="posthog"]`.

## Integration Guardrails

- Do not override `classic` to reproduce Warm Studio. All imported rules must stay inside `posthog` selectors or `themeId === "posthog"` branches.
- Keep `/api/preferences/theme` payload shape unchanged; only the allowed value set expands.
- Keep preview routing pinned to `classic`, including hidden selector behavior.
- Preserve the current branch auth model. Warm Studio is an authenticated workspace theme, not a login or preview theme.
- Do not couple Warm Studio to transitional password login. The existing Google OAuth-first login flow and the restricted password fallback remain unchanged.
- Keep unauthenticated and login-facing surfaces on the default `classic` path unless product requirements change explicitly.
- Future merges should verify these files first:
  - `src/app/globals.css`
  - `src/components/layout/project-shell.tsx`
  - `src/components/layout/sidebar.tsx`
  - `src/components/tasks/task-workspace.tsx`
  - `src/domains/preferences/types.ts`
  - `src/lib/ui-copy/catalog.ts`

## Current Branch Compatibility

Warm Studio is integrated on top of the current `codex/multi-user-transition` branch state and is intentionally isolated from the branch's existing auth work:

- Preview routes stay `classic` because `ThemeProvider` resets theme state on `/preview/*`.
- Login and unauthenticated flows stay on the default theme because theme persistence only loads after a user is present.
- The branch's restricted transitional password login route does not need UI changes for Warm Studio.
- Existing preview auth verification and redirect hardening remain valid because Warm Studio does not alter auth routes, auth config, or preview layout contracts.

## Verification Expectations

- Theme selector shows four modes in authenticated service routes.
- Preference save and reload keep `posthog` when auth-backed theme persistence is available.
- `classic`, `swiss-modern`, and `productivity` remain visually unchanged.
- `/preview/*` stays on `classic` regardless of saved preference.
