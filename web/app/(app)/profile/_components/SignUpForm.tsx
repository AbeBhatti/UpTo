"use client";

import { useState, type FormEvent } from "react";
import type { Me, SignUpRequest } from "@upto/contracts";
import { Banner, Button, Field, Panel, formStyles as s, type FieldErrors } from "../../create/_shared/form";
import { signUp } from "../_lib/authApi";

type FieldName = "username" | "name" | "email" | "phone" | "password";

/** Mirrors the User.test.ts limits so obvious mistakes never leave the page. */
function check(v: { username: string; name: string; contact: string; password: string }, via: "email" | "phone") {
  const e: FieldErrors<FieldName> = {};
  const u = v.username.trim();
  if (u.length < 3 || u.length > 30) e.username = "Usernames are 3 to 30 characters.";
  if (!v.name.trim()) e.name = "Add your name.";
  if (!v.contact.trim()) e[via] = via === "email" ? "Add an email, or use a phone number instead." : "Add a phone number, or use email instead.";
  if (v.password.length < 6) e.password = "Passwords are at least 6 characters.";
  return e;
}

export function SignUpForm({ onSignedUp, onSwitchToSignIn }: { onSignedUp?: (user: Me) => void; onSwitchToSignIn?: () => void }) {
  const [via, setVia] = useState<"email" | "phone">("email");
  const [values, setValues] = useState({ username: "", name: "", contact: "", password: "" });
  const [errors, setErrors] = useState<FieldErrors<FieldName>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof values) => (ev: { target: { value: string } }) =>
    setValues((prev) => ({ ...prev, [k]: ev.target.value }));

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    setFormError(null);
    const local = check(values, via);
    setErrors(local);
    if (Object.keys(local).length) return;

    const body: SignUpRequest = {
      username: values.username.trim(),
      name: values.name.trim(),
      password: values.password,
      ...(via === "email" ? { email: values.contact.trim() } : { phone: values.contact.trim() }),
    };

    setBusy(true);
    const res = await signUp(body);
    setBusy(false);
    if (res.ok) return onSignedUp?.(res.data.user);

    const field = res.error.field as FieldName | undefined;
    if (field && ["username", "name", "email", "phone", "password"].includes(field)) {
      setErrors({ [field]: res.error.message });
    } else {
      setFormError(res.error.message);
    }
  }

  const contactField: FieldName = via;

  return (
    <Panel title="Create your account" lede="You'll verify your SCU email right after.">
      <form className={s.form} onSubmit={onSubmit} noValidate>
        {formError ? <Banner tone="danger">{formError}</Banner> : null}

        <div className={s.row}>
          <Field label="Name" error={errors.name}>
            {(a) => <input {...a} className={s.input} autoComplete="name" value={values.name} onChange={set("name")} />}
          </Field>
          <Field label="Username" hint="3 to 30 characters" error={errors.username}>
            {(a) => (
              <input
                {...a}
                className={s.input}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={30}
                value={values.username}
                onChange={set("username")}
              />
            )}
          </Field>
        </div>

        <div className={s.switcher} role="group" aria-label="Sign up with">
          {(["email", "phone"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              className={s.switcherOption}
              aria-pressed={via === opt}
              onClick={() => {
                setVia(opt);
                setValues((p) => ({ ...p, contact: "" }));
                setErrors((p) => ({ ...p, email: undefined, phone: undefined }));
              }}
            >
              {opt === "email" ? "Email" : "Phone"}
            </button>
          ))}
        </div>

        <Field label={via === "email" ? "Email" : "Phone number"} error={errors[contactField]}>
          {(a) => (
            <input
              {...a}
              className={s.input}
              type={via === "email" ? "email" : "tel"}
              inputMode={via === "email" ? "email" : "tel"}
              autoComplete={via === "email" ? "email" : "tel"}
              value={values.contact}
              onChange={set("contact")}
            />
          )}
        </Field>

        <Field label="Password" hint="At least 6 characters" error={errors.password}>
          {(a) => (
            <input {...a} className={s.input} type="password" autoComplete="new-password" value={values.password} onChange={set("password")} />
          )}
        </Field>

        <Button type="submit" block busy={busy} busyLabel="Creating account…">
          Create account
        </Button>
      </form>
      {onSwitchToSignIn ? (
        <p className={s.footer}>
          Already have an account?{" "}
          <button type="button" className={s.link} onClick={onSwitchToSignIn}>
            Sign in
          </button>
        </p>
      ) : null}
    </Panel>
  );
}
