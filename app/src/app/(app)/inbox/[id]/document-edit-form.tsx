'use client'

import { useActionState, useEffect, useState } from 'react'
import { updateDocumentAction, type UpdateDocumentState } from '@/app/actions/update-document'
import type { ExtractedFields } from '@/lib/document-edit-core'
import styles from './page.module.css'

const INITIAL_STATE: UpdateDocumentState = { success: false }

const FIELDS: { name: keyof ExtractedFields; label: string; type: string }[] = [
  { name: 'montant', label: 'Montant', type: 'number' },
  { name: 'devise', label: 'Devise (ISO 4217, ex. GBP)', type: 'text' },
  { name: 'date_emission', label: "Date d'emission", type: 'date' },
  { name: 'date_echeance', label: "Date d'echeance", type: 'date' },
  { name: 'emetteur', label: 'Emetteur', type: 'text' },
  { name: 'destinataire', label: 'Destinataire', type: 'text' },
  { name: 'numero_document', label: 'Numero de document', type: 'text' },
]

function toFormValue(value: number | string | undefined): string {
  return value === undefined ? '' : String(value)
}

function parseFieldValue(name: keyof ExtractedFields, raw: string): number | string | undefined {
  if (raw === '') return undefined
  return name === 'montant' ? Number(raw) : raw
}

interface DocumentEditFormProps {
  documentId: string
  extracted: ExtractedFields
}

export function DocumentEditForm({ documentId, extracted }: DocumentEditFormProps) {
  const [values, setValues] = useState<ExtractedFields>(extracted)
  const [lastSaved, setLastSaved] = useState<ExtractedFields>(extracted)
  const [state, formAction, isPending] = useActionState(updateDocumentAction, INITIAL_STATE)

  // Commit l'etat optimiste sur succes, rollback vers la derniere version
  // confirmee par le serveur sur echec (validation ou erreur d'ecriture).
  useEffect(() => {
    if (state.success) {
      setLastSaved((previous) => ({ ...previous, ...values }))
    } else if (state.errors || state.message) {
      setValues(lastSaved)
    }
  }, [state])

  function handleChange(name: keyof ExtractedFields, raw: string) {
    setValues((previous) => ({ ...previous, [name]: parseFieldValue(name, raw) }))
  }

  return (
    <form className={styles.form} action={formAction}>
      <input type="hidden" name="documentId" value={documentId} />
      {FIELDS.map((field) => (
        <div key={field.name} className={styles.field}>
          <label className={styles.label} htmlFor={field.name}>
            {field.label}
          </label>
          <input
            id={field.name}
            name={field.name}
            type={field.type}
            step={field.type === 'number' ? '0.01' : undefined}
            value={toFormValue(values[field.name])}
            onChange={(event) => handleChange(field.name, event.target.value)}
            className={styles.input}
            disabled={isPending}
          />
          {!state.success && state.errors?.[field.name] && (
            <p className={styles.fieldError} role="alert">
              {state.errors[field.name]}
            </p>
          )}
        </div>
      ))}

      <button className={styles.submit} type="submit" disabled={isPending}>
        {isPending ? 'Enregistrement...' : 'Enregistrer'}
      </button>

      {state.success && state.message && (
        <p className={styles.success} role="status">
          {state.message}
        </p>
      )}
      {!state.success && state.message && (
        <p className={styles.formError} role="alert">
          {state.message}
        </p>
      )}
    </form>
  )
}
