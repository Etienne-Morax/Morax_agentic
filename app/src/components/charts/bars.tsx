import type { ReactNode } from 'react'
import styles from './charts.module.css'

export interface BarItem {
  label: ReactNode
  value: number
  display: string
  colorVar: string
}

interface BarsProps {
  items: readonly BarItem[]
  ariaLabel: string
}

/** Barres horizontales : label + valeur en texte visible, largeur proportionnelle au max. */
export function Bars({ items, ariaLabel }: BarsProps) {
  const max = Math.max(...items.map((item) => item.value), 1)

  return (
    <ul className={styles.bars} aria-label={ariaLabel}>
      {items.map((item, index) => {
        const pct = Math.min(100, Math.max(0, (item.value / max) * 100))
        return (
          <li key={index} className={styles.barRow}>
            <div className={styles.barTop}>
              <span className={styles.barLabel}>{item.label}</span>
              <span className={styles.barValue}>{item.display}</span>
            </div>
            <div className={styles.barTrack}>
              <div className={styles.barFill} style={{ width: `${pct}%`, background: item.colorVar }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export interface StackedSegment {
  value: number
  colorVar: string
  label: string
}

interface StackedBarProps {
  segments: readonly StackedSegment[]
  ariaLabel: string
}

/** Barre 100% empilee : repartition proportionnelle entre plusieurs categories. */
export function StackedBar({ segments, ariaLabel }: StackedBarProps) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0)

  return (
    <div className={styles.stacked} role="img" aria-label={ariaLabel}>
      {segments.map((segment) => {
        const pct = total > 0 ? (segment.value / total) * 100 : 0
        if (pct <= 0) return null
        return (
          <div
            key={segment.label}
            className={styles.stackedSegment}
            style={{ width: `${pct}%`, background: segment.colorVar }}
          />
        )
      })}
    </div>
  )
}
