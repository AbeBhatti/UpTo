"use client";

import { useRouter } from "next/navigation";
import { SignUpForm } from "../../(app)/profile/_components/SignUpForm";

/**
 * Liz's SignUpForm, routed. A new account goes straight to campus
 * verification (/profile), the next step before RSVPing.
 */
export function SignUpScreen() {
  const router = useRouter();
  return (
    <SignUpForm
      onSignedUp={() => {
        router.replace("/profile");
        router.refresh();
      }}
      onSwitchToSignIn={() => router.push("/sign-in")}
    />
  );
}
