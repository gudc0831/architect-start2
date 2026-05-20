Req: Fix Vercel Routes Manifest Could Not Be Found deployment failure
Diff: 1f +2/-1 | scripts/run-next.cjs
Why: Keep Windows local builds on .next-build while allowing Vercel builds to emit the default .next output expected by Vercel
Verify/Time: VERCEL=1 npm run build; confirmed .next/routes-manifest.json exists | 13:09-13:09 (1m)
