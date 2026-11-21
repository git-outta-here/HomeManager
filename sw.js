// Network-first with a cache fallback, so the app still opens offline.
const CACHE = 'homemanager-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone()
        caches.open(CACHE).then((c) => c.put(req, copy))
        return res
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match(self.registration.scope))),
  )
})

// Reminders: the server sends { title, body } and the phone shows it even when the app is closed.
self.addEventListener('push', (e) => {
  let data = {}
  try {
    data = e.data.json()
  } catch {
    /* no payload */
  }
  e.waitUntil(
    self.registration.showNotification(data.title || 'HomeManager', {
      body: data.body || '',
      icon: new URL('icon-512.png', self.registration.scope).href,
      tag: 'homemanager-reminder',
    }),
  )
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  e.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((open) => (open.length ? open[0].focus() : self.clients.openWindow(self.registration.scope))),
  )
})
