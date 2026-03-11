export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

export function badRequest(message: string, code = "BAD_REQUEST") {
  return new AppError(400, code, message);
}

export function unauthorized(message = "로그인이 필요합니다.", code = "UNAUTHORIZED") {
  return new AppError(401, code, message);
}

export function forbidden(message = "권한이 없습니다.", code = "FORBIDDEN") {
  return new AppError(403, code, message);
}

export function notFound(message: string, code = "NOT_FOUND") {
  return new AppError(404, code, message);
}

export function conflict(message: string, code = "CONFLICT") {
  return new AppError(409, code, message);
}

export function unprocessable(message: string, code = "UNPROCESSABLE_ENTITY") {
  return new AppError(422, code, message);
}

export function serviceUnavailable(message: string, code = "SERVICE_UNAVAILABLE") {
  return new AppError(503, code, message);
}