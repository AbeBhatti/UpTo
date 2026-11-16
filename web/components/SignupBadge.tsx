import type { Signup } from '@upto/contracts';
import styles from './SignupBadge.module.css';

interface SignupBadgeProps {
  signup: Signup;
}

export function SignupBadge({ signup }: SignupBadgeProps) {
  if (signup.state === 'NOT_REQUIRED' || !signup.label) return null;
  return <span className={styles.label}>{signup.label}</span>;
}
