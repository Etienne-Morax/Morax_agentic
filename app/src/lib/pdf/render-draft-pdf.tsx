/**
 * Morax - rendu PDF partage d'un brouillon devis/facture. Extrait de la route
 * d'export pour etre reutilisable par la server action de finalisation
 * (le PDF envoye au client doit etre rendu par le meme template).
 * Runtime Node requis (@react-pdf/renderer), jamais dans le bundle client.
 */

import { renderToBuffer } from '@react-pdf/renderer'
import type { DraftFields } from '@/lib/document-draft-core'
import { DraftPdf } from '@/lib/pdf/draft-pdf'

export async function renderDraftPdf(draft: DraftFields): Promise<Buffer> {
  return renderToBuffer(<DraftPdf draft={draft} />)
}
