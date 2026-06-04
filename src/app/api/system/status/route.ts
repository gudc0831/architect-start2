import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireUser } from "@/lib/auth/require-user";
import { backendMode } from "@/lib/backend-mode";
import { inspectLocalWriteProtectionSummary } from "@/lib/data-guard/local-status";
import { storageProvider } from "@/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser();
    const writeProtection = await inspectLocalWriteProtectionSummary();
    const response = NextResponse.json({
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

    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
