'use client'

import { useEffect, useState } from 'react'
import { subscribePushAction, unsubscribePushAction } from '@/app/actions/push-subscribe'
import styles from './push-notifications-toggle.module.css'

type Status = 'unsupported' | 'checking' | 'off' | 'enabling' | 'on' | 'error'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

/** Bandeau Launchpad : active/desactive les notifications push (Chantier C). */
export function PushNotificationsToggle() {
  const [status, setStatus] = useState<Status>('checking')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    async function check() {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setStatus('unsupported')
        return
      }
      const registration = await navigator.serviceWorker.register('/sw.js')
      const existing = await registration.pushManager.getSubscription()
      setStatus(existing ? 'on' : 'off')
    }
    check().catch(() => setStatus('unsupported'))
  }, [])

  async function handleEnable() {
    setStatus('enabling')
    setErrorMessage(null)
    try {
      // Next.js n'inline les NEXT_PUBLIC_* cote navigateur que pour un acces
      // statique litteral (voir lib/supabase/client.ts) - jamais process.env[name].
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!publicKey) throw new Error('Notifications push non configurees.')

      const permission = await Notification.requestPermission()
      if (permission !== 'granted') throw new Error('Permission refusee.')

      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        // Meme piege de typage Node/lib.dom que r2.ts (ArrayBufferLike vs ArrayBuffer) : cast explicite.
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      })

      const result = await subscribePushAction(subscription.toJSON())
      if (!result.success) throw new Error(result.message ?? 'Abonnement refuse.')

      setStatus('on')
    } catch (err) {
      setStatus('error')
      setErrorMessage(err instanceof Error ? err.message : 'Erreur inconnue.')
    }
  }

  async function handleDisable() {
    setStatus('enabling')
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        await unsubscribePushAction(subscription.endpoint)
        await subscription.unsubscribe()
      }
      setStatus('off')
    } catch (err) {
      setStatus('error')
      setErrorMessage(err instanceof Error ? err.message : 'Erreur inconnue.')
    }
  }

  if (status === 'unsupported' || status === 'checking') return null

  if (status === 'on') {
    return (
      <div className={styles.banner}>
        <span className={styles.status}>Notifications activees.</span>
        <button type="button" className={styles.buttonSecondary} onClick={handleDisable}>
          Desactiver
        </button>
      </div>
    )
  }

  return (
    <div className={styles.banner}>
      <button
        type="button"
        className={styles.button}
        onClick={handleEnable}
        disabled={status === 'enabling'}
      >
        {status === 'enabling' ? 'Activation...' : 'Activer les notifications'}
      </button>
      {status === 'error' && errorMessage && (
        <span className={styles.error} role="alert">
          {errorMessage}
        </span>
      )}
    </div>
  )
}
