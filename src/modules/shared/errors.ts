/**
 * Typed application errors shared by every domain module.
 * Route handlers convert thrown errors with `toErrorResponse`.
 */

export const APP_ERROR_CODES = [
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "PAYLOAD_TOO_LARGE",
  "RATE_LIMITED",
  "VALIDATION_FAILED",
  "INTERNAL",
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  VALIDATION_FAILED: 422,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;

  constructor(code: AppErrorCode, message: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
  }
}

export function statusForCode(code: AppErrorCode): number {
  return STATUS_BY_CODE[code];
}

export type ErrorBody = { error: { code: AppErrorCode; message: string } };

/** Maps any thrown value to a JSON Response; internal errors are logged, not leaked. */
export function toErrorBody(err: unknown): { status: number; body: ErrorBody } {
  if (err instanceof AppError) {
    return {
      status: err.status,
      body: { error: { code: err.code, message: err.message } },
    };
  }
  console.error("[unhandled]", err);
  return {
    status: 500,
    body: { error: { code: "INTERNAL", message: "Something went wrong. Please try again." } },
  };
}
