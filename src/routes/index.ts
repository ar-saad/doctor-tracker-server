import { Router } from "express";
import healthRoutes from "./health.routes.js";
import authRoutes from "./auth.routes.js";

const router = Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
// Everything below this line mounts behind the `auth` middleware.
// Phase 3: /doctors · Phase 4: /patients · Phase 5: /analytics

export default router;
