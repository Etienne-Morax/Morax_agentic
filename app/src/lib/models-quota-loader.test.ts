/**
 * Cloisonnement RLS : preuve complementaire au niveau de la couche serveur.
 * La preuve d'isolation reelle (deux tenants Postgres distincts, meme requete non
 * filtree) est dans supabase/tests/rls_credits_isolation.sql, executee contre la
 * base vivante (voir rapport de tache). Ici on verifie le contrat cote code :
 * - loadClientModelsQuota ne construit JAMAIS de filtre tenant_id explicite : il
 *   delegue entierement a la RLS (aucune colonne tenant_id dans les `.select()`,
 *   aucun `.eq('tenant_id', ...)`). C'est cette absence de filtre cote client qui
 *   rend le cloisonnement testable au niveau SQL : si le code app oubliait la RLS,
 *   ce test ne bougerait pas mais la requete SQL prouverait la fuite.
 * - assertAdminRole rejette tout utilisateur dont le role n'est pas 'admin', donc
 *   un tenant "client" ne peut jamais atteindre loadAdminModelsQuota (agregat tous
 *   tenants) meme s'il obtient un handle vers ce code.
 */

import { describe, expect, test, vi } from 'vitest'
import { assertAdminRole, ForbiddenAdminAccessError, loadClientModelsQuota } from './models-quota-loader.js'

function fakeQueryBuilder(result: { data: unknown; error: null }) {
  const builder: Record<string, unknown> = {}
  builder.select = vi.fn().mockReturnValue(builder)
  builder.eq = vi.fn().mockReturnValue(builder)
  builder.gte = vi.fn().mockReturnValue(builder)
  builder.maybeSingle = vi.fn().mockResolvedValue(result)
  builder.then = (resolve: (value: typeof result) => void) => resolve(result)
  return builder
}

describe('loadClientModelsQuota - contrat RLS', () => {
  test("ne filtre jamais explicitement par tenant_id : la requete credits_ledger ne contient aucun .eq('tenant_id', ...)", async () => {
    // Arrange
    const tenantRow = { data: { action_quota_monthly: 60, alert_threshold_pct: 80 }, error: null }
    const ledgerRow = { data: [{ action_category: 'scan_document', weight: 5 }], error: null }

    const tenantsBuilder = fakeQueryBuilder(tenantRow)
    const ledgerBuilder = fakeQueryBuilder(ledgerRow)

    const from = vi.fn((table: string) => {
      if (table === 'tenants') return tenantsBuilder
      if (table === 'credits_ledger') return ledgerBuilder
      throw new Error(`table inattendue: ${table}`)
    })
    const db = { from } as unknown as Parameters<typeof loadClientModelsQuota>[0]

    // Act
    const view = await loadClientModelsQuota(db)

    // Assert : la requete credits_ledger ne restreint QUE sur created_at (periode),
    // jamais sur tenant_id -- le cloisonnement vient entierement de la policy RLS.
    expect(ledgerBuilder.eq).not.toHaveBeenCalledWith('tenant_id', expect.anything())
    expect(ledgerBuilder.gte).toHaveBeenCalledWith('created_at', expect.any(String))
    expect(view.detail).toBe('client')
    expect(view.credits.consumed).toBe(5)
  })
})

describe('assertAdminRole - gate cote application pour la vue admin', () => {
  test("rejette un utilisateur avec role 'owner' (client standard)", async () => {
    // Arrange
    const builder = fakeQueryBuilder({ data: { role: 'owner' }, error: null })
    const db = { from: vi.fn().mockReturnValue(builder) } as unknown as Parameters<typeof assertAdminRole>[0]

    // Act / Assert
    await expect(assertAdminRole(db, 'user-client')).rejects.toBeInstanceOf(ForbiddenAdminAccessError)
  })

  test("autorise un utilisateur avec role 'admin'", async () => {
    // Arrange
    const builder = fakeQueryBuilder({ data: { role: 'admin' }, error: null })
    const db = { from: vi.fn().mockReturnValue(builder) } as unknown as Parameters<typeof assertAdminRole>[0]

    // Act / Assert
    await expect(assertAdminRole(db, 'user-admin')).resolves.toBeUndefined()
  })

  test('rejette quand aucune ligne utilisateur trouvee', async () => {
    // Arrange
    const builder = fakeQueryBuilder({ data: null, error: null })
    const db = { from: vi.fn().mockReturnValue(builder) } as unknown as Parameters<typeof assertAdminRole>[0]

    // Act / Assert
    await expect(assertAdminRole(db, 'user-inconnu')).rejects.toBeInstanceOf(ForbiddenAdminAccessError)
  })
})
