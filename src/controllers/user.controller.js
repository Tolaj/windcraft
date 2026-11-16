import bcrypt from "bcrypt";
import crypto from "crypto";
import User from "../models/user.model.js";
import * as userService from "../services/user.service.js";

export const createUser = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ message: "Name, email, and password are required" });
        }

        if (password.length < 6) {
            return res.status(400).json({ message: "Password must be at least 6 characters" });
        }

        const existingUser = await userService.getUserByEmail(email);
        if (existingUser) {
            return res.status(409).json({ message: "An account with this email already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await userService.createUser({ name, email, password: hashedPassword });
        const { password: _, ...userWithoutPassword } = user.toObject();
        res.status(201).json(userWithoutPassword);
    } catch (error) {
        res.status(400).json({ message: error.message || "Failed to create user" });
    }
};

export const getUsers = async (req, res) => {
    try {
        const users = await userService.getAllUsers();
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: error.message || "Failed to fetch users" });
    }
};

export const userSignIn = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required" });
        }

        const user = await userService.getUserByEmail(email);

        if (!user) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        if (!user.password) {
            return res.status(401).json({ message: "This account signs in with Google. Use the Google button." });
        }

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        const { password: _, ...userData } = user.toObject();

        req.session.user = {
            id: userData._id,
            name: userData.name,
            email: userData.email,
            llmEnabled: userData.llmSettings?.enabled || false,
        };

        return res.status(200).json({ message: "Sign-in successful!", userData: userData });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const getLlmSettings = async (req, res) => {
    try {
        const user = await userService.getUserById(req.session.user.id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        const settings = user.llmSettings || { enabled: false, provider: "anthropic", anthropicApiKey: "", localLlmUrl: "" };
        res.json({
            enabled: settings.enabled,
            provider: settings.provider,
            anthropicApiKey: settings.anthropicApiKey ? "••••" + settings.anthropicApiKey.slice(-4) : "",
            localLlmUrl: settings.localLlmUrl || "",
            hasAnthropicKey: !!settings.anthropicApiKey,
            hasLocalUrl: !!settings.localLlmUrl,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const updateLlmSettings = async (req, res) => {
    try {
        const { enabled, provider, anthropicApiKey, localLlmUrl } = req.body;

        if (provider && !["anthropic", "local"].includes(provider)) {
            return res.status(400).json({ message: "Provider must be 'anthropic' or 'local'" });
        }

        const user = await userService.getUserById(req.session.user.id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (!user.llmSettings) {
            user.llmSettings = { enabled: false, provider: "anthropic", anthropicApiKey: "", localLlmUrl: "" };
        }

        if (typeof anthropicApiKey === "string") user.llmSettings.anthropicApiKey = anthropicApiKey;
        if (typeof localLlmUrl === "string") user.llmSettings.localLlmUrl = localLlmUrl;
        if (provider) user.llmSettings.provider = provider;

        if (enabled) {
            const p = provider || user.llmSettings.provider;
            if (p === "anthropic" && !user.llmSettings.anthropicApiKey) {
                return res.status(400).json({ message: "Anthropic API key is required to enable AI" });
            }
            if (p === "local" && !user.llmSettings.localLlmUrl) {
                return res.status(400).json({ message: "Local LLM URL is required to enable AI" });
            }
        }

        if (typeof enabled === "boolean") user.llmSettings.enabled = enabled;

        await user.save();

        req.session.user.llmEnabled = user.llmSettings.enabled;

        res.json({ message: "Settings saved", enabled: user.llmSettings.enabled, provider: user.llmSettings.provider });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};



export const createApiToken = async (req, res) => {
    try {
        const token = `twl_${crypto.randomBytes(24).toString("hex")}`;
        await User.findByIdAndUpdate(req.session.user.id, {
            apiTokenHash: crypto.createHash("sha256").update(token).digest("hex"),
            apiTokenPrefix: token.slice(0, 8),
            apiTokenCreatedAt: new Date(),
        });
        res.status(200).json({ success: true, token });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/** Ends the person's access token at once: tools using it stop working. */
export const revokeApiToken = async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.session.user.id, { apiTokenHash: "", apiTokenPrefix: "", apiTokenCreatedAt: null });
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/* ---------- the Settings page ---------- */

const accountOf = (user) => ({
    name: user.name,
    email: user.email,
    hasPassword: Boolean(user.password),
    google: Boolean(user.googleId),
    createdAt: user.createdAt,
    token: user.apiTokenHash ? { prefix: user.apiTokenPrefix, createdAt: user.apiTokenCreatedAt } : null,
});

export const getMe = async (req, res) => {
    try {
        const user = await userService.getUserById(req.session.user.id);
        if (!user) return res.status(404).json({ message: "User not found" });
        res.json(accountOf(user));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const updateMe = async (req, res) => {
    try {
        const name = String(req.body?.name || "").trim();
        if (!name) return res.status(400).json({ message: "Enter your name" });
        if (name.length > 80) return res.status(400).json({ message: "That name is too long" });
        const user = await userService.updateUser(req.session.user.id, { name });
        if (!user) return res.status(404).json({ message: "User not found" });
        req.session.user.name = name;
        res.json({ message: "Saved", name });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/** Changes the password. A person who signed in with Google has none yet, so they can set one without a current password. */
export const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body || {};
        if (typeof newPassword !== "string" || newPassword.length < 6) {
            return res.status(400).json({ message: "The new password must be at least 6 characters" });
        }
        const user = await userService.getUserById(req.session.user.id);
        if (!user) return res.status(404).json({ message: "User not found" });
        if (user.password) {
            if (typeof currentPassword !== "string" || !(await bcrypt.compare(currentPassword, user.password))) {
                return res.status(401).json({ message: "Your current password is wrong" });
            }
        }
        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();
        res.json({ message: user.googleId ? "Password set. You can now sign in with email too." : "Password changed" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/** Deletes the account and everything that belongs to it. The person types their email to confirm (and their password, when they have one). */
export const deleteMe = async (req, res) => {
    try {
        const user = await userService.getUserById(req.session.user.id);
        if (!user) return res.status(404).json({ message: "User not found" });
        if (String(req.body?.email || "").trim().toLowerCase() !== user.email.toLowerCase()) {
            return res.status(400).json({ message: "Type your email exactly to confirm" });
        }
        if (user.password && !(await bcrypt.compare(String(req.body?.password || ""), user.password))) {
            return res.status(401).json({ message: "Your password is wrong" });
        }
        const id = user._id;
        const [{ default: Project }, { default: Component }, { default: OauthToken }, { default: FigmaToken }, { default: FigmaLink }, { default: FigmaChunk }, { default: FigmaDraft }, { default: FigmaDraftSource }, { default: FigmaSource }] = await Promise.all([
            import("../models/project.model.js"), import("../models/component.model.js"), import("../models/oauthToken.model.js"),
            import("../models/figmaToken.model.js"), import("../models/figmaLink.model.js"), import("../models/figmaChunk.model.js"),
            import("../models/figmaDraft.model.js"), import("../models/figmaDraftSource.model.js"), import("../models/figmaSource.model.js"),
        ]);
        // likes and reports this person left on other people's designs
        const liked = await Component.find({ likedBy: id }).select("_id").lean();
        if (liked.length) await Component.updateMany({ likedBy: id }, { $pull: { likedBy: id }, $inc: { likes: -1 } });
        await Component.updateMany({ "reports.by": id }, { $pull: { reports: { by: id } } });
        await Promise.all([
            Component.deleteMany({ createdBy: id }),
            Project.deleteMany({ owner: id }),
            OauthToken.deleteMany({ userId: id }),
            FigmaToken.deleteMany({ userId: id }),
            FigmaLink.deleteMany({ userId: id }),
            FigmaChunk.deleteMany({ userId: id }),
            FigmaDraft.deleteMany({ userId: id }),
            FigmaDraftSource.deleteMany({ userId: id }),
            FigmaSource.deleteMany({ userId: id }),
        ]);
        await userService.deleteUser(id);
        req.session.destroy(() => {
            res.clearCookie("TailwindUISession");
            res.json({ message: "Your account was deleted" });
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
