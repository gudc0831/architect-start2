import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireCurrentProjectAccess } from "@/lib/auth/project-guards";
import { requireUser } from "@/lib/auth/require-user";
import { prisma } from "@/lib/prisma";
import { applyProjectSessionProjectId } from "@/lib/project-session";

function maxDate(values: Array<Date | null | undefined>) {
  return values.reduce<Date | null>((latest, value) => {
    if (!value) {
      return latest;
    }

    if (!latest || value.getTime() > latest.getTime()) {
      return value;
    }

    return latest;
  }, null);
}

export async function GET() {
  try {
    const user = await requireUser();
    const context = await requireCurrentProjectAccess(user);
    const projectId = context.project.id;
    const [project, tasks, files, memberships, invitations, accessRequests] = await Promise.all([
      prisma.project.findUnique({
        where: { id: projectId },
        select: { updatedAt: true },
      }),
      prisma.task.aggregate({
        where: { projectId },
        _max: { updatedAt: true },
      }),
      prisma.file.aggregate({
        where: { projectId },
        _max: { updatedAt: true },
      }),
      prisma.projectMembership.aggregate({
        where: { projectId },
        _max: { updatedAt: true },
      }),
      prisma.projectInvitation.aggregate({
        where: { projectId },
        _max: { updatedAt: true },
      }),
      prisma.accessRequest.aggregate({
        where: {
          OR: [
            { projectId },
            { projectId: null, status: "pending" },
          ],
        },
        _max: { updatedAt: true },
      }),
    ]);
    const latest = maxDate([
      project?.updatedAt,
      tasks._max.updatedAt,
      files._max.updatedAt,
      memberships._max.updatedAt,
      invitations._max.updatedAt,
      accessRequests._max.updatedAt,
    ]);
    const response = NextResponse.json({
      data: {
        projectId,
        version: latest?.toISOString() ?? context.project.updatedAt,
      },
    });
    response.headers.set("Cache-Control", "no-store");
    return applyProjectSessionProjectId(response, projectId);
  } catch (error) {
    return handleRouteError(error);
  }
}
