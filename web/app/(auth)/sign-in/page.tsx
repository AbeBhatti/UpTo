import { Suspense } from "react";
import styles from "../auth.module.css";
import { SignInScreen } from "./SignInScreen";

export default function SignInPage() {
  return (
    <main className={styles.screen}>
      {/* useSearchParams needs a Suspense boundary to prerender. */}
      <Suspense>
        <SignInScreen />
      </Suspense>
    </main>
  );
}
