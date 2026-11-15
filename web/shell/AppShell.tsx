'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import styles from './AppShell.module.css';
import {
  ChatIcon,
  CollapseIcon,
  CreateIcon,
  DiscoverIcon,
  HomeIcon,
  MapIcon,
  NotificationsIcon,
  ProfileIcon,
} from './icons';

type AppShellProps = { children: React.ReactNode };

const primaryLinks = [
  { label: 'Home', href: '/home', Icon: HomeIcon },
  { label: 'Discover', href: '/discover', Icon: DiscoverIcon },
  { label: 'Map', href: '/map', Icon: MapIcon },
  { label: 'Chat', href: '/chat', Icon: ChatIcon },
  { label: 'Profile', href: '/profile', Icon: ProfileIcon },
];

const utilityLinks = [
  { label: 'Notifications', href: '/notifications', Icon: NotificationsIcon },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem('upto-rail-collapsed') === 'true');
    } catch {
      setCollapsed(false);
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem('upto-rail-collapsed', String(next));
      } catch {
        // The shell remains usable when browser storage is unavailable.
      }
      return next;
    });
  }

  function renderLink(item: (typeof primaryLinks)[number], mobile = false) {
    const active = isActive(pathname, item.href);
    return (
      <Link
        className={`${styles.navLink} ${active ? styles.active : ''} ${mobile ? styles.mobileLink : ''}`}
        href={item.href}
        key={item.href}
        aria-label={item.label}
        aria-current={active ? 'page' : undefined}
        title={item.label}
      >
        <item.Icon className={styles.icon} />
        <span className={styles.label}>{item.label}</span>
      </Link>
    );
  }

  return (
    <div className={`${styles.shell} ${collapsed ? styles.collapsed : ''}`}>
      <aside className={styles.rail}>
        <Link className={styles.wordmark} href="/home" aria-label="UpTo home" title="UpTo">
          UpTo
        </Link>

        <nav className={styles.navigation} aria-label="Main navigation">
          <div className={styles.linkGroup}>{primaryLinks.map((item) => renderLink(item))}</div>
          <div className={styles.lowerGroup}>
            {utilityLinks.map((item) => renderLink(item))}
            <Link
              className={styles.createButton}
              href="/create"
              aria-label="Create"
              title="Create"
              aria-current={isActive(pathname, '/create') ? 'page' : undefined}
            >
              <CreateIcon className={styles.icon} />
              <span className={styles.label}>Create</span>
            </Link>
          </div>
        </nav>

        <button
          type="button"
          className={styles.collapseButton}
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          aria-expanded={!collapsed}
        >
          <CollapseIcon className={`${styles.icon} ${collapsed ? styles.reverseIcon : ''}`} />
        </button>
      </aside>

      <main className={styles.main}>{children}</main>

      <nav className={styles.mobileNavigation} aria-label="Mobile navigation">
        {primaryLinks.map((item) => renderLink(item, true))}
        <Link
          className={`${styles.navLink} ${styles.mobileLink} ${styles.mobileCreate} ${isActive(pathname, '/create') ? styles.active : ''}`}
          href="/create"
          aria-label="Create"
          title="Create"
          aria-current={isActive(pathname, '/create') ? 'page' : undefined}
        >
          <CreateIcon className={styles.icon} />
          <span className={styles.label}>Create</span>
        </Link>
      </nav>
    </div>
  );
}
