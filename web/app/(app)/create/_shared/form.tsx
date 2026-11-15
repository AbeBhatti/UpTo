"use client";

/**
 * Form primitives for Liz's screens (auth, verify, create, admin).
 *
 * Edrick's component list has no inputs or form buttons, so these live here
 * per the working rules. If he later ships equivalents in `components/`,
 * switch to his and delete these.
 */
import { useId, type ReactNode, type ButtonHTMLAttributes } from "react";
import s from "./form.module.css";

export { s as formStyles };

export function cx(...names: Array<string | false | null | undefined>) {
  return names.filter(Boolean).join(" ");
}

export function Panel({ title, lede, children }: { title: string; lede?: ReactNode; children: ReactNode }) {
  return (
    <section className={s.panel} aria-label={title}>
      <header className={s.header}>
        <h1 className={s.title}>{title}</h1>
        {lede ? <p className={s.lede}>{lede}</p> : null}
      </header>
      {children}
    </section>
  );
}

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  meta?: ReactNode;
  metaOver?: boolean;
  /** Render-prop so the control gets the right id and aria wiring. */
  children: (control: { id: string; "aria-invalid": boolean; "aria-describedby": string | undefined }) => ReactNode;
}

export function Field({ label, hint, error, meta, metaOver, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={s.field}>
      <div className={s.labelRow}>
        <label htmlFor={id} className={s.label}>
          {label}
        </label>
        {meta !== undefined ? (
          <span className={cx(s.meta, metaOver && s.metaOver)} aria-live="polite">
            {meta}
          </span>
        ) : null}
      </div>
      {children({ id, "aria-invalid": Boolean(error), "aria-describedby": describedBy })}
      {error ? (
        <p id={errorId} className={s.error}>
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className={s.hint}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  block?: boolean;
  busy?: boolean;
  busyLabel?: string;
};

export function Button({ variant = "primary", block, busy, busyLabel, children, disabled, className, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      className={cx(s.button, s[variant], block && s.block, className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
    >
      {busy ? (busyLabel ?? "Working…") : children}
    </button>
  );
}

export function Banner({
  tone = "neutral",
  title,
  children,
}: {
  tone?: "neutral" | "danger" | "success";
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cx(s.banner, tone === "danger" && s.bannerDanger, tone === "success" && s.bannerSuccess)}
      role={tone === "danger" ? "alert" : "status"}
    >
      {title ? <span className={s.bannerTitle}>{title}</span> : null}
      {children}
    </div>
  );
}

/** Maps a server `error.field` onto the form's own field names. */
export type FieldErrors<K extends string> = Partial<Record<K, string>>;
