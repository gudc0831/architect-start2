# Firestore Setup

Firestore is now an optional backend mode, not the default development path.

## When to use it

Use Firestore only when you want shared task/file metadata during development or QA.
For normal local development, keep `APP_BACKEND_MODE=local`.

## Required settings

Set these values in `.env.local`:

```env
APP_BACKEND_MODE=firestore
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

## Notes

- Firestore mode still uses local project metadata and local preferences.
- Uploaded binaries still go to `LOCAL_UPLOAD_ROOT`.
- Auth remains in stub mode.
- If any required Firebase value is missing, the app now fails clearly instead of silently falling back.
