import styles from "../auth.module.css";
import { SignUpScreen } from "./SignUpScreen";

export default function SignUpPage() {
  return (
    <main className={styles.screen}>
      <SignUpScreen />
    </main>
  );
}
