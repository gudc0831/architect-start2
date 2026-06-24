import { badRequest } from "@/lib/api/errors";

export async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    throw badRequest("Invalid JSON payload.", "PROJECT_WIKI_PAYLOAD_INVALID");
  }
}
