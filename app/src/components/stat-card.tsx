import type { ReactNode } from 'react'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { entityKindSpec, type EntityKind } from '@/lib/entity-kind'
import styles from './stat-card.module.css'

export type StatTone = 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'

const TONE_VARS: Record<StatTone, { soft: string; ink: string }> = {
  accent: { soft: 'var(--color-accent-soft)', ink: 'var(--color-accent)' },
  success: { soft: 'var(--color-success-soft)', ink: 'var(--color-success-ink)' },
  warning: { soft: 'var(--color-warning-soft)', ink: 'var(--color-warning-ink)' },
  danger: { soft: 'var(--color-danger-soft)', ink: 'var(--color-danger-ink)' },
  info: { soft: 'var(--color-info-soft)', ink: 'var(--color-info-ink)' },
  neutral: { soft: 'var(--color-neutral-soft)', ink: 'var(--color-text-muted)' },
}

interface StatCardProps {
  label: string
  value: string
  /** Derive icone + couleur automatiquement depuis le type d'entite (timeline/documents). */
  kind?: EntityKind
  /** Icone explicite, combinee a `tone`, pour les pages hors entites timeline (ex. Credits). */
  icon?: LucideIcon
  tone?: StatTone
  hint?: string
  hintTone?: 'danger' | 'muted'
  href?: string
  sparkline?: ReactNode
}

/** Carte blanche compacte pour un chiffre-cle : label + valeur + hint optionnel + mini-graphe optionnel. */
export function StatCard({
  label,
  value,
  kind,
  icon,
  tone = 'neutral',
  hint,
  hintTone = 'muted',
  href,
  sparkline,
}: StatCardProps) {
  const kindSpec = kind ? entityKindSpec(kind) : undefined
  const Icon = kindSpec?.icon ?? icon
  const colors = kindSpec ?? TONE_VARS[tone]

  const content = (
    <>
      <div className={styles.header}>
        {Icon && (
          <span
            className={styles.iconBadge}
            style={{ background: colors.soft, color: colors.ink }}
            aria-hidden="true"
          >
            <Icon className={styles.icon} strokeWidth={2} />
          </span>
        )}
        <span className={styles.label}>{label}</span>
      </div>
      <p className={styles.value}>{value}</p>
      {hint && (
        <p className={hintTone === 'danger' ? styles.hintDanger : styles.hint}>{hint}</p>
      )}
      {sparkline && <div className={styles.sparkline}>{sparkline}</div>}
    </>
  )

  if (href) {
    return (
      <Link href={href} className={`${styles.card} ${styles.cardLink} pressable`}>
        {content}
      </Link>
    )
  }

  return <div className={styles.card}>{content}</div>
}
