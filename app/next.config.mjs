/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Le paquet partage est transpile depuis le workspace.
  transpilePackages: ['@morax/model-core'],
  // models.registry.yaml est lu via un chemin fs calcule au runtime
  // (registry.ts locateRegistryFile) : le tracer de Next ne le detecte pas
  // statiquement, il faut le forcer explicitement sinon 500 en prod (fichier
  // absent du bundle serverless deploye).
  outputFileTracingIncludes: {
    '/**': ['../packages/model-core/src/models.registry.yaml'],
  },
}

export default nextConfig
