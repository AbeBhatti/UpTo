import { ROUTES } from "@upto/contracts";
import { Router, type Request, type Response } from "express";
import {
  addMembers,
  createRoom,
  listMessages,
  listRooms,
  muteRoom,
  renameRoom,
  reportMessage,
  sendMessage,
  type ChatDeps,
  type Reply,
} from "../controllers/chat.controller.js";

/**
 * Express adapter for /chat/*. REST only; no sockets this week.
 * Session handling is injected through `currentUserId`.
 */
export interface ChatRouteDeps extends ChatDeps {
  currentUserId: (request: Request) => string | null;
}

const pathOf = (route: string) => route.slice(route.indexOf(" ") + 1);

function send<T>(response: Response, reply: Reply<T>): void {
  response.status(reply.status).json(reply.body);
}

const param = (request: Request, name: string) => String(request.params[name] ?? "");

export function chatRouter(deps: ChatRouteDeps): Router {
  const router = Router();

  // Every chat route needs a session.
  const signedIn = (request: Request, response: Response): string | null => {
    const userId = deps.currentUserId(request);
    if (userId === null) {
      response.status(401).json({ ok: false, error: { code: "unauthorized", message: "Sign in first." } });
    }
    return userId;
  };

  router.get(pathOf(ROUTES.listRooms), async (request, response) => {
    const userId = signedIn(request, response);
    if (userId) send(response, await listRooms(deps, userId));
  });

  router.post(pathOf(ROUTES.createRoom), async (request, response) => {
    const userId = signedIn(request, response);
    if (userId) send(response, await createRoom(deps, userId, request.body));
  });

  router.patch(pathOf(ROUTES.renameRoom), async (request, response) => {
    const userId = signedIn(request, response);
    if (userId) send(response, await renameRoom(deps, userId, param(request, "id"), request.body));
  });

  router.post(pathOf(ROUTES.addMembers), async (request, response) => {
    const userId = signedIn(request, response);
    if (userId) send(response, await addMembers(deps, userId, param(request, "id"), request.body));
  });

  router.get(pathOf(ROUTES.listMessages), async (request, response) => {
    const userId = signedIn(request, response);
    if (userId) send(response, await listMessages(deps, userId, param(request, "id"), { limit: request.query.limit }));
  });

  router.post(pathOf(ROUTES.sendMessage), async (request, response) => {
    const userId = signedIn(request, response);
    if (userId) send(response, await sendMessage(deps, userId, param(request, "id"), request.body));
  });

  router.post(pathOf(ROUTES.muteRoom), async (request, response) => {
    const userId = signedIn(request, response);
    if (userId) send(response, await muteRoom(deps, userId, param(request, "id"), request.body));
  });

  router.post(pathOf(ROUTES.reportMessage), async (request, response) => {
    const userId = signedIn(request, response);
    if (userId) send(response, await reportMessage(deps, userId, param(request, "id"), request.body));
  });

  return router;
}
