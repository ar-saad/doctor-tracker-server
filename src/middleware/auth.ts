import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";

interface TokenPayload {
  id: string;
}

/**
 * Gate for every route except /auth/login and /auth/logout.
 *
 * jwt.verify is deliberately NOT wrapped in try/catch: a tampered token throws
 * JsonWebTokenError and an expired one throws TokenExpiredError, and
 * errorHandler.ts already maps both to a 401. Express catches the synchronous
 * throw and routes it there.
 */
export function auth(req: Request, _res: Response, next: NextFunction): void {
  const token: unknown = req.cookies?.token;

  if (typeof token !== "string" || token.length === 0) {
    throw ApiError.unauthorized("Not authorized");
  }

  const decoded = jwt.verify(token, env.JWT_SECRET) as TokenPayload;

  req.user = { id: decoded.id };
  next();
}
