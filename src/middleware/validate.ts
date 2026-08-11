import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";

/**
 * Validation middleware factory. Runs BEFORE the controller, so a controller
 * never sees unvalidated input.
 *
 * safeParse (not parse) so nothing throws here; the ZodError is handed to
 * next() and errorHandler.ts renders it as a 400 "path: message". One place
 * owns the error shape.
 *
 * The parsed result replaces req.body: unknown keys are stripped and coercions
 * are applied, so controllers get exactly the schema's output type.
 */
export const validate =
  (schema: ZodType) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      next(result.error);
      return;
    }

    req.body = result.data;
    next();
  };
