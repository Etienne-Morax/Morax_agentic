/**
 * Morax - coeur pur de la finalisation d'un brouillon devis/facture (E4).
 * Fonctions testables sans mock, zero appel Supabase/R2/IA.
 */

import { z } from 'zod'
import { computeDraftTotals, type LineItem } from './document-draft-core'
import type { SendEmailActionPayload } from '@morax/model-core'

export interface FinalizeCheckInput {
  status: string
  kind: 'quote' | 'invoice'
  docNumber?: string
  clientEmail?: string
  lineItems: LineItem[]
}

export interface FinalizeValidationSuccess {
  success: true
}

export interface FinalizeValidationFailure {
  success: false
  errors: Record<string, string>
}

export type FinalizeValidationResult = FinalizeValidationSuccess | FinalizeValidationFailure

const finalizeSchema = z.object({
  status: z.literal('draft', { errorMap: () => ({ message: 'Brouillon deja finalise.' }) }),
  docNumber: z
    .string({ required_error: 'Numero de document requis.' })
    .min(1, 'Numero de document requis.'),
  clientEmail: z
    .string({ required_error: 'Email client requis pour envoyer.' })
    .email('Email client requis pour envoyer.'),
  lineItems: z.array(z.unknown()).min(1, 'Au moins une ligne requise.'),
})

/** Valide qu'un draft peut etre finalise et propose a l'envoi. */
export function validateFinalizeDraft(input: FinalizeCheckInput): FinalizeValidationResult {
  const result = finalizeSchema.safeParse(input)
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? 'Brouillon invalide.'
    return { success: false, errors: { form: message } }
  }
  return { success: true }
}

const PDF_KEY_UNSAFE_CHARS = /[^A-Za-z0-9._-]/g

/** Cle R2 tenant-scopee pour le PDF fige au moment de la proposition d'envoi. */
export function buildPdfKey(tenantId: string, draftId: string, docNumber: string): string {
  const safeDocNumber = docNumber.replace(PDF_KEY_UNSAFE_CHARS, '-')
  return `tenants/${tenantId}/drafts/${draftId}/${safeDocNumber}.pdf`
}

/** Construit le payload de pending_actions.payload pour action_type='send_email'. */
export function buildSendEmailPayload(input: {
  draftId: string
  kind: 'quote' | 'invoice'
  docNumber: string
  clientEmail: string
  pdfKey: string
  currency: string
  lineItems: LineItem[]
  vatRate: number
}): SendEmailActionPayload {
  const totals = computeDraftTotals(input.lineItems, input.vatRate)
  return {
    draft_id: input.draftId,
    kind: input.kind,
    doc_number: input.docNumber,
    client_email: input.clientEmail,
    pdf_key: input.pdfKey,
    total: totals.total,
    currency: input.currency,
  }
}
