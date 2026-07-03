import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Morax Command Center',
    short_name: 'Morax',
    description: 'Centre de commandement pour piloter les agents Morax.',
    start_url: '/launchpad',
    display: 'standalone',
    background_color: '#14161b',
    theme_color: '#14161b',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
