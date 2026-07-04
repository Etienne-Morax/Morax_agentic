/**
 * Morax - coeur pur de la validation d'un upload de document scanne (E-scan).
 * Fonctions testables sans mock, zero appel Supabase/R2.
 */

export interface ScanUploadValidationSuccess {
  success: true
}

export interface ScanUploadValidationFailure {
  success: false
  message: string
}

export type ScanUploadValidationResult = ScanUploadValidationSuccess | ScanUploadValidationFailure

/** Types MIME acceptes pour un scan depuis la camera ou la galerie du telephone. */
export const ALLOWED_SCAN_MIME_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
]

/** Taille max d'un upload de scan (octets). */
export const MAX_SCAN_UPLOAD_BYTES = 15 * 1024 * 1024

export interface ScanUploadCandidate {
  size: number
  type: string
}

/** Valide un fichier candidat avant upload R2 : taille, presence, type MIME. */
export function validateScanUpload(file: ScanUploadCandidate | null | undefined): ScanUploadValidationResult {
  if (!file || file.size <= 0) {
    return { success: false, message: 'Aucun fichier selectionne.' }
  }
  if (file.size > MAX_SCAN_UPLOAD_BYTES) {
    return { success: false, message: 'Fichier trop volumineux (15 Mo max).' }
  }
  if (!ALLOWED_SCAN_MIME_TYPES.includes(file.type)) {
    return { success: false, message: 'Format non supporte (photo ou PDF uniquement).' }
  }
  return { success: true }
}

const SCAN_KEY_UNSAFE_CHARS = /[^A-Za-z0-9._-]/g

/** Cle R2 tenant-scopee pour un document scanne uploade depuis l'app. */
export function buildScanUploadKey(tenantId: string, documentId: string, filename: string): string {
  const safeFilename = filename.replace(SCAN_KEY_UNSAFE_CHARS, '-')
  return `tenants/${tenantId}/uploads/${documentId}/${safeFilename}`
}
