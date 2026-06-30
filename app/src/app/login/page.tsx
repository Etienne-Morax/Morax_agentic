import { LoginForm } from './login-form'
import styles from './login.module.css'

export default function LoginPage() {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Morax</h1>
        <p className={styles.subtitle}>Connexion par lien magique, sans mot de passe.</p>
        <LoginForm />
      </div>
    </main>
  )
}
