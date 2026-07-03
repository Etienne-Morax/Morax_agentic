import Image from 'next/image'
import { getLaunchpadShortcuts } from '@/lib/command-center/queries'
import { LaunchpadGrid } from './launchpad-grid'
import styles from './launchpad.module.css'

export const dynamic = 'force-dynamic'

export default async function LaunchpadPage() {
  const shortcuts = await getLaunchpadShortcuts()

  return (
    <section>
      <div className={styles.greeting}>
        <Image
          src="/mascot/morax-cutout.png"
          alt=""
          width={72}
          height={72}
          priority
          className={styles.greetingMascot}
        />
        <div>
          <h1 className={styles.pageTitle}>Launchpad</h1>
          <p className={styles.greetingHint}>Pret quand tu l&apos;es.</p>
        </div>
      </div>
      <LaunchpadGrid shortcuts={shortcuts} />
    </section>
  )
}
