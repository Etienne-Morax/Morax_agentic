import { getOperationsFeed } from '@/lib/command-center/queries'
import { OpsFeed } from './ops-feed'
import styles from './operations.module.css'

export const dynamic = 'force-dynamic'

export default async function OperationsPage() {
  const entries = await getOperationsFeed()

  return (
    <section>
      <h1 className={styles.pageTitle}>Operations</h1>
      <OpsFeed entries={entries} />
    </section>
  )
}
