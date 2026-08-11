import { z } from "zod";

/**
 * Schemas are the single source of truth for both validation and types —
 * controllers consume z.infer output rather than a hand-written duplicate,
 * so the two can never drift.
 */
export const loginSchema = z.object({
  email: z.email("A valid email address is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export type LoginInput = z.infer<typeof loginSchema>;
