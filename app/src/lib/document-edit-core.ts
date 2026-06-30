/**
 * Morax - validation et patch immutable de ExtractedFields (editeur inline).
 * Source de verite du type : worker/src/types.ts (duplique ici, app n'importe
 * jamais le workspace worker). Fonctions pures, testables sans mock.
 */

import { z } from 'zod'

export interface ExtractedFields {
  montant?: number
  devise?: string
  date_emission?: string
  date_echeance?: string
  emetteur?: string
  destinataire?: string
  numero_document?: string
}

export type ExtractedFieldsFormInput = Record<string, string>

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

function emptyToUndefined(value: unknown): unknown {
  return typeof value === 'string' && value.trim() === '' ? undefined : value
}

// .optional() doit envelopper le validateur INTERNE, pas le preprocess : Zod ne
// court-circuite .optional() que si la valeur BRUTE (avant preprocess) est deja
// undefined. Ici la valeur brute est une chaine vide '', donc .optional() doit
// voir le resultat DEJA transforme par emptyToUndefined pour court-circuiter.
const extractedFieldsSchema = z.object({
  montant: z.preprocess(emptyToUndefined, z.coerce.number().nonnegative().optional()),
  devise: z.preprocess(emptyToUndefined, z.string().length(3).optional()),
  date_emission: z.preprocess(emptyToUndefined, z.string().regex(ISO_DATE_REGEX).optional()),
  date_echeance: z.preprocess(emptyToUndefined, z.string().regex(ISO_DATE_REGEX).optional()),
  emetteur: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  destinataire: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  numero_document: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
})

export interface ValidationSuccess {
  success: true
  data: ExtractedFields
}

export interface ValidationFailure {
  success: false
  errors: Record<string, string>
}

export type ValidationResult = ValidationSuccess | ValidationFailure

export function validateExtracted(input: ExtractedFieldsFormInput): ValidationResult {
  const result = extractedFieldsSchema.safeParse(input)
  if (!result.success) {
    const errors: Record<string, string> = {}
    for (const issue of result.error.issues) {
      const key = String(issue.path[0] ?? 'form')
      errors[key] = issue.message
    }
    return { success: false, errors }
  }
  return { success: true, data: result.data }
}

/** Merge immutable : un champ efface (undefined valide) disparait du JSON stocke. */
export function buildExtractedPatch(
  current: ExtractedFields,
  validated: ExtractedFields,
): ExtractedFields {
  return { ...current, ...validated }
}
