const $ = (id) => document.getElementById(id);
const api = (url, method = "GET", body) =>
    fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined })
        .then((r) => r.json().then((data) => ({ ok: r.ok, data })));
const say = (msg, type = "success") => showToast(msg, type);

let me = null;
const ai = { enabled: false, provider: "anthropic", hasKey: false };

/* ---- account, password, token ---- */
const renderMe = () => {
    $("nameInput").value = me.name;
    $("emailShown").value = me.email;
    $("methods").textContent = [me.google ? "Google" : "", me.hasPassword ? "Email and password" : ""].filter(Boolean).join(" + ");
    $("since").textContent = me.createdAt ? new Date(me.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "";
    $("currentWrap").classList.toggle("hidden", !me.hasPassword);
    $("curPw").required = me.hasPassword;
    $("pwTitle").textContent = me.hasPassword ? "Change password" : "Add a password";
    $("pwNote").textContent = me.hasPassword ? "" : "You signed in with Google. Add a password to sign in with your email too.";
    $("pwBtn").textContent = me.hasPassword ? "Change password" : "Set password";
    $("delPw").classList.toggle("hidden", !me.hasPassword);
    $("delPw").required = me.hasPassword;
    $("tokenState").textContent = me.token
        ? `Active: ${me.token.prefix}… created ${me.token.createdAt ? new Date(me.token.createdAt).toLocaleDateString() : ""}`
        : "No token yet.";
    $("tokenGen").textContent = me.token ? "Regenerate" : "Generate";
    $("tokenRevoke").classList.toggle("hidden", !me.token);
};
const loadMe = () => api("/users/me").then(({ ok, data }) => { if (ok) { me = data; renderMe(); } else say(data.message || "Could not load your account", "error"); });

$("nameForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const { ok, data } = await api("/users/me", "PUT", { name: $("nameInput").value });
    say(ok ? "Name saved" : data.message || "Could not save", ok ? "success" : "error");
    if (ok) { me.name = data.name; document.querySelectorAll("#userMenu p.font-semibold").forEach((n) => (n.textContent = data.name)); }
});

$("pwForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const { ok, data } = await api("/users/password", "PUT", { currentPassword: $("curPw").value, newPassword: $("newPw").value });
    say(ok ? data.message : data.message || "Could not change the password", ok ? "success" : "error");
    if (ok) { $("curPw").value = ""; $("newPw").value = ""; await loadMe(); }
});

$("tokenGen").addEventListener("click", async () => {
    if (me.token && !confirm("Regenerate the token? The current one stops working at once.")) return;
    const { ok, data } = await api("/users/api-token", "POST");
    if (!ok || !data.success) return say(data.message || "Could not create the token", "error");
    $("tokenValue").textContent = data.token;
    $("tokenBox").classList.remove("hidden");
    await loadMe();
});
$("tokenRevoke").addEventListener("click", async () => {
    if (!confirm("Revoke the token? Tools using it lose access at once.")) return;
    const { ok, data } = await api("/users/api-token", "DELETE");
    if (ok && data.success) { $("tokenBox").classList.add("hidden"); await loadMe(); } else say(data.message || "Could not revoke", "error");
});

$("delForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!confirm("Delete your account and everything in it? This can't be undone.")) return;
    $("delBtn").disabled = true;
    const { ok, data } = await api("/users/me", "DELETE", { email: $("delEmail").value, password: $("delPw").value });
    if (ok) { window.location.href = "/"; return; }
    $("delBtn").disabled = false;
    say(data.message || "Could not delete the account", "error");
});

/* ---- AI ---- */
const renderAi = () => {
    const t = $("llmToggle");
    t.setAttribute("aria-checked", ai.enabled);
    t.classList.toggle("bg-primary", ai.enabled);
    t.classList.toggle("bg-gray-200", !ai.enabled);
    $("llmKnob").classList.toggle("translate-x-5", ai.enabled);
    $("llmKnob").classList.toggle("translate-x-0", !ai.enabled);
    $("aiBody").classList.toggle("opacity-40", !ai.enabled);
    $("aiBody").classList.toggle("pointer-events-none", !ai.enabled);
    const a = ai.provider === "anthropic";
    $("provAnthropic").className = `rounded-xl border-2 px-4 py-3 text-left ${a ? "border-gray-900 bg-gray-50" : "border-gray-200"}`;
    $("provLocal").className = `rounded-xl border-2 px-4 py-3 text-left ${a ? "border-gray-200" : "border-gray-900 bg-gray-50"}`;
    $("anthropicBox").classList.toggle("hidden", !a);
    $("localBox").classList.toggle("hidden", a);
};
$("llmToggle").addEventListener("click", () => { ai.enabled = !ai.enabled; renderAi(); });
$("provAnthropic").addEventListener("click", () => { ai.provider = "anthropic"; renderAi(); });
$("provLocal").addEventListener("click", () => { ai.provider = "local"; renderAi(); });

api("/users/settings/llm").then(({ ok, data }) => {
    if (!ok) return say(data.message || "Could not load the AI settings", "error");
    ai.enabled = data.enabled; ai.provider = data.provider; ai.hasKey = data.hasAnthropicKey;
    $("urlInput").value = data.localLlmUrl || "";
    $("keyStatus").textContent = data.hasAnthropicKey ? "Key saved: " + data.anthropicApiKey : "No key configured";
    renderAi();
});

$("aiSave").addEventListener("click", async () => {
    const body = { enabled: ai.enabled, provider: ai.provider };
    const key = $("keyInput").value.trim(), url = $("urlInput").value.trim();
    if (ai.provider === "anthropic" && key) body.anthropicApiKey = key;
    if (ai.provider === "local" && url) body.localLlmUrl = url;
    if (ai.enabled && ai.provider === "anthropic" && !key && !ai.hasKey) return say("Enter an Anthropic API key", "error");
    if (ai.enabled && ai.provider === "local" && !url) return say("Enter a Local LLM URL", "error");
    const { ok, data } = await api("/users/settings/llm", "PUT", body);
    if (!ok) return say(data.message || "Could not save", "error");
    say(data.message || "Saved");
    if (key) { ai.hasKey = true; $("keyInput").value = ""; $("keyStatus").textContent = "Key saved: ••••" + key.slice(-4); }
});

loadMe();
