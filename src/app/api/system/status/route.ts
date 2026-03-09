import { NextResponse } from "next/server";
import { isFirestoreEnabled, localDataRoot, localProjectMetaPath, localUploadRoot } from "@/lib/runtime-config";

export async function GET() {
  return NextResponse.json({
    data: {
      dataMode: isFirestoreEnabled ? "firestore" : "memory",
      uploadMode: "local-copy",
      uploadRoot: localUploadRoot,
      dataRoot: localDataRoot,
      projectMetaPath: localProjectMetaPath,
      hasFirebaseProjectId: Boolean(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
    },
  });
}