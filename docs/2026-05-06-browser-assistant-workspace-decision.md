# Browser Assistant Workspace Decision

Date: 2026-05-06

## Decision

Do not convert the current SaaS project into a monorepo yet.

Use a multi-repo workspace instead:

```text
D:\architect-workspace\
  architect-saas\               # Existing SaaS service repo
  architect-browser-assistant\  # New Chrome extension repo based on Chromex concepts
```

The SaaS repo remains responsible for database access, user permissions, and assistant APIs.
The browser assistant repo remains responsible for the Chrome extension UI, local login flow, native bridge behavior, page context collection, and calls into the SaaS APIs.

This keeps the existing SaaS project stable while still allowing Codex to inspect and modify both projects from the same parent workspace.

## Context

The target product is a Chrome extension inspired by GENEXIS-AI/chromex. The desired behavior is:

- Each user logs in locally for GPT/Codex-style usage.
- The extension can answer using a database selected by the SaaS owner.
- Answers should be grounded in SaaS-controlled data, not only general model knowledge.
- The extension should stay separate enough that Chrome extension, native messaging, and bridge concerns do not destabilize the SaaS app.

Chromex's useful reference architecture is:

```text
Chrome Extension
  -> Native Messaging Host
  -> Local Bridge
  -> Codex app-server / local login
```

For this SaaS, extend the idea with a SaaS-owned retrieval layer:

```text
Chrome Extension
  -> Local Bridge / local login
  -> SaaS Assistant API
  -> SaaS auth and permission checks
  -> SaaS database / search / RAG context
  -> GPT answer grounded in retrieved context
```

## Recommended Folder Names

Use these names unless there is a strong reason to change them:

```text
D:\architect-workspace\
  architect-saas\
  architect-browser-assistant\
```

Avoid this structure:

```text
D:\architect - start2\
  architect-browser-assistant\
```

The extension should not live inside the existing SaaS repo because nested Git repositories will make status, commits, PRs, and future automation harder to reason about.

If the current SaaS repo remains at `D:\architect - start2` for now, that is acceptable temporarily. The cleaner long-term local layout is:

```text
D:\architect-workspace\
  architect-saas\               # Moved or freshly cloned copy of the current SaaS repo
  architect-browser-assistant\  # New extension repo
```

## GitHub And Git Model

Use two independent GitHub repositories:

```text
github.com/<org-or-user>/architect-saas
github.com/<org-or-user>/architect-browser-assistant
```

The current SaaS repository keeps its existing Git history and remote.

The extension should start as a separate repository. If Chromex source code is copied or imported, preserve the MIT license and relevant attribution notices.

For related work across both repos, use matching branch names:

```text
architect-saas
  branch: codex/assistant-api
  PR: Add SaaS assistant API

architect-browser-assistant
  branch: codex/assistant-api
  PR: Connect extension to SaaS assistant API
```

Because the projects are separate repos, each has its own:

- `git status`
- commit history
- pull request
- CI checks
- deployment or release process

When both PRs are needed, cross-link them in the PR descriptions.

## SaaS Repo Responsibilities

The SaaS repo should own:

- Assistant API endpoints
- SaaS user authentication
- Organization, workspace, project, or tenant permission checks
- Database access
- Search or retrieval logic
- RAG context construction
- Audit logging where needed
- Rate limits and usage policy

Example future API surface:

```text
POST /api/assistant/search
POST /api/assistant/chat
```

The browser extension should not connect directly to the production database.

## Extension Repo Responsibilities

The browser assistant repo should own:

- Chrome MV3 extension code
- Side panel UI
- Browser tab and page context collection
- Local Codex/OpenAI login integration
- Native messaging host integration, if retained from Chromex
- Local bridge integration, if retained from Chromex
- Calls to the SaaS assistant API
- Extension settings and diagnostics
- Chrome Web Store packaging concerns

The extension should treat the SaaS API as the source of truth for database-backed answers.

## Initial API Contract Draft

Use a small explicit contract first. Do not over-design shared packages until the integration proves it needs them.

```ts
type AssistantRequest = {
  query: string
  pageContext?: {
    url?: string
    title?: string
    selectedText?: string
    visibleText?: string
  }
  workspaceId?: string
  projectId?: string
}

type AssistantSource = {
  title: string
  url?: string
  recordId?: string
  kind?: "page" | "document" | "database-record" | "task" | "project"
}

type AssistantResponse = {
  answer: string
  sources: AssistantSource[]
}
```

The final schema should be documented in the SaaS repo before extension work depends on it.

Recommended document path:

```text
architect-saas\docs\assistant-extension-contract.md
```

## Why Not Monorepo Yet

Based on the current scope, the SaaS and extension are connected through API boundaries rather than deeply shared internals.

Current expected coupling:

- Extension sends user question and optional page context.
- SaaS validates the user and permissions.
- SaaS retrieves database-backed context.
- Extension displays the answer and sources.

This does not yet require a monorepo.

Monorepo conversion adds risk around:

- package manager configuration
- workspace scripts
- TypeScript path aliases
- environment variable layout
- Prisma paths
- deployment root settings
- CI and build commands
- import path churn

Those risks are not justified until there is proven shared code pressure.

## When To Reconsider Monorepo

Reconsider a monorepo only if several of these become true:

- The extension and SaaS share many TypeScript types that change frequently.
- A shared SDK becomes necessary.
- The extension reuses meaningful SaaS UI components or design-system packages.
- Assistant permissions, billing, or organization logic must be edited in both repos every time.
- Every feature requires coordinated changes in both repos.
- CI needs to test the SaaS and extension together before either can ship.
- Release management becomes harder because the two repos drift.

If this happens, a future monorepo shape could be:

```text
architect\
  apps\
    web\
    api\
    browser-assistant\
  packages\
    shared\
    assistant-contracts\
    assistant-sdk\
```

Do not start here unless the coupling becomes real.

## Review Checklist For Future Codex Work

Before implementing the extension or assistant API, verify:

- The SaaS repo and extension repo are sibling folders under `D:\architect-workspace`.
- The extension repo is not nested inside the SaaS repo.
- The SaaS repo contains the assistant API contract document.
- The extension calls SaaS APIs rather than connecting directly to the database.
- SaaS permission checks happen server-side before database context is returned.
- The response includes sources or record references when database-backed claims are made.
- The extension does not store raw OpenAI API keys, OAuth tokens, or ChatGPT session tokens in Chrome extension storage.
- Chromex license and attribution requirements are preserved if code is copied.
- Related work across both repos uses matching branch names and cross-linked PRs.

## First Implementation Sequence

1. Create or move the local workspace into:

```text
D:\architect-workspace\
  architect-saas\
  architect-browser-assistant\
```

2. In `architect-saas`, add the assistant API contract document.

3. In `architect-saas`, add a minimal server-side assistant API that performs auth and returns a grounded response or search result.

4. In `architect-browser-assistant`, create the Chromex-based extension project.

5. Connect the extension to the SaaS assistant API.

6. Verify end-to-end with a test user and test database records.

7. Only then decide whether shared packages or monorepo conversion are warranted.

## Open Decisions

These are not decided yet and should be answered before implementation:

- Whether GPT/model usage cost is paid by each user's local login or centrally by the SaaS backend.
- Which database or storage system is the source of truth.
- Whether vector search is needed, or whether structured DB search is enough for the first version.
- What user, organization, project, or tenant boundary controls data access.
- Whether page context should be sent to the SaaS API, local model flow, or both.
- Whether the first extension should be a private/internal build or a Chrome Web Store release.
