import { z } from "zod";
import { GENDERS } from "../models/Patient.js";

/**
 * Defined in Phase 3 because POST /doctors/:id/patients needs it; Phase 4
 * imports the same schema for the standalone /patients routes. GENDERS comes
 * from the model so the enum cannot drift from the Mongoose validator.
 *
 * `doctor` is deliberately absent: it comes from the :id path parameter, never
 * from the body, so a caller cannot file a patient under a different doctor
 * than the URL they posted to.
 */
export const createPatientSchema = z.object({
  name: z.string("Name is required").trim().min(1, "Name is required"),
  // Strict number, not z.coerce: coercion turns "" and null into 0, which would
  // silently store a newborn. The client sends JSON, so it can send a number.
  // The error callback keeps "missing" and "wrong type" from sharing a message.
  age: z
    .number({
      error: (issue) =>
        issue.input === undefined ? "Age is required" : "Age must be a number",
    })
    .int("Age must be a whole number")
    .min(0, "Age cannot be negative")
    .max(130, "Age must be realistic"),
  gender: z.enum(GENDERS, "Gender must be one of: male, female, other"),
  phone: z
    .string("Phone is required")
    .trim()
    .min(1, "Phone is required")
    .regex(/^[\d\s+()-]{7,20}$/, "Phone must be a valid phone number"),
  condition: z
    .string("Condition is required")
    .trim()
    .min(1, "Condition is required"),
});

export type CreatePatientInput = z.infer<typeof createPatientSchema>;
