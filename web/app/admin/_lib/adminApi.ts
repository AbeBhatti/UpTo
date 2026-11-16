/**
 * Admin routes (Abhi's `controllers/admin.*`, not written yet — until then the
 * fixture mock answers). Paths come from ROUTES in @upto/contracts.
 *
 * Two shapes the contract doesn't declare yet, assumed here:
 *   - approve / reject return the updated CampusEvent
 *   - GET /admin/reports returns Report[]  (a { reports } wrapper is also accepted)
 */
import type { ApiResponse, CampusEvent, PendingEventsResponse, Report } from "@upto/contracts";
import { call } from "../../(app)/create/_shared/api";

export const listPendingEvents = () => call<PendingEventsResponse>("pendingEvents");

export const approveEvent = (id: string) => call<CampusEvent>("approveEvent", { params: { id } });

export const rejectEvent = (id: string) => call<CampusEvent>("rejectEvent", { params: { id } });

export async function listReports(): Promise<ApiResponse<Report[]>> {
  const res = await call<Report[] | { reports: Report[] }>("listReports");
  if (!res.ok) return res;
  return { ok: true, data: Array.isArray(res.data) ? res.data : res.data.reports };
}
