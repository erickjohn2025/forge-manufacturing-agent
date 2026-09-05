import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function apiError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Invalid request", issues: error.issues }, { status: 400 });
  }
  const safeError = error instanceof Error
    ? { name: error.name, message: error.message, code: (error as Error & { code?: string }).code }
    : { message: "Unknown error" };
  console.error("Unhandled API error", safeError);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
