# Structured Approved WIKI Design

작성일: 2026-06-15
상태: implementation planning approved
범위: approved WIKI source of truth, structured draft generation, source buckets, ontology, TOC, generation profiles, admin review UX

## Core Decision

Approved WIKI uses structured knowledge records as the source of truth. Markdown is a rendered artifact of reviewed structure.

The canonical record is the structured item plus its approved version, source references, generation profile, generation run, approval readiness, and review lineage. Existing `approvedKnowledgeItem` snapshots stay as stable compatibility DTOs for readback, search, export, and copied links while structured storage becomes the write model.

Approved item identity must remain stable. Existing public IDs from legacy snapshots are preserved during backfill, dual-write approval, structured-first readback, and parity validation.

## Source Buckets

- legal_evidence: 법령, 조문, 공식 출처, 확인 시점, 법령 변경 경고
- task_context: task 질문, 결론 후보, task 특수 조건, 제거해야 할 일회성 맥락
- project_document: 업로드 문서, 도면/문서 청크, 프로젝트 조건, 신뢰도와 사용 제한
- approved_wiki: 기존 승인 WIKI, 중복/상충/보완 관계
- local_wiki: 로컬 WIKI import 후보, raw source digest, citation 상태, import rubric version
- external_evidence: 외부 근거, record id, 검증 상태

Source buckets are reviewed before approval. Each source reference records bucket membership, locator, excerpt or quote boundary, digest, authority rank, freshness state, legal change warnings, and allowed use.

Reusable central knowledge cannot be created from `pending_review`, discovery requests, import previews, raw local WIKI entries, or task-only context. Task context may inform a draft, but one-off task facts must be removed from the reusable approved body unless they are converted into scoped project knowledge.

## WIKI Structure

- title
- slug
- summary
- ontology
- sourceCoverage
- toc
- sections
- relatedKnowledge
- reasoningSummary
- claimEvidenceMatrix
- approvalReadiness
- reviewWarnings

The rendered Markdown artifact must include an explicit table of contents, stable anchors derived from reviewed TOC items, source coverage, and a related WIKI section when the structured draft contains those fields.

Section body content is generated from reviewed section blocks. The Markdown renderer may format headings, anchors, citations, source coverage, and related knowledge, but it cannot introduce unreviewed claims or hidden metadata.

Integrated reasoning is persisted draft data. `reasoningSummary` and `claimEvidenceMatrix` store claim, source, conflict, gap, and confidence information so admin review, approval readiness, and later audits do not depend on transient UI copy.

## Generation Profile

Generation profiles are versioned admin-managed instructions. They may change TOC, ontology schema, section rules, and citation rules. They cannot override security, legal evidence, approval, or central knowledge exclusion boundaries.

Each generation run records the active profile version, source bundle digest, prompt digest, provider and model metadata, legal verification status, and project context trace. Admin UI may show safe profile and run summaries, but raw prompt text, provider usage, cost metadata, local absolute paths, and secret-like strings are excluded from rendered Markdown and sanitized from route responses.

Profile changes require versioned activation and rollback audit data. A draft profile can affect generated drafts only after activation through guarded admin routes.

## Approval Rules

Approval requires source coverage, reusable scope review, ontology completeness, TOC quality, and metadata/body separation. Provider, usage, task id, assistant record id, raw local path, and secret-like content cannot appear in approved Markdown body.

Approval readiness is typed and enforced server-side. Blocking issues prevent approval. Warning issues require admin visibility. Ready status means the draft has passed required source bucket, TOC, ontology, reusable scope, source conflict, metadata/body, and legal freshness checks.

The initial approval model has no override path for blocking issues. Any future override must be explicit, reasoned, audited, and separate from the default approval path.

Double-approval races are blocked through existing candidate state transition guards plus a unique structured source-record constraint. Publishing writes the structured records and compatibility snapshot in one logical approval operation.

## Runtime Enforcement

Docs define intent. Runtime behavior is enforced by services, route guards, validators, and smoke tests.

Services enforce source bucket assembly, structured draft shape, Markdown rendering, approval readiness, publishing, dual-write, structured-first readback, and legacy fallback behavior. Validators prove schema contracts, DTO compatibility, source bucket coverage, generation output, approval rejection rules, readback parity, UI contract, sanitizer boundaries, and browser smoke coverage.

Backfill, dual-write, and parity migration are required. Existing snapshots are copied idempotently into structured rows while preserving public IDs. Approval writes structured records and legacy metadata snapshots together. Readback and search prefer structured rows and fall back to legacy snapshots only when no structured match exists. Parity validators protect ID stability, source refs, scope semantics, duplicate prevention, and export shape.

Route, security, and sanitizer boundaries are part of runtime enforcement. Admin routes must use request integrity checks, knowledge admin authorization, exact capability checks, state transition guards, and response sanitizers. Sanitizers remove raw prompts, secret-like values, environment fragments, Windows, UNC, and POSIX absolute paths, provider usage, and cost metadata from admin responses and approved Markdown.
