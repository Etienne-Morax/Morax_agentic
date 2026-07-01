'use client'

import { useActionState } from 'react'
import { markReminderStatusAction, type UpdateReminderState } from '@/app/actions/update-reminder'
import type { ReminderTargetStatus } from '@/lib/reminder-action-core'
import styles from './page.module.css'

const INITIAL_STATE: UpdateReminderState = { success: false }

type ReminderCurrentStatus = 'pending' | 'paid' | 'dismissed'

interface ReminderActionsProps {
  reminderId: string
  status: ReminderCurrentStatus
}

interface ActionButton {
  target: ReminderTargetStatus
  label: string
  variant: 'primary' | 'secondary'
}

function actionsFor(status: ReminderCurrentStatus): ActionButton[] {
  if (status === 'pending') {
    return [
      { target: 'paid', label: 'Paye', variant: 'primary' },
      { target: 'dismissed', label: 'Ignorer', variant: 'secondary' },
    ]
  }
  return [{ target: 'pending', label: 'Retablir', variant: 'secondary' }]
}

export function ReminderActions({ reminderId, status }: ReminderActionsProps) {
  const [state, formAction, isPending] = useActionState(markReminderStatusAction, INITIAL_STATE)

  return (
    <div className={styles.reminderActions}>
      {actionsFor(status).map((action) => (
        <form key={action.target} className={styles.reminderActionForm} action={formAction}>
          <input type="hidden" name="reminderId" value={reminderId} />
          <input type="hidden" name="status" value={action.target} />
          <button
            type="submit"
            className={action.variant === 'primary' ? styles.actionPrimary : styles.actionSecondary}
            disabled={isPending}
          >
            {action.label}
          </button>
        </form>
      ))}
      {!state.success && state.message && (
        <p className={styles.actionError} role="alert">
          {state.message}
        </p>
      )}
    </div>
  )
}
