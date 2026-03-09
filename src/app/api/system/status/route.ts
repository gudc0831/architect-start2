import { NextResponse } from "next/server";
import { isFirestoreEnabled, localUploadRoot } from "@/lib/runtime-config";

export async function GET() {
  return NextResponse.json({
    dataMode: isFirestoreEnabled ? "firestore" : "memory",
    uploadMode: "local-copy",
    uploadRoot: localUploadRoot,
    hasFirebaseProjectId: Boolean(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
  });
}