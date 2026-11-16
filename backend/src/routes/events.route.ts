import { ROUTES } from "@upto/contracts";
import { Router, type Request, type Response } from "express";
import { getEvent, listEvents, rsvp, rsvpSync, type EventsDeps, type Reply } from "../controllers/events.controller.js";

/**
 * Express adapter for /events/*. Reading the feed works signed out (myStatus
 * is then null); RSVPs need a session. Session handling is injected through
 * `currentUserId`, as for chat.
 */
export interface EventsRouteDeps extends EventsDeps {
  currentUserId: (request: Request) => string | null;
}

const pathOf = (route: string) => route.slice(route.indexOf(" ") + 1);

function send<T>(response: Response, reply: Reply<T>): void {
  response.status(reply.status).json(reply.body);
}

const param = (request: Request, name: string) => String(request.params[name] ?? "");

export function eventsRouter(deps: EventsRouteDeps): Router {
  const router = Router();

  const signedIn = (request: Request, response: Response): string | null => {
    const userId = deps.currentUserId(request);
    if (userId === null) {
      response.status(401).json({ ok: false, error: { code: "unauthorized", message: "Sign in first." } });
    }
    return userId;
  };

  router.get(pathOf(ROUTES.listEvents), async (request, response) => {
    send(response, await listEvents(deps, deps.currentUserId(request), request.query));
  });

  // Registered before /events/:id/rsvp. The paths cannot collide (their last
  // segments differ), but keeping the literal route first keeps it obvious.
  router.post(pathOf(ROUTES.rsvpSync), async (request, response) => {
    const userId = signedIn(request, response);
    if (userId) send(response, await rsvpSync(deps, userId, request.body));
  });

  router.get(pathOf(ROUTES.getEvent), async (request, response) => {
    send(response, await getEvent(deps, deps.currentUserId(request), param(request, "id")));
  });

  router.post(pathOf(ROUTES.rsvp), async (request, response) => {
    const userId = signedIn(request, response);
    if (userId) send(response, await rsvp(deps, userId, param(request, "id"), request.body));
  });

  return router;
}
