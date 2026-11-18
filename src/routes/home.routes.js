import express from "express";
import mongoose from "mongoose";
import Component from "../models/component.model.js";
import { galleryCache } from "../utils/galleryCache.js";

const router = express.Router();

/** Which of these gallery designs the person has already saved: Map of the design's id to their (latest) copy's id. */
async function savedCopies(userId, ids) {
    const map = new Map();
    if (!userId || !ids.length) return map;
    const copies = await Component.find({ createdBy: userId, forkedFrom: { $in: ids } }).select("forkedFrom").sort("-createdAt").lean();
    copies.forEach((c) => { const k = String(c.forkedFrom); if (!map.has(k)) map.set(k, String(c._id)); });
    return map;
}

// Category definitions with display names
const categories = {
    'marketing-hero': { name: 'Hero Sections', group: 'Marketing' },
    'marketing-hero-forms': { name: 'Hero Forms', group: 'Marketing' },
    'marketing-icons': { name: 'Icon Sections', group: 'Marketing' },
    'marketing-pricing': { name: 'Pricing Sections', group: 'Marketing' },
    'marketing-faq': { name: 'FAQ Sections', group: 'Marketing' },
    'marketing-blog': { name: 'Blog Sections', group: 'Marketing' },
    'marketing-testimonials': { name: 'Testimonials', group: 'Marketing' },
    'marketing-team': { name: 'Team Sections', group: 'Marketing' },
    'marketing-features': { name: 'Features', group: 'Marketing' },
    'marketing-announcements': { name: 'Announcement Banners', group: 'Marketing' },
    'marketing-cards': { name: 'Card Sections', group: 'Marketing' },
    'marketing-clients': { name: 'Clients Sections', group: 'Marketing' },
    'marketing-galleries': { name: 'Galleries', group: 'Marketing' },
    'marketing-timeline': { name: 'Timeline', group: 'Marketing' },
    'marketing-cta': { name: 'Call to Action', group: 'Marketing' },
    'marketing-stats': { name: 'Stats Sections', group: 'Marketing' },
    'ui-dropdowns': { name: 'Dropdowns', group: 'UI Components' },
    'ui-selects': { name: 'Selects', group: 'UI Components' },
    'ui-buttons': { name: 'Button Groups', group: 'UI Components' },
    'ui-modals': { name: 'Modals', group: 'UI Components' },
    'ui-cookie-banners': { name: 'Cookie Banners', group: 'UI Components' },
    'ui-alerts': { name: 'Alerts & Toasts', group: 'UI Components' },
    'ui-badges': { name: 'Badges & Tags', group: 'UI Components' },
    'ui-tabs': { name: 'Tabs', group: 'UI Components' },
    'ui-accordions': { name: 'Accordions', group: 'UI Components' },
    'ui-empty-states': { name: 'Empty States', group: 'UI Components' },
    'ui-avatars': { name: 'Avatars', group: 'UI Components' },
    'ui-drawers': { name: 'Drawers', group: 'UI Components' },
    'ui-popovers': { name: 'Popovers & Tooltips', group: 'UI Components' },
    'ui-progress': { name: 'Progress & Steppers', group: 'UI Components' },
    'ui-skeletons': { name: 'Skeleton Loaders', group: 'UI Components' },
    'navigation-navbars': { name: 'Navbars / Headers', group: 'Navigation' },
    'navigation-mega-menu': { name: 'Mega Menu', group: 'Navigation' },
    'navigation-sidebars': { name: 'Sidebars', group: 'Navigation' },
    'navigation-pagination': { name: 'Pagination & Breadcrumbs', group: 'Navigation' },
    'layout-basic': { name: 'Layouts', group: 'Layout' },
    'forms-authentication': { name: 'Authentication', group: 'Forms' },
    'forms-feedback': { name: 'Feedback', group: 'Forms' },
    'forms-subscribe': { name: 'Subscribe', group: 'Forms' },
    'forms-textarea': { name: 'Textarea Inputs', group: 'Forms' },
    'forms-controls': { name: 'Toggles & Checkboxes', group: 'Forms' },
    'pages-pricing': { name: 'Pricing Page', group: 'Pages' },
    'pages-landing': { name: 'Landing Pages', group: 'Pages' },
    'pages-about': { name: 'About Pages', group: 'Pages' },
    'pages-contact': { name: 'Contact Pages', group: 'Pages' },
    'pages-auth': { name: 'Sign In & Sign Up Pages', group: 'Pages' },
    'pages-dashboard': { name: 'Dashboard Pages', group: 'Pages' },
    'pages-settings': { name: 'Settings Pages', group: 'Pages' },
    'pages-blog-post': { name: 'Blog Post Pages', group: 'Pages' },
    'pages-error': { name: 'Error Pages', group: 'Pages' },
    'ecommerce-products': { name: 'Product Listings', group: 'E-Commerce' },
    'ecommerce-product-detail': { name: 'Product Detail', group: 'E-Commerce' },
    'ecommerce-cart': { name: 'Shopping Cart', group: 'E-Commerce' },
    'ecommerce-checkout': { name: 'Checkout', group: 'E-Commerce' },
    'apps-general': { name: 'Application Components', group: 'Applications' },
    'apps-invoice': { name: 'Invoice', group: 'Applications' },
    'apps-tables': { name: 'Tables', group: 'Applications' },
    'apps-stats': { name: 'Stats', group: 'Applications' },
    'apps-charts': { name: 'Charts', group: 'Applications' },
    'apps-ai-prompt': { name: 'AI Prompt', group: 'Applications' },
    'apps-dashboards': { name: 'Dashboards', group: 'Applications' },
    'apps-chat': { name: 'Chat & Messaging', group: 'Applications' },
    'apps-kanban': { name: 'Kanban Boards', group: 'Applications' },
    'apps-calendar': { name: 'Calendars', group: 'Applications' },
    'footer-contact': { name: 'Contact Sections', group: 'Footer' },
    'footer-footers': { name: 'Footers', group: 'Footer' }
};

// How many published designs each category has (and how many are new): the landing page and every category's sidebar use it.
const categoryCountRows = () =>
    galleryCache("counts", () => {
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        return Component.aggregate([
            { $match: { isPublished: true } },
            { $group: { _id: "$category", count: { $sum: 1 }, newCount: { $sum: { $cond: [{ $gte: ["$createdAt", oneMonthAgo] }, 1, 0] } } } }
        ]);
    });

// Home page - Shows only categories that have components
router.get("/", async (req, res) => {
    try {
        const results = await categoryCountRows(); // kept for 30 s, cleared when a design is written (utils/galleryCache.js)

        let totalComponents = 0;
        const categoryCards = results
            .filter(r => r.count > 0)
            .map(r => {
                totalComponents += r.count;
                return {
                    slug: r._id,
                    name: categories[r._id]?.name || r._id,
                    group: categories[r._id]?.group || 'Other',
                    kind: kindOfCategory(r._id), // pages and components are shown on their own tabs
                    count: r.count,
                    newCount: r.newCount,
                    hasNew: r.newCount > 0
                };
            })
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true })); // A to Z

        res.status(200).render("main/home", {
            activePage: 'home',
            layout: 'main',
            title: 'Windcraft',
            user: req.session.user || null,
            categories: categoryCards,
            pageCount: categoryCards.filter(c => c.kind === 'page').reduce((n, c) => n + c.count, 0),
            componentCount: categoryCards.filter(c => c.kind === 'component').reduce((n, c) => n + c.count, 0),
            totalComponents
        });
    } catch (error) {
        console.error('Error loading home page:', error);
        res.status(500).render("error", {
            layout: "main",
            title: "Error",
            message: "Failed to load components",
        });
    }
});

// Category detail page - Shows components in that category
router.get("/category/:category", async (req, res) => {
    try {
        const { category } = req.params;

        const categoryInfo = categories[category];
        if (!categoryInfo) {
            return res.status(404).render("error", {
                layout: "main",
                title: "Category Not Found",
                message: "The category you're looking for doesn't exist.",
            });
        }

        // The sidebar's counts and this category's designs are asked for together (not one after the other), and both are kept for a short
        // while (utils/galleryCache.js). The designs come without their version history, and without a lookup of their author: the page uses neither.
        const [countResults, designs] = await Promise.all([
            categoryCountRows(),
            galleryCache(`category:${category}`, () =>
                Component.find({ category, isPublished: true })
                    .select("-versions")
                    .sort({ likes: -1, createdAt: -1 }) // the most liked first; the newest first among equals
                    .lean()
            ),
        ]);

        const allCategories = countResults
            .filter(r => r.count > 0)
            .map(r => ({
                slug: r._id,
                name: categories[r._id]?.name || r._id,
                count: r.count,
                isActive: r._id === category
            }));

        // Mark which components are new, and what is particular to this visitor (the designs themselves are shared, so they are copied)
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

        const me = req.session.user ? req.session.user.id : null;
        const saved = await savedCopies(me, designs.map((c) => c._id));
        const components = designs.map(({ likedBy, ...component }) => ({ // who liked a design is not sent to the page
            ...component,
            savedId: saved.get(String(component._id)) || "", // your own copy of this design, if you have saved it
            isNew: new Date(component.createdAt) >= oneMonthAgo,
            likes: component.likes || 0,
            liked: Boolean(me) && (likedBy || []).some((u) => String(u) === me), // whether this person likes it
        }));

        res.status(200).render("main/category-detail", {
            activePage: 'category',
            layout: 'main',
            title: categoryInfo.name,
            user: req.session.user || null,
            components: components,
            categoryName: categoryInfo.name,
            categorySlug: category,
            categories: allCategories
        });
    } catch (error) {
        console.error('Error loading category:', error);
        res.status(500).render("error", {
            layout: "main",
            title: "Error",
            message: "Failed to load category",
        });
    }
});

// Component detail page
router.get("/component/:id", async (req, res) => {
    try {
        const me = req.session.user ? req.session.user.id : null;
        const component = mongoose.isValidObjectId(req.params.id) ? await Component.findById(req.params.id).populate('createdBy', 'name email').lean() : null;
        // a design that is not in the gallery can only be opened by its owner
        const visible = component && (component.isPublished || (component.createdBy && String(component.createdBy._id) === me));

        if (!visible) {
            return res.status(404).render("error", {
                layout: "main",
                title: "Component Not Found",
                message: "The component you're looking for doesn't exist.",
            });
        }

        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        component.isNew = new Date(component.createdAt) >= oneMonthAgo;
        component.savedId = (await savedCopies(me, [component._id])).get(String(component._id)) || "";
        component.likes = component.likes || 0;
        component.liked = Boolean(me) && (component.likedBy || []).some((u) => String(u) === me);
        delete component.likedBy;

        res.status(200).render("main/component-detail", {
            activePage: 'component',
            layout: 'main',
            title: component.title,
            user: req.session.user || null,
            component: component
        });
    } catch (error) {
        console.error('Error loading component:', error);
        res.status(500).render("error", {
            layout: "main",
            title: "Error",
            message: "Failed to load component",
        });
    }
});

/** What a design is follows its category: the "Pages" group (a pricing page...) are pages; every other category is a component (a part). */
export const kindOfCategory = (slug) => (categories[slug]?.group === "Pages" ? "page" : "component");
export { categories };
export default router;