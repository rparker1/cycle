/**
 * Inline icons.
 *
 * Hand-written rather than pulled from an icon package: the app needs about
 * twenty glyphs and a dependency would ship thousands, which matters for a
 * PWA that has to load over a bad connection.
 */

export type IconName =
  | 'droplet'
  | 'sun'
  | 'sparkles'
  | 'moon'
  | 'calendar'
  | 'calendar-clock'
  | 'chart'
  | 'settings'
  | 'shield-check'
  | 'alert'
  | 'info'
  | 'heart'
  | 'plus'
  | 'minus'
  | 'chevron-left'
  | 'chevron-right'
  | 'close'
  | 'check'
  | 'download'
  | 'upload'
  | 'cloud'
  | 'trash'
  | 'help'

interface Props {
  name: IconName
  size?: number
  strokeWidth?: number
  className?: string
  filled?: boolean
}

const paths: Record<IconName, React.ReactNode> = {
  droplet: <path d="M12 3.2 6.9 9.4a6.8 6.8 0 1 0 10.2 0Z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 3.5 13.6 8 18 9.5 13.6 11 12 15.5 10.4 11 6 9.5 10.4 8Z" />
      <path d="M18.5 15.5l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7ZM5.5 3l.6 1.6L7.7 5l-1.6.6L5.5 7l-.6-1.4L3.3 5l1.6-.4Z" />
    </>
  ),
  moon: <path d="M20 13.6A8.2 8.2 0 0 1 10.4 4a8.6 8.6 0 1 0 9.6 9.6Z" />,
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3.5" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  'calendar-clock': (
    <>
      <path d="M20 11V8.5A3.5 3.5 0 0 0 16.5 5h-9A3.5 3.5 0 0 0 4 8.5v9A3.5 3.5 0 0 0 7.5 21H12" />
      <path d="M4 10h16M8 3v4M16 3v4" />
      <circle cx="17.5" cy="17.5" r="4" />
      <path d="M17.5 15.8v1.9l1.3.9" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V4" />
      <path d="M8 20v-6M12.7 20V8M17.3 20v-9" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 14.4a1.6 1.6 0 0 0 .32 1.77l.06.06a1.94 1.94 0 1 1-2.75 2.75l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-1 1.46V20a1.94 1.94 0 1 1-3.88 0v-.1a1.6 1.6 0 0 0-1.05-1.46 1.6 1.6 0 0 0-1.77.32l-.06.06a1.94 1.94 0 1 1-2.75-2.75l.06-.06a1.6 1.6 0 0 0 .32-1.77 1.6 1.6 0 0 0-1.46-1H4a1.94 1.94 0 1 1 0-3.88h.1a1.6 1.6 0 0 0 1.46-1.05 1.6 1.6 0 0 0-.32-1.77l-.06-.06a1.94 1.94 0 1 1 2.75-2.75l.06.06a1.6 1.6 0 0 0 1.77.32H9.8a1.6 1.6 0 0 0 1-1.46V4a1.94 1.94 0 1 1 3.88 0v.1a1.6 1.6 0 0 0 1 1.46 1.6 1.6 0 0 0 1.77-.32l.06-.06a1.94 1.94 0 1 1 2.75 2.75l-.06.06a1.6 1.6 0 0 0-.32 1.77v.05a1.6 1.6 0 0 0 1.46 1H20a1.94 1.94 0 1 1 0 3.88h-.1a1.6 1.6 0 0 0-1.46 1Z" />
    </>
  ),
  'shield-check': (
    <>
      <path d="M12 2.8 5 5.6v5.5c0 4.2 2.9 8.2 7 9.6 4.1-1.4 7-5.4 7-9.6V5.6Z" />
      <path d="m9.2 12 2 2 3.6-3.8" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.6v5M12 16.1h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16.4v-5M12 7.9h.01" />
    </>
  ),
  heart: (
    <path d="M12 20s-7.2-4.4-8.9-8.5A4.9 4.9 0 0 1 12 6.6a4.9 4.9 0 0 1 8.9 4.9C19.2 15.6 12 20 12 20Z" />
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  'chevron-left': <path d="m14.5 6-6 6 6 6" />,
  'chevron-right': <path d="m9.5 6 6 6-6 6" />,
  close: <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" />,
  check: <path d="m5 12.5 4.8 4.8L19 7.5" />,
  download: (
    <>
      <path d="M12 3.5v11M7.6 10.4 12 14.8l4.4-4.4" />
      <path d="M4.5 16.5v1.8A2.2 2.2 0 0 0 6.7 20.5h10.6a2.2 2.2 0 0 0 2.2-2.2v-1.8" />
    </>
  ),
  upload: (
    <>
      <path d="M12 14.8v-11M7.6 7.9 12 3.5l4.4 4.4" />
      <path d="M4.5 16.5v1.8A2.2 2.2 0 0 0 6.7 20.5h10.6a2.2 2.2 0 0 0 2.2-2.2v-1.8" />
    </>
  ),
  cloud: (
    <path d="M7 18.5a4.3 4.3 0 0 1-.5-8.57 5.6 5.6 0 0 1 10.85-1.3A3.9 3.9 0 0 1 17.4 18.5Z" />
  ),
  trash: (
    <>
      <path d="M4.5 6.8h15M9.5 6.8V5.2A1.7 1.7 0 0 1 11.2 3.5h1.6a1.7 1.7 0 0 1 1.7 1.7v1.6" />
      <path d="M6.6 6.8 7.4 19a1.9 1.9 0 0 0 1.9 1.8h5.4a1.9 1.9 0 0 0 1.9-1.8l.8-12.2" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.6a2.5 2.5 0 1 1 3.3 2.4c-.6.2-.9.8-.9 1.4v.4M12 16.8h.01" />
    </>
  ),
}

export function Icon({ name, size = 20, strokeWidth = 1.9, className, filled }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  )
}
