import { NextResponse } from "next/server";
import { isFirestoreEnabled, isPostgresPrimary } from "@/lib/runtime-config";
import { storageProvider } from "@/storage";

export async function GET() {
  return NextResponse.json({
    data: {
      dataMode: isPostgresPrimary ? "postgres" : isFirestoreEnabled ? "firestore" : "memory",
      uploadMode: storageProvider.name,
      hasSupabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      hasFirebaseProjectId: Boolean(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
    },
  });
}
