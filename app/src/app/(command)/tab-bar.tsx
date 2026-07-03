'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutGrid, MessageCircle, Terminal, type LucideIcon } from 'lucide-react'
import { useHaptics } from '@/lib/use-haptics'
import styles from './command-shell.module.css'

interface TabItem {
  href: string
  label: string
  icon: LucideIcon
}

const TAB_ITEMS: TabItem[] = [
  { href: '/launchpad', label: 'Launchpad', icon: LayoutGrid },
  { href: '/operations', label: 'Operations', icon: Terminal },
  { href: '/command', label: 'Commande', icon: MessageCircle },
]

/** Seul composant client du shell mobile : etat actif derive de l'URL + haptique au tap. */
export function TabBar() {
  const pathname = usePathname()
  const haptics = useHaptics()

  return (
    <nav className={`${styles.tabBar} glass`} aria-label="Navigation principale">
      {TAB_ITEMS.map((item) => {
        const active = pathname.startsWith(item.href)
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`${styles.tabLink} pressable`}
            aria-current={active ? 'page' : undefined}
            data-active={active}
            onClick={() => haptics.tap()}
          >
            <Icon className={styles.tabIcon} strokeWidth={2} aria-hidden="true" />
            <span className={styles.tabLabel}>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
