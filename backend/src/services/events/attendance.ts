import type { AttendanceRow, AttendanceStatusValue, EventsDb } from "./db.js";

/**
 * Lab 4: Attendance "status", setStatus(status). One row per user per event.
 *
 * NOT_GOING is a status, not a deletion: the row stays, so a later change of
 * mind is an update. CampusEvent.goingCount is denormalised and is recomputed
 * from the rows after every change rather than incremented, so a repeated or
 * replayed RSVP can never drift the count.
 */
export const Attendance = {
  async setStatus(
    db: EventsDb,
    userId: string,
    campusEventId: string,
    status: AttendanceStatusValue,
  ): Promise<{ attendance: AttendanceRow; goingCount: number }> {
    return db.$transaction(async (tx) => {
      const attendance = await tx.attendance.upsert({
        where: { userId_campusEventId: { userId, campusEventId } },
        create: { userId, campusEventId, status },
        update: { status },
      });
      const goingCount = await tx.attendance.count({ where: { campusEventId, status: "GOING" } });
      await tx.campusEvent.update({ where: { id: campusEventId }, data: { goingCount } });
      return { attendance, goingCount };
    });
  },
};
