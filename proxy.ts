import type { NextRequest } from "next/server";
import { middleware } from "./middleware";

export { config } from "./middleware";
export { middleware };

export async function proxy(request: NextRequest) {
  return middleware(request);
}