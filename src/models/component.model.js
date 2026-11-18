import mongoose from "mongoose";
import { resetGalleryCache } from "../utils/galleryCache.js";
import { rolesOfDesign, ROLES_VERSION } from "@windcraft/core/roles.js";

const componentSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true
        },
        category: {
            type: String,
            required: true
        },
        description: {
            type: String,
            required: true,
            trim: true
        },
        htmlCode: {
            type: String,
            required: true
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        // reports from people who flagged a gallery design (one per person); the owner of the site reviews them
        reports: {
            type: [{ by: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, reason: String, note: { type: String, maxlength: 300 }, at: { type: Date, default: Date.now } }],
            default: [],
        },
        // likes: people who like a design in the gallery (the most liked show first); one like per person
        likes: { type: Number, default: 0, index: true },
        likedBy: { type: [mongoose.Schema.Types.ObjectId], ref: "User", default: [] },
        project: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Project",
            default: null,
            index: true
        },
        kind: {
            type: String,
            enum: ["component", "page", "section"],
            default: "component"
        },
        parent: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Component",
            default: null
        },
        board: {
            type: mongoose.Schema.Types.Mixed,
            default: null
        },
        // this page's own Tailwind config files, laid over the project's: { js, css, lock } (see core/config-file.js cleanTw); null for none
        twConfig: { type: mongoose.Schema.Types.Mixed, default: null },
        order: {
            type: Number,
            default: 0
        },
        // the group a page belongs to in its project ("Public site", "Customer area"); empty for none
        // the width (px) the page was designed at (a Figma frame is 1920 wide): its frame on the board and in the editor starts at this width
        frameW: { type: Number, default: null, min: 200, max: 10000 },
        group: {
            type: String,
            default: "",
            maxlength: 60
        },
        profile: {
            type: mongoose.Schema.Types.Mixed,
            default: null
        },
        forkedFrom: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Component",
            default: null
        },
        // gallery designs put into this one from the editor's Gallery tab: who made them (shown in the details, never in the code)
        sources: { type: [{ id: String, title: String, author: String, _id: false }], default: [] },
        // what the design is (a sidebar, a hero, a card...): worked out from its code, title and category (core/roles.js), so the editor can list the designs suited to a selected element
        roles: { type: [String], default: [], index: true },
        rolesV: { type: Number, default: 0 },
        partHash: { type: String, default: "" }, // a generated part: a fingerprint of the code made for it, to tell if someone has changed it by hand
        useAsReference: {
            type: Boolean,
            default: true
        },
        tags: {
            type: [String],
            default: []
        },
        version: {
            type: Number,
            default: 1
        },
        versions: {
            type: [{
                version: Number,
                htmlCode: String,
                note: String,
                // who made the change that replaced this version: source "ai" (an AI tool through the connector), "editor" (a person) or "" (not known), and a label such as "Claude"
                by: { source: { type: String, default: "" }, label: { type: String, default: "" } },
                createdAt: { type: Date, default: Date.now }
            }],
            default: []
        },
        // who made the first version (an AI tool through the connector, or nobody noted)
        createdVia: { source: { type: String, default: "" }, label: { type: String, default: "" } },
        // who made the current version, and when (the same source and label as above)
        lastChange: { source: { type: String, default: "" }, label: { type: String, default: "" }, at: { type: Date, default: null } },
        isPublished: {
            type: Boolean,
            default: true
        }
    },
    {
        timestamps: true
    }
);

// A component keeps its old versions inside its own document, and MongoDB stops at 16 MB per document. With designs up to 5 MB the
// oldest versions are dropped first, so the code and its history stay under this many characters (the newest old version is always kept).
const HISTORY_BUDGET = 12_000_000;
// its roles are worked out again whenever what they come from changes (the ones saved some other way are caught up by services/roles.service.js)
componentSchema.pre("save", function () {
    if (this.isNew || this.rolesV !== ROLES_VERSION || this.isModified("htmlCode") || this.isModified("category") || this.isModified("title") || this.isModified("tags")) {
        this.roles = rolesOfDesign(this);
        this.rolesV = ROLES_VERSION;
    }
});
componentSchema.pre("save", function () {
    if (!this.isModified("versions") && !this.isModified("htmlCode")) return;
    let total = (this.htmlCode || "").length + this.versions.reduce((n, v) => n + (v.htmlCode || "").length, 0);
    while (this.versions.length > 1 && total > HISTORY_BUDGET) total -= (this.versions.shift().htmlCode || "").length;
});

// the gallery pages keep what they ask the database for, for a short while: a design written through the model makes them forget it
componentSchema.post(["save", "deleteOne", "findOneAndUpdate", "findOneAndDelete", "updateOne", "updateMany", "deleteMany", "insertMany"], () => resetGalleryCache());

export default mongoose.model("Component", componentSchema);
