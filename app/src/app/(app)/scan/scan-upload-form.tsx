'use client'

/**
 * Morax - formulaire d'upload d'un scan (camera ou galerie). Previsualise
 * l'image choisie, envoie via Server Action, redirige vers /inbox en cas de
 * succes (liste les documents en statut actionnable, cf. inbox-core.ts).
 */

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, ScanLine } from 'lucide-react'
import { useHaptics } from '@/lib/use-haptics'
import { uploadScannedDocument } from './actions'
import styles from './page.module.css'

type FormState = 'idle' | 'submitting'

export function ScanUploadForm() {
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [state, setState] = useState<FormState>('idle')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const haptics = useHaptics()
  const router = useRouter()

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null
    setError(null)
    setFile(selected)

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }

    if (selected && selected.type.startsWith('image/')) {
      setPreviewUrl(URL.createObjectURL(selected))
    } else {
      setPreviewUrl(null)
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file) {
      setError('Aucun fichier selectionne.')
      return
    }

    haptics.tap()
    setState('submitting')
    setError(null)

    const formData = new FormData()
    formData.set('file', file)

    const result = await uploadScannedDocument(formData)

    if (result.ok) {
      haptics.success()
      router.push('/inbox')
      return
    }

    setState('idle')
    haptics.error()
    setError(result.message)
  }

  const isSubmitting = state === 'submitting'

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <label className={styles.dropzone} htmlFor="scan-file">
        {previewUrl ? (
          // next/image ne supporte pas les URLs blob: locales (previsualisation avant upload).
          <img src={previewUrl} alt="Apercu du document" className={styles.preview} />
        ) : file ? (
          <span className={styles.filePreview}>
            <FileText className={styles.filePreviewIcon} strokeWidth={2} aria-hidden="true" />
            {file.name}
          </span>
        ) : (
          <span className={styles.dropzonePlaceholder}>
            <ScanLine className={styles.dropzoneIcon} strokeWidth={2} aria-hidden="true" />
            Prendre une photo ou choisir un fichier
          </span>
        )}
      </label>
      <input
        ref={inputRef}
        id="scan-file"
        className={styles.fileInput}
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        onChange={handleFileChange}
        disabled={isSubmitting}
      />

      <button className={styles.submit} type="submit" disabled={isSubmitting || !file}>
        {isSubmitting ? 'Envoi...' : 'Envoyer pour analyse'}
      </button>

      {error && (
        <p className={styles.formError} role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
