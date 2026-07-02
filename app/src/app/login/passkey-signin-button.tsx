'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import styles from './login.module.css'

type Status = 'idle' | 'signing-in' | 'error'

export function PasskeySignInButton() {
  const router = useRouter()
  const [status, setStatus] = useState<Status>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleClick() {
    setStatus('signing-in')
    setErrorMessage(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPasskey()

    if (error) {
      setStatus('error')
      setErrorMessage(error.message)
      return
    }

    router.push('/')
    router.refresh()
  }

  return (
    <div className={styles.passkeyLoginGroup}>
      <button
        className={styles.buttonSecondary}
        type="button"
        onClick={handleClick}
        disabled={status === 'signing-in'}
      >
        {status === 'signing-in' ? 'Connexion...' : "Se connecter avec une cle d'acces"}
      </button>
      {status === 'error' && errorMessage && (
        <p className={styles.errorText} role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  )
}
