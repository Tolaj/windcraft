// End to end: connecting an AI app with OAuth through a real server.
// 1. The Google button must carry the whole /oauth/authorize address back (it has its own & and =).
// 2. Two copies of one client (two Claude Code windows) refreshing must never sign each other out.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { missingPrerequisite, startStack, seed, within } from "./helpers.js";

const skip = missingPrerequisite();
let stack, ids;
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const unescape = (s) => s.replace(/&amp;/g, "&").replace(/&#x3D;/g, "=").replace(/&#x2F;/g, "/").replace(/&quot;/g, '"').replace(/&#x27;/g, "'");
const attr = (html, re) => { const m = re.exec(html); return m ? unescape(m[1]) : null; };

before(async () => {
    if (skip) return;
    // The Google button only shows when Google sign-in is set up; a placeholder is enough, Google is never called here.
    process.env.GOOGLE_CLIENT_ID ||= "e2e-client.apps.googleusercontent.com";
    process.env.GOOGLE_CLIENT_SECRET ||= "e2e-secret";
    stack = await startStack();
    ids = await seed();
});
after(async () => { if (skip) return; if (stack) await within(stack.stop(), 20000); });

test("the Google button keeps the whole authorize address it should return to", { skip: skip || false, timeout: 120000 }, async () => {
    const authorize = "/oauth/authorize?response_type=code&client_id=mcp_client_x&redirect_uri=https%3A%2F%2Fclaude.ai%2Fapi%2Fmcp%2Fauth_callback&code_challenge=abc&code_challenge_method=S256&state=xyz";
    const html = await (await fetch(`${stack.base}/auth/sign-in?returnTo=${encodeURIComponent(authorize)}`)).text();

    const google = attr(html, /href="(\/auth\/google[^"]*)"/);
    assert.ok(google, "the Google button is on the page");
    assert.equal(new URL(google, stack.base).searchParams.get("returnTo"), authorize, "returnTo arrives in one piece, not cut at the first &");
    const signUp = attr(html, /href="(\/auth\/sign-up[^"]*)"/);
    assert.equal(new URL(signUp, stack.base).searchParams.get("returnTo"), authorize, "the Sign up link keeps it too");

    const upHtml = await (await fetch(`${stack.base}${signUp}`)).text();
    const upGoogle = attr(upHtml, /href="(\/auth\/google[^"]*)"/);
    assert.equal(new URL(upGoogle, stack.base).searchParams.get("returnTo"), authorize, "and so does the sign-up page's Google button");

    const go = await fetch(`${stack.base}${google}`, { redirect: "manual" });
    assert.equal(go.status, 302);
    assert.match(go.headers.get("location"), /^https:\/\/accounts\.google\.com\//);

    for (const bad of ["//evil.example", "/\\evil.example", "https://evil.example"]) {
        const page = await (await fetch(`${stack.base}/auth/sign-in?returnTo=${encodeURIComponent(bad)}`)).text();
        assert.equal(attr(page, /href="(\/auth\/google[^"]*)"/), "/auth/google", `${bad} is not kept`);
    }
});

test("two copies of a connected app refresh without signing each other out", { skip: skip || false, timeout: 120000 }, async () => {
    const redirectUri = "http://localhost:7777/callback";
    const reg = await (await fetch(`${stack.base}/oauth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_name: "E2E Claude Code", redirect_uris: [redirectUri] }) })).json();
    const clientId = reg.client_id;
    assert.ok(clientId);

    const signIn = await fetch(`${stack.base}/users/sign-in`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: ids.email, password: ids.password }) });
    const cookie = (signIn.headers.getSetCookie() || []).map((c) => c.split(";")[0]).join("; ");
    await new Promise((r) => setTimeout(r, 700)); // the session is written to the store a moment after the answer

    const verifier = crypto.randomBytes(48).toString("base64url");
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    const q = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: redirectUri, code_challenge: challenge, code_challenge_method: "S256", state: "s1" });
    const consent = await (await fetch(`${stack.base}/oauth/authorize?${q}`, { headers: { cookie } })).text();
    const csrf = attr(consent, /name="csrf" value="([^"]+)"/);
    assert.ok(csrf, "the consent page is shown to the signed-in user");

    const allow = await fetch(`${stack.base}/oauth/authorize`, { method: "POST", redirect: "manual", headers: { cookie, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrf, ...Object.fromEntries(q), decision: "allow" }) });
    const code = new URL(allow.headers.get("location")).searchParams.get("code");
    assert.ok(code, "Allow sends a code back to the app");

    const token = (body) => fetch(`${stack.base}/oauth/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });
    const first = await (await token({ grant_type: "authorization_code", code, client_id: clientId, redirect_uri: redirectUri, code_verifier: verifier })).json();
    assert.ok(first.access_token && first.refresh_token);

    const mcpOk = async (access) => (await fetch(`${stack.base}/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${access}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) })).status === 200;
    assert.ok(await mcpOk(first.access_token));

    // Two windows hold the same saved refresh token and refresh at the same moment: both must succeed.
    const refresh = (rt) => token({ grant_type: "refresh_token", refresh_token: rt, client_id: clientId });
    const [a, b] = await Promise.all([refresh(first.refresh_token), refresh(first.refresh_token)]);
    assert.equal(a.status, 200, "the first copy refreshes");
    assert.equal(b.status, 200, "the second copy refreshes with the same token");
    const pa = await a.json(), pb = await b.json();
    assert.notEqual(pa.access_token, pb.access_token);

    assert.ok(await mcpOk(first.access_token), "an access token handed out earlier keeps working after another copy refreshed");
    assert.ok(await mcpOk(pa.access_token) && await mcpOk(pb.access_token));

    // A reply lost on the way back: the app retries with the old token later and still gets in.
    assert.equal((await refresh(first.refresh_token)).status, 200, "the old refresh token still works within the grace period");
    assert.equal((await refresh(pa.refresh_token)).status, 200, "and so does the new one");

    // After the grace period the old token is refused, and an unknown one always is.
    const { default: OAuthToken } = await import("../src/models/oauthToken.model.js");
    await OAuthToken.updateOne({ tokenHash: sha(first.refresh_token) }, { expiresAt: new Date(Date.now() - 1000) });
    const late = await refresh(first.refresh_token);
    assert.equal(late.status, 400);
    assert.equal((await late.json()).error, "invalid_grant");
    assert.equal((await refresh("rt_unknown")).status, 400);
    assert.equal((await token({ grant_type: "refresh_token", refresh_token: pa.refresh_token, client_id: "someone_else" })).status, 400, "a refresh token only works for its own app");
});
