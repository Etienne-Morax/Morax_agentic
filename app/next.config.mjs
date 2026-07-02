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
  // NB: ces chemins restent relatifs a app/ (dossier de la config), PAS a
  // outputFileTracingRoot — verifie dans next/dist/build/collect-build-traces.
  // Ne pas retirer le `../`.
  outputFileTracingIncludes: {
    '/**': ['../packages/model-core/src/models.registry.yaml'],
  },
}

export default nextConfig
