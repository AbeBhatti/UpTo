"use client";

/**
 * The public share page for an Up-To: what UpTo.shareLink() opens.
 * Reads GET /u/:slug (Abhi), which works signed out. Unknown and unpublished
 * Up-Tos both come back 404 not_found, and get the same page here.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ApiResponse, UpTo } from "@upto/contracts";
import { call } from "../../(app)/create/_shared/api";
import { Banner, Panel, formStyles as f } from "../../(app)/create/_shared/form";
import s from "./share.module.css";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

type State = { kind: "loading" } | { kind: "ready"; upTo: UpTo } | { kind: "not_found" } | { kind: "error"; message: string };

export function SharedUpTo({ slug }: { slug: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let live = true;
    setState({ kind: "loading" });
    call<UpTo>("getSharedUpTo", { params: { slug } }).then((res: ApiResponse<UpTo>) => {
      if (!live) return;
      if (res.ok) setState({ kind: "ready", upTo: res.data });
      else if (res.error.code === "not_found") setState({ kind: "not_found" });
      else setState({ kind: "error", message: res.error.message });
    });
    return () => {
      live = false;
    };
  }, [slug]);

  return (
    <main className={s.page}>
      <Link href="/home" className={s.brand}>
        UpTo
      </Link>
      {state.kind === "loading" ? (
        <Panel title="Loading…">
          <div className={s.skeleton} aria-hidden />
          <div className={s.skeleton} aria-hidden />
        </Panel>
      ) : state.kind === "not_found" ? (
        <Panel title="This plan isn't available" lede="The link may be wrong, or the person who posted it took it down.">
          <div className={f.actions}>
            <Link href="/home" className={`${f.button} ${f.primary}`}>
              See what&apos;s happening
            </Link>
          </div>
        </Panel>
      ) : state.kind === "error" ? (
        <Panel title="Couldn't load this plan">
          <Banner tone="danger">{state.message}</Banner>
        </Panel>
      ) : (
        <Ready upTo={state.upTo} />
      )}
    </main>
  );
}

function Ready({ upTo }: { upTo: UpTo }) {
  const going = upTo.goingCount === 1 ? "1 person going" : `${upTo.goingCount} people going`;
  return (
    <Panel title={upTo.title} lede={<span className={s.time}>{upTo.timeLabel}</span>}>
      <dl className={s.facts}>
        <div className={s.fact}>
          <dt className={s.factLabel}>Where</dt>
          <dd className={s.factValue}>{upTo.location}</dd>
        </div>
        <div className={s.fact}>
          <dt className={s.factLabel}>Going</dt>
          <dd className={`${s.factValue} ${s.going}`}>{going}</dd>
        </div>
      </dl>

      {upTo.description ? <p className={s.description}>{upTo.description}</p> : null}

      <div className={s.host}>
        <span className={s.avatar} aria-hidden>
          {initials(upTo.creator.name)}
        </span>
        <span className={s.hostName}>
          Posted by {upTo.creator.name}
          <span className={s.hostHandle}>@{upTo.creator.username}</span>
        </span>
      </div>

      <div className={f.actions}>
        <Link href="/sign-up" className={`${f.button} ${f.primary}`}>
          Join UpTo to RSVP
        </Link>
      </div>
    </Panel>
  );
}
