"use client";

import { useState } from "react";
import type { Me, PublicUser } from "@upto/contracts";
import { Banner, Button, Panel, formStyles as s } from "../../create/_shared/form";
import v from "./verify.module.css";

export function VerifySuccess({ user, onDone }: { user: Me; onDone?: () => void }) {
  return (
    <Panel title="You're verified">
      <Banner tone="success" title="Santa Clara student confirmed">
        {user.campusEmail}
        {user.classOf ? ` · Class of ${user.classOf}` : null}
      </Banner>
      {onDone ? (
        <Button block onClick={onDone}>
          Continue to Home
        </Button>
      ) : null}
    </Panel>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/**
 * 409 campus_email_in_use (Lab 6 N9 → R9). Another account already holds the
 * address; the server has spent the codes and issued a single-use switch token.
 *
 * `switchToken` / `heldBy` may be missing if the backend sends the 409 as a
 * plain error envelope — then we can explain but not offer the switch.
 */
export function VerifyInUse({
  email,
  heldBy,
  switchToken,
  onSwitch,
  onKeep,
  busy,
  error,
}: {
  email: string;
  heldBy: PublicUser | null;
  switchToken: string | null;
  onSwitch: (deleteCurrent: boolean) => void;
  onKeep: () => void;
  busy?: boolean;
  error?: string | null;
}) {
  const [deleteCurrent, setDeleteCurrent] = useState(false);
  return (
    <Panel
      title="This address is already in use"
      lede={
        <>
          <span className={v.address}>{email}</span> is verified on another UpTo account. Each SCU address can
          belong to one account.
        </>
      }
    >
      {heldBy ? (
        <div className={v.person}>
          <span className={v.avatar} aria-hidden>
            {initials(heldBy.name)}
          </span>
          <span className={v.personName}>
            {heldBy.name}
            <span className={v.personHandle}>@{heldBy.username}</span>
          </span>
        </div>
      ) : null}

      {error ? <Banner tone="danger">{error}</Banner> : null}

      {switchToken ? (
        <>
          <label className={s.check}>
            <input type="checkbox" checked={deleteCurrent} onChange={(e) => setDeleteCurrent(e.target.checked)} />
            Delete the account I&apos;m using now after switching
          </label>
          <div className={s.actions}>
            <Button onClick={() => onSwitch(deleteCurrent)} busy={busy} busyLabel="Switching…">
              {heldBy ? `Switch to @${heldBy.username}` : "Switch accounts"}
            </Button>
            <Button variant="secondary" onClick={onKeep} disabled={busy}>
              Keep this account
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className={s.lede}>Sign in to that account instead, or verify with a different address.</p>
          <div className={s.actions}>
            <Button variant="secondary" onClick={onKeep}>
              Use a different address
            </Button>
          </div>
        </>
      )}
    </Panel>
  );
}
