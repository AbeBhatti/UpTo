"use client";

/**
 * The Lab 4 Admin actor's console: approve or reject pending events, and a
 * read-only list of reports. Deliberately plain.
 *
 * Event times and sign-up copy are the server's strings (`timeLabel`,
 * `signup.label`), shown verbatim, never recomputed.
 */
import { useCallback, useEffect, useState } from "react";
import type { ApiResponse, CampusEvent, Report, ReportReason } from "@upto/contracts";
import { Banner, Button, cx } from "../../(app)/create/_shared/form";
import { approveEvent, listPendingEvents, listReports, rejectEvent } from "../_lib/adminApi";
import s from "../admin.module.css";

type ApiError = Extract<ApiResponse<never>, { ok: false }>["error"];

type Load<T> = { kind: "loading" } | { kind: "ready"; data: T } | { kind: "error"; error: ApiError };

const REASONS: Record<ReportReason, string> = {
  ABOUT_A_PERSON: "About a person",
  THREAT: "Threat",
  HATE: "Hate",
  SEXUAL: "Sexual",
  SPAM: "Spam",
  OTHER: "Other",
};

function when(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
  });
}

function isAccessError(error: ApiError) {
  return error.code === "unauthorized" || error.code === "forbidden";
}

export function AdminConsole() {
  const [events, setEvents] = useState<Load<CampusEvent[]>>({ kind: "loading" });
  const [reports, setReports] = useState<Load<Report[]>>({ kind: "loading" });

  const load = useCallback(async () => {
    setEvents({ kind: "loading" });
    setReports({ kind: "loading" });
    const [e, r] = await Promise.all([listPendingEvents(), listReports()]);
    setEvents(e.ok ? { kind: "ready", data: e.data.events } : { kind: "error", error: e.error });
    setReports(r.ok ? { kind: "ready", data: r.data } : { kind: "error", error: r.error });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const denied =
    (events.kind === "error" && isAccessError(events.error)) || (reports.kind === "error" && isAccessError(reports.error));

  return (
    <main className={s.page}>
      <div className={s.top}>
        <h1 className={s.title}>Admin</h1>
        <Button variant="secondary" className={s.small} onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {denied ? (
        <Banner tone="danger" title="Admins only">
          Sign in with an admin account to review events and reports.
        </Banner>
      ) : (
        <>
          <PendingEvents state={events} onChange={(data) => setEvents({ kind: "ready", data })} />
          <Reports state={reports} />
        </>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------

function PendingEvents({ state, onChange }: { state: Load<CampusEvent[]>; onChange: (events: CampusEvent[]) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmReject, setConfirmReject] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  if (state.kind === "loading") return <Section title="Pending events" count="Loading…" />;
  if (state.kind === "error")
    return (
      <Section title="Pending events">
        <Banner tone="danger">{state.error.message}</Banner>
      </Section>
    );

  const rows = state.data;
  const pending = rows.filter((e) => e.reviewStatus === "PENDING").length;

  async function review(event: CampusEvent, action: "approve" | "reject") {
    setBusy(event.id);
    setRowErrors((p) => ({ ...p, [event.id]: "" }));
    const res = await (action === "approve" ? approveEvent(event.id) : rejectEvent(event.id));
    setBusy(null);
    setConfirmReject(null);
    if (!res.ok) return setRowErrors((p) => ({ ...p, [event.id]: res.error.message }));
    // Keep the row, now showing its new status, so the admin sees what happened.
    onChange(rows.map((e) => (e.id === event.id ? { ...e, ...res.data } : e)));
  }

  return (
    <Section title="Pending events" count={`${pending} waiting`}>
      {rows.length === 0 ? (
        <div className={s.tableWrap}>
          <p className={s.empty}>Nothing to review.</p>
        </div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th scope="col">Event</th>
                <th scope="col">When</th>
                <th scope="col">Where</th>
                <th scope="col">Sign-up</th>
                <th scope="col" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td>
                    <div className={s.primaryCell}>
                      <span>{e.title}</span>
                      <span className={s.sub}>
                        {[e.organizer, e.category, e.source?.label].filter(Boolean).join(" · ") || "No details"}
                      </span>
                    </div>
                  </td>
                  <td className={s.nowrap}>{e.timeLabel}</td>
                  <td>{e.location}</td>
                  <td className={s.sub}>{e.signup.label ?? "—"}</td>
                  <td>
                    {e.reviewStatus === "PENDING" ? (
                      <div className={s.rowActions}>
                        {confirmReject === e.id ? (
                          <>
                            <Button variant="secondary" className={s.small} disabled={busy === e.id} onClick={() => setConfirmReject(null)}>
                              Cancel
                            </Button>
                            <Button className={s.small} busy={busy === e.id} busyLabel="Rejecting…" onClick={() => void review(e, "reject")}>
                              Confirm reject
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button variant="secondary" className={s.small} disabled={busy !== null} onClick={() => setConfirmReject(e.id)}>
                              Reject
                            </Button>
                            <Button className={s.small} busy={busy === e.id} busyLabel="Approving…" disabled={busy !== null} onClick={() => void review(e, "approve")}>
                              Approve
                            </Button>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className={s.rowActions}>
                        <span className={cx(s.chip, e.reviewStatus === "APPROVED" ? s.chipDone : s.chipOpen)}>
                          {e.reviewStatus === "APPROVED" ? "Approved · now in the feed" : "Rejected"}
                        </span>
                      </div>
                    )}
                    {rowErrors[e.id] ? <p className={s.rowError}>{rowErrors[e.id]}</p> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------

function target(r: Report): { kind: string; text: string; by: string } {
  switch (r.targetType) {
    case "UPTO":
      return { kind: "Up-To", text: r.upTo.title, by: r.upTo.creator.username };
    case "DROP":
      return { kind: "Drop", text: r.drop.text, by: r.drop.author.username };
    case "MESSAGE":
      return { kind: "Message", text: r.message.content, by: r.message.sender.username };
  }
}

function Reports({ state }: { state: Load<Report[]> }) {
  if (state.kind === "loading") return <Section title="Reports" count="Loading…" />;
  if (state.kind === "error")
    return (
      <Section title="Reports">
        <Banner tone="danger">{state.error.message}</Banner>
      </Section>
    );

  const open = state.data.filter((r) => r.resolvedAt === null).length;
  return (
    <Section title="Reports" count={`${open} open · read-only`}>
      {state.data.length === 0 ? (
        <div className={s.tableWrap}>
          <p className={s.empty}>No reports.</p>
        </div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th scope="col">Reported</th>
                <th scope="col">Reason</th>
                <th scope="col">Reporter</th>
                <th scope="col">When</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {state.data.map((r) => {
                const t = target(r);
                return (
                  <tr key={r.id}>
                    <td>
                      <div className={s.primaryCell}>
                        <span>
                          <span className={s.chip}>{t.kind}</span> {t.text}
                        </span>
                        <span className={s.sub}>by @{t.by}</span>
                      </div>
                    </td>
                    <td>
                      <div className={s.primaryCell}>
                        <span>{REASONS[r.reason]}</span>
                        {r.details ? <span className={s.sub}>{r.details}</span> : null}
                      </div>
                    </td>
                    <td className={s.nowrap}>@{r.reporter.username}</td>
                    <td className={s.nowrap}>{when(r.createdAt)}</td>
                    <td>
                      <span className={cx(s.chip, r.resolvedAt ? s.chipDone : s.chipOpen)}>
                        {r.resolvedAt ? "Resolved" : "Open"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function Section({ title, count, children }: { title: string; count?: string; children?: React.ReactNode }) {
  return (
    <section className={s.section} aria-label={title}>
      <div className={s.sectionHead}>
        <h2 className={s.sectionTitle}>{title}</h2>
        {count ? <span className={s.count}>{count}</span> : null}
      </div>
      {children}
    </section>
  );
}
