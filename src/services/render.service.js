// A screenshot of a design, so an AI can look at what it built (the render_design tool). It needs a browser on the machine that runs the server:
//   RENDER_CHROME_PATH  a Chrome or Chromium to start (found on its own on a Mac or Linux box that has one), or
//   RENDER_BROWSER_WS   the address of a browser already running that speaks the DevTools protocol (a hosted browser service), or
//   the package @sparticuz/chromium installed, for serverless hosts such as Vercel.
// Without any of them the tool says so, and everything else keeps working. The page is untrusted code, so it runs in a fresh context and
// every request it makes is checked: only http(s) to a public address, never localhost, a private network or a cloud metadata address.
import dns from "node:dns/promises";
import net from "node:net";
import { existsSync } from "node:fs";
import { exportComponent } from "@windcraft/core/exporters.js";
import { pageTheme } from "@windcraft/core/theme.js";
import Component from "../models/component.model.js";
import Project from "../models/project.model.js";

export const MAX_HTML = 300_000;
const LOCAL = [process.env.RENDER_CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].filter(Boolean);

const SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
let browserPromise = null, idleTimer = null, running = 0;
const WAITING = [];
const LIMIT = SERVERLESS ? 1 : 2; // a serverless function has little memory: one page at a time
const BUDGET_MS = SERVERLESS ? 45_000 : 60_000; // the whole job, browser start included, must end before the function's own limit (60 s on Vercel)

// A cost guard: an AI in a loop must not be able to burn a host's allowance. Per user, per instance (a function instance forgets when it is recycled).
const WINDOW_MS = 10 * 60_000, PER_WINDOW = Number(process.env.RENDER_LIMIT) || 20;
const spent = new Map();
/** Counts one screenshot for the user, or says when they can ask again. */
export function takeBudget(userId) {
    const now = Date.now();
    const used = (spent.get(String(userId)) || []).filter((t) => now - t < WINDOW_MS);
    if (used.length >= PER_WINDOW) { spent.set(String(userId), used); return { ok: false, retryInMin: Math.max(1, Math.ceil((WINDOW_MS - (now - used[0])) / 60_000)) }; }
    used.push(now);
    spent.set(String(userId), used);
    if (spent.size > 2000) for (const [k, v] of spent) if (!v.some((t) => now - t < WINDOW_MS)) spent.delete(k);
    return { ok: true };
}

export class RenderUnavailable extends Error {}

async function launch() {
    let playwright;
    try { playwright = await import("playwright-core"); } catch { throw new RenderUnavailable("Screenshots are not set up on this server: the playwright-core package is not installed."); }
    const { chromium } = playwright;
    if (process.env.RENDER_BROWSER_WS) return chromium.connectOverCDP(process.env.RENDER_BROWSER_WS);
    let executablePath = LOCAL.find((p) => existsSync(p));
    // software WebGL (SwiftShader), so a design with a 3D model (<wc-model>) draws on a server that has no graphics card
    let args = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
    if (!executablePath) {
        try {
            // @sparticuz/chromium unpacks the system libraries the browser needs (libnss3 and the rest) only when it recognises an AWS Lambda
            // runtime from AWS_EXECUTION_ENV. Vercel runs on Lambda but does not always say so, so say it before the package is loaded.
            if (process.env.VERCEL && !/AWS_Lambda_nodejs\d+\.x/.test(process.env.AWS_EXECUTION_ENV || "")) {
                const major = Number(process.versions.node.split(".")[0]);
                process.env.AWS_EXECUTION_ENV = `AWS_Lambda_nodejs${major >= 22 ? 22 : 20}.x`;
            }
            const sparticuz = (await import("@sparticuz/chromium")).default;
            executablePath = await sparticuz.executablePath();
            args = sparticuz.args;
        } catch { /* not installed */ }
    }
    if (!executablePath) throw new RenderUnavailable("Screenshots are not set up on this server: no browser was found. Set RENDER_CHROME_PATH, RENDER_BROWSER_WS, or install @sparticuz/chromium.");
    // the server keeps its own shutdown: Playwright must not install signal handlers that hold the process open (Chrome ends by itself when its pipe closes)
    return chromium.launch({ executablePath, headless: true, args, handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false });
}

async function browser() {
    clearTimeout(idleTimer);
    if (!browserPromise) browserPromise = launch().catch((e) => { browserPromise = null; throw e; });
    const b = await browserPromise;
    if (!b.isConnected()) { browserPromise = null; return browser(); }
    return b;
}
const idleLater = () => { clearTimeout(idleTimer); idleTimer = setTimeout(async () => { const p = browserPromise; browserPromise = null; if (p) (await p.catch(() => null))?.close().catch(() => {}); }, 60_000); idleTimer.unref?.(); };

/** Whether an address a page asks for is public. */
export function isPrivateAddress(ip) {
    if (net.isIPv6(ip)) {
        const v = ip.toLowerCase();
        if (v === "::1" || v === "::" || v.startsWith("fe80") || v.startsWith("fc") || v.startsWith("fd")) return true;
        const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
        return mapped ? isPrivateAddress(mapped[1]) : false;
    }
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}
const verdicts = new Map();
async function allowed(url) {
    let u;
    try { u = new URL(url); } catch { return false; }
    if (u.protocol === "data:" || u.protocol === "blob:" || u.protocol === "about:") return true;
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const host = u.hostname.replace(/^\[|\]$/g, "");
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) return false;
    if (net.isIP(host)) return !isPrivateAddress(host);
    if (verdicts.has(host)) return verdicts.get(host);
    let ok = false;
    try { const all = await dns.lookup(host, { all: true }); ok = all.length > 0 && all.every((a) => !isPrivateAddress(a.address)); } catch { ok = false; }
    if (verdicts.size > 500) verdicts.clear();
    verdicts.set(host, ok);
    return ok;
}

async function slot() {
    if (running >= LIMIT) await new Promise((r) => WAITING.push(r));
    running++;
}
const release = () => { running--; const next = WAITING.shift(); if (next) next(); };

/** The document to show: a saved design (with its project's theme), or the markup given. */
export async function documentFor(userId, { id, html, dark }) {
    let code = html, title = "Design", theme = null;
    if (id) {
        const c = await Component.findOne({ _id: id, createdBy: userId }).select("title htmlCode project twConfig").lean();
        if (!c) throw new Error("Design not found in your library");
        const proj = c.project ? await Project.findOne({ _id: c.project, owner: userId }).select("theme").lean() : null;
        code = c.htmlCode; title = c.title; theme = pageTheme(proj && proj.theme, c.twConfig);
    }
    if (typeof code !== "string" || !code.trim()) throw new Error("Give an id (a saved design) or html");
    if (code.length > MAX_HTML) throw new Error(`The HTML is too large to render (limit ${MAX_HTML.toLocaleString("en")} characters)`);
    const page = exportComponent(code, "standalone", title, { theme });
    return dark ? page.replace(/<html([^>]*)>/i, (m, attrs) => (/class=/.test(attrs) ? m.replace(/class="/, 'class="dark ') : `<html${attrs} class="dark">`)) : page;
}

/** Takes the screenshot. Resolves to { data (base64), mimeType, width, height, cut }. */
export function renderPage(page, options = {}) {
    let timer;
    const limit = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`took longer than ${Math.round(BUDGET_MS / 1000)} seconds (${SERVERLESS ? "a cold start of the browser can be slow: try again" : "the page may be loading something slow"})`)), BUDGET_MS); });
    return Promise.race([draw(page, options), limit]).finally(() => clearTimeout(timer));
}

async function draw(page, { width = 1280, fullPage = true, maxHeight = 3000, dark = false } = {}) {
    const w = Math.min(2400, Math.max(320, Math.round(Number(width) || 1280)));
    const cap = Math.min(6000, Math.max(300, Math.round(Number(maxHeight) || 3000)));
    await slot();
    let ctx;
    try {
        const b = await browser();
        ctx = await b.newContext({ viewport: { width: w, height: 800 }, deviceScaleFactor: 1, colorScheme: dark ? "dark" : "light", javaScriptEnabled: true, acceptDownloads: false, serviceWorkers: "block" });
        await ctx.route("**/*", async (route) => ((await allowed(route.request().url())) ? route.continue() : route.abort("blockedbyclient")));
        const tab = await ctx.newPage();
        await tab.setContent(page, { waitUntil: "load", timeout: SERVERLESS ? 15_000 : 20_000 });
        // Tailwind's play script writes its CSS a moment after load: wait until a stylesheet it made exists and has stopped growing
        await tab.waitForFunction(() => {
            const tw = !!document.querySelector('script[src*="tailwindcss"]');
            if (!tw) return true;
            const css = [...document.querySelectorAll("style")].map((s) => s.textContent).join("");
            const now = css.length;
            const last = window.__wcLast; window.__wcLast = now;
            return /tailwindcss v\d/.test(css) && now > 0 && last === now;
        }, null, { timeout: 12_000, polling: 200 }).catch(() => {});
        // 3D models (<wc-model>) fetch Three.js and the file after the page has loaded: wait until each has drawn (or failed), but not for long
        await tab.waitForFunction(() => [...document.querySelectorAll("wc-model")].every((m) => !m.getAttribute("src") || m._ground || (m._err && !m._err.hidden)), null, { timeout: 8_000, polling: 150 }).catch(() => {});
        await tab.waitForTimeout(250);
        const full = await tab.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
        const height = fullPage ? Math.min(full, cap) : 800;
        const buf = await tab.screenshot({ type: "jpeg", quality: 82, clip: { x: 0, y: 0, width: w, height }, fullPage: fullPage && height > 800 });
        return { data: buf.toString("base64"), mimeType: "image/jpeg", width: w, height, cut: fullPage && full > cap ? full : 0 };
    } finally {
        if (ctx) await ctx.close().catch(() => {});
        release();
        idleLater();
    }
}

export async function closeRenderer() { clearTimeout(idleTimer); const p = browserPromise; browserPromise = null; if (p) (await p.catch(() => null))?.close().catch(() => {}); }

/** For the Connect page's test: starts the browser and draws a tiny page. Never throws. */
export async function checkRenderer() {
    const t0 = Date.now();
    try {
        const shot = await renderPage("<!doctype html><html><body style=\"margin:0;background:#4f46e5\"><div style=\"height:40px\"></div></body></html>", { width: 320, fullPage: true, maxHeight: 300 });
        return { ok: shot.data.length > 100, ms: Date.now() - t0, where: process.env.RENDER_BROWSER_WS ? "a browser service" : SERVERLESS ? "this serverless function" : "this server" };
    } catch (e) {
        return { ok: false, ms: Date.now() - t0, unavailable: e instanceof RenderUnavailable, error: shortError(e) };
    }
}

/** A browser that fails to start prints a wall of launch flags; what matters is the first line, the lines the browser itself printed, and where it ran. */
function shortError(e) {
    const lines = String(e && e.message).split("\n");
    const own = lines.filter((l) => /\[err\]|error while loading|cannot open|No such file|Permission denied|sandbox/i.test(l)).map((l) => l.replace(/^\s*-?\s*/, "").replace(/\[pid=\d+\]/, "").trim()).slice(0, 3);
    const where = SERVERLESS ? ` (node ${process.versions.node}, AWS_EXECUTION_ENV=${process.env.AWS_EXECUTION_ENV || "unset"}, LD_LIBRARY_PATH=${process.env.LD_LIBRARY_PATH || "unset"}, libs extracted: ${existsSync("/tmp/al2023/lib") || existsSync("/tmp/al2/lib")})` : "";
    return `${lines[0].slice(0, 200)}${own.length ? ` ${own.join(" ")}` : ""}${where}`.slice(0, 700);
}
