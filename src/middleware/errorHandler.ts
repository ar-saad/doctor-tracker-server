import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { ZodError } from "zod";
import { ApiError } from "../utils/ApiError.js";
import { isProduction } from "../config/env.js";

interface NormalizedError {
  statusCode: number;
  message: string;
}

function hasCode(error: unknown, code: number): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

function duplicateKeyMessage(error: unknown): string {
  const keyValue = (error as { keyValue?: Record<string, unknown> }).keyValue;
  const field = keyValue ? Object.keys(keyValue)[0] : undefined;
  return field
    ? `A record with this ${field} already exists`
    : "Duplicate value violates a unique constraint";
}

function normalize(error: unknown): NormalizedError {
  if (error instanceof ApiError) {
    return { statusCode: error.statusCode, message: error.message };
  }

  // Malformed JSON body -> express.json() throws a SyntaxError with status 400
  if (
    error instanceof SyntaxError &&
    "body" in error &&
    (error as { status?: number }).status === 400
  ) {
    return { statusCode: 400, message: "Malformed JSON in request body" };
  }

  if (error instanceof ZodError) {
    const first = error.issues[0];
    const path = first?.path.join(".");
    return {
      statusCode: 400,
      message: first
        ? `${path ? `${path}: ` : ""}${first.message}`
        : "Validation failed",
    };
  }

  if (error instanceof mongoose.Error.ValidationError) {
    const first = Object.values(error.errors)[0];
    return { statusCode: 400, message: first?.message ?? "Validation failed" };
  }

  if (error instanceof mongoose.Error.CastError) {
    return { statusCode: 400, message: `Invalid ${error.path}: ${error.value}` };
  }

  if (hasCode(error, 11000)) {
    return { statusCode: 409, message: duplicateKeyMessage(error) };
  }

  if (error instanceof Error) {
    switch (error.name) {
      case "JsonWebTokenError":
        return { statusCode: 401, message: "Invalid authentication token" };
      case "TokenExpiredError":
        return { statusCode: 401, message: "Session expired, please log in again" };
      default:
        break;
    }

    return {
      statusCode: 500,
      message: isProduction ? "Something went wrong" : error.message,
    };
  }

  return { statusCode: 500, message: "Something went wrong" };
}

/**
 * Central error handler. Must be registered LAST in app.ts.
 * Express 5 forwards rejected promises from async handlers here automatically.
 */
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  const { statusCode, message } = normalize(error);

  if (statusCode >= 500) {
    console.error(error);
  }

  res.status(statusCode).json({ success: false, message });
}
