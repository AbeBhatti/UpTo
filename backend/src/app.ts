import cors from "cors";
import express, { type ErrorRequestHandler, type RequestHandler, type Router } from "express";
import { ROUTES } from "@upto/contracts";
import { createRealDeps, type AppDeps } from "./deps.js";
import { adminRouter } from "./routes/admin.route.js";
import { authRouter } from "./routes/auth.route.js";
import { chatRouter } from "./routes/chat.route.js";
import { dropsRouter } from "./routes/drops.route.js";
import { eventsRouter } from "./routes/events.route.js";
import { studentVerificationRouter } from "./routes/studentVerification.route.js";
import { uptosRouter } from "./routes/uptos.route.js";

type ExpressRouteLayer = { route?: { path: string | string[]; methods: Record<string, boolean> } };

function routesServedBy(routers: Router[]): Set<string> {
  const definitions = new Set<string>();
  const routes = Object.values(ROUTES);
  for (const router of routers) {
    for (const layer of (router as unknown as { stack: ExpressRouteLayer[] }).stack) {
      const route = layer.route;
      if (!route) continue;
      const routePaths = Array.isArray(route.path) ? route.path : [route.path];
      for (const routePath of routePaths) {
        for (const [method, serves] of Object.entries(route.methods)) {
          if (!serves) continue;
          const definition = routes.find((candidate) => {
            const [candidateMethod, candidatePath] = candidate.split(" ", 2);
            return candidateMethod.toLowerCase() === method && candidatePath === routePath;
          });
          if (definition) definitions.add(definition);
        }
      }
    }
  }
  return definitions;
}

/** Hides the password in any database URL an error message carries. */
function redact(text: string): string {
  return text.replace(/(postgres(?:ql)?:\/\/[^:/\s]+:)[^@\s]+@/gi, "$1***@");
}

/**
 * Every 500 is logged with what was asked and where it broke; the client
 * still only sees the generic envelope. Without this a failure is a bare 500
 * with an empty server log.
 */
function logServerError(error: unknown, request: express.Request): void {
  const route = (request.route as { path?: string } | undefined)?.path;
  const detail = error instanceof Error ? (error.stack ?? `${error.name}: ${error.message}`) : String(error);
  console.error(redact(`[500] ${request.method} ${request.originalUrl}${route ? ` (route ${route})` : ""}\n${detail}`));
}

export function createApp(deps?: AppDeps): express.Express {
  const app = express();
  const dependencies = deps ?? createRealDeps();
  app.use(express.json({ limit: "100kb" }));
  app.use(cors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:3000", credentials: true }));

  app.get("/health", (_request, response) => {
    response.json({ ok: true, data: { status: "ok" } });
  });

  const routers = [
    authRouter(dependencies.auth),
    studentVerificationRouter(dependencies.verification),
    eventsRouter(dependencies.events),
    uptosRouter(dependencies.uptos),
    dropsRouter(dependencies.drops),
    chatRouter(dependencies.chat),
    // POST /admin/flyer has no handler here, so it keeps its 501 stub: Gemini is cut.
    adminRouter(dependencies.admin),
  ];
  for (const router of routers) app.use(router);

  const servedRoutes = routesServedBy(routers);
  app.locals.servedRouteDefinitions = servedRoutes;
  for (const [routeKey, definition] of Object.entries(ROUTES)) {
    if (servedRoutes.has(definition)) continue;
    const separator = definition.indexOf(" ");
    const method = definition.slice(0, separator).toLowerCase();
    const path = definition.slice(separator + 1);
    const handler: RequestHandler = (_request, response) => {
      response.status(501).json({
        ok: false,
        error: { code: "server_error", message: `${routeKey} is not implemented yet` },
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

  const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
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

    logServerError(error, request);
    response.status(500).json({
      ok: false,
      error: { code: "server_error", message: "Internal server error" },
    });
  };
  app.use(errorHandler);

  return app;
}
