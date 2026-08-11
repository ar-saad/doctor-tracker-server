import { Router } from "express";
import { getSummary } from "../controllers/analyticsController.js";

const router = Router();

// Read-only, so no validate() — there is no body and no query param to check.
router.get("/summary", getSummary);

export default router;
