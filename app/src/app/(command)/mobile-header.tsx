import { Sparkles } from 'lucide-react'
import styles from './command-shell.module.css'

/** Header fixe du shell mobile : marque centree seule, pas de nav ni de compte (voir TabBar). */
export function MobileHeader() {
  return (
    <header className={`${styles.header} glass`}>
      <span className={styles.brand}>
        <span className={styles.brandMark} aria-hidden="true">
          <Sparkles strokeWidth={2} />
        </span>
        <span className={styles.brandName}>Morax</span>
      </span>
    </header>
  )
}
