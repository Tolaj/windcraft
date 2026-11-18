import crypto from "crypto";
import User from "../models/user.model.js";
import FigmaToken from "../models/figmaToken.model.js";
import { accessTokenInfo } from "./oauth.service.js";

/** Accepts a personal API token (twl_...), a Figma plugin sign-in (fgp_...) or an OAuth access token in the Authorization header. Returns the user's id, or null. */
export const authenticateBearer = async (req) => {
    const header = req.get("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) return null;
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    const viaApiToken = await User.findOne({ apiTokenHash: hash }).select("_id").lean();
    // req.actor says who is calling, so what they change is recorded as theirs (design history, the Connect page's activity)
    if (viaApiToken) { req.actor = { source: "ai", label: "Access token" }; return String(viaApiToken._id); }
    const viaPlugin = await FigmaToken.findOne({ tokenHash: hash }).select("userId").lean();
    if (viaPlugin) { req.actor = { source: "figma", label: "Figma plugin" }; return String(viaPlugin.userId); }
    const oauth = await accessTokenInfo(token);
    if (oauth) req.actor = { source: "ai", label: oauth.name };
    return oauth ? oauth.userId : null;
};
