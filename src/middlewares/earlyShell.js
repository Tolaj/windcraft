// The landing page's first bytes, sent at once.
//
// On a cold start the page waits for the server to wake up, for MongoDB, for the session and for the gallery's counts before a single byte
// is sent, so the browser shows nothing for seconds. This middleware runs first: it sends the start of the page (the black preloader screen,
// views/main/_shell.handlebars) the moment the request arrives, and the rest of the page follows into the same document when it is ready
// (the layout leaves out what the shell already sent when `res.locals.streamed` is set).
//
// Once the start is on its way the status and the headers are final, so the rest of the request has to cope with that:
// setting a header is ignored, and a redirect becomes a script. The session cookie is not refreshed on this one response.

const send = (res, body) => res.end(body);

export function earlyShell(req, res, next) {
    if (req.method !== "GET" || req.path !== "/" || !req.accepts("html")) return next();
    // a click on the logo from inside the site: the server is awake and the browser has everything cached, so the page is sent the usual way (no preloader)
    if (req.get("sec-fetch-site") === "same-origin") return next();
    req.app.render("main/_shell", { layout: false, title: "Windcraft" }, (err, html) => {
        if (err) return next(); // no shell: the page is sent the usual way
        res.status(200);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("X-Accel-Buffering", "no"); // a proxy (nginx) must not hold the start back
        res.write(html);
        if (typeof res.flush === "function") res.flush();
        res.locals.streamed = true;

        // from here the headers are sent: the rest of the app may still try to set one or to redirect
        const setHeader = res.setHeader.bind(res);
        res.setHeader = (...args) => (res.headersSent ? res : setHeader(...args));
        res.redirect = (a, b) => send(res, `<script>location.replace(${JSON.stringify(String(typeof a === "number" ? b : a))})</script>`);
        next();
    });
}
