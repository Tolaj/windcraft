import { Router } from "express";
import { createUser, userSignIn, getLlmSettings, updateLlmSettings, createApiToken, revokeApiToken } from "../controllers/user.controller.js";
import { limit } from "../utils/rateLimit.js";
import * as userService from "../services/user.service.js";
import { ensureAuthAPI } from "../middlewares/auth.js";

const router = Router();

router.route("/").post(createUser);
// the sign-in page asks whether an email has an account before it shows the password step
router.post("/check-email", limit("check-email", 30, 10 * 60 * 1000), async (req, res) => {
    try {
        const email = String(req.body?.email || "").trim().toLowerCase();
        if (!email) return res.status(400).json({ message: "Enter your email." });
        const user = await userService.getUserByEmail(email);
        return res.json({ exists: Boolean(user), google: Boolean(user && !user.password) });
    } catch (error) {
        return res.status(500).json({ message: "Server error. Try again." });
    }
});

router.route("/sign-in").post(userSignIn);
router.route("/settings/llm").get(ensureAuthAPI, getLlmSettings).put(ensureAuthAPI, updateLlmSettings);

router.post("/api-token", ensureAuthAPI, createApiToken);
router.delete("/api-token", ensureAuthAPI, revokeApiToken);

export default router;
