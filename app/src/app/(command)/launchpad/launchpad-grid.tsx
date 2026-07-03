'use client'

import { useState } from 'react'
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
import { triggerShortcut } from '@/lib/command-center/queries'
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

const RESET_DELAY_MS = 1500

type TileState = 'idle' | 'triggering' | 'done'

interface LaunchpadGridProps {
  shortcuts: LaunchpadShortcut[]
}

export function LaunchpadGrid({ shortcuts }: LaunchpadGridProps) {
  const [tileStates, setTileStates] = useState<Record<string, TileState>>({})
  const haptics = useHaptics()

  async function handleTrigger(id: string) {
    haptics.tap()
    setTileStates((prev) => ({ ...prev, [id]: 'triggering' }))
    const result = await triggerShortcut(id)
    setTileStates((prev) => ({ ...prev, [id]: 'done' }))
    if (result.ok) {
      haptics.success()
    } else {
      haptics.error()
    }
    setTimeout(() => {
      setTileStates((prev) => ({ ...prev, [id]: 'idle' }))
    }, RESET_DELAY_MS)
  }

  return (
    <div className={styles.grid}>
      {shortcuts.map((shortcut) => {
        const spec = entityKindSpec(shortcut.kind)
        const Icon = SHORTCUT_ICONS[shortcut.icon] ?? spec.icon
        const state = tileStates[shortcut.id] ?? 'idle'
        const displayStatus = state === 'idle' ? shortcut.status : state

        return (
          <button
            key={shortcut.id}
            type="button"
            className={`${styles.tile} pressable`}
            onClick={() => handleTrigger(shortcut.id)}
            disabled={state === 'triggering'}
          >
            <span className={styles.iconBadge} style={{ background: spec.soft, color: spec.ink }}>
              <Icon className={styles.icon} strokeWidth={2} aria-hidden="true" />
            </span>
            <span className={styles.statusDot} data-status={displayStatus} aria-hidden="true" />
            <span className={styles.tileTitle}>{shortcut.title}</span>
          </button>
        )
      })}
    </div>
  )
}
