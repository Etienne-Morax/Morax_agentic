'use client'

import { useEffect, useRef, useState } from 'react'
import { Mic, Paperclip, Send } from 'lucide-react'
import { useHaptics } from '@/lib/use-haptics'
import { useRealtimeTable } from '@/lib/supabase/use-realtime-table'
import { mapCommandMessageRow, type CommandMessageRow } from '@/lib/command-center/chat-message-core'
import type { ChatMessage } from '@/lib/command-center/types'
import { sendCommandMessage } from './actions'
import styles from './chat.module.css'

interface ChatConsoleProps {
  initialMessages: ChatMessage[]
  tenantId: string
}

export function ChatConsole({ initialMessages, tenantId }: ChatConsoleProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [draft, setDraft] = useState('')
  const [isSending, setIsSending] = useState(false)
  const haptics = useHaptics()
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  // La reponse de l'agent (role='agent') est inseree par le worker, pas par ce
  // client : sans Realtime elle n'apparaissait jamais (aucun poll ni refresh).
  // Notre propre message (role='user') arrive aussi par ce canal ; dedupe par id
  // puisqu'on l'a deja ajoute de facon optimiste dans handleSend().
  useRealtimeTable<CommandMessageRow>('command_messages', tenantId, (payload) => {
    if (payload.eventType !== 'INSERT') return
    const incoming = mapCommandMessageRow(payload.new)
    setMessages((prev) => (prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]))
  })

  async function handleSend() {
    const text = draft.trim()
    if (!text || isSending) return
    haptics.tap()
    setDraft('')
    setIsSending(true)
    try {
      const result = await sendCommandMessage(text)
      if (result.ok && result.message) {
        setMessages((prev) => [...prev, result.message as ChatMessage])
      } else {
        setDraft(text)
      }
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className={styles.console}>
      <ul className={styles.messages}>
        {messages.map((message) => (
          <li key={message.id} className={`${styles.bubble} ${styles[message.role]}`}>
            {message.content}
          </li>
        ))}
      </ul>
      <div ref={endRef} />
      <div className={`${styles.inputBar} glass`}>
        <button
          type="button"
          className={`${styles.iconButton} pressable`}
          aria-label="Message vocal"
          onClick={() => haptics.tap()}
        >
          <Mic strokeWidth={2} aria-hidden="true" />
        </button>
        <input
          className={styles.input}
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') handleSend()
          }}
          placeholder="Ecrire une commande..."
          aria-label="Message"
          disabled={isSending}
        />
        <button
          type="button"
          className={`${styles.iconButton} pressable`}
          aria-label="Joindre un fichier"
          onClick={() => haptics.tap()}
        >
          <Paperclip strokeWidth={2} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`${styles.iconButton} pressable`}
          aria-label="Envoyer"
          onClick={handleSend}
          disabled={isSending || !draft.trim()}
        >
          <Send strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
