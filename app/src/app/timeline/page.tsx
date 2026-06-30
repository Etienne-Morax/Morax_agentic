/**
 * Timeline de restitution (chemin de lecture).
 * Contrainte dure : ZERO appel IA en lecture. Lit Supabase seul (via RLS).
 * Scaffold MVP : la requete reelle (session Auth + RLS) est branchee en Phase 4.
 */

export const dynamic = 'force-dynamic'

interface TimelineItem {
  id: string
  title: string
  status: 'pending' | 'done'
}

// Phase 4 : remplacer par une lecture Supabase scoping tenant via la session Auth.
async function loadTimeline(): Promise<TimelineItem[]> {
  return []
}

export default async function TimelinePage() {
  const items = await loadTimeline()
  return (
    <main>
      <h1>Timeline</h1>
      {items.length === 0 ? (
        <p>Rien pour le moment. Envoyez une facture sur Telegram.</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.id} data-status={item.status}>
              {item.title}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
