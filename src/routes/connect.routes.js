import express from "express";
import Component from "../models/component.model.js";
import User from "../models/user.model.js";
import { createZip } from "../utils/zip.js";
import { publicBase } from "../utils/publicUrl.js";
import { connectedApps, revokeClientForUser, issueTokenPair } from "../services/oauth.service.js";
import FigmaToken from "../models/figmaToken.model.js";
import OAuthClient from "../models/oauthClient.model.js";
import OAuthToken from "../models/oauthToken.model.js";
import { TOOLS } from "../mcp/tools.js";
import AiActivity from "../models/aiActivity.model.js";
import { revertDesign, RevertError } from "../services/change.service.js";
import { checkRenderer } from "../services/render.service.js";
import { buildClaudeCodeKit, buildDesignPack, mcpJson, cursorJson, cursorInstallLink, claudeMdSnippet, skillMd, TOKEN_ENV } from "../services/kit.service.js";

const router = express.Router();

const TOOL_BLURBS = {
    get_design_guide: "Reads your design guide: tokens, conventions and an index of your designs. Claude starts here.",
    get_context: "Shows the active project, its pages and their versions.",
    search_components: "Searches your library by keyword or tag and returns short cards.",
    get_component: "Gets a design's code, as HTML, React, Vue or Svelte.",
    get_design_spec: "Reads a design as structured JSON that is easy to edit precisely.",
    apply_design_patch: "Changes a saved design with small edits, leaving the rest of the code as it was.",
    save_component: "Saves a new component to your library.",
    save_design: "Saves one finished screen, or its next version.",
    save_pages: "Saves several pages in one project at once.",
    get_project: "Reads one project: its pages, groups and settings.",
    set_active_project: "Chooses which project new designs are saved to.",
    list_projects: "Lists your projects.",
    render_design: "Takes a screenshot of a design so the AI can look at its own work and fix it.",
    search: "Searches your designs in the shape ChatGPT expects (use with fetch).",
    fetch: "Gets one design by the id that search returned (for ChatGPT).",
    revert_design: "Undoes the latest AI change to a design (never one of your own edits).",
    list_tags: "Lists the tags used in your library.",
    create_project: "Creates a project.",
    update_project: "Changes a project's name, description or settings.",
    arrange_project: "Tidies a project's board: sets each design's group and puts the frames back in automatic layout.",
};
const WRITE_TOOLS = new Set(["apply_design_patch", "save_component", "save_design", "save_pages", "create_project", "update_project", "arrange_project", "set_active_project", "revert_design"]);
const firstSentence = (t = "") => (t.split(/(?<=[.!?])\s/)[0] || "").slice(0, 160);
const baseUrl = publicBase;

const ago = (d) => {
    const m = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000));
    if (m < 1) return "just now";
    if (m < 60) return `${m} min ago`;
    if (m < 60 * 24) return `${Math.round(m / 60)} h ago`;
    return `${Math.round(m / 60 / 24)} d ago`;
};
const VERB = { created: "saved", changed: "changed", reverted: "undid a change to" };

/** The last things AI clients did, newest first; Undo is offered only while the design is still as the AI left it and the AI made that change. */
async function recentActivity(userId) {
    const rows = await AiActivity.find({ user: userId }).sort("-at").limit(10).lean();
    if (!rows.length) return [];
    const designs = await Component.find({ _id: { $in: rows.map((r) => r.design).filter(Boolean) }, createdBy: userId }).select("version lastChange versions.version").lean();
    const by = new Map(designs.map((d) => [String(d._id), d]));
    return rows.map((r) => {
        const d = r.design && by.get(String(r.design));
        return {
            id: String(r._id), label: r.label, verb: VERB[r.action] || r.action, title: r.title || "a design", when: ago(r.at),
            url: d ? `/design/${d._id}` : "", gone: !d,
            canUndo: Boolean(d && r.action !== "created" && d.version === r.version && d.lastChange && d.lastChange.source === "ai" && (d.versions || []).length),
        };
    });
}

const sendZip = (res, name, files) => {
    res.set({ "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${name}"` });
    res.send(createZip(files));
};

router.get("/", async (req, res) => {
    try {
        const userId = req.session.user.id;
        const [count, account, apps, figmaSignIns, activity] = await Promise.all([
            Component.countDocuments({ createdBy: userId, useAsReference: { $ne: false }, kind: { $ne: "section" } }), // what the design pack holds
            User.findById(userId).select("apiTokenPrefix apiTokenCreatedAt").lean(),
            connectedApps(userId),
            FigmaToken.find({ userId }).sort("-createdAt").select("createdAt").lean(),
            recentActivity(userId),
        ]);
        res.render("main/connect", {
            layout: "main",
            activePage: "connect",
            title: "Connect",
            user: req.session.user,
            count,
            apps,
            figmaSignIns: figmaSignIns.map((t) => ({ id: String(t._id), since: t.createdAt })),
            activity,
            hasConnections: apps.length > 0 || figmaSignIns.length > 0,
            isLocal: /^https?:\/\/(localhost|127\.0\.0\.1)/.test(baseUrl(req)),
            tokenPrefix: account?.apiTokenPrefix || "",
            tokenCreated: account?.apiTokenCreatedAt || null,
            mcpUrl: `${baseUrl(req)}/mcp`,
            tokenEnv: TOKEN_ENV,
            tools: TOOLS.map((t) => ({ name: t.name, blurb: TOOL_BLURBS[t.name] || firstSentence(t.description), writes: WRITE_TOOLS.has(t.name) })),
            mcpJson: mcpJson(baseUrl(req)),
            cursorJson: cursorJson(baseUrl(req)),
            cursorLink: cursorInstallLink(baseUrl(req)),
            claudeMd: claudeMdSnippet(),
            skillMd: skillMd(),
        });
    } catch (error) {
        console.error("Connect error:", error);
        res.status(500).render("error", { layout: "main", title: "Error", message: "Failed to load the Connect page" });
    }
});

router.get("/claude-code-kit.zip", (req, res) => sendZip(res, "claude-code-kit.zip", buildClaudeCodeKit(baseUrl(req))));

router.get("/design-pack.zip", async (req, res) => {
    try {
        const { files, count } = await buildDesignPack(req.session.user.id, req.session.user.name);
        if (!count) return res.status(400).type("text/plain").send("Your library has no components yet. Add or save a few first.");
        sendZip(res, "design-pack.zip", files);
    } catch (error) {
        console.error("Design pack error:", error);
        res.status(500).type("text/plain").send("Could not build the design pack");
    }
});

// a Figma plugin sign-in ends at once: the plugin has to sign in again
/** Undo from the activity card: takes the design back to what it was before that AI change, if nothing has changed it since. */
router.post("/activity/:id/undo", async (req, res) => {
    try {
        const userId = req.session.user.id;
        if (!/^[a-f0-9]{24}$/i.test(req.params.id)) return res.status(400).json({ success: false, message: "Invalid id" });
        const row = await AiActivity.findOne({ _id: req.params.id, user: userId }).lean();
        if (!row || !row.design) return res.status(404).json({ success: false, message: "That activity is gone" });
        const r = await revertDesign(userId, { id: row.design, baseVersion: row.version, actor: { source: "editor", label: "You" } });
        res.json({ success: true, message: `"${r.title}" is back to v${r.to}.` });
    } catch (e) {
        if (e instanceof RevertError) return res.status(409).json({ success: false, message: e.message });
        console.error("Undo error:", e);
        res.status(500).json({ success: false, message: "Could not undo" });
    }
});

router.post("/figma/:id/revoke", async (req, res) => {
    if (!/^[a-f0-9]{24}$/i.test(req.params.id)) return res.status(400).json({ success: false });
    await FigmaToken.deleteOne({ _id: req.params.id, userId: req.session.user.id });
    res.json({ success: true });
});

router.post("/apps/:clientId/revoke", async (req, res) => {
    await revokeClientForUser(req.session.user.id, req.params.clientId);
    res.json({ success: true });
});

// Runs the same sequence Claude does against this server's public address and reports what is wrong.
router.get("/check", async (req, res) => {
    const base = baseUrl(req);
    const userId = req.session.user.id;
    const http = (url, opts = {}) => fetch(url, { ...opts, signal: AbortSignal.timeout(7000), redirect: "manual" });
    const rpc = (headers, body) => http(`${base}/mcp`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...headers }, body: JSON.stringify(body) });

    const run = async (id, label, fn) => {
        try {
            const r = await fn();
            return { id, label, ok: Boolean(r.ok), optional: Boolean(r.optional), detail: r.detail || "", fix: r.ok ? "" : r.fix || "" };
        } catch (e) {
            const timeout = e.name === "TimeoutError" || e.name === "AbortError";
            return { id, label, ok: false, detail: timeout ? "No answer within 7 seconds" : `Could not connect: ${e.cause?.code || e.message}`, fix: `Make sure ${base} is reachable from the internet and the server is running.` };
        }
    };

    const checks = [];
    checks.push(await run("https", "Public HTTPS address", async () => {
        const local = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(base);
        if (local) return { ok: false, detail: `The server address is ${base}, which Claude on the web cannot reach.`, fix: "Deploy the app on a public HTTPS address and set PUBLIC_URL to it." };
        if (!base.startsWith("https://")) return { ok: false, detail: `${base} is not HTTPS.`, fix: "Claude requires HTTPS. Serve the app over HTTPS and set PUBLIC_URL." };
        return { ok: true, detail: base };
    }));

    checks.push(await run("resource", "Resource metadata (RFC 9728)", async () => {
        const r = await http(`${base}/.well-known/oauth-protected-resource`);
        if (r.status !== 200) return { ok: false, detail: `Returned HTTP ${r.status}`, fix: "The /.well-known/ paths must be served by this app. Check proxy or rewrite rules." };
        const j = await r.json();
        return j.resource === `${base}/mcp` && (j.authorization_servers || []).includes(base)
            ? { ok: true, detail: `resource ${j.resource}` }
            : { ok: false, detail: `resource is ${j.resource}`, fix: `It should be ${base}/mcp. Set PUBLIC_URL to the exact public address.` };
    }));

    checks.push(await run("authserver", "Authorization server metadata", async () => {
        const r = await http(`${base}/.well-known/oauth-authorization-server`);
        if (r.status !== 200) return { ok: false, detail: `Returned HTTP ${r.status}`, fix: "Serve /.well-known/oauth-authorization-server from this app." };
        const j = await r.json();
        const missing = ["authorization_endpoint", "token_endpoint", "registration_endpoint"].filter((k) => !j[k]);
        if (j.issuer !== base) return { ok: false, detail: `issuer is ${j.issuer}`, fix: `It should be ${base}. Set PUBLIC_URL.` };
        if (missing.length) return { ok: false, detail: `Missing ${missing.join(", ")}`, fix: "Update the app to the latest version." };
        if (!(j.code_challenge_methods_supported || []).includes("S256")) return { ok: false, detail: "PKCE S256 not advertised", fix: "Update the app to the latest version." };
        return { ok: true, detail: "issuer, endpoints and PKCE S256 present" };
    }));

    checks.push(await run("challenge", "Unauthenticated request gets a 401 challenge", async () => {
        const r = await rpc({}, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } });
        const h = r.headers.get("www-authenticate") || "";
        if (r.status !== 401) return { ok: false, detail: `Expected 401, got ${r.status}`, fix: "The /mcp endpoint must answer 401 until the user signs in." };
        return h.includes(`resource_metadata="${base}/.well-known/oauth-protected-resource"`)
            ? { ok: true, detail: "401 with resource_metadata pointer" }
            : { ok: false, detail: `WWW-Authenticate was: ${h || "(empty)"}`, fix: "Set PUBLIC_URL to the exact public address." };
    }));

    checks.push(await run("register", "Dynamic client registration", async () => {
        const r = await http(`${base}/oauth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_name: "Windcraft self-check", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] }) });
        if (r.status !== 201) return { ok: false, detail: `Returned HTTP ${r.status}`, fix: "POST /oauth/register must be reachable and return 201." };
        const j = await r.json();
        await OAuthClient.deleteOne({ clientId: j.client_id });
        return { ok: true, detail: "registered and removed a test client" };
    }));

    checks.push(await run("mcp", "Authenticated MCP call (tools/list)", async () => {
        const pair = await issueTokenPair({ clientId: "windcraft-selfcheck", userId, resource: `${base}/mcp` });
        try {
            const auth = { Authorization: `Bearer ${pair.access_token}` };
            const init = await (await rpc(auth, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "selfcheck", version: "1" } } })).json();
            const list = await (await rpc(auth, { jsonrpc: "2.0", id: 2, method: "tools/list" })).json();
            const names = (list.result?.tools || []).map((t) => t.name);
            return init.result?.protocolVersion && names.includes("search_components")
                ? { ok: true, detail: `protocol ${init.result.protocolVersion}, ${names.length} tools` }
                : { ok: false, detail: "initialize or tools/list returned an unexpected answer", fix: "Check the server logs for MCP errors." };
        } finally {
            await OAuthToken.deleteMany({ clientId: "windcraft-selfcheck" });
        }
    }));

    checks.push(await run("cors", "Cross-origin access (browser clients)", async () => {
        const r = await http(`${base}/oauth/token`, { method: "OPTIONS", headers: { Origin: "https://claude.ai", "Access-Control-Request-Method": "POST" } });
        return r.headers.get("access-control-allow-origin")
            ? { ok: true, detail: "CORS headers present" }
            : { ok: false, detail: "No CORS headers on the token endpoint", fix: "A proxy may be stripping OPTIONS requests. Allow OPTIONS on /oauth/* and /mcp." };
    }));

    // Screenshots (the render_design tool) are optional: without a browser on the server everything else works, so this row never turns the result red
    checks.push(await run("screenshots", "Screenshots (render_design)", async () => {
        const r = await checkRenderer();
        if (r.ok) return { ok: true, optional: true, detail: `drew a test page in ${(r.ms / 1000).toFixed(1)} s on ${r.where}` };
        return { ok: false, optional: true, detail: r.error, fix: r.unavailable ? "Optional. Install Chrome on the server (or set RENDER_CHROME_PATH or RENDER_BROWSER_WS), or on Vercel add @sparticuz/chromium and playwright-core." : "Optional. The browser started but the test page did not draw: see the server logs." };
    }));

    res.json({ base, allOk: checks.every((c) => c.ok || c.optional), checks });
});

export default router;
