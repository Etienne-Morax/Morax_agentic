import type { ReactNode } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import styles from './shell.module.css'

const NAV_ITEMS = [
  { href: '/', label: 'Timeline' },
  { href: '/inbox', label: 'Inbox' },
  { href: '/calendar', label: 'Calendrier' },
  { href: '/credits', label: 'Credits' },
]

export default async function AppShellLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.brand}>Morax</span>
        <nav className={styles.nav} aria-label="Navigation principale">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} className={styles.navLink} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className={styles.account}>
          {user?.email && <span className={styles.email}>{user.email}</span>}
          <form action="/auth/signout" method="post">
            <button className={styles.signOut} type="submit">
              Se deconnecter
            </button>
          </form>
        </div>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  )
}
