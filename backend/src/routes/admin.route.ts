import { ROUTES } from "@upto/contracts";
import { Router, type Request, type Response } from "express";
import {
  approveEvent,
  isAdmin,
  listReports,
  pendingEvents,
  rejectEvent,
  type AdminDeps,
  type Reply,
} from "../controllers/admin.controller.js";

/**
 * Express adapter for /admin/*. Every route is admin-only: signed out is 401,
 * signed in but not an admin is 403, checked here once for all of them.
 * Session handling is injected through `currentUserId`, as for the other
 * routers.
 *
 * POST /admin/flyer is not registered, so it keeps its 501 stub.
 */
export interface AdminRouteDeps extends AdminDeps {
  currentUserId: (request: Request) => string | null;
}

const pathOf = (route: string) => route.slice(route.indexOf(" ") + 1);

function send<T>(response: Response, reply: Reply<T>): void {
  response.status(reply.status).json(reply.body);
}

const param = (request: Request, name: string) => String(request.params[name] ?? "");

export function adminRouter(deps: AdminRouteDeps): Router {
  const router = Router();

  /** The admin's id, or null once a 401 or 403 has been sent. */
  const asAdmin = async (request: Request, response: Response): Promise<string | null> => {
    const userId = deps.currentUserId(request);
    if (userId === null) {
      response.status(401).json({ ok: false, error: { code: "unauthorized", message: "Sign in first." } });
      return null;
    }
    if (!(await isAdmin(deps.db, userId))) {
      response.status(403).json({ ok: false, error: { code: "forbidden", message: "Admins only." } });
      return null;
    }
    return userId;
  };

  router.get(pathOf(ROUTES.pendingEvents), async (request, response) => {
    const adminId = await asAdmin(request, response);
    if (adminId) send(response, await pendingEvents(deps, adminId));
  });

  router.post(pathOf(ROUTES.approveEvent), async (request, response) => {
    const adminId = await asAdmin(request, response);
    if (adminId) send(response, await approveEvent(deps, adminId, param(request, "id")));
  });

  router.post(pathOf(ROUTES.rejectEvent), async (request, response) => {
    const adminId = await asAdmin(request, response);
    if (adminId) send(response, await rejectEvent(deps, adminId, param(request, "id")));
  });

  router.get(pathOf(ROUTES.listReports), async (request, response) => {
    const adminId = await asAdmin(request, response);
    if (adminId) send(response, await listReports(deps, adminId));
  });

  return router;
}
