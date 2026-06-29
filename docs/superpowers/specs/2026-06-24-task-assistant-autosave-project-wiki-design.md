# Task Assistant Auto-Save And Project WIKI Design

## Context

Task Assistant currently separates AI review generation, review-session saving, work-summary approval, and WIKI candidate handling. The current UX makes users decide whether to save a generated review manually, which creates two problems:

- Users can lose useful AI review output by forgetting to click `검토기록저장`.
- `보류 저장` and manual review saving are hard to distinguish without a follow-up queue.

The new design makes AI review results auto-save as `임시 검토 기록`, lets users reload or delete those temporary records, and introduces a project-scoped WIKI path that remains separate from shared organization-level WIKI.

## Terminology

- `임시 검토 기록`: An auto-saved Task Assistant review session. It is reloadable and deletable. It is not a finalized work record and is not WIKI by itself.
- `작업 기록 승인`: User confirmation that the generated work-summary draft can become the official task work record. This does not directly create shared WIKI.
- `프로젝트wiki`: Project-scoped reusable knowledge. It is active only inside the current project and can be used by Task Assistant for later project work.
- `공용wiki`: Shared reusable knowledge across projects. It requires a separate review/approval path.
- `공용wiki 후보`: A candidate submitted for common WIKI review. It is not reusable as `공용wiki` until approved.

If a future discussion says only `wiki` and the intended scope is unclear, ask whether it means `프로젝트wiki`, `공용wiki 후보`, or `공용wiki`.

## Goals

- Auto-save every successful AI review generation as an `임시 검토 기록`.
- Allow users to reload and delete temporary review records.
- Keep official work-record approval separate from temporary review saving.
- Let users convert an approved work record into `프로젝트wiki` when AI judges it suitable and the user confirms.
- Automatically submit a `공용wiki 후보` when `프로젝트wiki` is created.
- Keep `공용wiki 후보` creation automatic and non-optional during `프로젝트wiki` registration, so users do not have to answer an extra checkbox or confirmation step.
- Keep `프로젝트wiki` management available to project participants, not only top-level admins.
- Keep UI complexity low: basic Task Assistant flow stays focused on review generation, auto-save status, work-record approval, and project WIKI registration.

## Non-Goals

- Do not make auto-save create `프로젝트wiki`, `공용wiki 후보`, or `공용wiki`.
- Do not require users to separately opt in to `공용wiki 후보` creation when registering `프로젝트wiki`.
- Do not require users to edit the generated project WIKI body before registration. Optional title, summary, body, and tag edits are allowed when the generated wording needs correction before immediate project reuse.
- Do not add RAG or semantic search to the `프로젝트 WIKI` management page in this phase.
- Do not make disabled `프로젝트wiki` available to Task Assistant retrieval.
- Do not auto-promote anything into `공용wiki`.

## Primary UX Flow

1. User clicks `근거 조회 + 의견 생성`.
2. Task Assistant generates the review answer and draft work summary.
3. On successful generation, the review is automatically saved as an `임시 검토 기록`.
4. The `검토 의견` header shows a compact status badge:
   - `저장 중`
   - `임시 기록 자동저장됨`
   - `저장 실패 · 다시 시도`
5. The old manual `검토기록저장` action is removed from the primary action row.
6. The old `최근 검토 기록` section becomes `임시 검토 기록`.
7. Each generated review creates a new temporary record, even for the same task.
8. Users can reopen an `임시 검토 기록`.
9. Users can delete an `임시 검토 기록`.
10. Users can approve the work summary through `작업 기록 승인`.
11. After work-record approval, Task Assistant evaluates whether the approved content is suitable for WIKI registration.
12. If the AI result is `추천` or `주의`, the user can open a project WIKI registration preview.
13. User clicks `프로젝트wiki로 등록`.
14. The system atomically creates:
    - one `프로젝트wiki`
    - one linked `공용wiki 후보`
    - the link from the source `임시 검토 기록` and approved work record
15. The temporary record remains in the list with `작업기록 승인됨`, `프로젝트wiki 등록됨`, and `공용wiki 후보 생성됨` states.

## Task Assistant Actions

Primary action row:

- `근거 조회 + 의견 생성`
- `작업 기록 승인`

Temporary-record delete is not a primary action. It appears on each `임시 검토 기록` item.

Project WIKI registration appears only after work-record approval and AI WIKI suitability evaluation. The button label is:

- `프로젝트wiki로 등록`

Helper copy:

- `프로젝트wiki로 등록하면 공용wiki 후보도 자동 생성됩니다.`
- `공용wiki 후보는 관리자 검토 전까지 공용wiki로 재사용되지 않습니다.`

## Auto-Save Behavior

Auto-save runs immediately after a review answer is successfully generated.

Rules:

- The generated answer remains visible even if auto-save fails.
- Auto-save failure does not mark generation as failed.
- Failure shows `임시 검토 기록 저장 실패` with a `다시 시도` action.
- Retry uses the same generated output and must not regenerate the AI answer.
- Each successful generation creates a durable `임시 검토 기록`.
- The UI groups temporary records for the selected task by review question/run context when possible.
- The default list shows the newest 6 review groups. Each group shows the latest record, version count, and whether any version is linked to an approved work record, `프로젝트wiki`, or `공용wiki 후보`.

The saved temporary record must preserve:

- task id
- project id
- question
- generated answer
- evidence snapshot
- draft work summary
- execution mode and runtime mode
- AI WIKI suitability result when available
- source metadata needed for future audit

## Temporary Review Record Deletion

Deletion is lightweight because the record is temporary.

Rules:

- Delete without a blocking confirmation modal.
- If the temporary record is linked to work approval, `프로젝트wiki`, or `공용wiki 후보`, the row shows a compact `연결 유지` note before deletion.
- Show a short undo toast.
- If the temporary record already produced a work approval, `프로젝트wiki`, or `공용wiki 후보`, those artifacts remain.
- Toast copy when linked artifacts exist:
  - `임시 검토 기록을 삭제했습니다. 연결된 프로젝트wiki와 공용wiki 후보는 유지됩니다. 되돌리기`
- Undo restores the temporary review record only.

Deletion must not delete:

- the task
- the approved work-summary record
- the task work-record update
- `프로젝트wiki`
- `공용wiki 후보`
- approved `공용wiki`

## Work Record Approval

`작업 기록 승인` confirms the work-summary draft as the official task work record.

Rules:

- It is separate from temporary review record creation.
- It is separate from project WIKI registration.
- Approval preserves the source temporary record id when available.
- The source temporary record shows `작업기록 승인됨`.
- If the temporary record is later deleted, the approved work record remains.

## AI WIKI Suitability

After work-record approval, AI evaluates whether the approved content is suitable for project WIKI.

Suitability values:

- `추천`
- `주의`
- `비추천`

Display:

- Use a small badge.
- Distinguish primarily by color, not long text.
- Keep the reason short and scannable.

Rules:

- Show `프로젝트wiki로 등록` only for `추천` and `주의`.
- `주의` keeps the button available but shows the caution reason directly above the registration action.
- Supplemental note remains optional for `주의`; the system should inform without creating an extra required checkbox.
- `비추천` does not show the registration button.
- The AI suitability reason is stored and included in the future `공용wiki 후보`.

## Project WIKI Registration Preview

The registration preview keeps UX simple while allowing users to correct obvious wording before immediate project reuse.

Rules:

- The project WIKI title, summary, body, and tags generated by system logic are shown ready to register by default.
- Users may optionally edit title, summary, body, and tags before registration.
- Optional edits update the `프로젝트wiki` body and the linked `공용wiki 후보` draft source.
- Users can approve registration.
- Users can cancel registration.
- Users can optionally add a supplemental note.

Supplemental note behavior:

- It is optional.
- It is collapsed by default behind `보완 메모 추가`.
- It is saved separately from the editable project WIKI body.
- It is included in future Task Assistant project WIKI context as user-provided supplemental evidence.
- It is included in `공용wiki 후보` as review context.
- It is not automatically merged into the `공용wiki` body.

The system does not need a regeneration loop in this phase. Supplemental notes are a provenance layer, not body edits.

## Project WIKI Creation

When the user confirms `프로젝트wiki로 등록`, the operation must be atomic.

Atomic unit:

- create `프로젝트wiki`
- create linked `공용wiki 후보`
- link both to the source temporary review record
- link both to the approved work record

Rules:

- If any part fails, the whole registration fails.
- No partial `프로젝트wiki` or partial `공용wiki 후보` may remain.
- The user sees a retryable failure state.
- One temporary review record can create at most one `프로젝트wiki`.
- Reopening a source record that already has project WIKI shows `프로젝트wiki 등록됨`, `공용wiki 후보 생성됨`, and links where available.
- Repeated clicks must be idempotent and must not create duplicate `공용wiki 후보`.
- There is no separate checkbox or confirmation modal for `공용wiki 후보`; it is always created with `프로젝트wiki`.

## Project WIKI Scope And Reuse

`프로젝트wiki` is immediately reusable inside the current project.

Rules:

- Active `프로젝트wiki` can be used by Task Assistant retrieval and answer generation.
- Disabled `프로젝트wiki` is completely excluded from retrieval, evidence, and answer generation.
- Task Assistant answers must naturally integrate project WIKI and common WIKI into the response.
- The visible answer must not split into heavy `프로젝트 WIKI` and `공용 WIKI` sections by default.
- When evidence is shown, use small source badges such as `프로젝트 WIKI`, `공용 WIKI`, `task`, `도면/문서`, and `법규`.

## Common WIKI Candidate

Creating `프로젝트wiki` automatically creates a `공용wiki 후보`. This is always-on behavior, not a user-selectable option.

User-facing status must make the automatic result visible without asking the user to check another box:

- before registration: `프로젝트wiki로 등록하면 공용wiki 후보도 자동 생성됩니다.`
- after registration: `공용wiki 후보 생성됨`
- failure: `프로젝트wiki와 공용wiki 후보를 생성하지 못했습니다. 다시 시도해 주세요.`

The candidate includes:

- project WIKI title/body/summary
- source task link
- source temporary review record link
- approved work record link
- user supplemental note
- AI suitability badge and reason
- AI-generated `공용화 주의사항`
- project-specific context marker

`공용화 주의사항` is generated by AI and must be short. Example:

- `이 기준은 특정 현장 협의 조건에 의존하므로 공용wiki 반영 전 일반 조건으로 재작성 필요.`

Rules:

- `공용wiki 후보` is not `공용wiki`.
- Common WIKI approval remains a separate review path.
- If the source `프로젝트wiki` is later disabled, keep the `공용wiki 후보` but show a small `원본 비활성화됨` badge.

## Project WIKI Management Page

The management surface belongs under the left navigation `프로젝트 자료`, not top-level admin knowledge.

Page name:

- `프로젝트 WIKI`

Access:

- Any project participant can view.
- Any project participant can search.
- The project WIKI creator, project manager, and project admin can disable.
- The project WIKI creator, project manager, and project admin can restore.
- This is not restricted to top-level `admin`.

Default list card shows:

- title
- short summary
- tags
- status: active or disabled
- source task
- creator
- created date
- common WIKI candidate status

Detail view shows:

- body
- supplemental note
- source task
- source temporary review record when still available
- approved work record link
- AI suitability badge and reason
- common WIKI candidate link/status
- `공용화 주의사항`
- action log
- disable/restore controls

## Project WIKI Search

Search is keyword-only in this phase.

Rules:

- No RAG search.
- No semantic search.
- No AI-based similarity search.
- Search returns every project WIKI item that contains the entered keyword.
- Search must cover title, summary, body, tags, and supplemental note.
- Default search includes only active project WIKI.
- A `비활성 포함` toggle includes disabled items.

## Disable And Restore

Eligible project participants can disable and restore project WIKI. This keeps project WIKI management inside the project while preventing every participant from accidentally removing reusable context from Task Assistant retrieval.

Rules:

- Disable removes the project WIKI from Task Assistant retrieval and generation.
- Restore makes it reusable again.
- Disable/restore must not delete source records.
- Disable/restore must not delete or approve common WIKI candidates.
- Disable/restore writes an action log automatically.
- Disable requires a short reason.
- Restore allows an optional reason.

Action log records:

- action type: disable or restore
- project WIKI id
- user id
- user display name or email when available
- timestamp
- reason, required for disable and optional for restore

## Permissions

Permission model:

- Current project participants can read project WIKI.
- The project WIKI creator, project manager, and project admin can disable/restore project WIKI.
- Current project participants can register project WIKI from an approved work record if they have access to that task and review record.
- Common WIKI approval remains outside this project-participant flow.

Project WIKI APIs must enforce current project membership and project id scoping.

## Data Model Implications

The implementation needs durable records for:

- temporary review sessions with soft delete or restore metadata
- approved work-summary records linked to source temporary review records
- project WIKI items
- common WIKI candidates linked to project WIKI items
- project WIKI action logs

Project WIKI item must include:

- id
- project id
- source task id
- source temporary review id
- source approved work record id
- title
- summary
- body
- tags
- supplemental note
- AI suitability state and reason
- commonization caution
- status: active or disabled
- created by
- created at
- updated at
- disabled by
- disabled at
- restored by
- restored at
- editable snapshot metadata for the title, summary, body, and tags used at registration time

Use explicit links rather than inferring lineage from text.

## Error Handling

Auto-save failure:

- keep generated answer visible
- show retry
- do not claim saved state

Temporary record delete failure:

- leave the item visible
- show error

Project WIKI registration failure:

- no partial state remains
- show retryable failure
- use copy: `프로젝트wiki와 공용wiki 후보를 생성하지 못했습니다. 다시 시도해 주세요.`
- keep the approved work record and temporary record intact

Disable/restore failure:

- leave current status unchanged
- show error

Common WIKI candidate creation failure during project WIKI registration:

- fail the whole registration and roll back project WIKI creation

## Testing And Validation

Unit or service tests:

- auto-save creates an `임시 검토 기록` after successful generation
- auto-save failure preserves generated answer
- retry saves without regenerating
- temporary records are grouped by review question/run context and show version count
- deleting a temporary record preserves linked work approval and WIKI artifacts
- work approval links to source temporary record
- one temporary record creates at most one project WIKI
- project WIKI registration atomically creates a common WIKI candidate
- project WIKI registration always creates a common WIKI candidate without requiring a user opt-in flag
- partial registration failure rolls back
- disabled project WIKI is excluded from retrieval
- restore includes the item again
- keyword search matches title, summary, body, tags, and supplemental note
- `비활성 포함` controls disabled search inclusion
- project membership is required for project WIKI APIs

Browser checks:

- generation shows auto-save badge
- failed auto-save shows retry
- `임시 검토 기록` list groups records and can reopen a saved review
- delete shows undo toast
- work approval marks source record as approved
- `프로젝트wiki로 등록` appears only for `추천` or `주의`
- registration preview allows optional title, summary, body, and tag edits and does not require a separate common-candidate checkbox
- successful registration shows `프로젝트wiki 등록됨` and `공용wiki 후보 생성됨`
- project WIKI page lists active items
- keyword search works
- disable removes item from active default list
- `비활성 포함` shows disabled items
- restore returns item to active list

## Open Follow-Up Decisions

The following are intentionally deferred until implementation planning:

- Exact storage strategy for undo after temporary record deletion.
- Exact common WIKI candidate review UI placement.
- Whether to add semantic/RAG search to project WIKI later.
- Whether common WIKI reviewers can request project WIKI supplemental context from source project participants.
