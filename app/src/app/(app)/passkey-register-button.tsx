'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import styles from './shell.module.css'

type Status = 'idle' | 'registering' | 'success' | 'error'

export function PasskeyRegisterButton() {
  const [status, setStatus] = useState<Status>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleClick() {
    setStatus('registering')
    setErrorMessage(null)

    const supabase = createClient()
    const { error } = await supabase.auth.registerPasskey()

    if (error) {
      setStatus('error')
      setErrorMessage(error.message)
      return
    }

    setStatus('success')
  }

  if (status === 'success') {
    return <span className={styles.passkeyStatus}>Cle d&apos;acces ajoutee</span>
  }

  return (
    <div className={styles.passkeyGroup}>
      <button
        className={styles.passkeyButton}
        type="button"
        onClick={handleClick}
        disabled={status === 'registering'}
      >
        {status === 'registering' ? 'Enregistrement...' : "Ajouter une cle d'acces"}
      </button>
      {status === 'error' && errorMessage && (
        <span className={styles.passkeyError} role="alert">
          {errorMessage}
        </span>
      )}
    </div>
  )
}
