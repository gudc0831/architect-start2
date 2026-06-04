Req: Fix sidebar tab navigation getting blocked after entering the `/daily` list.
Diff: Marked sidebar workspace navigation with `data-workspace-navigation`, made the `/daily` document-level pointerdown guard ignore that area, and expanded `workspace-navigation-harness` to lock the contract.
Why: The daily task selection/draft guard could prevent default on sidebar pointerdowns before Next links handled the tab change.
Verify/Time: 2026-05-30 10:35 +09:00; `npx.cmd tsx scripts/workspace-navigation-harness.ts`; `npx.cmd tsc --noEmit --incremental false`; `npm.cmd run lint`; `npx.cmd tsx scripts/daily-editing-responsiveness-verify.ts`; headed Chrome/CDP confirmed `/daily` to `/calendar` route change with no page errors.
