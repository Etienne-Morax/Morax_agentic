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
  // dossier (../packages/...). On pointe le tracer vers la racine du monorepo
  // pour qu'il packe aussi les fichiers du workspace situes en dehors de app/.
  outputFileTracingRoot: join(here, '..'),
}

export default nextConfig
