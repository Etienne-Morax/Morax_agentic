'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BellRing,
  CalendarCheck,
  FileSignature,
  Inbox,
  ScanLine,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { entityKindSpec } from '@/lib/entity-kind'
import { triggerShortcut } from './actions'
import { useHaptics } from '@/lib/use-haptics'
import type { LaunchpadShortcut } from '@/lib/command-center/types'
import styles from './launchpad.module.css'

const SHORTCUT_ICONS: Record<string, LucideIcon> = {
  scan: ScanLine,
  'bell-ring': BellRing,
  'file-signature': FileSignature,
  'calendar-check': CalendarCheck,
  sparkles: Sparkles,
  inbox: Inbox,
}

type TileState = 'idle' | 'triggering'

interface LaunchpadGridProps {
  shortcuts: LaunchpadShortcut[]
}

export function LaunchpadGrid({ shortcuts }: LaunchpadGridProps) {
  const [tileStates, setTileStates] = useState<Record<string, TileState>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const haptics = useHaptics()
  const router = useRouter()

  async function handleTrigger(id: string) {
    haptics.tap()
    setErrors((prev) => ({ ...prev, [id]: '' }))
    setTileStates((prev) => ({ ...prev, [id]: 'triggering' }))

    const result = await triggerShortcut(id)

    setTileStates((prev) => ({ ...prev, [id]: 'idle' }))
    if (result.ok) {
      haptics.success()
      router.refresh()
    } else {
      haptics.error()
      setErrors((prev) => ({ ...prev, [id]: result.message }))
    }
  }

  return (
    <div className={styles.grid}>
      {shortcuts.map((shortcut) => {
        const spec = entityKindSpec(shortcut.kind)
        const Icon = SHORTCUT_ICONS[shortcut.icon] ?? spec.icon
        const state = tileStates[shortcut.id] ?? 'idle'
        const displayStatus = state === 'idle' ? shortcut.status : state
        const error = errors[shortcut.id]

        return (
          <div key={shortcut.id} className={styles.tileWrap}>
            <button
              type="button"
              className={`${styles.tile} pressable`}
              onClick={() => handleTrigger(shortcut.id)}
              disabled={state === 'triggering' || shortcut.status === 'off'}
            >
              <span className={styles.iconBadge} style={{ background: spec.soft, color: spec.ink }}>
                <Icon className={styles.icon} strokeWidth={2} aria-hidden="true" />
              </span>
              <span className={styles.statusDot} data-status={displayStatus} aria-hidden="true" />
              <span className={styles.tileTitle}>{shortcut.title}</span>
            </button>
            {error ? <p className={styles.tileError}>{error}</p> : null}
          </div>
        )
      })}
    </div>
  )
}
