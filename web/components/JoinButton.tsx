'use client';

import { useState } from 'react';
import type { CampusEvent } from '@upto/contracts';
import styles from './JoinButton.module.css';

interface JoinButtonProps {
  event: Pick<CampusEvent, 'title' | 'myStatus'>;
  onToggle?: (joined: boolean) => void;
}

export function JoinButton({ event, onToggle }: JoinButtonProps) {
  const [joined, setJoined] = useState(event.myStatus === 'GOING');

  function toggle() {
    const next = !joined;
    setJoined(next);
    onToggle?.(next);
  }

  return (
    <button
      className={styles.button}
      type="button"
      aria-label={`Join ${event.title}`}
      aria-pressed={joined}
      onClick={toggle}
    >
      <span aria-hidden="true">{joined ? '✓' : '+'}</span>
    </button>
  );
}
