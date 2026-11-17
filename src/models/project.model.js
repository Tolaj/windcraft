import mongoose from "mongoose";

const projectSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 80 },
        description: { type: String, default: "", trim: true, maxlength: 300 },
        brief: { type: String, default: "", trim: true, maxlength: 4000 },
        // the head the project's pages share (fonts, the Tailwind script and config...): save_pages reuses it when it is not sent again
        sharedHead: { type: String, default: "", maxlength: 20000 },
        // the project's theme (brand colour, gray palette, font, radius): see packages/core/theme.js; null until it is set, then the default applies
        theme: { type: mongoose.Schema.Types.Mixed, default: null },
        // elements (a frame's header, hero, sections, footer...): made automatically, and listed on the project page, only while this is on (off unless turned on)
        autoParts: { type: Boolean, default: false },
        // the share link: anyone with /p/<shareToken> can look at the project and copy its code (no account); empty = not shared
        shareToken: { type: String, default: "", index: true },
        // the prototype link: anyone with /prototype/<protoToken> can click through the pages, full screen, and nothing else (no code, no editing); empty = not shared
        protoToken: { type: String, default: "", index: true },
        // Community: the project is public. Anyone can open /community/<id> to look at it (with its author named) and make their own copy; it is listed in the Community tab of the Projects page
        community: { type: Boolean, default: false, index: true },
        communityAt: { type: Date, default: null },
        // whether people can make their own copy of a Community project (true), or only look at it and copy its code (false)
        communityCopy: { type: Boolean, default: true },
        // a copy made from a Community project: where it came from, so the author keeps the credit
        remixedFrom: { type: { project: mongoose.Schema.Types.ObjectId, author: String, name: String }, default: null, _id: false },
        owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    },
    { timestamps: true }
);

export default mongoose.model("Project", projectSchema);
