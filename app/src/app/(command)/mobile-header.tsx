import Image from 'next/image'
import styles from './command-shell.module.css'

/** Header fixe du shell mobile : marque centree seule, pas de nav ni de compte (voir TabBar). */
export function MobileHeader() {
  return (
    <header className={`${styles.header} glass`}>
      <span className={styles.brand}>
        <span className={styles.brandMark} aria-hidden="true">
          <Image src="/icons/icon-192.png" alt="" width={28} height={28} />
        </span>
        <span className={styles.brandName}>Morax</span>
      </span>
    </header>
  )
}
