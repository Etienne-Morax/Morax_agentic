import { getChatMessages, getCurrentTenantId } from '@/lib/command-center/queries'
import { ChatConsole } from './chat-console'

export const dynamic = 'force-dynamic'

export default async function CommandPage() {
  const [messages, tenantId] = await Promise.all([getChatMessages(), getCurrentTenantId()])

  return (
    <section>
      <ChatConsole initialMessages={messages} tenantId={tenantId} />
    </section>
  )
}
