"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { CreateUpToRequest, UpTo } from "@upto/contracts";
import { Banner, Button, Field, Panel, formStyles as s, type FieldErrors } from "../_shared/form";
import { UPTO_DESCRIPTION_MAX, descriptionLength, toDescriptionField } from "../_shared/description";
import { createUpTo } from "../_lib/upToApi";
import { SharePanel } from "./SharePanel";

type FieldName = "title" | "description" | "scheduledAt" | "location";

export interface CreateUpToValues {
  title: string;
  description: string;
  /** `<input type="datetime-local">` value, in the viewer's local time. */
  when: string;
  location: string;
}

/** datetime-local wants "YYYY-MM-DDTHH:mm" in local time. */
export function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function nextHour(now = new Date()) {
  const d = new Date(now);
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

const EMPTY: CreateUpToValues = { title: "", description: "", when: "", location: "" };

export function CreateUpToForm({
  initialValues,
  onPublished,
}: {
  initialValues?: Partial<CreateUpToValues>;
  onPublished?: (upTo: UpTo) => void;
}) {
  const [values, setValues] = useState<CreateUpToValues>(() => ({
    ...EMPTY,
    when: toLocalInputValue(nextHour()),
    ...initialValues,
  }));
  const [errors, setErrors] = useState<FieldErrors<FieldName>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [published, setPublished] = useState<UpTo | null>(null);

  const descLen = useMemo(() => descriptionLength(values.description), [values.description]);
  const over = descLen > UPTO_DESCRIPTION_MAX;

  const set = (k: keyof CreateUpToValues) => (e: { target: { value: string } }) => {
    setValues((p) => ({ ...p, [k]: e.target.value }));
    const map: Record<keyof CreateUpToValues, FieldName> = {
      title: "title",
      description: "description",
      when: "scheduledAt",
      location: "location",
    };
    setErrors((p) => ({ ...p, [map[k]]: undefined }));
  };

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    setFormError(null);

    const local: FieldErrors<FieldName> = {};
    if (!values.title.trim()) local.title = "Give it a title.";
    if (!values.location.trim()) local.location = "Say where it is.";
    const when = values.when ? new Date(values.when) : null;
    if (!when || Number.isNaN(when.getTime())) local.scheduledAt = "Pick a date and time.";
    else if (when.getTime() < Date.now()) local.scheduledAt = "Pick a time that hasn't passed.";
    if (over) local.description = `Keep it to ${UPTO_DESCRIPTION_MAX.toLocaleString()} characters.`;
    setErrors(local);
    if (Object.keys(local).length || !when) return;

    const body: CreateUpToRequest = {
      title: values.title.trim(),
      description: toDescriptionField(values.description),
      scheduledAt: when.toISOString(),
      location: values.location.trim(),
      publish: true,
    };

    setBusy(true);
    const res = await createUpTo(body);
    setBusy(false);
    if (res.ok) {
      setPublished(res.data);
      onPublished?.(res.data);
      return;
    }
    const field = res.error.field as FieldName | undefined;
    if (field && ["title", "description", "scheduledAt", "location"].includes(field)) setErrors({ [field]: res.error.message });
    else setFormError(res.error.message);
  }

  if (published) {
    return (
      <SharePanel
        upTo={published}
        onCreateAnother={() => {
          setPublished(null);
          setValues({ ...EMPTY, when: toLocalInputValue(nextHour()) });
        }}
      />
    );
  }

  return (
    <Panel title="Post an Up-To" lede="A plan of your own. Anyone with the link can see it.">
      <form className={s.form} onSubmit={onSubmit} noValidate>
        {formError ? <Banner tone="danger">{formError}</Banner> : null}

        <Field label="What's the plan?" error={errors.title}>
          {(a) => (
            <input {...a} className={s.input} placeholder="CSEN 174 study session" value={values.title} onChange={set("title")} />
          )}
        </Field>

        <div className={s.row}>
          <Field label="When" error={errors.scheduledAt}>
            {(a) => (
              <input
                {...a}
                className={s.input}
                type="datetime-local"
                min={toLocalInputValue(new Date())}
                value={values.when}
                onChange={set("when")}
              />
            )}
          </Field>
          <Field label="Where" error={errors.location}>
            {(a) => (
              <input
                {...a}
                className={s.input}
                placeholder="Learning Commons, 3rd floor"
                value={values.location}
                onChange={set("location")}
              />
            )}
          </Field>
        </div>

        <Field
          label="Details"
          hint="Optional. Extra blank lines and hidden characters are tidied up when you post."
          error={errors.description}
          meta={`${descLen.toLocaleString()} / ${UPTO_DESCRIPTION_MAX.toLocaleString()}`}
          metaOver={over}
        >
          {(a) => (
            <textarea
              {...a}
              aria-invalid={a["aria-invalid"] || over}
              className={s.textarea}
              placeholder="What to bring, who it's for, how to find you…"
              value={values.description}
              onChange={set("description")}
            />
          )}
        </Field>

        <Button type="submit" block busy={busy} busyLabel="Publishing…" disabled={over}>
          Publish
        </Button>
      </form>
    </Panel>
  );
}
