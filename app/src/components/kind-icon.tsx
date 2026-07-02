import { entityKindSpec, type EntityKind } from '@/lib/entity-kind'
import styles from './kind-icon.module.css'

interface KindIconProps {
  kind: EntityKind
  size?: 'sm' | 'md'
}

/** Pastille coloree ronde portant l'icone du type d'entite. Purement decoratif : le libelle texte reste a cote. */
export function KindIcon({ kind, size = 'md' }: KindIconProps) {
  const spec = entityKindSpec(kind)
  const Icon = spec.icon

  return (
    <span
      className={`${styles.badge} ${size === 'sm' ? styles.sm : styles.md}`}
      style={{ background: spec.soft, color: spec.ink }}
      aria-hidden="true"
    >
      <Icon className={styles.icon} strokeWidth={2} />
    </span>
  )
}
