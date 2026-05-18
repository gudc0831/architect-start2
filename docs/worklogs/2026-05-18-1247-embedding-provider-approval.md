Req: Apply the approved embedding provider/key/write-audit gate for Slice 482 credentialed operations.
Diff: Stored a new OpenAI API key in ignored `.env.local`, added non-secret provider/write-audit env values, and left tracked runtime code unchanged.
Why: The embedding worker execute path could only be proven after a real provider key and write-audit approval were present, even though the configured cloud DB currently has zero chunks.
Verify/Time: 2026-05-18 12:45 KST; escalated embedding plan reports provider `openai`, key configured, `totalChunks=0`, blockers `[]`; dry-run and execute with `--write-audit ALLOW_FILE_ANALYSIS_EMBEDDING_WRITE` exit 0, select/update `0`, and make no provider call or DB mutation.
