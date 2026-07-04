'use client'

import { useEffect, useRef, useState } from 'react'
import { Mic, Paperclip, Send, Square } from 'lucide-react'
import { useHaptics } from '@/lib/use-haptics'
import { useRealtimeTable } from '@/lib/supabase/use-realtime-table'
import { mapCommandMessageRow, type CommandMessageRow } from '@/lib/command-center/chat-message-core'
import type { ChatMessage } from '@/lib/command-center/types'
import { encodeWavPcm16 } from '@/lib/audio/encode-wav'
import { uploadScannedDocument } from '@/app/(app)/scan/actions'
import { logAttachmentMessage, sendCommandMessage, uploadVoiceMessage } from './actions'
import styles from './chat.module.css'

interface ChatConsoleProps {
  initialMessages: ChatMessage[]
  tenantId: string
}

type BannerTone = 'error' | 'info'
interface Banner {
  tone: BannerTone
  text: string
}

declare global {
  interface Window {
    /** Safari < 14.1 n'expose AudioContext que sous ce prefixe. */
    webkitAudioContext?: typeof AudioContext
  }
}

export function ChatConsole({ initialMessages, tenantId }: ChatConsoleProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [draft, setDraft] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isAttaching, setIsAttaching] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [banner, setBanner] = useState<Banner | null>(null)
  const haptics = useHaptics()
  const endRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const micStreamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  // Si l'utilisateur quitte la page en cours d'enregistrement, le micro
  // resterait actif (piste MediaStream jamais arretee) sans ce nettoyage.
  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stop()
      micStreamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  // Un nouveau tour affiche (texte, reponse agent, transcription vocale) rend
  // obsolete tout statut transitoire de type "info" (ex. "transcription en
  // cours..."). Une erreur reste affichee tant qu'aucun nouveau tour n'arrive.
  useEffect(() => {
    setBanner((prev) => (prev?.tone === 'info' ? null : prev))
  }, [messages.length])

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

  // Reutilise le pipeline scan existant (upload R2 -> capture_document) : le
  // trombone n'ouvrait jusqu'ici qu'un retour haptique, aucun fichier n'etait
  // jamais envoye. Le resultat de l'OCR est notifie via Telegram (pipeline
  // existant) ; ici on trace juste l'envoi dans l'historique du chat.
  async function handleAttach(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    event.target.value = ''
    if (!file || isAttaching) return

    haptics.tap()
    setBanner(null)
    setIsAttaching(true)
    try {
      const formData = new FormData()
      formData.set('file', file)
      const uploadResult = await uploadScannedDocument(formData)

      if (!uploadResult.ok) {
        haptics.error()
        setBanner({ tone: 'error', text: uploadResult.message })
        return
      }

      haptics.success()
      const logResult = await logAttachmentMessage(file.name)
      if (logResult.ok && logResult.message) {
        setMessages((prev) => [...prev, logResult.message as ChatMessage])
      }
    } finally {
      setIsAttaching(false)
    }
  }

  // Le navigateur enregistre en webm/opus (Chrome/Firefox/Android) ou mp4/aac
  // (Safari) -- ni l'un ni l'autre n'est dans la liste de formats audio
  // supportes par OpenRouter/Gemini. On decode via AudioContext puis on
  // reencode en WAV (encode-wav.ts) avant l'upload, format garanti compatible.
  async function handleMicClick() {
    if (isTranscribing) return
    if (isRecording) {
      mediaRecorderRef.current?.stop()
      return
    }

    setBanner(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      audioChunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        micStreamRef.current = null
        const recordedBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType })
        void processRecording(recordedBlob)
      }

      mediaRecorderRef.current = recorder
      micStreamRef.current = stream
      recorder.start()
      haptics.tap()
      setIsRecording(true)
    } catch {
      haptics.error()
      setBanner({ tone: 'error', text: 'Micro indisponible ou refuse.' })
    }
  }

  async function processRecording(recordedBlob: Blob) {
    setIsRecording(false)
    setIsTranscribing(true)
    try {
      const arrayBuffer = await recordedBlob.arrayBuffer()
      const AudioContextCtor = window.AudioContext ?? window.webkitAudioContext
      const audioContext = new AudioContextCtor()
      try {
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
        const channelData = Array.from({ length: audioBuffer.numberOfChannels }, (_, channel) =>
          audioBuffer.getChannelData(channel),
        )
        const wavBytes = encodeWavPcm16(channelData, audioBuffer.sampleRate)

        const formData = new FormData()
        // Cast : décalage de version entre lib.dom.Uint8Array et @types/node.Uint8Array<ArrayBufferLike> (meme motif que lib/r2.ts).
        formData.set('file', new File([wavBytes as BlobPart], 'message.wav', { type: 'audio/wav' }))
        const result = await uploadVoiceMessage(formData)

        if (!result.ok) {
          haptics.error()
          setBanner({ tone: 'error', text: result.message })
          return
        }

        haptics.success()
        setBanner({ tone: 'info', text: 'Message vocal envoye, transcription en cours...' })
      } finally {
        void audioContext.close()
      }
    } catch {
      haptics.error()
      setBanner({ tone: 'error', text: 'Enregistrement illisible. Reessaie.' })
    } finally {
      setIsTranscribing(false)
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
      {banner ? (
        <p
          className={banner.tone === 'error' ? styles.bannerError : styles.voiceStatus}
          role={banner.tone === 'error' ? 'alert' : 'status'}
        >
          {banner.text}
        </p>
      ) : null}
      <div className={`${styles.inputBar} glass`}>
        <button
          type="button"
          className={`${styles.iconButton} pressable`}
          aria-label={isRecording ? 'Arreter l\'enregistrement' : 'Message vocal'}
          aria-pressed={isRecording}
          onClick={handleMicClick}
          disabled={isTranscribing}
          data-recording={isRecording || undefined}
        >
          {isRecording ? (
            <Square strokeWidth={2} aria-hidden="true" />
          ) : (
            <Mic strokeWidth={2} aria-hidden="true" />
          )}
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
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          onChange={handleAttach}
          disabled={isAttaching}
          hidden
        />
        <button
          type="button"
          className={`${styles.iconButton} pressable`}
          aria-label="Joindre un fichier"
          onClick={() => fileInputRef.current?.click()}
          disabled={isAttaching}
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
