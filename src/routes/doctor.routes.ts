import { Router } from "express";
import {
  addPatientToDoctor,
  createDoctor,
  deleteDoctor,
  getDoctorById,
  getDoctorFilterOptions,
  getDoctorPatients,
  getDoctors,
  updateDoctor,
} from "../controllers/doctorController.js";
import { validate } from "../middleware/validate.js";
import {
  createDoctorSchema,
  updateDoctorSchema,
} from "../schemas/doctorSchema.js";
import { createPatientSchema } from "../schemas/patientSchema.js";

const router = Router();

// Registered before /:id so the literal path is never read as an id. It would
// not collide today (different segment counts), but the ordering is the rule.
router.get("/meta/filters", getDoctorFilterOptions);

router.route("/").get(getDoctors).post(validate(createDoctorSchema), createDoctor);

router
  .route("/:id")
  .get(getDoctorById)
  .put(validate(updateDoctorSchema), updateDoctor)
  .delete(deleteDoctor);

router
  .route("/:id/patients")
  .get(getDoctorPatients)
  .post(validate(createPatientSchema), addPatientToDoctor);

export default router;
