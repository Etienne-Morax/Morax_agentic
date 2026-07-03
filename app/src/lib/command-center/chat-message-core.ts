/**
 * Centre de Commandement - mapping pur command_messages (Postgres) -> ChatMessage
 * (UI). Extrait de queries.ts pour rester testable sans tirer les imports Supabase
 * server-only (next/headers), meme motif que status-tone.ts.
 */

import type { ChatMessage, ChatRole } from './types'

export interface CommandMessageRow {
  id: string
  role: ChatRole
  body: string
  created_at: string
}

export function mapCommandMessageRow(row: CommandMessageRow): ChatMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.body,
    createdAt: row.created_at,
  }
}
