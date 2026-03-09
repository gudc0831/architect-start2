import { NextResponse } from "next/server";

export function handleRouteError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected server error";
  const status = message.includes("required") ? 400 : 500;

  return NextResponse.json({ error: message }, { status });
}