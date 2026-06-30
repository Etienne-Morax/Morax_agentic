import type { ReactNode } from 'react'
import '@/styles/global.css'

export const metadata = {
  title: 'Morax',
  description: 'Assistant agentic d administration. Zero retard.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr-GB">
      <body>{children}</body>
    </html>
  )
}
