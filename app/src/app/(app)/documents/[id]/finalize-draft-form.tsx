'use client'

/**
 * Morax - E4 : finalise un brouillon et propose l'envoi via le gate HIGH
 * (approbation Telegram). Distinct du formulaire d'edition : une fois soumis,
 * le PDF est fige et le brouillon n'est plus modifiable.
 */

import { useActionState } from 'react'
import { finalizeDraftAction, type UpdateDraftState } from '@/app/actions/manage-draft'
import styles from './page.module.css'

const INITIAL_STATE: UpdateDraftState = { success: false }

interface FinalizeDraftFormProps {
  draftId: string
}

export function FinalizeDraftForm({ draftId }: FinalizeDraftFormProps) {
  const [state, formAction, isPending] = useActionState(finalizeDraftAction, INITIAL_STATE)

  return (
    <form className={styles.finalizeForm} action={formAction}>
      <input type="hidden" name="draftId" value={draftId} />
      <button className={styles.submit} type="submit" disabled={isPending}>
        {isPending ? 'Finalisation...' : 'Finaliser et proposer l\'envoi'}
      </button>
      {state.success && state.message && (
        <p className={styles.success} role="status">
          {state.message}
        </p>
      )}
      {!state.success && state.message && (
        <p className={styles.formError} role="alert">
          {state.message}
        </p>
      )}
    </form>
  )
}
