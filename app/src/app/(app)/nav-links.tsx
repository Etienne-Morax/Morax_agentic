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
  ShieldAlert,
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

const ADMIN_NAV_ITEM: NavItem = {
  href: '/admin/models-quota',
  label: 'Modeles & quota (admin)',
  icon: ShieldAlert,
}

function isActiveHref(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname.startsWith(href)
}

interface NavLinksProps {
  /** Determine cote serveur (layout) via users.role — jamais recalcule cote client. */
  isAdmin?: boolean
}

/** Seul composant client du shell : etat actif derive de l'URL courante. */
export function NavLinks({ isAdmin = false }: NavLinksProps) {
  const pathname = usePathname()
  const items = isAdmin ? [...NAV_ITEMS, ADMIN_NAV_ITEM] : NAV_ITEMS

  return (
    <nav className={styles.nav} aria-label="Navigation principale">
      {items.map((item) => {
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
