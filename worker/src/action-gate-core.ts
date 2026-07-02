/**
 * Morax worker - coeur pur du gate d'approbation HIGH (envoi devis/facture).
 * Zero dependance : pas de LLM, pas de credits/COGS. Le job action_propose/
 * action_execute n'est pas un job IA, juste un relai vers Telegram/Postmark.
 */

import type { SendEmailActionPayload } from '@morax/model-core'

interface InlineKeyboardButton {
  text: string
  callback_data: string
}

export interface InlineKeyboard {
  inline_keyboard: InlineKeyboardButton[][]
}

const KIND_LABEL: Record<SendEmailActionPayload['kind'], { def: string; indef: string }> = {
  invoice: { def: 'la facture', indef: 'Facture' },
  quote: { def: 'le devis', indef: 'Devis' },
}

function amountLabel(payload: SendEmailActionPayload): string {
  return `${payload.total} ${payload.currency} TTC`
}

/** Texte du message d'approbation Telegram. */
export function formatApprovalSummary(payload: SendEmailActionPayload): string {
  const label = KIND_LABEL[payload.kind].def
  const ccSuffix = payload.cc ? ` (cc ${payload.cc})` : ''
  return `Envoyer ${label} ${payload.doc_number} (${amountLabel(payload)}) a ${payload.client_email}${ccSuffix} ?`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Inline keyboard Approuver/Rejeter, callback_data <= 64 octets. */
export function buildApprovalKeyboard(pendingActionId: string): InlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: 'Approuver', callback_data: `act:${pendingActionId}:approve` },
        { text: 'Rejeter', callback_data: `act:${pendingActionId}:reject` },
      ],
    ],
  }
}

/** Contenu de l'email sortant Postmark (texte + HTML simple, echappe contre l'injection). */
export function formatDocumentEmail(
  payload: SendEmailActionPayload,
): { subject: string; textBody: string; htmlBody: string; filename: string } {
  const indef = KIND_LABEL[payload.kind].indef
  const docNumber = escapeHtml(payload.doc_number)
  const amount = escapeHtml(amountLabel(payload))
  return {
    subject: `${indef} ${payload.doc_number}`,
    textBody: `Bonjour,\n\nVeuillez trouver ci-joint ${indef.toLowerCase()} ${payload.doc_number} (${amountLabel(payload)}).\n\nCordialement.`,
    htmlBody: `<p>Bonjour,</p><p>Veuillez trouver ci-joint ${indef.toLowerCase()} ${docNumber} (${amount}).</p><p>Cordialement.</p>`,
    filename: `${payload.doc_number}.pdf`,
  }
}

/** Texte de notification Telegram apres decision (execute/reject/expiration). */
export function formatActionResult(
  status: 'executed' | 'rejected' | 'expired',
  payload: SendEmailActionPayload,
): string {
  const label = payload.kind === 'invoice' ? 'facture' : 'devis'
  if (status === 'executed') {
    return `Email envoye : ${label} ${payload.doc_number} a ${payload.client_email}.`
  }
  if (status === 'expired') {
    return `Proposition expiree (72h) : ${label} ${payload.doc_number}. Relancer un nouvel envoi si besoin.`
  }
  return `Envoi annule : ${label} ${payload.doc_number}.`
}

/** Valide/parse le payload jsonb non type de pending_actions. Leve si invalide. */
export function parseSendEmailPayload(raw: unknown): SendEmailActionPayload {
  if (!raw || typeof raw !== 'object') {
    throw new Error('[action-gate] payload send_email invalide : absent')
  }
  const p = raw as Record<string, unknown>
  const requiredStrings: Array<keyof SendEmailActionPayload> = [
    'draft_id',
    'doc_number',
    'client_email',
    'pdf_key',
    'currency',
  ]
  for (const key of requiredStrings) {
    if (typeof p[key] !== 'string' || p[key] === '') {
      throw new Error(`[action-gate] payload send_email invalide : champ '${key}' manquant`)
    }
  }
  if (p.kind !== 'quote' && p.kind !== 'invoice') {
    throw new Error("[action-gate] payload send_email invalide : champ 'kind' invalide")
  }
  if (typeof p.total !== 'number') {
    throw new Error("[action-gate] payload send_email invalide : champ 'total' manquant")
  }
  if ('cc' in p && (typeof p.cc !== 'string' || p.cc === '')) {
    throw new Error("[action-gate] payload send_email invalide : champ 'cc' invalide")
  }
  return {
    draft_id: p.draft_id as string,
    kind: p.kind,
    doc_number: p.doc_number as string,
    client_email: p.client_email as string,
    ...(typeof p.cc === 'string' ? { cc: p.cc } : {}),
    pdf_key: p.pdf_key as string,
    total: p.total,
    currency: p.currency as string,
  }
}
