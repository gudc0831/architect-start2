import { NextResponse } from "next/server";
import { AppError } from "@/lib/api/errors";

function getErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: "code" in error ? (error as { code?: unknown }).code : undefined,
      clientVersion: "clientVersion" in error ? (error as { clientVersion?: unknown }).clientVersion : undefined,
      meta: "meta" in error ? (error as { meta?: unknown }).meta : undefined,
    };
  }

  return { value: error };
}

export function handleRouteError(error: unknown) {
  if (error instanceof AppError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
        },
      },
      { status: error.status },
    );
  }

  console.error("[route-error] unexpected error", getErrorDetails(error));

  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Unexpected server error",
      },
    },
    { status: 500 },
  );
}
