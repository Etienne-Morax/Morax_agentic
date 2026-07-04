/**
 * Morax - coeur pur de la validation d'un upload de message vocal (E-voice).
 * Fonctions testables sans mock, zero appel Supabase/R2. Meme forme que
 * scan-upload-core.ts (le pipeline OCR photo/PDF).
 */

export interface VoiceUploadValidationSuccess {
  success: true
}

export interface VoiceUploadValidationFailure {
  success: false
  message: string
}

export type VoiceUploadValidationResult = VoiceUploadValidationSuccess | VoiceUploadValidationFailure

/** Toujours WAV : le client ré-encode l'enregistrement natif du navigateur avant l'envoi (cf. encode-wav.ts), pour un format garanti compatible avec la transcription (OpenRouter/Gemini n'accepte pas webm/opus). */
export const ALLOWED_VOICE_MIME_TYPES: readonly string[] = ['audio/wav']

/** Taille max d'un message vocal (octets) : quelques minutes de WAV mono 16 kHz suffisent largement. */
export const MAX_VOICE_UPLOAD_BYTES = 20 * 1024 * 1024

export interface VoiceUploadCandidate {
  size: number
  type: string
}

/** Valide un fichier audio candidat avant upload R2 : taille, presence, type MIME. */
export function validateVoiceUpload(
  file: VoiceUploadCandidate | null | undefined,
): VoiceUploadValidationResult {
  if (!file || file.size <= 0) {
    return { success: false, message: 'Aucun message vocal enregistre.' }
  }
  if (file.size > MAX_VOICE_UPLOAD_BYTES) {
    return { success: false, message: 'Message vocal trop long.' }
  }
  if (!ALLOWED_VOICE_MIME_TYPES.includes(file.type)) {
    return { success: false, message: 'Format audio non supporte.' }
  }
  return { success: true }
}

const VOICE_KEY_UNSAFE_CHARS = /[^A-Za-z0-9._-]/g

/** Cle R2 tenant-scopee pour un message vocal uploade depuis le chat. */
export function buildVoiceUploadKey(tenantId: string, voiceId: string, filename: string): string {
  const safeFilename = filename.replace(VOICE_KEY_UNSAFE_CHARS, '-')
  return `tenants/${tenantId}/voice/${voiceId}/${safeFilename}`
}
