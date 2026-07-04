'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import styles from './login.module.css'

type Status = 'idle' | 'sending' | 'sent' | 'error'
type CodeStatus = 'idle' | 'verifying' | 'error'

export function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [codeStatus, setCodeStatus] = useState<CodeStatus>('idle')
  const [codeError, setCodeError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('sending')
    setErrorMessage(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setStatus('error')
      setErrorMessage(error.message)
      return
    }

    setStatus('sent')
  }

  async function handleVerifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCodeStatus('verifying')
    setCodeError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' })

    if (error) {
      setCodeStatus('error')
      setCodeError(error.message)
      return
    }

    router.push('/')
    router.refresh()
  }

  if (status === 'sent') {
    return (
      <div className={styles.form}>
        <p className={styles.confirmation} role="status">
          Lien envoye a {email}. Ouvrez-le depuis cet appareil pour vous connecter, ou
          entrez le code a 6 chiffres reçu dans le meme email (fonctionne meme si le
          lien est bloque ou si le mail est arrive dans les indesirables).
        </p>
        <form className={styles.form} onSubmit={handleVerifyCode}>
          <label className={styles.label} htmlFor="code">
            Code a 6 chiffres
          </label>
          <input
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            className={styles.input}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            disabled={codeStatus === 'verifying'}
          />
          <button className={styles.button} type="submit" disabled={codeStatus === 'verifying'}>
            {codeStatus === 'verifying' ? 'Verification...' : 'Valider le code'}
          </button>
          {codeStatus === 'error' && codeError && (
            <p className={styles.errorText} role="alert">
              {codeError}
            </p>
          )}
        </form>
      </div>
    )
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <label className={styles.label} htmlFor="email">
        Adresse email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        className={styles.input}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        disabled={status === 'sending'}
      />
      <button className={styles.button} type="submit" disabled={status === 'sending'}>
        {status === 'sending' ? 'Envoi en cours...' : 'Recevoir le lien de connexion'}
      </button>
      {status === 'error' && errorMessage && (
        <p className={styles.errorText} role="alert">
          {errorMessage}
        </p>
      )}
    </form>
  )
}
