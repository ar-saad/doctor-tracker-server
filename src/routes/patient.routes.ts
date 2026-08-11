import { Router } from "express";
import {
  deletePatient,
  getPatientById,
  getPatientFilterOptions,
  getPatients,
  updatePatient,
} from "../controllers/patientController.js";
import { validate } from "../middleware/validate.js";
import { updatePatientSchema } from "../schemas/patientSchema.js";

const router = Router();

// Literal paths before /:id, same rule as the doctor routes.
router.get("/meta/filters", getPatientFilterOptions);

// No POST here by design: a patient cannot exist without a doctor, so creation
// lives at POST /doctors/:id/patients where the doctor comes from the URL.
router.get("/", getPatients);

router
  .route("/:id")
  .get(getPatientById)
  .put(validate(updatePatientSchema), updatePatient)
  .delete(deletePatient);

export default router;
