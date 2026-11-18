// What a client can attach without calling a tool: the design guide, the active project, a project's pages and theme, and a design's code.
// The same things the tools give, as documents a person can pick ("@" in Claude and Cursor).
import mongoose from "mongoose";
import Component from "../models/component.model.js";
import { buildDesignGuide } from "../services/guide.service.js";
import { listProjects, projectTree, projectContext, resolveProject } from "../services/project.service.js";
import { pageTheme, tailwindConfig } from "@windcraft/core/theme.js";

const URI = /^windcraft:\/\/(design-guide|context|projects|project|theme|component)(?:\/([a-f0-9]{24}))?$/i;
const MAX_LISTED = 30;

export const resources = {
    async list(userId) {
        const projects = await listProjects(userId);
        return [
            { uri: "windcraft://design-guide", name: "Design guide", description: "Your design tokens, conventions and an index of every component. Read it before designing.", mimeType: "text/markdown" },
            { uri: "windcraft://context", name: "Active project", description: "The project you are working in: its brief and the pages already designed.", mimeType: "text/markdown" },
            { uri: "windcraft://projects", name: "Projects", description: "Your projects with page counts.", mimeType: "application/json" },
            ...projects.slice(0, MAX_LISTED).map((p) => ({ uri: `windcraft://project/${p.id}`, name: `Project: ${p.name}`, description: `The pages of ${p.name}, in order, with ids.`, mimeType: "application/json" })),
        ];
    },
    templates: [
        { uriTemplate: "windcraft://project/{id}", name: "A project's pages", description: "Pages in order, with groups, sections and ids.", mimeType: "application/json" },
        { uriTemplate: "windcraft://theme/{id}", name: "A project's Tailwind theme", description: "The tailwind.config a project's designs use (brand colour, grays, font, radius).", mimeType: "application/json" },
        { uriTemplate: "windcraft://component/{id}", name: "A design's HTML", description: "The code of one saved design.", mimeType: "text/html" },
    ],
    async read(userId, uri) {
        const m = URI.exec(String(uri));
        if (!m) return null;
        const kind = m[1].toLowerCase(), id = m[2];
        if (kind === "design-guide" && !id) return { text: (await buildDesignGuide(userId)).markdown, mimeType: "text/markdown" };
        if (kind === "context" && !id) return { text: (await projectContext(userId)) || "No active project yet.", mimeType: "text/markdown" };
        if (kind === "projects" && !id) return { text: JSON.stringify(await listProjects(userId), null, 2), mimeType: "application/json" };
        if (!id || !mongoose.isValidObjectId(id)) return null;
        if (kind === "project") {
            const p = await resolveProject(userId, id);
            return p ? { text: JSON.stringify({ id: String(p._id), name: p.name, description: p.description, brief: p.brief || "", pages: await projectTree(userId, p._id) }, null, 2), mimeType: "application/json" } : null;
        }
        if (kind === "theme") {
            const p = await resolveProject(userId, id);
            return p ? { text: JSON.stringify(tailwindConfig(p.theme), null, 2), mimeType: "application/json" } : null;
        }
        if (kind === "component") {
            const c = await Component.findOne({ _id: id, createdBy: userId }).select("htmlCode").lean();
            return c ? { text: c.htmlCode, mimeType: "text/html" } : null;
        }
        return null;
    },
};
