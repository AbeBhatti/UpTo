import type { CampusEventRow, EventsDb, ReviewStatusValue } from "./db.js";

/**
 * Lab 4: CampusEvent.approve(). Review moves an event between PENDING,
 * APPROVED and REJECTED; only APPROVED events reach students.
 *
 * Both moves are allowed from any status and are idempotent: approving an
 * approved event changes nothing, rejecting an approved one takes it down,
 * and approving a rejected one puts it back. The admin console decides which
 * buttons to show; the server does not refuse a change of mind.
 */
export const CampusEvent = {
  approve(db: EventsDb, id: string): Promise<CampusEventRow> {
    return review(db, id, "APPROVED");
  },

  reject(db: EventsDb, id: string): Promise<CampusEventRow> {
    return review(db, id, "REJECTED");
  },
};

function review(db: EventsDb, id: string, reviewStatus: ReviewStatusValue): Promise<CampusEventRow> {
  return db.campusEvent.update({ where: { id }, data: { reviewStatus } });
}
