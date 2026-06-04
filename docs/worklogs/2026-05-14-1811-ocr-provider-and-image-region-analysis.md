Req: Continue the active Architect Browser Assistant goal by implementing the OCR/image-analysis slice after Postgres text-hybrid retrieval.
Diff: Added OCR metadata fields, OCR provider contract, `ocr_extract` file analysis mode, optional Tesseract CLI gate, selected-region metadata support, `/daily` OCR/region controls, and `npm run ocr:provider:validate`.
Why: Image and scanned-document evidence needed a real entry path into file analysis and assistant retrieval without fabricating OCR output when no provider is configured.
Verify/Time: 2026-05-14 18:13 KST. `npm run ocr:provider:validate` passed, `npm run typecheck` passed, `npm run lint` passed with 7 pre-existing React Hook warnings, and `npm run build` passed.
