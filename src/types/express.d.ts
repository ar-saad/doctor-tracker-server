/**
 * Declaration merging so `req.user` exists on Express's Request type after the
 * auth middleware has run. Done once, here — controllers must never reach for
 * `(req as any).user`.
 *
 * tsconfig's include is ["src/**\/*.ts"], which already matches .d.ts files,
 * so no tsconfig change is needed.
 */
declare global {
  namespace Express {
    interface Request {
      user?: { id: string };
    }
  }
}

export {};
