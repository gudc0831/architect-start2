export const isFirestoreEnabled =
  Boolean(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) &&
  process.env.FIRESTORE_USE_MEMORY_FALLBACK !== "true";

export const localUploadRoot =
  process.env.LOCAL_UPLOAD_ROOT || "D:/architect-start-data/uploads";