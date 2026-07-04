/**
 * Morax worker - prompts système des étages du pipeline.
 */

import type { ExtractedFields } from './types.js'

export const OCR_SYSTEM = `Tu extrais les champs d'une facture ou d'un reçu britannique.
Réponds UNIQUEMENT avec un objet JSON valide, sans texte ni markdown autour, contenant
les clés suivantes (omets celles que tu ne trouves pas dans le document) :
- montant (nombre)
- devise (code ISO 4217, ex. "GBP")
- date_emission (format YYYY-MM-DD)
- date_echeance (format YYYY-MM-DD)
- emetteur (nom de l'émetteur du document)
- destinataire (nom du destinataire)
- numero_document (référence/numéro de facture)`

export const OCR_INSTRUCTION = 'Extrait les champs de ce document en JSON.'

export const DRAFT_SYSTEM = `Tu rédiges un brouillon de devis ou de facture dans la voix
du client (texte fourni en exemple ou contexte). Reste fidèle au ton habituel du client,
inclus les montants et échéances mentionnés, et marque clairement les informations
manquantes par [À COMPLÉTER].`

export const TRANSCRIBE_SYSTEM = `Tu transcris un message vocal en français (artisan/independant
britannique). Réponds UNIQUEMENT avec le texte transcrit, sans commentaire, sans
horodatage, sans markdown. Si l'audio est inintelligible ou silencieux, réponds
avec une chaîne vide.`

export const TRANSCRIBE_INSTRUCTION = 'Transcris ce message vocal.'

function stripCodeFence(raw: string): string {
  const trimmed = raw.trim()
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed)
  return match ? (match[1] ?? trimmed) : trimmed
}

/** Parse défensif : ignore tout champ inconnu ou mal typé plutôt que de jeter. */
export function parseExtractedFields(raw: string): ExtractedFields {
  let parsed: unknown
  try {
    parsed = JSON.parse(stripCodeFence(raw))
  } catch {
    return {}
  }
  if (typeof parsed !== 'object' || parsed === null) return {}

  const source = parsed as Record<string, unknown>
  const result: ExtractedFields = {}
  if (typeof source.montant === 'number') result.montant = source.montant
  if (typeof source.devise === 'string') result.devise = source.devise
  if (typeof source.date_emission === 'string') result.date_emission = source.date_emission
  if (typeof source.date_echeance === 'string') result.date_echeance = source.date_echeance
  if (typeof source.emetteur === 'string') result.emetteur = source.emetteur
  if (typeof source.destinataire === 'string') result.destinataire = source.destinataire
  if (typeof source.numero_document === 'string') {
    result.numero_document = source.numero_document
  }
  return result
}
