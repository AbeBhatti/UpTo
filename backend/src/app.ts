import cors from "cors";
import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import { ROUTES } from "@upto/contracts";

export function createApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: "100kb" }));
  app.use(cors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:3000" }));

  app.get("/health", (_request, response) => {
    response.json({ ok: true, data: { status: "ok" } });
  });

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
