import { describe, expect, it, vi } from "vitest";
import { AppError, statusForCode, toErrorBody } from "@/modules/shared/errors";

describe("AppError", () => {
  it("maps codes to HTTP statuses", () => {
    expect(statusForCode("UNAUTHORIZED")).toBe(401);
    expect(statusForCode("PAYLOAD_TOO_LARGE")).toBe(413);
    expect(statusForCode("INTERNAL")).toBe(500);
    expect(new AppError("FORBIDDEN", "x").status).toBe(403);
  });
});

describe("toErrorBody", () => {
  it("passes AppError codes through", () => {
    const res = toErrorBody(new AppError("NOT_FOUND", "Course not found"));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(res.body.error.message).toBe("Course not found");
  });

  it("hides internals of unknown errors and logs server-side", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = toErrorBody(new Error("stack traces are secrets"));
    expect(res.status).toBe(500);
    expect(res.body.error.message).toBe("Something went wrong. Please try again.");
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});
