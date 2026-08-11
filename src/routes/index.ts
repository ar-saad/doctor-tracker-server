import { Router } from "express";
import healthRoutes from "./health.routes.js";
import authRoutes from "./auth.routes.js";
import doctorRoutes from "./doctor.routes.js";
import { auth } from "../middleware/auth.js";

const router = Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);

// Everything below this line mounts behind the `auth` middleware: the gate is
// applied once, at mount time, so no individual route can forget it.
// Phase 4: /patients · Phase 5: /analytics
router.use("/doctors", auth, doctorRoutes);

export default router;
