import { Router } from "express";
import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import * as userService from "../services/user.service.js";
import { publicBase } from "../utils/publicUrl.js";

const router = Router();

/** A same-site path to go back to after signing in, or "" (rejects //host and /\host, which browsers read as another site). */
export const safeReturnTo = (value) => {
    const s = String(value || "");
    return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s.slice(0, 4000) : "";
};
/** The path with returnTo encoded as ONE query value: an /oauth/authorize address has its own & and = that must not split. */
export const withReturnTo = (path, returnTo) => (returnTo ? `${path}?returnTo=${encodeURIComponent(returnTo)}` : path);
const authLinks = (req) => {
    const returnTo = safeReturnTo(req.query.returnTo);
    return { returnTo, googleHref: withReturnTo("/auth/google", returnTo), signInHref: withReturnTo("/auth/sign-in", returnTo), signUpHref: withReturnTo("/auth/sign-up", returnTo) };
};

router.get("/sign-in", (req, res) => {
    return res.render("auth/signin", { layout: 'auth', title: 'Sign In', googleOn: googleOn(), error: req.query.error ? String(req.query.error).slice(0, 200) : "", ...authLinks(req) });
});

// Sign in with Google (needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)
const googleClient = (req) =>
    new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, `${publicBase(req)}/auth/google/callback`);
const googleOn = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
// Keeps where the user was going, so a failed Google try can be retried without losing an app's authorization request.
const failBack = (res, msg, returnTo = "") => res.redirect(`/auth/sign-in?error=${encodeURIComponent(msg)}${returnTo && returnTo !== "/" ? `&returnTo=${encodeURIComponent(returnTo)}` : ""}`);

router.get("/google", (req, res) => {
    if (!googleOn()) return failBack(res, "Google sign-in isn't set up on this server.");
    const state = crypto.randomBytes(16).toString("hex");
    req.session.googleAuth = { state, returnTo: safeReturnTo(req.query.returnTo) || "/" };
    const url = googleClient(req).generateAuthUrl({ scope: ["openid", "email", "profile"], state, prompt: "select_account" });
    req.session.save(() => res.redirect(url));
});

router.get("/google/callback", async (req, res) => {
    const saved = req.session.googleAuth;
    delete req.session.googleAuth;
    try {
        if (!googleOn()) return failBack(res, "Google sign-in isn't set up on this server.");
        if (req.query.error) return failBack(res, "Google sign-in was cancelled.", saved?.returnTo);
        if (!saved || !req.query.state || req.query.state !== saved.state || !req.query.code) return failBack(res, "Google sign-in expired. Try again.", saved?.returnTo);

        const client = googleClient(req);
        const { tokens } = await client.getToken(String(req.query.code));
        const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID });
        const info = ticket.getPayload();
        if (!info?.email || !info.email_verified) return failBack(res, "Your Google email isn't verified.");

        const email = info.email.toLowerCase();
        let user = await userService.getUserByEmail(email);
        if (!user) {
            user = await userService.createUser({ name: info.name || email.split("@")[0], email, googleId: info.sub });
        } else if (!user.googleId) {
            user.googleId = info.sub; // the same verified email: link it to the existing account
            await user.save();
        } else if (user.googleId !== info.sub) {
            return failBack(res, "That email belongs to a different Google account.");
        }

        req.session.user = { id: user._id, name: user.name, email: user.email, llmEnabled: user.llmSettings?.enabled || false };
        return req.session.save(() => res.redirect(saved.returnTo || "/"));
    } catch (err) {
        console.error("google sign-in:", err.message);
        return failBack(res, "Google sign-in failed. Try again.", saved?.returnTo);
    }
});

// Sign Out
router.get('/sign-out', (req, res) => {
    return req.session.destroy(() => {
        res.clearCookie('TailwindUISession');
        res.redirect('/auth/sign-in');
    });
});

// Sign Up
router.get("/sign-up", (req, res) => {
    return res.render("auth/signup", { layout: 'auth', title: "Sign Up", googleOn: googleOn(), ...authLinks(req) });
});

// OTP Verification
router.get("/verify-otp", (req, res) => {
    return res.render("auth/verification", { layout: 'auth', title: "OTP Verification" });
});

export default router;
