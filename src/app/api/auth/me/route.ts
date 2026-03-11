import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireUser } from "@/lib/auth/require-user";

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json({ data: user });
  } catch (error) {
    return handleRouteError(error);
  }
}

