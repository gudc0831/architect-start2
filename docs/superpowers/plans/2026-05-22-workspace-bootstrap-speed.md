# Workspace Bootstrap Speed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the perceived first-load delay on `/daily`, `/board`, `/calendar`, and `/trash` by removing the client-side auth/project/tasks waterfall without changing existing optimistic `/daily` mutation behavior.

**Architecture:** Add a workspace bootstrap read path that returns the same authenticated user, project selection, and active task list currently fetched by separate client requests. Keep the existing Provider APIs intact; only the initial workspace load reuses the shared bootstrap fetch, while explicit refreshes and mutations keep using the existing endpoints.

**Tech Stack:** Next.js App Router route handlers, React client providers, TypeScript, existing `scripts/daily-editing-responsiveness-verify.ts`.

---

## 2026-06-10 OLD/Paused Notice

- [x] This plan is paused and is not part of the current verified-legal, AI review, or `/daily` collaboration release gate.
- [x] Its unchecked bootstrap performance tasks remain backlog items, not current release blockers.
- [ ] Reopen only with a fresh target URL/SHA/deployment baseline and a separate performance acceptance matrix.

### Task 1: Lock The Bootstrap Contract

**Files:**
- Modify: `scripts/daily-editing-responsiveness-verify.ts`

- [ ] **Step 1: Add static regression assertions**

Add assertions that fail until:
- `src/app/api/workspace/bootstrap/route.ts` exists and serves active tasks.
- `src/lib/workspace/bootstrap-client.ts` provides a shared in-flight bootstrap promise.
- `AuthProvider`, `ProjectProvider`, and `DashboardProvider` consume that shared bootstrap on workspace initial load.

- [ ] **Step 2: Run the verification script**

Run: `npx tsx scripts/daily-editing-responsiveness-verify.ts`

Expected before implementation: fail because the bootstrap route/client files are missing.

### Task 2: Implement Shared Bootstrap Read

**Files:**
- Create: `src/lib/workspace/bootstrap-types.ts`
- Create: `src/lib/workspace/bootstrap-server.ts`
- Create: `src/app/api/workspace/bootstrap/route.ts`
- Create: `src/lib/workspace/bootstrap-client.ts`

- [ ] **Step 1: Define shared payload types**

Define `WorkspaceBootstrapPayload`, `ProjectSelectionPayload`, and `DashboardSystemMode` in one type-only module so providers and the route agree on the response shape.

- [ ] **Step 2: Build server payload**

Use existing server use cases:
- `requireUser()`
- `listProjectsForSession(user)`
- `listEffectiveTaskCategoriesForProject(currentProjectId)`
- `listTasks("active", selectedProject)`

The helper must return the same project category payload currently returned by `/api/projects`, plus the active task list.

- [ ] **Step 3: Expose route handler**

Add `GET /api/workspace/bootstrap`, return `{ data }`, set no-store headers, and apply the selected project id cookie with `applyProjectSessionProjectId`.

- [ ] **Step 4: Add client cache**

Add a module-level shared promise so simultaneous initial Provider calls collapse into one network request. Add `clearWorkspaceBootstrapCache()` for logout, project switch, or explicit refresh.

### Task 3: Wire Providers Without Rewriting Optimistic UI

**Files:**
- Modify: `src/providers/auth-provider.tsx`
- Modify: `src/providers/project-provider.tsx`
- Modify: `src/providers/dashboard-provider.tsx`

- [ ] **Step 1: AuthProvider**

On workspace paths only, `refreshUser()` should load `fetchWorkspaceBootstrap()` and set `user` from `payload.user`. Non-workspace pages should keep `/api/auth/me`.

- [ ] **Step 2: ProjectProvider**

On workspace paths only, initial project load should use `fetchWorkspaceBootstrap()` and call the existing `applyProjectSelection(payload.project)`. Explicit `refreshProjects`, `refreshWorkTypes`, and `switchProject` should keep existing project endpoints and clear the bootstrap cache when they intentionally change server state.

- [ ] **Step 3: DashboardProvider**

For initial active-scope load on workspace paths, use `fetchWorkspaceBootstrap().activeTasks` instead of `/api/tasks`. Force refreshes, trash scope, and file reads must keep the existing endpoints.

### Task 4: Document And Verify

**Files:**
- Create: `docs/worklogs/2026-05-22-workspace-bootstrap-speed.md`
- Modify if needed: `AGENTS.md`

- [ ] **Step 1: Worklog**

Record Req / Diff / Why / Verify/Time in compact format.

- [ ] **Step 2: Required verification**

Run:
- `npm run typecheck`
- `npm run lint`
- `npx tsx scripts/daily-editing-responsiveness-verify.ts`
- `npm run build`

- [ ] **Step 3: Commit**

Commit only this slice after verification and leave unrelated files untouched.
