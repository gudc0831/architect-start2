import type { NextResponse } from "next/server";

export function disableAuthResponseCache<T extends NextResponse>(response: T) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}
