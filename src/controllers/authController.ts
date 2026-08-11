import type { CookieOptions, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env, isProduction } from "../config/env.js";
import { User } from "../models/User.js";
import { ApiError } from "../utils/ApiError.js";
import { sendSuccess } from "../utils/response.js";
import type { LoginInput } from "../schemas/authSchema.js";

const TOKEN_COOKIE = "token";
const TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * sameSite: "lax" is safe here because the browser only ever talks to the
 * Next.js origin — its rewrites proxy /api/* to this server, so the cookie is
 * first-party. No SameSite=None, no third-party cookie blocking in Safari.
 * clearCookie must be given the same options (minus maxAge) or the browser
 * will not match the cookie it is meant to remove.
 */
const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax",
  path: "/",
};

function signToken(userId: string): string {
  return jwt.sign({ id: userId }, env.JWT_SECRET, {
    // @types/jsonwebtoken types expiresIn as number | StringValue (a template
    // literal type like `${number}d`); a plain string is not assignable, so the
    // cast belongs here rather than in the Zod env schema.
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as LoginInput;

  // password is select: false on the model — without the explicit +password
  // bcrypt.compare would receive undefined and every login would fail.
  const user = await User.findOne({ email: email.toLowerCase() }).select(
    "+password",
  );

  // Same message for an unknown email and a wrong password: never leak which
  // of the two was wrong.
  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw ApiError.unauthorized("Invalid credentials");
  }

  res.cookie(TOKEN_COOKIE, signToken(user._id.toString()), {
    ...cookieOptions,
    maxAge: TOKEN_MAX_AGE_MS,
  });

  // The token travels in the httpOnly cookie only — never in the body, and
  // never the password field.
  sendSuccess(res, {
    user: { _id: user._id.toString(), name: user.name, email: user.email },
  });
}

export function logout(_req: Request, res: Response): void {
  res.clearCookie(TOKEN_COOKIE, cookieOptions);
  sendSuccess(res, null);
}

export async function me(req: Request, res: Response): Promise<void> {
  // Runs behind the auth middleware, so req.user is set. No .select needed:
  // password is select: false by default on the model.
  const user = await User.findById(req.user?.id);

  if (!user) {
    throw ApiError.unauthorized("Not authorized");
  }

  sendSuccess(res, {
    user: { _id: user._id.toString(), name: user.name, email: user.email },
  });
}
