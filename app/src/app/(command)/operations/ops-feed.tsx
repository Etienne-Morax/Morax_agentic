import { entityKindSpec } from '@/lib/entity-kind'
import type { OpsFeedEntry, OpsStatus } from '@/lib/command-center/types'
import styles from './operations.module.css'

const TIME_FORMATTER = new Intl.DateTimeFormat('fr-GB', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZone: 'Europe/London',
})

interface OpsFeedProps {
  entries: OpsFeedEntry[]
}

/** Feed console : purement de lecture, pas d'interactivite (server component). */
export function OpsFeed({ entries }: OpsFeedProps) {
  return (
    <ul className={styles.feed}>
      {entries.map((entry) => {
        const spec = entityKindSpec(entry.kind)
        return (
          <li key={entry.id} className={styles.row} style={{ borderLeftColor: spec.vivid }}>
            <time className={styles.time} dateTime={entry.occurredAt}>
              {TIME_FORMATTER.format(new Date(entry.occurredAt))}
            </time>
            <span className={styles.agent} style={{ color: spec.ink }}>
              {entry.agent}
            </span>
            <span className={styles.action}>{entry.action}</span>
            <StatusGlyph status={entry.status} />
          </li>
        )
      })}
    </ul>
  )
}

function StatusGlyph({ status }: { status: OpsStatus }) {
  if (status === 'running') {
    return <span className={styles.spinner} role="status" aria-label="En cours" />
  }
  if (status === 'done') {
    return (
      <span className={styles.done} aria-label="Termine">
        {'✓'}
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span className={styles.error} aria-label="Erreur">
        {'✕'}
      </span>
    )
  }
  return (
    <span className={styles.queued} aria-label="En file">
      {'···'}
    </span>
  )
}
