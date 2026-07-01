'use client'

import { useActionState, useEffect, useMemo, useState } from 'react'
import { updateDraftAction, type UpdateDraftState } from '@/app/actions/manage-draft'
import { computeDraftTotals, type DraftFields, type LineItem } from '@/lib/document-draft-core'
import styles from './page.module.css'

const INITIAL_STATE: UpdateDraftState = { success: false }

const EMPTY_LINE_ITEM: LineItem = { description: '', quantity: 1, unitPrice: 0 }

interface DocumentDraftFormProps {
  draftId: string
  initial: DraftFields
}

function formatMoney(value: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(value)
}

export function DocumentDraftForm({ draftId, initial }: DocumentDraftFormProps) {
  const [values, setValues] = useState<DraftFields>(initial)
  const [lastSaved, setLastSaved] = useState<DraftFields>(initial)
  const [state, formAction, isPending] = useActionState(updateDraftAction, INITIAL_STATE)

  useEffect(() => {
    if (state.success) {
      setLastSaved((previous) => ({ ...previous, ...values }))
    } else if (state.errors || state.message) {
      setValues(lastSaved)
    }
  }, [state])

  const totals = useMemo(
    () => computeDraftTotals(values.lineItems, values.vatRate),
    [values.lineItems, values.vatRate],
  )

  function updateField<K extends keyof DraftFields>(field: K, value: DraftFields[K]) {
    setValues((previous) => ({ ...previous, [field]: value }))
  }

  function updateLineItem(index: number, patch: Partial<LineItem>) {
    setValues((previous) => ({
      ...previous,
      lineItems: previous.lineItems.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }))
  }

  function addLineItem() {
    setValues((previous) => ({ ...previous, lineItems: [...previous.lineItems, { ...EMPTY_LINE_ITEM }] }))
  }

  function removeLineItem(index: number) {
    setValues((previous) => ({
      ...previous,
      lineItems: previous.lineItems.filter((_, i) => i !== index),
    }))
  }

  return (
    <form className={styles.form} action={formAction}>
      <input type="hidden" name="draftId" value={draftId} />
      <input type="hidden" name="lineItems" value={JSON.stringify(values.lineItems)} />

      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="kind">
            Type
          </label>
          <select
            id="kind"
            name="kind"
            className={styles.input}
            value={values.kind}
            onChange={(event) => updateField('kind', event.target.value as DraftFields['kind'])}
            disabled={isPending}
          >
            <option value="quote">Devis</option>
            <option value="invoice">Facture</option>
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="docNumber">
            Numero
          </label>
          <input
            id="docNumber"
            name="docNumber"
            className={styles.input}
            value={values.docNumber ?? ''}
            onChange={(event) => updateField('docNumber', event.target.value)}
            disabled={isPending}
          />
        </div>
      </div>

      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="clientName">
            Client
          </label>
          <input
            id="clientName"
            name="clientName"
            className={styles.input}
            value={values.clientName ?? ''}
            onChange={(event) => updateField('clientName', event.target.value)}
            disabled={isPending}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="clientAddress">
            Adresse client
          </label>
          <input
            id="clientAddress"
            name="clientAddress"
            className={styles.input}
            value={values.clientAddress ?? ''}
            onChange={(event) => updateField('clientAddress', event.target.value)}
            disabled={isPending}
          />
        </div>
      </div>

      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="currency">
            Devise
          </label>
          <input
            id="currency"
            name="currency"
            className={styles.input}
            value={values.currency ?? 'GBP'}
            onChange={(event) => updateField('currency', event.target.value)}
            disabled={isPending}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="vatRate">
            TVA (%)
          </label>
          <input
            id="vatRate"
            name="vatRate"
            type="number"
            step="0.01"
            className={styles.input}
            value={values.vatRate}
            onChange={(event) => updateField('vatRate', Number(event.target.value))}
            disabled={isPending}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="issueDate">
            Date d&apos;emission
          </label>
          <input
            id="issueDate"
            name="issueDate"
            type="date"
            className={styles.input}
            value={values.issueDate ?? ''}
            onChange={(event) => updateField('issueDate', event.target.value)}
            disabled={isPending}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="dueDate">
            Date d&apos;echeance
          </label>
          <input
            id="dueDate"
            name="dueDate"
            type="date"
            className={styles.input}
            value={values.dueDate ?? ''}
            onChange={(event) => updateField('dueDate', event.target.value)}
            disabled={isPending}
          />
        </div>
      </div>

      <h2 className={styles.sectionTitle}>Lignes</h2>
      <div className={styles.lineItems}>
        {values.lineItems.map((item, index) => (
          <div key={index} className={styles.lineItemRow}>
            <input
              className={styles.lineItemDescription}
              placeholder="Designation"
              value={item.description}
              onChange={(event) => updateLineItem(index, { description: event.target.value })}
              disabled={isPending}
            />
            <input
              type="number"
              step="0.01"
              className={styles.lineItemNumber}
              placeholder="Qte"
              value={item.quantity}
              onChange={(event) => updateLineItem(index, { quantity: Number(event.target.value) })}
              disabled={isPending}
            />
            <input
              type="number"
              step="0.01"
              className={styles.lineItemNumber}
              placeholder="PU"
              value={item.unitPrice}
              onChange={(event) => updateLineItem(index, { unitPrice: Number(event.target.value) })}
              disabled={isPending}
            />
            <span className={styles.lineItemTotal}>
              {formatMoney(item.quantity * item.unitPrice, values.currency ?? 'GBP')}
            </span>
            <button
              type="button"
              className={styles.lineItemRemove}
              onClick={() => removeLineItem(index)}
              disabled={isPending}
            >
              Supprimer
            </button>
          </div>
        ))}
      </div>
      <button type="button" className={styles.addLineItem} onClick={addLineItem} disabled={isPending}>
        + Ajouter une ligne
      </button>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="notes">
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          className={styles.input}
          value={values.notes ?? ''}
          onChange={(event) => updateField('notes', event.target.value)}
          disabled={isPending}
        />
      </div>

      <div className={styles.totals}>
        <div className={styles.totalRow}>
          <span>Sous-total (HT)</span>
          <span>{formatMoney(totals.subtotal, values.currency ?? 'GBP')}</span>
        </div>
        <div className={styles.totalRow}>
          <span>TVA</span>
          <span>{formatMoney(totals.vatAmount, values.currency ?? 'GBP')}</span>
        </div>
        <div className={styles.totalRowFinal}>
          <span>Total (TTC)</span>
          <span>{formatMoney(totals.total, values.currency ?? 'GBP')}</span>
        </div>
      </div>

      {Object.keys(state.errors ?? {}).length > 0 && (
        <ul className={styles.errorList} role="alert">
          {Object.entries(state.errors ?? {}).map(([key, message]) => (
            <li key={key}>{message}</li>
          ))}
        </ul>
      )}

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
