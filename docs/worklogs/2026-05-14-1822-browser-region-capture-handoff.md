Req: Connect the browser selected-region capture workflow to SaaS `image_region` file analysis controls.
Diff: Added `/daily` task assistant support for invoking the extension `select-region` bridge, filling region percent fields, and seeding a review summary before saving through the existing file analysis API.
Why: Browser-side selection closes the manual-coordinate gap left by the OCR provider and image-region metadata slice without adding a new screenshot storage model.
Verify/Time: 2026-05-14 18:24 KST. `npm run typecheck`, `npm run lint`, and `npm run build` passed; lint still reports 7 pre-existing React Hook warnings.
