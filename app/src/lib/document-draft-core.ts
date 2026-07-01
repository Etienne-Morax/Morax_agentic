/**
 * Morax - E2 : brouillons devis/facture (outbound). Validation Zod + calcul
 * des totaux (HT/TVA/TTC). Fonctions pures, testables sans mock, zero appel
 * Supabase/IA. Source de verite du type : table document_drafts.
 */

import { z } from 'zod'

export interface LineItem {
  description: string
  quantity: number
  unitPrice: number
}

export interface DraftTotals {
  subtotal: number
  vatAmount: number
  total: number
}

export interface DraftFields {
  kind: 'quote' | 'invoice'
  docNumber?: string
  clientName?: string
  clientAddress?: string
  currency?: string
  vatRate: number
  issueDate?: string
  dueDate?: string
  notes?: string
  lineItems: LineItem[]
}

export type DraftFormInput = {
  kind?: string
  docNumber?: string
  clientName?: string
  clientAddress?: string
  currency?: string
  vatRate?: string | number
  issueDate?: string
  dueDate?: string
  notes?: string
  lineItems?: unknown
}

export interface ValidationSuccess {
  success: true
  data: DraftFields
}

export interface ValidationFailure {
  success: false
  errors: Record<string, string>
}

export type ValidationResult = ValidationSuccess | ValidationFailure

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

function emptyToUndefined(value: unknown): unknown {
  return typeof value === 'string' && value.trim() === '' ? undefined : value
}

const lineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.coerce.number().nonnegative(),
  unitPrice: z.coerce.number().nonnegative(),
})

const draftSchema = z.object({
  kind: z.enum(['quote', 'invoice']),
  docNumber: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  clientName: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  clientAddress: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  currency: z.preprocess(emptyToUndefined, z.string().length(3).optional()),
  vatRate: z.coerce.number().min(0).max(100),
  issueDate: z.preprocess(emptyToUndefined, z.string().regex(ISO_DATE_REGEX).optional()),
  dueDate: z.preprocess(emptyToUndefined, z.string().regex(ISO_DATE_REGEX).optional()),
  notes: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  lineItems: z.array(lineItemSchema),
})

export function validateDraft(input: DraftFormInput): ValidationResult {
  const result = draftSchema.safeParse({ ...input, lineItems: input.lineItems ?? [] })
  if (!result.success) {
    const errors: Record<string, string> = {}
    for (const issue of result.error.issues) {
      const key = issue.path.length > 0 ? issue.path.join('.') : 'form'
      errors[key] = issue.message
    }
    return { success: false, errors }
  }
  return { success: true, data: result.data }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export function computeDraftTotals(
  lineItems: readonly LineItem[],
  vatRatePct: number,
): DraftTotals {
  const rawSubtotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  const subtotal = round2(rawSubtotal)
  const vatAmount = round2(rawSubtotal * (vatRatePct / 100))
  const total = round2(subtotal + vatAmount)
  return { subtotal, vatAmount, total }
}
