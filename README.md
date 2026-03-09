# Architect Start2

Local-first rebuild scaffold.

## Setup

1. Copy `.env.example` to `.env.local`
2. If you want Firestore, fill `NEXT_PUBLIC_FIREBASE_*` values
3. To use Firestore instead of memory, set `FIRESTORE_USE_MEMORY_FALLBACK=false`
4. Run `npm install`
5. Run `npm run dev`

## Current Mode

- Default: memory repository
- Optional: Firestore repository
- File upload: local copy to `LOCAL_UPLOAD_ROOT`