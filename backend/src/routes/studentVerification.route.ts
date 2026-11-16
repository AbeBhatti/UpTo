import { ROUTES } from "@upto/contracts";
import { Router, type Request, type Response } from "express";
import {
  confirmVerification,
  sendVerificationCode,
  switchAccount,
  type Caller,
  type Reply,
  type VerificationDeps,
} from "../controllers/studentVerification.controller.js";

/**
 * Express adapter for POST /verify/send, /verify/confirm and /verify/switch.
 *
 * Authentication and sessions are injected, so this router does not depend
 * on how app.ts wires sessions: `currentUserId` reads the signed-in user,
 * `startSession` signs the student into the account a switch token names.
 */
export interface VerificationRouteDeps extends VerificationDeps {
  currentUserId: (request: Request) => string | null;
  startSession: (response: Response, userId: string) => void;
}

/** Header carrying a stable per-install device id; a switch token is bound to it. */
export const DEVICE_HEADER = "x-device-id";

const pathOf = (route: string) => route.slice(route.indexOf(" ") + 1);

function callerOf(deps: VerificationRouteDeps, request: Request): Caller | null {
  const userId = deps.currentUserId(request);
  if (userId === null) return null;
  return { userId, deviceId: request.header(DEVICE_HEADER)?.trim() || "unknown-device" };
}

function send<T>(response: Response, reply: Reply<T>): void {
  response.status(reply.status).json(reply.body);
}

const unauthorized = (response: Response) =>
  response.status(401).json({ ok: false, error: { code: "unauthorized", message: "Sign in first." } });

export function studentVerificationRouter(deps: VerificationRouteDeps): Router {
  const router = Router();

  router.post(pathOf(ROUTES.sendCode), async (request, response) => {
    const caller = callerOf(deps, request);
    if (caller === null) return void unauthorized(response);
    send(response, await sendVerificationCode(deps, caller, request.body));
  });

  router.post(pathOf(ROUTES.confirmCode), async (request, response) => {
    const caller = callerOf(deps, request);
    if (caller === null) return void unauthorized(response);
    send(response, await confirmVerification(deps, caller, request.body));
  });

  router.post(pathOf(ROUTES.switchAccount), async (request, response) => {
    const caller = callerOf(deps, request);
    if (caller === null) return void unauthorized(response);
    const reply = await switchAccount(deps, caller, request.body);
    if (reply.body.ok) deps.startSession(response, reply.body.data.user.id);
    send(response, reply);
  });

  return router;
}
