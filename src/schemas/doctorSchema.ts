import { z } from "zod";

/**
 * The message on z.string(...) covers a missing or wrong-typed field; the one
 * on .min(1) covers a present-but-empty one. Both are needed — without the
 * first, an omitted field returns Zod's raw "expected string, received
 * undefined", which is not something to show a user.
 */
const requiredText = (label: string) =>
  z.string(`${label} is required`).trim().min(1, `${label} is required`);

const phone = z
  .string("Phone is required")
  .trim()
  .min(1, "Phone is required")
  .regex(/^[\d\s+()-]{7,20}$/, "Phone must be a valid phone number");

export const createDoctorSchema = z.object({
  name: requiredText("Name"),
  specialization: requiredText("Specialization"),
  hospital: requiredText("Hospital"),
  phone,
  email: z.email("A valid email address is required"),
});

/**
 * PUT accepts a subset, but not an empty object — {} would issue a pointless
 * write and return 200 as if something had changed.
 */
export const updateDoctorSchema = createDoctorSchema
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one field must be provided",
  });

export type CreateDoctorInput = z.infer<typeof createDoctorSchema>;
export type UpdateDoctorInput = z.infer<typeof updateDoctorSchema>;
