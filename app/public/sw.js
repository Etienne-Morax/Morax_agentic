// Morax - service worker push (Chantier C). Portee minimale : reception push
// + tap pour ouvrir/focaliser l'app. Aucun cache/offline ici (hors scope).

self.addEventListener('push', (event) => {
  let data = { title: 'Morax', body: '', url: '/launchpad' }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch {
    // Payload non-JSON : garde les valeurs par defaut.
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data && event.notification.data.url ? event.notification.data.url : '/launchpad'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
    }),
  )
})
