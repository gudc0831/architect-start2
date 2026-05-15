import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { resolveKnowledgeAdminAccess } from "@/lib/auth/knowledge-guards";

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json({
      data: {
        userId: user.id,
        accessStatus: user.accessStatus,
        ...resolveKnowledgeAdminAccess(user),
      },
    });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 500;
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to resolve Knowledge admin capabilities",
      },
      { status: Number.isFinite(status) ? status : 500 },
    );
  }
}
