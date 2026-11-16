import session from 'express-session';
import MongoStore from "connect-mongo";
import mongoose from "mongoose";
import connectDB from "../config/mongoConnection.js";
import { mongoConfig } from '../config/settings.js';

// The sessions use the app's own database connection. The store used to open a second one of its own, and opening a connection to a
// far-away database takes several round trips (TLS, then the login): that was paid twice on every cold start.
// The store is handed a promise that never gives up: it resolves with the shared client as soon as the connection is up, and until then
// the store waits (as the app does), so one failed attempt cannot leave the sessions dead for the life of the process.
const sharedClient = (async () => {
    for (let wait = 500; ; wait = Math.min(wait * 2, 5000)) {
        try {
            await connectDB();
            return mongoose.connection.getClient();
        } catch {
            await new Promise((resolve) => setTimeout(resolve, wait).unref());
        }
    }
})();

const sessionConfig = session({
    name: 'TailwindUISession',
    secret: process.env.SESSION_SECRET || 'change-this-secret-in-env',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        clientPromise: sharedClient,
        dbName: mongoConfig.database,
        collectionName: "sessions",
        ttl: 60 * 60 * 2,
    }),
    cookie: {
        maxAge: 1000 * 60 * 60 * 2,
        httpOnly: true,
        sameSite: 'lax',
        secure: 'auto',
    },
});

export { sessionConfig }
