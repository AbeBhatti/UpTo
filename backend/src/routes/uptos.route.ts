import { ROUTES } from "@upto/contracts";
import { Router, type Request, type Response } from "express";
import {
  createPoll,
  createUpTo,
  getSharedUpTo,
  getUpTo,
  reportUpTo,
  respondPoll,
  rsvpUpTo,
  type Reply,
  type UpTosDeps,
} from "../controllers/uptos.controller.js";

/**
 * Express adapter for /uptos/* (Up-Tos and their polls) and the public
 * /u/:slug share page. Reading works signed out (myRsvp is then null);
 * creating, RSVPing, polls and reports need a session. Session handling is
 * injected through `currentUserId`, as for events and chat.
 */
export interface UpTosRouteDeps extends UpTosDeps {
  currentUserId: (request: Request) => string | null;
}

const pathOf = (route: string) => route.slice(route.indexOf(" ") + 1);

function send<T>(response: Response, reply: Reply<T>): void {
  response.status(reply.status).json(reply.body);
}

const param = (request: Request, name: string) => String(request.params[name] ?? "");

export function uptosRouter(deps: UpTosRouteDeps): Router {
  const router = Router();

  const signedIn = (request: Request, response: Response): string | null => {
    const userId = deps.currentUserId(request);
    if (userId === null) {
      response.status(401).json({ ok: false, error: { code: "unauthorized", message: "Sign in first." } });
    }
    return userId;
  };

  router.post(pathOf(ROUTES.createUpTo), async (request, response) => {
    const userId = signedIn(request, response);
    if (userId) send(response, await createUpTo(deps, userId, request.body));
  });

  router.get(pathOf(ROUTES.getUpTo), async (request, response) => {
    send(response, await getUpTo(deps, deps.currentUserId(request), param(request, "id")));
  });

  router.get(pathOf(ROUTES.getSharedUpTo), async (request, response) => {
    send(response, await getSharedUpTo(deps, deps.currentUserId(request), param(request, "slug")));
  });

  router.post(pathOf(ROUTES.rsvpUpTo), async (request, response) => {
    const userId = signedIn(request, response);
    if (userId) send(response, await rsvpUpTo(deps, userId, param(request, "id"), request.body));
  });

  router.post(pathOf(ROUTES.createPoll), async (request, response) => {
    const userId = signedIn(request, response);
    if (userId) send(response, await createPoll(deps, userId, param(request, "id"), request.body));
  });

  router.post(pathOf(ROUTES.respondPoll), async (request, response) => {
    const userId = signedIn(request, response);
    if (userId) send(response, await respondPoll(deps, userId, param(request, "id"), request.body));
  });

  router.post(pathOf(ROUTES.reportUpTo), async (request, response) => {
    const userId = signedIn(request, response);
    if (userId) send(response, await reportUpTo(deps, userId, param(request, "id"), request.body));
  });

  return router;
}
