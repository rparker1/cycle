import { Icon, type IconName } from './Icon'

export type Tab = 'today' | 'calendar' | 'history' | 'settings'

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'today', label: 'Today', icon: 'sun' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'history', label: 'History', icon: 'chart' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
]

interface Props {
  active: Tab
  onChange(tab: Tab): void
}

export function BottomNav({ active, onChange }: Props) {
  return (
    <nav className="nav" aria-label="Main">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          className="nav__item"
          aria-current={active === tab.id ? 'page' : undefined}
          onClick={() => onChange(tab.id)}
        >
          <Icon name={tab.icon} size={22} strokeWidth={active === tab.id ? 2.2 : 1.8} />
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
