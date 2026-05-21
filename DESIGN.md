---
version: alpha
name: Architect Apple Workbench Theme
status: design-approved-for-planning
source: normalized from `npx getdesign@latest add apple`
theme:
  internalId: apple-workbench
  userFacingName: apple
  mode: additive-theme
  accent: "#0066cc"
  density: preserve-current-workflow-density
---

# Architect Apple Workbench Theme

## Summary

Apple Workbench is a new additive SaaS theme for authenticated Architect service routes.

It takes the useful parts of the Apple design reference: quiet chrome, white and pearl surfaces, precise hairlines, strong typography, full-pill primary actions, and a single blue interaction color. It rejects the parts that do not fit this product: product-gallery heroes, marketing-page spacing, photography-led tiles, decorative layout drama, and large whitespace that would slow down spreadsheet-like work.

## Decisions

- Add a new theme option instead of modifying `classic`, `swiss-modern`, `productivity`, or `posthog`.
- Preserve current `/daily` and task-grid density.
- Use Apple Blue as the only primary accent.
- Keep `/preview/*` pinned to `classic`.
- Keep auth, persistence, database, API route, and deployment behavior unchanged except for expanding the allowed theme id set.

## Theme Identity

- Internal theme id: `apple-workbench`
- User-facing label: `apple`
- Description: `A precise blue-and-pearl workspace theme with Apple-inspired restraint.`
- CSS selector: `[data-theme="apple-workbench"]`
- Scope: authenticated service routes only
- Default theme: unchanged, remains `classic`

The user-facing label is intentionally temporary and should be revisited before production copy freeze. The design source remains Apple-inspired, but the SaaS theme should ultimately read as Architect's own workbench theme.

## Design Intent

This theme should feel like a quiet professional operating system for architectural coordination: clear, fast, precise, and low-noise.

The visual memory should be:

- Pearl canvas instead of warm parchment.
- Blue action and focus signals.
- Hairline separators instead of heavy borders.
- Minimal shadows and no floating-card drama.
- Dense tables and sidebars that still feel polished.

The theme must not become a landing page aesthetic. `/daily`, sidebars, panels, forms, dialogs, task rows, and admin surfaces are repeated-use tools, so scanning speed wins over presentation.

## Token Direction

### Color

| Role | Token Value | Use |
|---|---:|---|
| Action Blue | `#0066cc` | Primary actions, links, selected state, active nav, focus cues |
| Focus Blue | `#0071e3` | Focus-visible rings and selected borders |
| Dark-surface Blue | `#2997ff` | Links and focus cues on dark chrome only |
| Ink | `#1d1d1f` | Primary text |
| Muted Ink | `#6e6e73` | Secondary text, metadata |
| Soft Muted Ink | `#86868b` | Placeholder and subdued labels |
| Canvas | `#ffffff` | Primary panels and fields |
| Pearl Canvas | `#f5f5f7` | Page background and low-priority surfaces |
| Pearl Surface | `#fafafc` | Slightly raised panels without shadow |
| Hairline | `#d2d2d7` | Borders and separators |
| Soft Hairline | `#e8e8ed` | Internal grid lines |
| Dark Chrome | `#1d1d1f` | Rare strong chrome, badges, destructive contrast backup |

### CSS Variable Mapping

Implementation should add a new token block in `src/app/globals.css`:

```css
[data-theme="apple-workbench"] {
  --theme-page-bg: #f5f5f7;
  --theme-page-bg-accent: #ffffff;
  --theme-surface-panel: rgba(255, 255, 255, 0.96);
  --theme-surface-panel-strong: #ffffff;
  --theme-surface-sidebar: rgba(250, 250, 252, 0.94);
  --theme-surface-sidebar-mobile: rgba(250, 250, 252, 0.98);
  --theme-surface-soft: #f5f5f7;
  --theme-surface-soft-strong: #fafafc;
  --theme-surface-field: #ffffff;
  --theme-border-default: #d2d2d7;
  --theme-border-strong: #a1a1a6;
  --theme-border-subtle: rgba(210, 210, 215, 0.72);
  --theme-text-primary: #1d1d1f;
  --theme-text-muted: #6e6e73;
  --theme-text-placeholder: #86868b;
  --theme-text-accent: #0066cc;
  --theme-accent: #0066cc;
  --theme-accent-soft: rgba(0, 102, 204, 0.1);
  --theme-accent-border: rgba(0, 102, 204, 0.42);
  --theme-accent-border-strong: rgba(0, 102, 204, 0.72);
  --theme-accent-focus-ring: rgba(0, 113, 227, 0.2);
  --theme-accent-solid-hover: #0071e3;
  --theme-shadow: none;
  --theme-shadow-soft: none;
  --theme-radius: 14px;
}
```

The implementation can adjust exact variable names to match the existing token inventory, but it should preserve this relationship: white/pearl surfaces, ink text, blue accent, hairline borders, minimal shadow.

### Typography

Use the existing system stack unless the app already has a reliable font-loading path for SF Pro. Do not add external font dependencies for this theme.

| Role | Guidance |
|---|---|
| Body, input, button | Keep current readable sizing; do not drop below current dense-screen floors |
| Dense grid text | Preserve row height and column density |
| Panel headings | Use 600 weight, tighter but not negative letter spacing |
| Metadata | Muted ink, never low-contrast gray |
| Korean UI copy | Prioritize readability over Apple-style tight tracking |

Do not introduce negative letter spacing globally. The generated Apple reference uses tight display tracking, but this SaaS contains dense Korean and mixed technical labels.

### Radius

| Role | Value |
|---|---:|
| Grid rows, input fields, utility controls | `8px` to `12px` |
| Panels and side surfaces | `14px` |
| Primary action pills and status chips | `9999px` |
| Nested cards | Avoid nested-card treatment; use hairlines and section spacing instead |

### Elevation

Prefer surface separation and hairlines over shadows.

- Default panels: no box shadow.
- Sticky or overlay surfaces: subtle backdrop/frosted treatment if already supported.
- Dialogs and popovers: may keep existing app shadow if removing it hurts hierarchy.
- Task rows and cards: no heavy floating shadows.

## Component Rules

### Project Shell

The shell should feel like a precise light operating system:

- Pearl page background.
- White content panels.
- Hairline frame around major work areas.
- No hero-like gradients, decorative orbs, or product-tile rhythm.
- Keep content width and current route layout unchanged.

### Sidebar

The sidebar should become quieter, not larger:

- Pearl/white sidebar surface.
- Active route uses blue text plus blue soft background or left hairline.
- Section labels remain compact.
- Theme selector remains in the sidebar and lists the new option.
- Do not add black global navigation unless the product explicitly requests a broader shell redesign.

### Buttons

- Primary action: Apple Blue filled pill or compact rounded rectangle depending on current component context.
- Secondary action: white surface, blue text, blue hairline.
- Destructive and warning actions keep semantic warning color; do not force all warnings to blue.
- Press state can use a small scale or surface shift, but do not rely on motion alone.

### Inputs And Forms

- White field background.
- Hairline border by default.
- Focus-visible: blue ring plus border upgrade.
- Error: keep semantic error coloring and text, not blue.
- Minimum touch target stays 44px where controls are standalone.
- Spreadsheet cells and row controls preserve existing dense dimensions.

### `/daily` And Task Grid

This is the priority surface for density preservation.

- Preserve current row heights, column widths, quick-create density, and resize behavior.
- Do not add large vertical padding to rows.
- Use hairline grid separators rather than thick borders.
- Selected row/cell: blue soft surface plus stronger blue border or outline.
- Hover: subtle surface shift plus cursor affordance.
- Pending optimistic actions must remain usable; do not add a global theme-level disabled treatment that blocks chained actions.

### Admin And Knowledge Surfaces

Apply the same token grammar:

- Pearl canvas, white panels, hairline separators.
- Blue only for interactive affordances, selection, and focus.
- Status and review badges keep semantic meaning; do not flatten all states to blue.
- Dense reports remain scannable.

### Preview Routes

`/preview/*` stays `classic`.

The new theme must not leak into preview routes, preview layout, hidden selector behavior, or preview auth verification.

## Implementation Scope

Allowed implementation files:

- `src/domains/preferences/types.ts`
- `src/lib/ui-copy/catalog.ts`
- `src/app/globals.css`
- `src/components/layout/theme-selector.tsx` only if the existing selector cannot display the new option without layout polish
- `src/components/layout/project-shell.tsx` only if theme-gated shell classes are needed
- `src/components/layout/sidebar.tsx` only if theme-gated sidebar classes are needed
- `src/components/tasks/task-workspace.tsx` only if CSS tokens cannot handle a specific theme-gated affordance
- `docs/worklogs/*`

Prefer CSS variable and selector work over component logic changes.

## Out Of Scope

Do not modify these for the theme-only slice:

- `prisma/**`
- `src/app/api/**`
- `src/providers/auth-provider.tsx`
- `src/use-cases/**`
- `src/lib/repositories/**`
- `.env*`
- `.github/**`
- `package.json`
- `package-lock.json`
- build, deploy, database, OCR, retrieval, regulation, or assistant behavior

## Verification Contract

Before the theme branch is integrated:

1. `npm run typecheck`
2. `npm run lint`
3. `npm run build`
4. Browser check authenticated service shell with `apple-workbench` selected.
5. Browser check `/daily` for density, row selection, editing, resize affordances, pending states, and no obvious overlap.
6. Browser check sidebar, dialogs, inputs, buttons, focus-visible states, and theme selector.
7. Browser check `/preview/*` remains `classic`.
8. Browser check existing themes remain selectable and visually intact.
9. Confirm the final diff does not include auth, API, DB, deployment, or package changes.

## Design Self-Review

- No unresolved placeholder remains.
- The theme is additive, not a replacement for existing themes.
- The density decision is explicit and tied to `/daily`.
- The accent decision is explicit and uses Apple Blue.
- The implementation scope is narrow enough for one theme slice.
- Remaining user-facing label can be changed before implementation if requested.
