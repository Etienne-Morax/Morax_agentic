'use client'

import { useEffect, useRef, useState } from 'react'
import { Mic, Paperclip, Send } from 'lucide-react'
import { useHaptics } from '@/lib/use-haptics'
import type { ChatMessage } from '@/lib/command-center/types'
import { sendCommandMessage } from './actions'
import styles from './chat.module.css'

interface ChatConsoleProps {
  initialMessages: ChatMessage[]
}

export function ChatConsole({ initialMessages }: ChatConsoleProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [draft, setDraft] = useState('')
  const [isSending, setIsSending] = useState(false)
  const haptics = useHaptics()
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

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
