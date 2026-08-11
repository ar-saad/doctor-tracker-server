import { Router } from "express";
import healthRoutes from "./health.routes.js";
import authRoutes from "./auth.routes.js";
import doctorRoutes from "./doctor.routes.js";
import patientRoutes from "./patient.routes.js";
import analyticsRoutes from "./analytics.routes.js";
import { auth } from "../middleware/auth.js";

const router = Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);

// Everything below this line mounts behind the `auth` middleware: the gate is
// applied once, at mount time, so no individual route can forget it.
router.use("/doctors", auth, doctorRoutes);
router.use("/patients", auth, patientRoutes);
router.use("/analytics", auth, analyticsRoutes);

export default router;
