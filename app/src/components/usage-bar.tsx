import type { UsageZone } from '@morax/model-core'
import styles from './usage-bar.module.css'

const ZONE_CLASS: Record<UsageZone, string> = {
  green: styles.green ?? '',
  orange: styles.orange ?? '',
  red: styles.red ?? '',
}

interface UsageBarProps {
  pct: number
  zone: UsageZone
}

export function UsageBar({ pct, zone }: UsageBarProps) {
  const clampedPct = Math.min(100, Math.max(0, pct))
  return (
    <div className={styles.track} role="progressbar" aria-valuenow={Math.round(clampedPct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`${styles.fill} ${ZONE_CLASS[zone]}`} style={{ width: `${clampedPct}%` }} />
    </div>
  )
}
