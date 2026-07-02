import type { ReactNode } from 'react'
import styles from './empty-state.module.css'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  hint?: string
}

/** Etat vide sobre : icone douce + une phrase courte. Remplace les longs paragraphes. */
export function EmptyState({ icon, title, hint }: EmptyStateProps) {
  return (
    <div className={styles.wrap}>
      <span className={styles.iconWrap} aria-hidden="true">
        {icon}
      </span>
      <p className={styles.title}>{title}</p>
      {hint && <p className={styles.hint}>{hint}</p>}
    </div>
  )
}
