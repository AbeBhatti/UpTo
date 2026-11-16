"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { SignInForm } from "../../(app)/profile/_components/SignInForm";
import { safeNext } from "../safeNext";

/** Liz's SignInForm, routed: home (or ?next=) on success, sign-up on "Create an account". */
export function SignInScreen() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"), "/home");
  return (
    <SignInForm
      onSignedIn={() => {
        router.replace(next);
        router.refresh();
      }}
      onSwitchToSignUp={() => router.push("/sign-up")}
    />
  );
}
