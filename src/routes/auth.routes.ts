import { Router } from "express";
import { login, logout, me } from "../controllers/authController.js";
import { auth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { loginSchema } from "../schemas/authSchema.js";

const router = Router();

router.post("/login", validate(loginSchema), login);
// Public: clearing a cookie needs no valid token, and logging out with an
// expired one should still work rather than 401.
router.post("/logout", logout);
router.get("/me", auth, me);

export default router;
