# Firestore Setup

## Current default

- `.env.local` is created with `FIRESTORE_USE_MEMORY_FALLBACK=true`
- The app runs in memory mode by default
- File uploads still copy to `LOCAL_UPLOAD_ROOT`

## To enable Firestore

1. Fill all `NEXT_PUBLIC_FIREBASE_*` values in `.env.local`
2. Set `FIRESTORE_USE_MEMORY_FALLBACK=false`
3. Restart `npm run dev`
4. Check the header status text in the app

## Notes

- Current Firestore integration is for local-first development
- If Firestore rules block reads/writes, the API routes will fail until rules are adjusted
- Upload binaries are still stored locally, not in Firebase Storage