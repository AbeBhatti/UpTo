import Link from 'next/link';
import styles from './SectionHeader.module.css';

interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  actionHref?: string;
}

export function SectionHeader({ title, actionLabel, actionHref }: SectionHeaderProps) {
  return (
    <div className={styles.header}>
      <h2 className={styles.title}>{title}</h2>
      {actionLabel && actionHref ? (
        <Link className={styles.action} href={actionHref}>{actionLabel}</Link>
      ) : null}
    </div>
  );
}
