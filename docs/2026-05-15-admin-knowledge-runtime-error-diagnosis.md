# 2026-05-15 Admin Knowledge Runtime Error Diagnosis

## Summary

`/admin/knowledge` on the Vercel branch alias can show the generic Next.js server error page:

```text
This page couldn't load
A server error occurred. Reload to try again.
ERROR 1826282582
```

This is not a build failure. The deployed app built successfully, but the logged-in admin request path reaches a database table that has not been created in the cloud database.

Current root cause: cloud DB migrations are behind the deployed application code. The `/admin/knowledge` server page calls `listKnowledgeCandidates()`, which reads `assistant_task_records`. In the checked cloud DB, that table and related assistant tables do not exist.

## Affected Route And Code Path

Primary route:

```text
/admin/knowledge
```

Server page:

```text
src/app/admin/knowledge/page.tsx
```

Relevant call chain:

```text
AdminKnowledgePage()
  -> requirePageUser("/admin/knowledge")
  -> canManageKnowledge(user)
  -> listKnowledgeCandidates()
  -> assistantRepository.listKnowledgeCandidateRecords()
  -> prisma.assistantTaskRecord.findMany(...)
  -> public.assistant_task_records
```

Important implementation files:

```text
src/app/admin/knowledge/page.tsx
src/lib/auth/require-page-user.ts
src/lib/auth/knowledge-guards.ts
src/use-cases/admin/knowledge-service.ts
src/repositories/assistant/postgres-store.ts
src/lib/prisma.ts
prisma/schema.prisma
prisma/migrations/202605070001_add_assistant_core_loop/migration.sql
prisma/migrations/202605080002_add_assistant_saas_api_mode/migration.sql
prisma/migrations/202605140001_add_file_analysis_chunks/migration.sql
```

## How The Cause Was Found

1. Checked the screenshot.
   - The visible page is the generic production Next.js server error screen.
   - `ERROR 1826282582` is a Next.js digest, not the original database error text.

2. Checked the route implementation.
   - `src/app/admin/knowledge/page.tsx` redirects pending/no-access users.
   - If the user is active admin, it calls `listKnowledgeCandidates()` before rendering the admin shell.
   - That means a logged-in admin can fail in server data loading even though an unauthenticated user only sees login.

3. Checked the Vercel deployment.
   - Project: `architect-start2`
   - Latest checked deployment: `dpl_GQF8SCe4Q2oemZtkommTMCw9Kh9X`
   - Branch alias: `architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app`
   - Deployed commit: `9ec451b`
   - Build output included `Compiled successfully` and `Deployment completed`.
   - Conclusion: this is runtime, not build-time.

4. Checked unauthenticated route behavior.
   - Fetching the deployment URL without the user's session returned the login page with `next=/admin/knowledge`.
   - That confirms the basic app/auth route is alive and the failure is likely after authenticated admin data loading.

5. Checked cloud DB status with repo tooling.
   - `npm run data:doctor` showed the cloud DB is configured and non-empty.
   - It also showed pending migrations:

```text
202605070001_add_assistant_core_loop
202605080001_add_file_analysis_metadata
202605080002_add_assistant_saas_api_mode
202605140001_add_file_analysis_chunks
```

6. Checked table existence directly with a read-only query.
   - These tables were missing:

```text
assistant_task_records
assistant_work_summary_drafts
assistant_usage_events
assistant_audit_events
file_analysis_chunks
```

7. Confirmed the exact database error for the first `/admin/knowledge` table.

```text
relation "public.assistant_task_records" does not exist
PostgreSQL code: 42P01
```

## Evidence Commands

Use these as read-only confirmation steps before changing anything.

Check route/code references:

```powershell
rg -n "admin/knowledge|listKnowledgeCandidates|listKnowledgeCandidateRecords|assistantTaskRecord" src prisma
```

Check deployment build state through Vercel if available:

```text
Vercel project: architect-start2
Deployment id: dpl_GQF8SCe4Q2oemZtkommTMCw9Kh9X
Expected build result: READY / Deployment completed
```

Check repo cloud DB status:

```powershell
npm run data:doctor
```

Expected problematic output before the fix:

```text
Following migrations have not yet been applied:
202605070001_add_assistant_core_loop
202605080001_add_file_analysis_metadata
202605080002_add_assistant_saas_api_mode
202605140001_add_file_analysis_chunks
```

Check missing tables with a read-only PostgreSQL query:

```powershell
node -e 'const { loadEnvConfig } = require("@next/env"); loadEnvConfig(process.cwd()); const { Pool } = require("pg"); const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 }); const sql = "select * from (values (''assistant_task_records'', to_regclass(''public.assistant_task_records'') is not null),(''assistant_work_summary_drafts'', to_regclass(''public.assistant_work_summary_drafts'') is not null),(''assistant_usage_events'', to_regclass(''public.assistant_usage_events'') is not null),(''assistant_audit_events'', to_regclass(''public.assistant_audit_events'') is not null),(''file_analysis_chunks'', to_regclass(''public.file_analysis_chunks'') is not null)) as t(table_name, exists)"; pool.query(sql).then(r => console.log(JSON.stringify(r.rows, null, 2))).catch(e => console.log(JSON.stringify({ ok:false, message:e.message, code:e.code }, null, 2))).finally(() => pool.end());'
```

Check the exact failing relation:

```powershell
node -e 'const { loadEnvConfig } = require("@next/env"); loadEnvConfig(process.cwd()); const { Pool } = require("pg"); const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 }); pool.query("select count(*)::int as count from public.assistant_task_records").then(r => console.log(JSON.stringify({ ok:true, count:r.rows[0].count }))).catch(e => console.log(JSON.stringify({ ok:false, message:e.message, code:e.code, severity:e.severity, routine:e.routine }, null, 2))).finally(() => pool.end());'
```

Expected problematic output:

```json
{
  "ok": false,
  "message": "relation \"public.assistant_task_records\" does not exist",
  "code": "42P01",
  "severity": "ERROR",
  "routine": "parserOpenTable"
}
```

## Result

The app code expects assistant and file-analysis schema introduced after the last applied cloud migration. The cloud DB is still at an older schema state.

Observed cloud row counts before the fix:

```json
{
  "profiles": 8,
  "projects": 2,
  "tasks": 2,
  "files": 0,
  "preferences": 2
}
```

Because the DB is non-empty, do not run migration commands casually. Follow the guarded migration flow.

## Recommended Fix

Do not start by changing `/admin/knowledge` code. The first fix candidate is to apply the pending cloud DB migrations through the repo's guarded path.

Recommended sequence:

1. Confirm target and pending state.

```powershell
npm run data:doctor
```

2. Get explicit user approval before any cloud DB mutation.
   - The target is non-empty.
   - The prior latest cloud backup in the checked environment was `cloud-2026-04-30T02-10-24-568Z-9c4e4b70`.
   - Create a fresh backup before migration.

3. Run the guarded backup if approved.

```powershell
npm run data:backup
```

4. Run the guarded migration flow if approved.

```powershell
npm run db:migrate:safe
```

If the data guard requests `DATA_GUARD_CONFIRM`, use only the current token printed by `npm run data:doctor` after the user approves the operation.

5. Re-check migration status.

```powershell
npm run data:doctor
```

Expected after fix:

```text
cloud.migrationStatus.ok = true
```

6. Re-check the required tables.

```text
assistant_task_records = true
assistant_work_summary_drafts = true
assistant_usage_events = true
assistant_audit_events = true
file_analysis_chunks = true
```

7. Re-test `/admin/knowledge` with an active admin session.
   - Expected: page renders.
   - If it still fails with a digest, inspect Vercel runtime logs for the new digest. The migration issue should be resolved first.

8. Deploy current code if the branch alias is still behind local work.
   - The checked Vercel deployment was on commit `9ec451b`.
   - The local branch had later commits when this document was written.
   - Migration and deployment are separate operations; do not assume one performs the other.

## Notes For The Next Worker

- Treat `ERROR 1826282582` as a symptom, not the root cause. The root cause is hidden server-side.
- Build logs are not enough for this case. Build passed; the failure occurs during authenticated server render.
- The unauthenticated `/admin/knowledge` check may redirect to `/login?next=/admin/knowledge` and look healthy. Test with an active admin session after DB repair.
- If local shell checks show `EACCES` while querying Supabase/Postgres, verify whether the execution environment is sandboxing outbound network. A read-only query succeeded once run with actual network access.
- Do not expose or paste `.env.local` values. Confirm only whether keys are present.
- Do not run `prisma migrate dev` against the cloud DB. Use the repo's guarded commands.
- Do not bypass the data guard. This cloud DB is non-empty.
- Do not revert unrelated local changes. At the time of diagnosis, the SaaS repo had unrelated local state (`src/app/api/project/changes/route.ts` modified and `.codex-run/` untracked).
- If this is handled as a formal slice, update the relevant worklog and deployment/migration notes after the fix.
- If runtime errors remain after migration, the next likely diagnostic step is Vercel runtime logs matched by the new digest and a direct authenticated API/page reproduction.
