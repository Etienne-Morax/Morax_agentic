import type { StatusTone } from '@/lib/status-tone'
import styles from './status-pill.module.css'

interface StatusPillProps {
  label: string
  tone: StatusTone
}

export function StatusPill({ label, tone }: StatusPillProps) {
  return <span className={`${styles.pill} ${styles[tone]}`}>{label}</span>
}
