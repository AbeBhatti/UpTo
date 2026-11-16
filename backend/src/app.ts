import cors from "cors";
import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import { ROUTES } from "@upto/contracts";
import type { AdminDb } from "./controllers/admin.controller.js";
import type { AuthDb } from "./controllers/auth.controller.js";
import type { ChatDb } from "./services/chat/db.js";
import type { DropsDb } from "./services/drops/db.js";
import type { EventsDb } from "./services/events/db.js";
import type { UpTosDb } from "./services/uptos/db.js";
import type { ReportsDb } from "./services/uptos/reports.js";
import type { VerificationDb } from "./services/verification/db.js";
import { adminRouter } from "./routes/admin.route.js";
import { authRouter, currentUserId, startSession } from "./routes/auth.route.js";
import { chatRouter } from "./routes/chat.route.js";
import { dropsRouter } from "./routes/drops.route.js";
import { eventsRouter } from "./routes/events.route.js";
import { studentVerificationRouter } from "./routes/studentVerification.route.js";
import { uptosRouter } from "./routes/uptos.route.js";

/** Every model the routers touch. The PrismaClient satisfies it at runtime. */
export type AppDb = AuthDb & VerificationDb & ChatDb & EventsDb & UpTosDb & DropsDb & ReportsDb & AdminDb;

export interface AppDeps {
  db: AppDb;
  now?: () => Date;
  /** Delivers a campus verification code. Defaults to logging it (no mailer yet). */
  deliverCode?: (email: string, code: string) => Promise<void>;
}

const logCode = async (email: string, code: string) => {
  console.log(`[verify] code for ${email}: ${code}`);
};

/**
 * With `deps`, the real routers are mounted ahead of the 501 stubs, so any
 * route without an implementation still answers 501. Without `deps` (the
 * contract test), only the stubs are mounted.
 */
export function createApp(deps?: AppDeps): express.Express {
  const app = express();
  app.use(express.json({ limit: "100kb" }));
  // credentials: the session lives in an HttpOnly cookie.
  app.use(cors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:3000", credentials: true }));

  app.get("/health", (_request, response) => {
    response.json({ ok: true, data: { status: "ok" } });
  });

  if (deps) {
    const now = deps.now ?? (() => new Date());
    const db = deps.db;
    const session = (request: express.Request) => currentUserId(request, now());

    app.use(authRouter({ db, now }));
    app.use(
      studentVerificationRouter({
        db,
        now,
        deliverCode: deps.deliverCode ?? logCode,
        currentUserId: session,
        startSession: (response, userId) => startSession(response, userId, now()),
      }),
    );
    app.use(chatRouter({ db, now, currentUserId: session }));
    app.use(eventsRouter({ db, now, currentUserId: session }));
    app.use(uptosRouter({ db, now, currentUserId: session }));
    app.use(dropsRouter({ db, now, currentUserId: session }));
    app.use(adminRouter({ db, now, currentUserId: session }));
  }

  // These 501 stubs make the shared contract available to every owner; each route owner replaces their own stub with its implementation.
  for (const [routeKey, definition] of Object.entries(ROUTES)) {
    const separator = definition.indexOf(" ");
    const method = definition.slice(0, separator).toLowerCase();
    const path = definition.slice(separator + 1);
    const handler: RequestHandler = (_request, response) => {
      response.status(501).json({
        ok: false,
        error: {
          code: "server_error",
          message: `${routeKey} is not implemented yet`,
        },
      });
    };

    app[method as "get" | "post" | "patch"](path, handler);
  }

  app.use((_request, response) => {
    response.status(404).json({
      ok: false,
      error: { code: "not_found", message: "Route not found" },
    });
  });

  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    const malformedJson =
      error instanceof SyntaxError &&
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      error.status === 400;

    if (malformedJson) {
      response.status(400).json({
        ok: false,
        error: { code: "invalid_request", message: "Malformed JSON request body" },
      });
      return;
    }

    response.status(500).json({
      ok: false,
      error: { code: "server_error", message: "Internal server error" },
    });
  };
  app.use(errorHandler);

  return app;
}
