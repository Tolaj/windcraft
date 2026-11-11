// What the end-to-end tests need: a throwaway MongoDB, the real app on a free port, a browser, and the network (the Tailwind CDN and jsdelivr).
// They are skipped, with the reason, when MongoDB (`mongod` on the PATH) or Chrome is missing. Run them with `npm run e2e`.
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import bcrypt from "bcrypt";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => resolve(port)); }); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, label, ms = 30000) { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return; } catch { /* retry */ } await wait(250); } throw new Error(`Timed out waiting for ${label}`); }

/** Why the tests can't run here, or "" when they can. */
export function missingPrerequisite() {
    if (spawnSync("mongod", ["--version"]).status !== 0) return "mongod is not on the PATH";
    if (!chromePath()) return "Chrome was not found (set CHROME_PATH)";
    return "";
}
export function chromePath() {
    const c = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].filter(Boolean);
    return c.find((p) => existsSync(p)) || "";
}

/** Starts MongoDB and the app against it. Returns { base, mongoUri, stop() }. */
export async function startStack() {
    const dir = mkdtempSync(path.join(tmpdir(), "wc-e2e-"));
    const mongoPort = await freePort(), appPort = await freePort();
    const mongod = spawn("mongod", ["--dbpath", dir, "--port", String(mongoPort), "--bind_ip", "127.0.0.1"], { stdio: "ignore" });
    const mongoUri = `mongodb://127.0.0.1:${mongoPort}/e2e`;
    await waitFor(async () => { await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 800 }); return true; }, "MongoDB");
    await mongoose.connection.dropDatabase();
    const app = spawn("node", ["src/server.js"], { cwd: ROOT, env: { ...process.env, MONGO_URI: mongoUri, PORT: String(appPort), SESSION_SECRET: process.env.SESSION_SECRET || "e2e-secret" }, stdio: process.env.E2E_VERBOSE ? "inherit" : "ignore" });
    const base = `http://127.0.0.1:${appPort}`;
    const cleanup = async () => { app.kill(); mongod.kill(); await mongoose.disconnect().catch(() => {}); await wait(300); rmSync(dir, { recursive: true, force: true }); };
    try { await waitFor(async () => (await fetch(`${base}/auth/sign-in`)).status < 500, "the app", 90000); }
    catch (e) { await cleanup(); throw e; } // never leave a database or a server running behind a failed start
    return {
        base, mongoUri,
        stop: cleanup,
    };
}

/** A user with a project holding one page whose HTML uses a project colour and a page colour. */
export async function seed() {
    const { default: User } = await import("../src/models/user.model.js");
    const { default: Project } = await import("../src/models/project.model.js");
    const { default: Component } = await import("../src/models/component.model.js");
    const user = await User.create({ name: "E2E", email: "e2e@example.test", password: await bcrypt.hash("pw-e2e-1234", 8) });
    const project = await Project.create({ owner: user._id, name: "E2E project", shareToken: "a".repeat(32) });
    const html = '<div class="p-6"><button id="a" class="bg-pg text-white p-2">page colour</button> <button id="b" class="bg-proj text-white p-2">project colour</button></div>';
    const page = await Component.create({ title: "Home", htmlCode: html, category: "landing-page", description: "x", createdBy: user._id, project: project._id, kind: "page", version: 1 });
    // a part saved from the page: it lives in the project's Components tab, not in the editor
    await Component.create({ title: "Home: Header", htmlCode: `<header id="s">header</header>`, category: "landing-page", description: "x", createdBy: user._id, project: project._id, kind: "section", parent: page._id, version: 1 });
    return { project: String(project._id), page: String(page._id), token: "a".repeat(32), email: "e2e@example.test", password: "pw-e2e-1234" };
}

export const PROJECT_FILE = `module.exports = {\n  theme: { extend: { colors: { proj: "#0f766e" } } },\n  plugins: [require("@tailwindcss/typography"), require("preline/plugin")],\n};\n`;
export const PAGE_FILE = `module.exports = {\n  theme: { extend: { colors: { pg: "#7c3aed" } } },\n};\n`;
export const colourOf = (frame, id) => frame.evaluate((i) => { const e = document.getElementById(i); return e ? getComputedStyle(e).backgroundColor : null; }, id);
