import { getChatMessages } from '@/lib/command-center/queries'
import { ChatConsole } from './chat-console'

export const dynamic = 'force-dynamic'

export default async function CommandPage() {
  const messages = await getChatMessages()

  return (
    <section>
      <ChatConsole initialMessages={messages} />
    </section>
  )
}
