import Image from 'next/image'
import { LoginForm } from './login-form'
import { PasskeySignInButton } from './passkey-signin-button'
import styles from './login.module.css'

const ERROR_MESSAGES: Record<string, string> = {
  no_tenant:
    "Ce compte n'a pas encore d'acces configure. Connecte-toi avec le compte autorise.",
}

interface LoginPageProps {
  searchParams: Promise<{ e?: string }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { e } = await searchParams
  const errorMessage = e ? ERROR_MESSAGES[e] : undefined

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <span className={styles.brandMark} aria-hidden="true">
          <Image src="/icons/icon-192.png" alt="" width={40} height={40} />
        </span>
        <h1 className={styles.title}>Morax</h1>
        <p className={styles.subtitle}>Connexion par lien magique, sans mot de passe.</p>
        {errorMessage && (
          <p className={styles.errorText} role="alert">
            {errorMessage}
          </p>
        )}
        <LoginForm />
        <div className={styles.divider} role="separator">
          ou
        </div>
        <PasskeySignInButton />
      </div>
    </main>
  )
}
