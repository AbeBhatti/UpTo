"use client";

import type { FormEvent } from "react";
import { Banner, Button, Field, Panel, formStyles as s } from "../../create/_shared/form";
import v from "./verify.module.css";

/**
 * The code-entry screen. Purely presentational: VerifyFlow owns the calls.
 *
 * The three failure states are Lab 6 returns, so each has its own copy:
 *   incorrect           422  (N5)      — try again, budget is shared across codes
 *   expired             410  (S1 / RS) — that code is no longer live, send another
 *   attempts_exhausted  410  (D3 / R3) — budget spent; a new code does NOT refill it
 * The fourth, 409 campus_email_in_use, is a separate screen (VerifyInUse).
 */
export type CodeStatus =
  | { kind: "idle" }
  | { kind: "incorrect" }
  | { kind: "expired" }
  | { kind: "attempts_exhausted" }
  | { kind: "error"; message: string };

export interface VerifyCodeFormProps {
  email: string;
  code: string;
  onCodeChange: (code: string) => void;
  onSubmit: () => void;
  onResend: () => void;
  onChangeEmail: () => void;
  status: CodeStatus;
  busy?: boolean;
  resending?: boolean;
  /** Seconds until resend is allowed again; 0 means now. */
  resendIn: number;
  /** From SendCodeResponse.liveCodes — how many codes currently work. */
  liveCodes: number;
  resendNotice?: string | null;
  resendError?: string | null;
  /** Shown only in fixture mode. */
  devHint?: string | null;
}

export function VerifyCodeForm(p: VerifyCodeFormProps) {
  const locked = p.status.kind === "attempts_exhausted";
  const complete = /^\d{6}$/.test(p.code);

  function submit(ev: FormEvent) {
    ev.preventDefault();
    if (complete && !locked) p.onSubmit();
  }

  const fieldError =
    p.status.kind === "incorrect"
      ? "That code isn't right. Check the most recent email and try again."
      : p.status.kind === "error"
        ? p.status.message
        : null;

  return (
    <Panel
      title="Enter your code"
      lede={
        <>
          We sent a 6-digit code to <span className={v.address}>{p.email}</span>.{" "}
          <button type="button" className={s.link} onClick={p.onChangeEmail}>
            Change
          </button>
        </>
      }
    >
      <form className={s.form} onSubmit={submit} noValidate>
        {p.status.kind === "expired" ? (
          <Banner tone="danger" title="That code has expired">
            Send yourself a new one below.
          </Banner>
        ) : null}
        {locked ? (
          <Banner tone="danger" title="Too many incorrect codes">
            For your security, verifying this address is paused. Sending a new code won&apos;t reset it, so try
            again later.
          </Banner>
        ) : null}

        <Field label="6-digit code" error={fieldError}>
          {(a) => (
            <input
              {...a}
              className={v.codeInput}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              placeholder="••••••"
              disabled={locked}
              value={p.code}
              onChange={(e) => p.onCodeChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
              autoFocus
            />
          )}
        </Field>

        <Button type="submit" block busy={p.busy} busyLabel="Checking…" disabled={!complete || locked}>
          Verify
        </Button>

        <div className={v.resendRow} aria-live="polite">
          <span>
            {p.resendError ??
              p.resendNotice ??
              (p.liveCodes > 1 ? `Any of your last ${p.liveCodes} codes will work.` : "Didn't get it? Check spam, then resend.")}
          </span>
          <Button
            type="button"
            variant="ghost"
            onClick={p.onResend}
            busy={p.resending}
            busyLabel="Sending…"
            disabled={locked || p.resendIn > 0}
          >
            {p.resendIn > 0 ? `Resend in ${p.resendIn}s` : "Resend code"}
          </Button>
        </div>

        {p.devHint ? <p className={s.devNote}>{p.devHint}</p> : null}
      </form>
    </Panel>
  );
}
