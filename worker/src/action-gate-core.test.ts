import { describe, expect, it } from 'vitest'
import type { SendEmailActionPayload } from '@morax/model-core'
import {
  buildApprovalKeyboard,
  formatActionResult,
  formatApprovalSummary,
  formatDocumentEmail,
  parseSendEmailPayload,
} from './action-gate-core.js'

function payload(overrides: Partial<SendEmailActionPayload> = {}): SendEmailActionPayload {
  return {
    draft_id: 'draft-1',
    kind: 'invoice',
    doc_number: 'INV-001',
    client_email: 'client@x.com',
    pdf_key: 'tenants/t1/drafts/draft-1/INV-001.pdf',
    total: 340,
    currency: 'GBP',
    ...overrides,
  }
}

describe('formatApprovalSummary', () => {
  it('resume une facture avec montant et devise', () => {
    expect(formatApprovalSummary(payload())).toBe(
      'Envoyer la facture INV-001 (340 GBP TTC) a client@x.com ?',
    )
  })

  it('resume un devis', () => {
    expect(formatApprovalSummary(payload({ kind: 'quote', doc_number: 'Q-042' }))).toBe(
      'Envoyer le devis Q-042 (340 GBP TTC) a client@x.com ?',
    )
  })
})

describe('buildApprovalKeyboard', () => {
  it('construit un inline_keyboard avec 2 boutons approuver/rejeter', () => {
    const keyboard = buildApprovalKeyboard('abc-123')
    expect(keyboard).toEqual({
      inline_keyboard: [
        [
          { text: 'Approuver', callback_data: 'act:abc-123:approve' },
          { text: 'Rejeter', callback_data: 'act:abc-123:reject' },
        ],
      ],
    })
  })

  it('callback_data reste sous 64 octets pour un uuid standard', () => {
    const id = '123e4567-e89b-12d3-a456-426614174000'
    const keyboard = buildApprovalKeyboard(id)
    for (const row of keyboard.inline_keyboard) {
      for (const button of row) {
        expect(Buffer.byteLength(button.callback_data, 'utf8')).toBeLessThanOrEqual(64)
      }
    }
  })
})

describe('formatDocumentEmail', () => {
  it('construit subject/textBody/filename pour une facture', () => {
    const email = formatDocumentEmail(payload())
    expect(email.subject).toBe('Facture INV-001')
    expect(email.textBody).toContain('INV-001')
    expect(email.textBody).toContain('340 GBP')
    expect(email.filename).toBe('INV-001.pdf')
  })

  it('construit subject pour un devis', () => {
    const email = formatDocumentEmail(payload({ kind: 'quote', doc_number: 'Q-042' }))
    expect(email.subject).toBe('Devis Q-042')
    expect(email.filename).toBe('Q-042.pdf')
  })
})

describe('formatActionResult', () => {
  it('formate le resultat execute', () => {
    expect(formatActionResult('executed', payload())).toBe(
      'Email envoye : facture INV-001 a client@x.com.',
    )
  })

  it('formate le resultat rejected', () => {
    expect(formatActionResult('rejected', payload({ kind: 'quote', doc_number: 'Q-042' }))).toBe(
      'Envoi annule : devis Q-042.',
    )
  })
})

describe('parseSendEmailPayload', () => {
  it('accepte un payload valide', () => {
    expect(parseSendEmailPayload(payload())).toEqual(payload())
  })

  it('leve si le payload est absent', () => {
    expect(() => parseSendEmailPayload(undefined)).toThrow(/payload send_email invalide/)
  })

  it('leve si un champ requis manque', () => {
    const { client_email, ...rest } = payload()
    expect(() => parseSendEmailPayload(rest)).toThrow(/payload send_email invalide/)
  })

  it('leve si kind est invalide', () => {
    expect(() => parseSendEmailPayload({ ...payload(), kind: 'other' })).toThrow(
      /payload send_email invalide/,
    )
  })
})
