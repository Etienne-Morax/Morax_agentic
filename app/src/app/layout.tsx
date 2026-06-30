import type { ReactNode } from 'react'

export const metadata = {
  title: 'Morax',
  description: 'Assistant agentic d administration. Zero retard.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  )
}
