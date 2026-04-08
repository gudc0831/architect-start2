Req: close the remaining spreadsheet-grid latency gaps, especially row-height resize responsiveness, and document the remediation method.
Diff: rAF-batched row resize, transient live row-height sync for virtualization, reusable auto-fit measurement DOM, and a methodology addendum under docs.
Why: the prior pass still left pointermove-rate DOM writes, stale virtual window math during drag, and expensive auto-fit cache misses.
Verify: `npm run typecheck`, `npm run build`, `preview/daily` browser QA for in-flight row resize, blank-space deselect, detail heading reset, and console errors.
Risk: auto-fit still uses DOM measurement and the layout body still recomputes per snapshot change, so future profiler data may still justify finer-grained subscriptions.
