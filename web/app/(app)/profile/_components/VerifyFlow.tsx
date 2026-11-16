"use client";

/**
 * SCU verification, end to end: email + class year → code → verified | in use.
 * Drives POST /verify/send, /verify/confirm and /verify/switch (Abe).
 */
import { useEffect, useState } from "react";
import type { Me, PublicUser } from "@upto/contracts";
import { isMockApi } from "../../create/_shared/api";
import { MOCK_EXPIRED_CODE, MOCK_LIVE_CODE } from "../../create/_shared/mock";
import { confirmCode, sendCode, switchAccount } from "../_lib/authApi";
import { CampusEmailForm, localCampusEmailError } from "./CampusEmailForm";
import { VerifyCodeForm, type CodeStatus } from "./VerifyCodeForm";
import { VerifyInUse, VerifySuccess } from "./VerifyResult";

const RESEND_COOLDOWN_S = 30;

type Step =
  | { kind: "email" }
  | { kind: "code" }
  | { kind: "verified"; user: Me }
  | { kind: "in_use"; heldBy: PublicUser | null; switchToken: string | null };

export function VerifyFlow({ onVerified, onSwitched }: { onVerified?: (user: Me) => void; onSwitched?: (user: Me) => void }) {
  const [step, setStep] = useState<Step>({ kind: "email" });
  const [email, setEmail] = useState("");
  const [classOf, setClassOf] = useState<number | "">("");
  const [code, setCode] = useState("");

  const [emailError, setEmailError] = useState<string | null>(null);
  const [classOfError, setClassOfError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<CodeStatus>({ kind: "idle" });
  const [liveCodes, setLiveCodes] = useState(0);
  const [resendIn, setResendIn] = useState(0);
  const [resendNotice, setResendNotice] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "send" | "confirm" | "resend" | "switch">(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  async function send() {
    setFormError(null);
    const eErr = localCampusEmailError(email);
    const cErr = classOf === "" ? "Choose your class year." : null;
    setEmailError(eErr);
    setClassOfError(cErr);
    if (eErr || cErr) return;

    setBusy("send");
    const res = await sendCode({ email: email.trim().toLowerCase() });
    setBusy(null);
    if (res.ok) {
      setLiveCodes(res.data.liveCodes);
      setCode("");
      setStatus({ kind: "idle" });
      setResendNotice(null);
      setResendError(null);
      setResendIn(RESEND_COOLDOWN_S);
      setStep({ kind: "code" });
      return;
    }
    if (res.error.field === "email") setEmailError(res.error.message);
    else if (res.error.code === "rate_limited") setFormError("You've requested a lot of codes. Try again in an hour.");
    else setFormError(res.error.message);
  }

  async function resend() {
    setResendError(null);
    setResendNotice(null);
    setBusy("resend");
    const res = await sendCode({ email: email.trim().toLowerCase() });
    setBusy(null);
    if (res.ok) {
      setLiveCodes(res.data.liveCodes);
      setResendIn(RESEND_COOLDOWN_S);
      setResendNotice(
        res.data.liveCodes > 1 ? `New code sent. Any of your last ${res.data.liveCodes} codes will work.` : "New code sent.",
      );
      if (status.kind === "expired") setStatus({ kind: "idle" });
      return;
    }
    setResendError(
      res.error.code === "rate_limited" ? "You've requested a lot of codes. Try again in an hour." : res.error.message,
    );
  }

  async function confirm() {
    if (classOf === "") return setStep({ kind: "email" });
    setBusy("confirm");
    const res = await confirmCode({ email: email.trim().toLowerCase(), code, classOf });
    setBusy(null);

    if (res.ok) {
      if (res.data.verified) {
        setStep({ kind: "verified", user: res.data.user });
        onVerified?.(res.data.user);
      } else {
        setStep({ kind: "in_use", heldBy: res.data.heldBy, switchToken: res.data.switchToken });
      }
      return;
    }

    switch (res.error.code) {
      case "incorrect":
        return setStatus({ kind: "incorrect", message: res.error.message });
      case "expired":
        return setStatus({ kind: "expired" });
      case "attempts_exhausted":
        return setStatus({ kind: "attempts_exhausted" });
      case "campus_email_in_use":
        // 409 sent as a plain error envelope: no switch token to offer.
        return setStep({ kind: "in_use", heldBy: null, switchToken: null });
      case "class_of_out_of_range":
        setClassOfError("That class year isn't accepted. Pick another and we'll send a fresh code.");
        return setStep({ kind: "email" });
      default:
        return setStatus({ kind: "error", message: res.error.message });
    }
  }

  async function doSwitch(deleteCurrent: boolean) {
    if (step.kind !== "in_use" || !step.switchToken) return;
    setSwitchError(null);
    setBusy("switch");
    const res = await switchAccount({ switchToken: step.switchToken, ...(deleteCurrent ? { deleteCurrent: true } : {}) });
    setBusy(null);
    if (res.ok) return onSwitched?.(res.data.user);
    setSwitchError(
      res.error.code === "expired" ? "That switch link has expired. Verify again to get a new one." : res.error.message,
    );
  }

  function backToEmail() {
    setStep({ kind: "email" });
    setStatus({ kind: "idle" });
    setCode("");
    setSwitchError(null);
  }

  switch (step.kind) {
    case "email":
      return (
        <CampusEmailForm
          email={email}
          classOf={classOf}
          onEmailChange={(v) => {
            setEmail(v);
            setEmailError(null);
          }}
          onClassOfChange={(v) => {
            setClassOf(v);
            setClassOfError(null);
          }}
          onSubmit={send}
          busy={busy === "send"}
          emailError={emailError}
          classOfError={classOfError}
          formError={formError}
        />
      );
    case "code":
      return (
        <VerifyCodeForm
          email={email.trim().toLowerCase()}
          code={code}
          onCodeChange={(c) => {
            setCode(c);
            if (status.kind === "incorrect" || status.kind === "error") setStatus({ kind: "idle" });
          }}
          onSubmit={confirm}
          onResend={resend}
          onChangeEmail={backToEmail}
          status={status}
          busy={busy === "confirm"}
          resending={busy === "resend"}
          resendIn={resendIn}
          liveCodes={liveCodes}
          resendNotice={resendNotice}
          resendError={resendError}
          devHint={
            isMockApi
              ? `Fixture mode: ${MOCK_LIVE_CODE} works, ${MOCK_EXPIRED_CODE} is expired, anything else is wrong. aala@scu.edu triggers the 409.`
              : null
          }
        />
      );
    case "verified":
      return <VerifySuccess user={step.user} />;
    case "in_use":
      return (
        <VerifyInUse
          email={email.trim().toLowerCase()}
          heldBy={step.heldBy}
          switchToken={step.switchToken}
          onSwitch={doSwitch}
          onKeep={backToEmail}
          busy={busy === "switch"}
          error={switchError}
        />
      );
  }
}
