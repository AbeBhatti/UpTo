import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true as const,
};

export function HomeIcon(props: IconProps) {
  return <svg {...base} {...props}><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-7h6v7" /></svg>;
}

export function DiscoverIcon(props: IconProps) {
  return <svg {...base} {...props}><circle cx="12" cy="12" r="9" /><path d="m15.8 8.2-2.5 5.1-5.1 2.5 2.5-5.1 5.1-2.5Z" /></svg>;
}

export function MapIcon(props: IconProps) {
  return <svg {...base} {...props}><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z" /><path d="M9 3v15M15 6v15" /></svg>;
}

export function ChatIcon(props: IconProps) {
  return <svg {...base} {...props}><path d="M4 4h12a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H9l-5 3V4Z" /><path d="M8 9h7M8 13h5" /></svg>;
}

export function ProfileIcon(props: IconProps) {
  return <svg {...base} {...props}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="9" r="3" /><path d="M6.5 19a6 6 0 0 1 11 0" /></svg>;
}

export function NotificationsIcon(props: IconProps) {
  return <svg {...base} {...props}><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" /></svg>;
}

export function CreateIcon(props: IconProps) {
  return <svg {...base} {...props}><path d="M12 5v14M5 12h14" /></svg>;
}

export function CollapseIcon(props: IconProps) {
  return <svg {...base} {...props}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16m6-11-3 3 3 3" /></svg>;
}
