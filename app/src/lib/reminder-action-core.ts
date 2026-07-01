/**
 * Morax - validation de l'input d'action sur un rappel (marquer paye / ignorer /
 * retablir). Miroir du CHECK constraint `reminders.status` (supabase/migrations/
 * 0001_init.sql). Fonction pure, testable sans mock.
 */

import { z } from 'zod'

export const REMINDER_TARGET_STATUSES = ['paid', 'dismissed', 'pending'] as const
export type ReminderTargetStatus = (typeof REMINDER_TARGET_STATUSES)[number]

export interface ReminderStatusInput {
  reminderId: string
  status: string
}

export interface ReminderStatusData {
  reminderId: string
  status: ReminderTargetStatus
}

const reminderStatusSchema = z.object({
  reminderId: z.string().uuid(),
  status: z.enum(REMINDER_TARGET_STATUSES),
})

export interface ValidationSuccess {
  success: true
  data: ReminderStatusData
}

export interface ValidationFailure {
  success: false
  errors: Record<string, string>
}

export type ValidationResult = ValidationSuccess | ValidationFailure

export function validateReminderStatusInput(input: ReminderStatusInput): ValidationResult {
  const result = reminderStatusSchema.safeParse(input)
  if (!result.success) {
    const errors: Record<string, string> = {}
    for (const issue of result.error.issues) {
      const key = String(issue.path[0] ?? 'form')
      errors[key] = issue.message
    }
    return { success: false, errors }
  }
  return { success: true, data: result.data }
}
