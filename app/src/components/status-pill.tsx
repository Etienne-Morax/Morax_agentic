import type { ReactNode } from 'react'
import type { StatusTone } from '@/lib/status-tone'
import styles from './status-pill.module.css'

interface StatusPillProps {
  label: string
  tone: StatusTone
  /** Icone optionnelle (lucide) pour renforcer le signal sans ajouter de texte. */
  icon?: ReactNode
}

export function StatusPill({ label, tone, icon }: StatusPillProps) {
  return (
    <span className={`${styles.pill} ${styles[tone]}`}>
      {icon && (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      )}
      {label}
    </span>
  )
}
