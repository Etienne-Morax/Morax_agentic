import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { MobileHeader } from './mobile-header'
import { TabBar } from './tab-bar'
import styles from './command-shell.module.css'

export const metadata: Metadata = {
  title: 'Morax - Centre de Commandement',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Morax',
  },
  icons: {
    apple: '/icons/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  // #faf7f3 = --color-surface (tokens.css), pas de variable CSS dispo dans le viewport Next.
  themeColor: '#faf7f3',
}

/** Shell mobile (Launchpad/Operations/Commande) : theme clair par defaut (tokens.css :root), distinct du shell desktop (app). */
export default function CommandShellLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <MobileHeader />
      <main className={styles.main}>{children}</main>
      <TabBar />
    </div>
  )
}
