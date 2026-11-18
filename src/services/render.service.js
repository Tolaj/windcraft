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

let browserPromise = null, idleTimer = null, running = 0;
const WAITING = [];
const LIMIT = 2;

export class RenderUnavailable extends Error {}

async function launch() {
    let playwright;
    try { playwright = await import("playwright-core"); } catch { throw new RenderUnavailable("Screenshots are not set up on this server: the playwright-core package is not installed."); }
    const { chromium } = playwright;
    if (process.env.RENDER_BROWSER_WS) return chromium.connectOverCDP(process.env.RENDER_BROWSER_WS);
    let executablePath = LOCAL.find((p) => existsSync(p));
    let args = [];
    if (!executablePath) {
        try {
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
export async function renderPage(page, { width = 1280, fullPage = true, maxHeight = 3000, dark = false } = {}) {
    const w = Math.min(2400, Math.max(320, Math.round(Number(width) || 1280)));
    const cap = Math.min(6000, Math.max(300, Math.round(Number(maxHeight) || 3000)));
    await slot();
    let ctx;
    try {
        const b = await browser();
        ctx = await b.newContext({ viewport: { width: w, height: 800 }, deviceScaleFactor: 1, colorScheme: dark ? "dark" : "light", javaScriptEnabled: true, acceptDownloads: false, serviceWorkers: "block" });
        await ctx.route("**/*", async (route) => ((await allowed(route.request().url())) ? route.continue() : route.abort("blockedbyclient")));
        const tab = await ctx.newPage();
        await tab.setContent(page, { waitUntil: "load", timeout: 20_000 });
        // Tailwind's play script writes its CSS a moment after load: wait until a stylesheet it made exists and has stopped growing
        await tab.waitForFunction(() => {
            const tw = !!document.querySelector('script[src*="tailwindcss"]');
            if (!tw) return true;
            const css = [...document.querySelectorAll("style")].map((s) => s.textContent).join("");
            const now = css.length;
            const last = window.__wcLast; window.__wcLast = now;
            return /tailwindcss v\d/.test(css) && now > 0 && last === now;
        }, null, { timeout: 12_000, polling: 200 }).catch(() => {});
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
