import { describe, expect, it } from 'vitest'
import { listActiveModels } from './active-models.js'
import { registry } from './registry.js'
import type { Registry } from './registry.js'

describe('listActiveModels', () => {
  it('renvoie une entrée par (tier, role) présent dans le registre réel', () => {
    const entries = listActiveModels(registry)

    const expectedCount = Object.values(registry.tiers).reduce(
      (sum, tier) => sum + Object.keys(tier).length,
      0,
    )
    expect(entries).toHaveLength(expectedCount)
  })

  it('marque le cerveau finance-critique (premium/cerveau) comme actif et épinglé', () => {
    const entries = listActiveModels(registry)
    const financePin = entries.find((e) => e.id === 'premium/cerveau')

    expect(financePin).toBeDefined()
    expect(financePin?.pinned).toBe(true)
    expect(financePin?.status).toBe('active')
    expect(financePin?.model).toBe(registry.tiers.premium.cerveau.model)
  })

  it('marque le workhorse planificateur (premium/workhorse) comme actif et épinglé', () => {
    const entries = listActiveModels(registry)
    const plannerPin = entries.find((e) => e.id === 'premium/workhorse')

    expect(plannerPin).toBeDefined()
    expect(plannerPin?.pinned).toBe(true)
    expect(plannerPin?.status).toBe('active')
  })

  it('marque chaque palier tenant (economique/*, intermediaire/*, premium/*) comme actif non épinglé sauf les pins', () => {
    const entries = listActiveModels(registry)
    const economiqueCerveau = entries.find((e) => e.id === 'economique/cerveau')
    const intermediaireWorkhorse = entries.find((e) => e.id === 'intermediaire/workhorse')

    expect(economiqueCerveau?.status).toBe('active')
    expect(economiqueCerveau?.pinned).toBe(false)
    expect(intermediaireWorkhorse?.status).toBe('active')
    expect(intermediaireWorkhorse?.pinned).toBe(false)
  })

  it('ne code aucun nom de modèle en dur : changer le registre change la sortie', () => {
    const mutatedRegistry: Registry = {
      ...registry,
      tiers: {
        ...registry.tiers,
        premium: {
          ...registry.tiers.premium,
          micro: {
            ...registry.tiers.premium.micro,
            model: 'un-modele-invente-pour-le-test',
          },
        },
      },
    }

    const entries = listActiveModels(mutatedRegistry)
    const microEntry = entries.find((e) => e.id === 'premium/micro')

    expect(microEntry?.model).toBe('un-modele-invente-pour-le-test')
    expect(microEntry?.label).toContain('un-modele-invente-pour-le-test')
  })

  it('détecte un modèle déprécié (tier orphelin, non atteignable par aucun palier tenant, ni pin, ni fallback)', () => {
    const mutatedRegistry: Registry = {
      ...registry,
      tiers: {
        ...registry.tiers,
        legacy_orpheline: {
          cerveau: registry.tiers.economique.cerveau,
          workhorse: registry.tiers.economique.workhorse,
          micro: registry.tiers.economique.micro,
        },
      },
    }

    const entries = listActiveModels(mutatedRegistry)
    const orphanEntries = entries.filter((e) => e.tier === 'legacy_orpheline')

    expect(orphanEntries).toHaveLength(3)
    for (const entry of orphanEntries) {
      expect(entry.status).toBe('deprecated')
      expect(entry.pinned).toBe(false)
    }
  })

  it('génère un label lisible incluant le palier, le rôle et le nom du modèle', () => {
    const entries = listActiveModels(registry)
    const entry = entries.find((e) => e.id === 'economique/micro')

    expect(entry?.label).toBe(
      `Palier economique — micro (${registry.tiers.economique.micro.model})`,
    )
  })
})
