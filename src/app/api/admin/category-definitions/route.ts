import { NextResponse } from "next/server";
import { requireTaskCategoryFieldKey } from "@/domains/admin/task-category-definitions";
import { handleRouteError } from "@/lib/api/route-error";
import { requireRole } from "@/lib/auth/require-user";
import { createGlobalTaskCategory, listGlobalTaskCategories } from "@/use-cases/admin/admin-service";

export async function GET(request: Request) {
  try {
    await requireRole("admin");
    const { searchParams } = new URL(request.url);
    const data = await listGlobalTaskCategories(requireTaskCategoryFieldKey(searchParams.get("fieldKey")));
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireRole("admin");
    const body = (await request.json()) as {
      fieldKey?: string;
      code?: string;
      labelKo?: string;
      labelEn?: string;
      sortOrder?: number;
      isSystem?: boolean;
    };
    const data = await createGlobalTaskCategory(
      requireTaskCategoryFieldKey(body.fieldKey),
      {
        code: String(body.code ?? ""),
        labelKo: String(body.labelKo ?? ""),
        labelEn: String(body.labelEn ?? ""),
        sortOrder: Number(body.sortOrder ?? 0),
        isSystem: Boolean(body.isSystem),
      },
      user.id,
    );
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
