Req: Implement Slice 363 provider-specific secret metadata and the next guarded provider adapter.
Diff: Added credential source/scope metadata for knowledge sync target configs, target-specific server environment credential refs, Obsidian guarded execution artifacts, and Admin UI adapter-oriented execution labels.
Why: Provider execution should advance beyond the portable archive only after secret readiness is represented as opaque server-side metadata and the preview audit remains the execution boundary.
Verify/Time: typecheck passed; lint passed with 7 pre-existing React hook warnings; API route validation passed for Obsidian metadata/execution; Browser UI validation passed for provider target chips on 2026-05-13 13:29 KST.
