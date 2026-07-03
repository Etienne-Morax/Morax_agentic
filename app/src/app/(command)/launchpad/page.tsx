import { getLaunchpadShortcuts } from '@/lib/command-center/queries'
import { LaunchpadGrid } from './launchpad-grid'
import styles from './launchpad.module.css'

export const dynamic = 'force-dynamic'

export default async function LaunchpadPage() {
  const shortcuts = await getLaunchpadShortcuts()

  return (
    <section>
      <h1 className={styles.pageTitle}>Launchpad</h1>
      <LaunchpadGrid shortcuts={shortcuts} />
    </section>
  )
}
