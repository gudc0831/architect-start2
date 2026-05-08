# Assistant Extension API Contract

Updated: 2026-05-08

Purpose: define the API boundary used by `architect-browser-assistant` for the Task Assistant Core Loop slice.

## Boundary

- Browser assistant calls SaaS APIs only.
- Browser assistant must not access Prisma, Supabase service role credentials, storage buckets, or production DB credentials directly.
- SaaS re-checks session, project access, task scope, and editor permission for persistence.
- Mutation endpoints use the existing request integrity guard. Chrome extension origins are allowed only when explicitly listed in `ARCHITECT_ASSISTANT_EXTENSION_ORIGINS`.

## Endpoints

### `GET /api/assistant/task-context?taskId=<taskId>`

Returns the selected task context after SaaS auth and current-project access checks.

```ts
type AssistantTaskContext = {
  taskId: string;
  projectId: string;
  title: string;
  description: string;
  status: string;
  issueId: string;
  projectName: string;
};
```

### `POST /api/assistant/retrieve`

Returns evidence in product priority order where available. The first slice derives evidence from task/project records and records unavailable central/regulation/document classes explicitly.

```ts
type RetrieveRequest = {
  taskId: string;
  question: string;
};

type AssistantEvidence = {
  id: string;
  kind: "central_knowledge" | "regulation" | "task" | "project_document" | "web_or_skill";
  priority: number;
  title: string;
  excerpt: string;
  sourceUrl?: string;
  recordId?: string;
  confidenceWeight?: number;
};

type RetrieveResponse = {
  taskContext: AssistantTaskContext;
  evidence: AssistantEvidence[];
  unavailableEvidenceKinds: Array<"central_knowledge" | "regulation" | "project_document">;
};
```

### `POST /api/assistant/records`

Saves the generated assistant answer and evidence as a task assistant record. Requires project editor permission.

```ts
type SaveAssistantRecordRequest = {
  taskId: string;
  question: string;
  answer: string;
  evidence: AssistantEvidence[];
  confidenceScore?: number;
  confidenceReason?: string;
  executionMode?: "local-chatgpt-codex" | "mock" | "unavailable" | "saas-api";
  runtimeMode?: string;
  draftSummary?: {
    conclusion: string;
    tags: string[];
    scope: string;
    followUpAction?: string;
  };
};
```

### `GET /api/assistant/policy`

Returns the current project SaaS API Mode policy summary for user-facing assistant UI. Requires current-project access.

```ts
type AssistantPolicyResponse = {
  enabled: boolean;
  provider: "mock" | "openai";
  model: string;
  externalEvidenceAllowed: boolean;
  allowedEvidenceKinds: AssistantEvidence["kind"][];
};
```

### `POST /api/assistant/generate`

Runs the SaaS API Mode foundation path for the selected task. Requires project editor permission. This endpoint currently does not call a live provider; it validates policy, writes usage/audit events, and returns a deterministic foundation response.

```ts
type GenerateAssistantRequest = {
  taskId: string;
  question: string;
  instruction?: string;
};

type GenerateAssistantResponse = {
  answer: string;
  suggestedDraftSummary: {
    conclusion: string;
    tags: string[];
    scope: string;
    followUpAction?: string;
  };
  citations: Array<{
    sourceType: AssistantEvidence["kind"];
    sourceId: string;
    title: string;
  }>;
  usage: {
    inputTokens: number;
    outputTokens: number;
    estimatedCostCents: number;
  };
  executionMode: "saas-api";
  policyDecision: "allowed" | "disabled" | "budget_exceeded" | "evidence_disallowed" | "unauthorized" | "rate_limited";
};
```

### `GET /api/admin/assistant/policy`

Returns the full admin policy for the current or specified project. Requires global admin.

### `PUT /api/admin/assistant/policy`

Updates the current or specified project SaaS API Mode policy. Requires global admin and request integrity. Writes an audit event.

### `GET /api/admin/assistant/usage?month=YYYY-MM`

Returns request count, success/blocked/failed counts, token estimates, cost estimate, and recent usage events for the current or specified project. Requires global admin.

### `POST /api/assistant/summaries`

Saves or updates the user-facing work summary draft linked to one assistant record. Requires project editor permission. Only the record author or a global admin may update the summary.

```ts
type SaveWorkSummaryDraftRequest = {
  taskId: string;
  recordId: string;
  conclusion: string;
  tags?: string[];
  scope: string;
  followUpAction?: string;
  status?: "draft" | "approved" | "deferred";
};
```

## Known Limits

- Central official knowledge, regulation DB, and extracted project documents are represented as unavailable classes until later slices add those stores.
- Real Chrome extension origin support requires setting `ARCHITECT_ASSISTANT_EXTENSION_ORIGINS` to the installed extension origin, for example `chrome-extension://<extension-id>`.
- Real local ChatGPT/Codex answer generation is not part of SaaS. The browser assistant owns the runtime adapter and sends generated text back for storage.
- SaaS API Mode currently uses a deterministic foundation response. Live provider calls and provider cost mapping remain a later slice.
