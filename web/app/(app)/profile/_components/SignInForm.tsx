"use client";

import { useState, type FormEvent } from "react";
import type { Me } from "@upto/contracts";
import { Banner, Button, Field, Panel, formStyles as s, type FieldErrors } from "../../create/_shared/form";
import { signIn } from "../_lib/authApi";

type FieldName = "identifier" | "password";

export function SignInForm({ onSignedIn, onSwitchToSignUp }: { onSignedIn?: (user: Me) => void; onSwitchToSignUp?: () => void }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors<FieldName>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    setFormError(null);
    const local: FieldErrors<FieldName> = {};
    if (!identifier.trim()) local.identifier = "Enter your username, email or phone.";
    if (!password) local.password = "Enter your password.";
    setErrors(local);
    if (Object.keys(local).length) return;

    setBusy(true);
    const res = await signIn({ identifier: identifier.trim(), password });
    setBusy(false);
    if (res.ok) return onSignedIn?.(res.data.user);

    const field = res.error.field as FieldName | undefined;
    if (field === "identifier" || field === "password") setErrors({ [field]: res.error.message });
    else setFormError(res.error.message);
  }

  return (
    <Panel title="Sign in">
      <form className={s.form} onSubmit={onSubmit} noValidate>
        {formError ? <Banner tone="danger">{formError}</Banner> : null}
        <Field label="Username, email or phone" error={errors.identifier}>
          {(a) => (
            <input
              {...a}
              className={s.input}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
            />
          )}
        </Field>
        <Field label="Password" error={errors.password}>
          {(a) => (
            <input
              {...a}
              className={s.input}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Field>
        <Button type="submit" block busy={busy} busyLabel="Signing in…">
          Sign in
        </Button>
      </form>
      {onSwitchToSignUp ? (
        <p className={s.footer}>
          New to UpTo?{" "}
          <button type="button" className={s.link} onClick={onSwitchToSignUp}>
            Create an account
          </button>
        </p>
      ) : null}
    </Panel>
  );
}
