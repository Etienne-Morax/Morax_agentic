/**
 * Morax - E2 : template PDF d'un brouillon devis/facture (@react-pdf/renderer).
 * Import confine au route handler serveur (jamais dans le bundle client).
 * Les totaux reutilisent computeDraftTotals (document-draft-core) : source
 * unique de verite, jamais recalcules a la main ici.
 */

import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { computeDraftTotals, type DraftFields } from '@/lib/document-draft-core'

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: 'Helvetica' },
  title: { fontSize: 20, marginBottom: 4 },
  subtitle: { fontSize: 10, color: '#666666', marginBottom: 16 },
  section: { marginBottom: 16 },
  label: { fontSize: 9, color: '#666666', marginBottom: 2 },
  value: { fontSize: 11, marginBottom: 8 },
  table: { display: 'flex', flexDirection: 'column', borderTop: '1 solid #dddddd' },
  tableHeaderRow: {
    flexDirection: 'row',
    borderBottom: '1 solid #dddddd',
    paddingVertical: 4,
    fontWeight: 700,
  },
  tableRow: { flexDirection: 'row', borderBottom: '1 solid #eeeeee', paddingVertical: 4 },
  colDescription: { flex: 3 },
  colNumber: { flex: 1, textAlign: 'right' },
  totals: { marginTop: 16, alignSelf: 'flex-end', width: 200 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  totalRowFinal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontWeight: 700,
    fontSize: 12,
    marginTop: 4,
    borderTop: '1 solid #333333',
    paddingTop: 4,
  },
  notes: { marginTop: 24, fontSize: 9, color: '#666666' },
})

function formatMoney(value: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(value)
}

interface DraftPdfProps {
  draft: DraftFields
}

export function DraftPdf({ draft }: DraftPdfProps) {
  const currency = draft.currency ?? 'GBP'
  const totals = computeDraftTotals(draft.lineItems, draft.vatRate)
  const kindLabel = draft.kind === 'quote' ? 'Devis' : 'Facture'

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>
          {kindLabel}
          {draft.docNumber ? ` — ${draft.docNumber}` : ''}
        </Text>
        {draft.issueDate && <Text style={styles.subtitle}>Emis le {draft.issueDate}</Text>}

        <View style={styles.section}>
          <Text style={styles.label}>Client</Text>
          <Text style={styles.value}>{draft.clientName ?? '—'}</Text>
          {draft.clientAddress && <Text style={styles.value}>{draft.clientAddress}</Text>}
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={styles.colDescription}>Designation</Text>
            <Text style={styles.colNumber}>Qte</Text>
            <Text style={styles.colNumber}>PU</Text>
            <Text style={styles.colNumber}>Total</Text>
          </View>
          {draft.lineItems.map((item, index) => (
            <View key={index} style={styles.tableRow}>
              <Text style={styles.colDescription}>{item.description}</Text>
              <Text style={styles.colNumber}>{item.quantity}</Text>
              <Text style={styles.colNumber}>{formatMoney(item.unitPrice, currency)}</Text>
              <Text style={styles.colNumber}>
                {formatMoney(item.quantity * item.unitPrice, currency)}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text>Sous-total (HT)</Text>
            <Text>{formatMoney(totals.subtotal, currency)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text>TVA ({draft.vatRate}%)</Text>
            <Text>{formatMoney(totals.vatAmount, currency)}</Text>
          </View>
          <View style={styles.totalRowFinal}>
            <Text>Total (TTC)</Text>
            <Text>{formatMoney(totals.total, currency)}</Text>
          </View>
        </View>

        {draft.dueDate && <Text style={styles.notes}>Echeance : {draft.dueDate}</Text>}
        {draft.notes && <Text style={styles.notes}>{draft.notes}</Text>}
      </Page>
    </Document>
  )
}
