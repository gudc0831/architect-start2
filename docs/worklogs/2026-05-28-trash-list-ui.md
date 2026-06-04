Req: Improve the trash tab so deleted tasks/files can sort by deleted date or created date, default to 50-per-page, show compact title-first cards, and reveal details only on expansion.
Diff: Added trash view preferences, mixed task/file sorting, 50-item pagination, expandable compact trash cards, localized copy, and responsive trash styling.
Why: Keeps the trash screen usable with larger item counts while preserving quick restore/permanent delete controls.
Verify/Time: typecheck and lint passed; ui-copy validation ran typecheck/lint/build successfully but still reports the existing missing translator-status failure; browser checked /trash empty, /preview/trash desktop/mobile, expand, created-date sort, and full/50 view toggle.
