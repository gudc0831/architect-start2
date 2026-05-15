Req: Implement SaaS side of scanned-PDF rasterization and selected-region crop persistence/OCR for the active hardening goal.
Diff: Added file-analysis crop artifact metadata, crop data URL upload to storage, crop OCR input routing, and `pdftoppm` PDF rasterization before Tesseract OCR.
Why: OCR/image evidence needed persisted crop artifacts and scanned-PDF provider support instead of manual-only residual paths.
Verify/Time: 2026-05-14 18:49-19:05 KST. `npm run typecheck`, `npm run ocr:provider:validate`, `npm run lint`, and `npm run build` passed.
