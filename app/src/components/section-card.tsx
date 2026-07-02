import type { ReactNode } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import styles from './section-card.module.css'

interface SectionCardProps {
  title: string
  icon?: ReactNode
  count?: number
  viewAllHref?: string
  viewAllLabel?: string
  headingId?: string
  children: ReactNode
}

/** Carte conteneur pour une zone de contenu : header (titre + compteur + lien) + corps. */
export function SectionCard({
  title,
  icon,
  count,
  viewAllHref,
  viewAllLabel = 'Tout voir',
  headingId,
  children,
}: SectionCardProps) {
  return (
    <section className={styles.card}>
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          {icon && (
            <span className={styles.icon} aria-hidden="true">
              {icon}
            </span>
          )}
          <h2 id={headingId} className={styles.title}>
            {title}
          </h2>
          {count != null && <span className={styles.count}>{count}</span>}
        </div>
        {viewAllHref && (
          <Link href={viewAllHref} className={`${styles.viewAll} pressable`}>
            {viewAllLabel}
            <ChevronRight className={styles.chevron} strokeWidth={2} />
          </Link>
        )}
      </header>
      <div className={styles.body}>{children}</div>
    </section>
  )
}
