import type { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { PasskeyRegisterButton } from './passkey-register-button'
import { NavLinks } from './nav-links'
import styles from './shell.module.css'

export default async function AppShellLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let isAdmin = false
  if (user) {
    const { data } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle()
    isAdmin = (data as { role: string } | null)?.role === 'admin'
  }

  return (
    <div className={styles.shell}>
      <header className={`${styles.header} glass`}>
        <Link href="/" className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">
            <Image src="/icons/icon-192.png" alt="" width={28} height={28} />
          </span>
          <span className={styles.brandName}>Morax</span>
        </Link>
        <NavLinks isAdmin={isAdmin} />
        <div className={styles.account}>
          {user?.email && <span className={styles.email}>{user.email}</span>}
          <PasskeyRegisterButton />
          <form action="/auth/signout" method="post">
            <button
              className={`${styles.signOut} pressable`}
              type="submit"
              aria-label="Se deconnecter"
              title="Se deconnecter"
            >
              <LogOut className={styles.signOutIcon} strokeWidth={2} aria-hidden="true" />
            </button>
          </form>
        </div>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  )
}
