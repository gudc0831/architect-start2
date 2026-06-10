# Apple Workbench Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `apple-workbench` theme option with UI label `apple`, preserving existing themes and `/daily` density.

**Architecture:** Reuse the existing theme registry, ThemeProvider, selector, and CSS variable system. Add the new theme id and copy, then define `[data-theme="apple-workbench"]` tokens plus narrow CSS refinements for shell, sidebar, controls, and dense grid states.

**Tech Stack:** Next.js 16, React 19, TypeScript, CSS custom properties, existing in-repo theme persistence.

---

## 2026-06-10 Completed/Archived Notice

- [x] This theme plan is completed and archived for current planning purposes.
- [x] It is not part of the verified-legal, AI review, Browser Assistant, or `/daily` collaboration release gate.
- [ ] Reopen only if new theme regressions are found on a current target URL/SHA.

### Task 1: Register Theme Contract

**Files:**
- Modify: `src/domains/preferences/types.ts`
- Modify: `src/lib/ui-copy/catalog.ts`

- [x] Add `"apple-workbench"` to `themeIds`.
- [x] Add `themeDefinitions["apple-workbench"]` with label and description keys.
- [x] Add Korean and English UI copy entries:
  - label: `apple`
  - Korean description: `흰색과 펄 톤, 정밀한 헤어라인, Apple Blue 강조색을 쓰는 절제된 업무형 테마입니다.`
  - English description: `A restrained white-and-pearl workspace theme with precise hairlines and Apple Blue accents.`

### Task 2: Add CSS Tokens

**Files:**
- Modify: `src/app/globals.css`

- [x] Add `[data-theme="apple-workbench"]` after the existing `posthog` token block.
- [x] Include all required `--theme-*` variables so existing surfaces resolve without fallback gaps.
- [x] Add `[data-theme="apple-workbench"]` to the shared alias selector that maps `--theme-*` into app variables.
- [x] Keep existing `--table-min-width`, row-height, column-width, and layout density variables unchanged.

### Task 3: Add Scoped Visual Refinements

**Files:**
- Modify: `src/app/globals.css`

- [x] Add scoped `html[data-theme="apple-workbench"]` rules for:
  - body background as pearl canvas with subtle radial light
  - sidebar as white/pearl chrome
  - active nav as blue text plus soft blue surface
  - primary/secondary buttons using Apple Blue grammar
  - inputs with white background, hairline border, blue focus ring
  - `/daily` grid hover and active row states using blue soft surfaces
- [x] Avoid changing row heights, table min-width, or component layout structure.

### Task 4: Documentation And Verification

**Files:**
- Modify: `DESIGN.md`
- Modify: `docs/worklogs/2026-05-21-theme-design-worktree.md`

- [x] Update docs if implementation changes the label, scope, or verification contract.
- [x] Run `npm run typecheck`.
- [x] Run `npm run lint`.
- [x] Run `npm run build`.
- [x] Start local dev server on port `4000`.
- [x] Share `http://localhost:4000`.
