import express from "express";
import Component from "../models/component.model.js";
import { galleryCache } from "../utils/galleryCache.js";
import { categories, kindOfCategory } from "./home.routes.js";

// ── The gallery for the editor: published designs, a dozen at a time ──────────────────────────────────────────────────────────
// The editor's "Add a wireframe" popup has a Gallery tab: search, a category, pages or components, newest or most liked. Open to anyone,
// like the gallery itself. A design carries only what the popup needs (no email, no history), and a very large one is left out.
export const galleryApi = express.Router();

const PAGE_SIZE = 12;
const MAX_CODE = 80_000; // characters: a preview of a bigger design would cost the editor more than it is worth
const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const slugsOf = (kind) => Object.keys(categories).filter((slug) => kindOfCategory(slug) === kind);

galleryApi.get("/designs", async (req, res) => {
    try {
        const q = String(req.query.q || "").trim().slice(0, 80);
        const category = categories[String(req.query.category || "")] ? String(req.query.category) : "";
        const kind = ["page", "component"].includes(String(req.query.kind)) ? String(req.query.kind) : "";
        const sort = req.query.sort === "liked" ? "liked" : "new";
        const page = Math.min(200, Math.max(1, parseInt(req.query.page, 10) || 1));

        const where = { isPublished: true, kind: { $ne: "section" }, $expr: { $lte: [{ $strLenCP: "$htmlCode" }, MAX_CODE] } };
        if (category) where.category = category;
        else if (kind === "page") where.category = { $in: slugsOf("page") };
        else if (kind === "component") where.category = { $in: slugsOf("component") };
        if (q) { const rx = new RegExp(escapeRx(q), "i"); where.$or = [{ title: rx }, { description: rx }, { tags: rx }]; }

        const data = await galleryCache(`designs:${JSON.stringify([q, category, kind, sort, page])}`, async () => {
            const rows = await Component.find(where)
                .select("title description category tags htmlCode twConfig likes createdBy")
                .populate("createdBy", "name")
                .sort(sort === "liked" ? { likes: -1, createdAt: -1 } : { createdAt: -1 })
                .skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE + 1) // one more than a page: is there another?
                .lean();
            return {
                items: rows.slice(0, PAGE_SIZE).map((c) => ({
                    id: String(c._id), title: c.title, description: c.description, category: c.category, tags: c.tags || [], kind: kindOfCategory(c.category),
                    html: c.htmlCode, twConfig: c.twConfig || null, likes: c.likes || 0, author: (c.createdBy && c.createdBy.name) || "Someone",
                })),
                hasMore: rows.length > PAGE_SIZE,
            };
        });
        res.json({ success: true, data: { ...data, page } });
    } catch (error) {
        console.error("Gallery list error:", error);
        res.status(500).json({ success: false, message: "Could not load the gallery" });
    }
});
