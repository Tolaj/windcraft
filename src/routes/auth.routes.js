import { Router } from "express";
import crypto from "crypto";
import { google } from "googleapis";
import * as userService from "../services/user.service.js";
import { publicBase } from "../utils/publicUrl.js";

const router = Router();

router.get("/sign-in", (req, res) => {
    return res.render("auth/signin", { layout: 'auth', title: 'Sign In', googleOn: googleOn(), error: req.query.error ? String(req.query.error).slice(0, 200) : "", returnTo: String(req.query.returnTo || "") });
});

// Sign in with Google (needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)
const googleClient = (req) =>
    new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, `${publicBase(req)}/auth/google/callback`);
const googleOn = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const failBack = (res, msg) => res.redirect(`/auth/sign-in?error=${encodeURIComponent(msg)}`);

router.get("/google", (req, res) => {
    if (!googleOn()) return failBack(res, "Google sign-in isn't set up on this server.");
    const state = crypto.randomBytes(16).toString("hex");
    const returnTo = String(req.query.returnTo || "");
    req.session.googleAuth = { state, returnTo: returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/" };
    const url = googleClient(req).generateAuthUrl({ scope: ["openid", "email", "profile"], state, prompt: "select_account" });
    req.session.save(() => res.redirect(url));
});

router.get("/google/callback", async (req, res) => {
    const saved = req.session.googleAuth;
    delete req.session.googleAuth;
    try {
        if (!googleOn()) return failBack(res, "Google sign-in isn't set up on this server.");
        if (req.query.error) return failBack(res, "Google sign-in was cancelled.");
        if (!saved || !req.query.state || req.query.state !== saved.state || !req.query.code) return failBack(res, "Google sign-in expired. Try again.");

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
        return failBack(res, "Google sign-in failed. Try again.");
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
    return res.render("auth/signup", { layout: 'auth', title: "Sign Up", googleOn: googleOn() });
});

// OTP Verification
router.get("/verify-otp", (req, res) => {
    return res.render("auth/verification", { layout: 'auth', title: "OTP Verification" });
});

export default router;
