import { ROUTES } from "@upto/contracts";
import { Router, type Request, type Response } from "express";
import { agreeToRules, createDrop, listDrops, reportDrop, voteDrop, type DropsDeps, type Reply } from "../controllers/drops.controller.js";

/**
 * Express adapter for /drops/*. Reading works signed out (myVote is then
 * null); agreeing to the rules, posting, voting and reporting need a
 * session. Session handling is injected through `currentUserId`, as for
 * events and chat.
 */
export interface DropsRouteDeps extends DropsDeps {
  currentUserId: (request: Request) => string | null;
}

const pathOf = (route: string) => route.slice(route.indexOf(" ") + 1);

function send<T>(response: Response, reply: Reply<T>): void {
  response.status(reply.status).json(reply.body);
}

const param = (request: Request, name: string) => String(request.params[name] ?? "");

export function dropsRouter(deps: DropsRouteDeps): Router {
  const router = Router();

  const signedIn = (request: Request, response: Response): string | null => {
    const userId = deps.currentUserId(request);
    if (userId === null) {
      response.status(401).json({ ok: false, error: { code: "unauthorized", message: "Sign in first." } });
    }
    return userId;
  };

  router.get(pathOf(ROUTES.listDrops), async (request, response) => {
    send(response, await listDrops(deps, deps.currentUserId(request)));
  });

  // Registered before /drops/:id/vote. The paths cannot collide, but keeping
  // the literal route first keeps it obvious.
  router.post(pathOf(ROUTES.rulesAgreement), async (request, response) => {
    const userId = signedIn(request, response);
    if (userId) send(response, await agreeToRules(deps, userId, request.body));
  });

  router.post(pathOf(ROUTES.createDrop), async (request, response) => {
    const userId = signedIn(request, response);
    if (userId) send(response, await createDrop(deps, userId, request.body));
  });

  router.post(pathOf(ROUTES.voteDrop), async (request, response) => {
    const userId = signedIn(request, response);
    if (userId) send(response, await voteDrop(deps, userId, param(request, "id"), request.body));
  });

  router.post(pathOf(ROUTES.reportDrop), async (request, response) => {
    const userId = signedIn(request, response);
    if (userId) send(response, await reportDrop(deps, userId, param(request, "id"), request.body));
  });

  return router;
}
