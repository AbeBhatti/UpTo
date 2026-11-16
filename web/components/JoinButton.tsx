'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CampusEvent } from '@upto/contracts';
import { rsvp, useRsvp } from '@/lib/rsvp';
import styles from './JoinButton.module.css';

interface JoinButtonProps {
  event: Pick<CampusEvent, 'id' | 'title' | 'myStatus' | 'goingCount'>;
}

/**
 * Join is an RSVP: GOING when not joined, NOT_GOING to leave. The ✓ is the
 * server's myStatus, never a guess; it changes only once the server answers.
 *
 * Signed out (401), it sends you to sign in and back. Any other failure leaves
 * the button as it was and says so beside it.
 */
export function JoinButton({ event }: JoinButtonProps) {
  const router = useRouter();
  const { myStatus } = useRsvp(event);
  const joined = myStatus === 'GOING';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await rsvp(event.id, joined ? 'NOT_GOING' : 'GOING');
    setBusy(false);
    if (result.ok) return;
    if (result.error.code === 'unauthorized') {
      router.push(`/sign-in?next=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`);
      return;
    }
    setError(
      result.error.code === 'server_error'
        ? "Couldn't save that. Try again."
        : result.error.message,
    );
  }

  return (
    <span className={styles.wrap}>
      <button
        className={styles.button}
        type="button"
        aria-label={`Join ${event.title}`}
        aria-pressed={joined}
        aria-busy={busy}
        disabled={busy}
        onClick={toggle}
      >
        <span aria-hidden="true">{joined ? '✓' : '+'}</span>
      </button>
      {error ? (
        <span className={styles.error} role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
