/**
 * Morax - Scanner un document : upload photo/PDF depuis le telephone
 * (camera ou galerie). Point d'entree du Launchpad "Scanner un document".
 */

import { ScanUploadForm } from './scan-upload-form'
import styles from './page.module.css'

export const dynamic = 'force-dynamic'

export default function ScanPage() {
  return (
    <section className={styles.page}>
      <h1 className={styles.title}>Scanner un document</h1>
      <p className={styles.hint}>Photographie ou choisis un recu, une facture ou un devis.</p>
      <ScanUploadForm />
    </section>
  )
}
