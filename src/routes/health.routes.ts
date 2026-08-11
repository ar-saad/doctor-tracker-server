import { Router } from "express";
import { sendSuccess } from "../utils/response.js";

const router = Router();

// GET /api/health — also used to warm up the Render free-tier cold start.
router.get("/", (_req, res) => {
  sendSuccess(res, "ok");
});

export default router;
