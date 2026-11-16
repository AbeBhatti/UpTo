import type { PublicUser, ReportReason } from "@upto/contracts";

/**
 * Lab 4: the abstract Report, stored as ONE Report table with a targetType
 * discriminator (prisma/schema.prisma). The responses narrow it back into the
 * class diagram's subclasses, DropReport and UpToReport.
 *
 * Exactly one of dropId, upToId and messageId is set. The schema comment
 * describes a check constraint that enforces this, but no migration exists
 * yet, so until the first one adds it the only guarantee is this code: each
 * report endpoint sets its own target id and leaves the other two null.
 *
 * Shared by uptos.controller.ts and drops.controller.ts; chat reports are
 * Abe's.
 */

export type ReportTargetValue = "DROP" | "UPTO" | "MESSAGE";

export interface ReportRow {
  id: string;
  reporterId: string;
  targetType: ReportTargetValue;
  reason: ReportReason;
  details: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  dropId: string | null;
  upToId: string | null;
  messageId: string | null;
}

export interface ReportsDb {
  report: {
    create(args: {
      data: {
        reporterId: string;
        targetType: ReportTargetValue;
        reason: ReportReason;
        details: string | null;
        dropId: string | null;
        upToId: string | null;
        messageId: null;
      };
    }): Promise<ReportRow>;
  };
}

/** Blank details mean none, as a blank description does. */
export function reportDetails(details: string | undefined): string | null {
  return details === undefined || details.trim() === "" ? null : details;
}

/** The ReportBase fields every narrowed report shares. */
export function reportBase(row: ReportRow, reporter: PublicUser) {
  return {
    id: row.id,
    reporter,
    reason: row.reason,
    details: row.details,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
  };
}

/** What GET /admin/reports reads. */
export interface ReportsReadDb {
  report: {
    findMany(args: {
      where: Record<string, unknown>;
      orderBy: Array<Record<string, "asc" | "desc">>;
    }): Promise<ReportRow[]>;
  };
}
