import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Le paquet partage est transpile depuis le workspace.
  transpilePackages: ['@morax/model-core'],
  // Sur Vercel le Root Directory est app/. Sans borne explicite, le packaging
  // Lambda peut rester borne a app/ et NE PAS inclure les fichiers hors de ce
  // dossier (../packages/...), d'ou un 500 recurrent en prod sur les routes
  // lisant models.registry.yaml (via usageStatus() de @morax/model-core).
  // On pointe le tracer vers la racine du monorepo pour qu'il packe aussi les
  // fichiers du workspace situes en dehors de app/.
  outputFileTracingRoot: join(here, '..'),
  // models.registry.yaml est lu via un chemin fs calcule au runtime
  // (registry.ts locateRegistryFile) : le tracer de Next ne le detecte pas
  // statiquement, il faut le forcer explicitement sinon 500 en prod (fichier
  // absent du bundle serverless deploye).
  // Un premier essai (uniquement '../packages/.../src/models.registry.yaml')
  // n'a PAS fonctionne en prod (500 persistant, fichier absent du bundle) —
  // la base de resolution reelle de ce glob cote Vercel est incertaine.
  // On liste dist ET src, avec et sans prefixe '../', pour couvrir les deux
  // bases possibles (relatif a next.config.mjs vs relatif a
  // outputFileTracingRoot) ; le build model-core copie aussi le yaml dans
  // dist/ (candidat 1 de locateRegistryFile) pour ne plus dependre du tout
  // du fallback src en prod.
  outputFileTracingIncludes: {
    '/**': [
      'packages/model-core/dist/models.registry.yaml',
      'packages/model-core/src/models.registry.yaml',
      '../packages/model-core/dist/models.registry.yaml',
      '../packages/model-core/src/models.registry.yaml',
    ],
  },
}

export default nextConfig
