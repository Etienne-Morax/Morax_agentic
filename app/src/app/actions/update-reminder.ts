'use server'

/**
 * Morax - Server Action : changer le statut d'un rappel (paye / ignore / retabli).
 * RLS scope l'UPDATE au tenant courant via la session (current_tenant_id()).
 * Ne JAMAIS filtrer le tenant a la main ici : la policy `rem_tenant` le fait.
 */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { validateReminderStatusInput } from '@/lib/reminder-action-core'

export interface UpdateReminderState {
  success: boolean
  errors?: Record<string, string>
  message?: string
}

export async function markReminderStatusAction(
  _prevState: UpdateReminderState,
  formData: FormData,
): Promise<UpdateReminderState> {
  const validation = validateReminderStatusInput({
    reminderId: String(formData.get('reminderId') ?? ''),
    status: String(formData.get('status') ?? ''),
  })

  if (!validation.success) {
    return { success: false, errors: validation.errors }
  }

  const { reminderId, status } = validation.data
  const supabase = await createClient()

  const { error: updateError } = await supabase
    .from('reminders')
    .update({ status })
    .eq('id', reminderId)

  if (updateError) {
    return { success: false, message: `Enregistrement impossible : ${updateError.message}` }
  }

  revalidatePath('/calendar')
  revalidatePath('/inbox')
  revalidatePath('/')

  return { success: true, message: 'Rappel mis a jour.' }
}
