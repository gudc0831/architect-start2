import { NextResponse } from "next/server";
import { backendMode } from "@/lib/backend-mode";
import { inspectLocalWriteProtectionSummary } from "@/lib/data-guard/local-status";
import { storageProvider } from "@/storage";

export async function GET() {
  const writeProtection = await inspectLocalWriteProtectionSummary();

  return NextResponse.json({
    data: {
      backendMode,
      dataMode: backendMode === "cloud" ? "postgres" : backendMode === "firestore" ? "firestore" : "local-file",
      uploadMode: storageProvider.name,
      hasSupabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      hasFirebaseProjectId: Boolean(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
      writeProtection: {
        locked: writeProtection.locked,
        reasonCode: writeProtection.reasonCode,
        message: writeProtection.message,
        lastSnapshotId: writeProtection.lastSnapshotId,
        recommendedCommand: writeProtection.recommendedCommand,
        guardMode: writeProtection.guardMode,
      },
    },
  });
}