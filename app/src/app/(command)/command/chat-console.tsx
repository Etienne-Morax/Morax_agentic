'use client'

import { useEffect, useRef, useState } from 'react'
import { Mic, Paperclip, Send } from 'lucide-react'
import { useHaptics } from '@/lib/use-haptics'
import type { ChatMessage, ChatRole } from '@/lib/command-center/types'
import styles from './chat.module.css'

const AGENT_ECHO_DELAY_MS = 700
const AGENT_ECHO_TEXT = "Recu, je m'en occupe."

function makeMessage(role: ChatRole, content: string): ChatMessage {
  return {
    id: `${role}-${crypto.randomUUID()}`,
    role,
    content,
    createdAt: new Date().toISOString(),
  }
}

interface ChatConsoleProps {
  initialMessages: ChatMessage[]
}

export function ChatConsole({ initialMessages }: ChatConsoleProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [draft, setDraft] = useState('')
  const haptics = useHaptics()
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  function handleSend() {
    const text = draft.trim()
    if (!text) return
    haptics.tap()
    setMessages((prev) => [...prev, makeMessage('user', text)])
    setDraft('')
    setTimeout(() => {
      setMessages((prev) => [...prev, makeMessage('agent', AGENT_ECHO_TEXT)])
    }, AGENT_ECHO_DELAY_MS)
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
        >
          <Send strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
