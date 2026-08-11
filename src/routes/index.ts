import { Router } from "express";
import healthRoutes from "./health.routes.js";

const router = Router();

router.use("/health", healthRoutes);
// Phase 2: /auth · Phase 3: /doctors · Phase 4: /patients · Phase 5: /analytics

export default router;
