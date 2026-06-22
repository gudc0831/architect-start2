# Local Codex review usage closeout

## Failure boundary

Local Codex review can only run when all three boundaries are ready:

1. The Architect Browser Assistant content script is attached to the current `/daily` page.
2. The extension can reach the native host.
3. The native host can run `codex exec --json` in read-only mode.

The app now checks boundary 1 and 2 before retrieval. If the page bridge does not answer, the review stops before evidence retrieval or answer generation.

## Daily verification

1. Open `/daily` in the same Chrome profile that has Architect Browser Assistant loaded.
2. Select one task and choose `로컬 Codex 로그인`.
3. Click `연결 상태 확인`.
4. Run `근거 조회 + 의견 생성`.
5. Confirm that the answer is saved and `Local Codex 사용량 기록` shows `반영됨`.

If the page reports `content script/native bridge 준비 상태가 감지되지 않았습니다.`, reload the extension from `chrome://extensions`, refresh `/daily`, then run the check again.

## Usage record verification

After a saved Local Codex review, verify the assistant record and usage event:

```powershell
npm run assistant:verify-record -- --backend-mode cloud --env-file .env.preview.local --execution-mode local-chatgpt-codex --runtime-mode extension-native-bridge-in-page --since-minutes 60 --strict --json
npm run assistant:verify-usage -- --backend-mode cloud --env-file .env.preview.local --execution-mode local-chatgpt-codex --runtime-mode extension-native-bridge-in-page --since-minutes 60 --strict --json
```

For a specific saved record:

```powershell
npm run assistant:verify-usage -- --backend-mode cloud --env-file .env.preview.local --assistant-record-id <record-id> --request-hash local-codex:<record-id> --strict --json
```

The usage verifier prints only metadata: ids, execution mode, runtime mode, model, token counts, status, request hash, and safe metadata fields.
