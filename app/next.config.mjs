/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Le paquet partage est transpile depuis le workspace.
  transpilePackages: ['@morax/model-core'],
}

export default nextConfig
