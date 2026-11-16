import { ROUTES } from "@upto/contracts";
import { Router, type Request, type Response } from "express";
import {
  SESSION_TTL_MS,
  googleSignIn,
  me,
  readSession,
  signIn,
  signOut,
  signSession,
  signUp,
  type AuthDeps,
  type Reply,
} from "../controllers/auth.controller.js";

/**
 * Express adapter for /auth/*. The session lives in an HttpOnly cookie.
 *
 * `currentUserId` and `startSession` are exported so the verification and
 * chat routers can be handed the same session handling at wiring time.
 */

export const SESSION_COOKIE = "upto_session";

const pathOf = (route: string) => route.slice(route.indexOf(" ") + 1);

function cookieValue(request: Request, name: string): string | undefined {
  const header = request.header("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

function cookie(value: string, maxAgeSeconds: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function currentUserId(request: Request, now: Date = new Date()): string | null {
  return readSession(cookieValue(request, SESSION_COOKIE), now);
}

export function startSession(response: Response, userId: string, now: Date = new Date()): void {
  response.append("Set-Cookie", cookie(signSession(userId, now), Math.floor(SESSION_TTL_MS / 1000)));
}

export function endSession(response: Response): void {
  response.append("Set-Cookie", cookie("", 0));
}

function send<T>(response: Response, reply: Reply<T>): void {
  response.status(reply.status).json(reply.body);
}

export function authRouter(deps: AuthDeps): Router {
  const router = Router();

  router.post(pathOf(ROUTES.signUp), async (request, response) => {
    const reply = await signUp(deps, request.body);
    if (reply.body.ok) startSession(response, reply.body.data.user.id, deps.now());
    send(response, reply);
  });

  router.post(pathOf(ROUTES.signIn), async (request, response) => {
    const reply = await signIn(deps, request.body);
    if (reply.body.ok) startSession(response, reply.body.data.user.id, deps.now());
    send(response, reply);
  });

  router.post(pathOf(ROUTES.googleSignIn), async (request, response) => {
    send(response, await googleSignIn(deps, request.body));
  });

  router.get(pathOf(ROUTES.me), async (request, response) => {
    send(response, await me(deps, currentUserId(request, deps.now())));
  });

  router.post(pathOf(ROUTES.signOut), (_request, response) => {
    endSession(response);
    send(response, signOut());
  });

  return router;
}
