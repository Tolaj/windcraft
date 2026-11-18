import mongoose from "mongoose";

// What an AI client did to a user's designs through the connector: shown on the Connect page ("Claude saved 3 pages 10 minutes ago") with an Undo.
// Entries expire after 30 days.
const aiActivitySchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    label: { type: String, default: "An AI client" }, // the client's name: Claude, Cursor, "Access token"
    action: { type: String, enum: ["created", "changed", "reverted"], required: true },
    design: { type: mongoose.Schema.Types.ObjectId, ref: "Component", index: true },
    title: { type: String, default: "" },
    project: { type: mongoose.Schema.Types.ObjectId, ref: "Project" },
    version: { type: Number, default: 1 }, // the version the design was at after this change (Undo is only offered while it still is)
    at: { type: Date, default: Date.now, index: { expireAfterSeconds: 60 * 60 * 24 * 30 } },
});

export default mongoose.model("AiActivity", aiActivitySchema);
