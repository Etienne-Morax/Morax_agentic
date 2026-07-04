import Image from 'next/image'
import { LoginForm } from './login-form'
import { PasskeySignInButton } from './passkey-signin-button'
import styles from './login.module.css'

export default function LoginPage() {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <span className={styles.brandMark} aria-hidden="true">
          <Image src="/icons/icon-192.png" alt="" width={40} height={40} />
        </span>
        <h1 className={styles.title}>Morax</h1>
        <p className={styles.subtitle}>Connexion par lien magique, sans mot de passe.</p>
        <LoginForm />
        <div className={styles.divider} role="separator">
          ou
        </div>
        <PasskeySignInButton />
      </div>
    </main>
  )
}
