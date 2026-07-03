'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Activity,
  CalendarDays,
  Coins,
  FileText,
  Inbox,
  LayoutGrid,
  type LucideIcon,
} from 'lucide-react'
import styles from './shell.module.css'

interface NavItem {
  href: string
  label: string
  icon: LucideIcon
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Timeline', icon: Activity },
  { href: '/inbox', label: 'Inbox', icon: Inbox },
  { href: '/documents', label: 'Devis & factures', icon: FileText },
  { href: '/calendar', label: 'Calendrier', icon: CalendarDays },
  { href: '/credits', label: 'Credits', icon: Coins },
  { href: '/launchpad', label: 'Launchpad', icon: LayoutGrid },
]

function isActiveHref(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname.startsWith(href)
}

/** Seul composant client du shell : etat actif derive de l'URL courante. */
export function NavLinks() {
  const pathname = usePathname()

  return (
    <nav className={styles.nav} aria-label="Navigation principale">
      {NAV_ITEMS.map((item) => {
        const active = isActiveHref(pathname, item.href)
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`${styles.navLink} pressable`}
            aria-current={active ? 'page' : undefined}
            data-active={active}
            title={item.label}
          >
            <Icon className={styles.navIcon} strokeWidth={2} aria-hidden="true" />
            <span className={styles.navLabel}>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
