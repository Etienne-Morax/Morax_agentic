import type { MetadataRoute } from 'next'

// screenshots: pas ajoutees ici - captures reelles bloquees (login magic-link
// casse en prod, cf memoire session ; pas de credentials de test disponibles).
// A ajouter une fois le login retabli.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Morax Command Center',
    short_name: 'Morax',
    description: 'Centre de commandement pour piloter les agents Morax.',
    start_url: '/launchpad',
    display: 'standalone',
    orientation: 'portrait',
    // #faf7f3 = --color-surface (tokens.css), pas de variable CSS dispo dans le manifest.
    background_color: '#faf7f3',
    theme_color: '#faf7f3',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
