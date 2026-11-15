"use client";

import type { FormEvent } from "react";
import { Banner, Button, Field, Panel, formStyles as s } from "../../create/_shared/form";

/** The academic year that ends next June, e.g. Fall 2026 → 2027. */
function classYearOptions(now = new Date()) {
  const first = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
  return Array.from({ length: 5 }, (_, i) => first + i);
}

export interface CampusEmailFormProps {
  email: string;
  classOf: number | "";
  onEmailChange: (v: string) => void;
  onClassOfChange: (v: number | "") => void;
  onSubmit: () => void;
  busy?: boolean;
  emailError?: string | null;
  classOfError?: string | null;
  formError?: string | null;
}

export function CampusEmailForm(p: CampusEmailFormProps) {
  function submit(ev: FormEvent) {
    ev.preventDefault();
    p.onSubmit();
  }
  return (
    <Panel title="Verify you're at SCU" lede="We'll email a 6-digit code to your Santa Clara address.">
      <form className={s.form} onSubmit={submit} noValidate>
        {p.formError ? <Banner tone="danger">{p.formError}</Banner> : null}
        <Field label="SCU email" hint="Your @scu.edu address" error={p.emailError}>
          {(a) => (
            <input
              {...a}
              className={s.input}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="you@scu.edu"
              value={p.email}
              onChange={(e) => p.onEmailChange(e.target.value)}
            />
          )}
        </Field>
        <Field label="Class year" error={p.classOfError}>
          {(a) => (
            <select
              {...a}
              className={s.select}
              value={p.classOf}
              onChange={(e) => p.onClassOfChange(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">Choose your class year</option>
              {classYearOptions().map((y) => (
                <option key={y} value={y}>
                  Class of {y}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Button type="submit" block busy={p.busy} busyLabel="Sending code…">
          Send code
        </Button>
      </form>
    </Panel>
  );
}

/** Client-side pre-check only; the server decides what counts as an SCU address. */
export function localCampusEmailError(email: string): string | null {
  const v = email.trim().toLowerCase();
  if (!v) return "Enter your SCU email.";
  if (!v.endsWith("@scu.edu")) return "Use your @scu.edu address.";
  if (v.split("@")[0]!.includes("+")) return "Use your address without a +tag.";
  return null;
}
