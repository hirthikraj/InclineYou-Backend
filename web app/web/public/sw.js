/* The client portal's service worker: it only shows a push the browser vendor delivers and opens the portal when it is tapped. It caches nothing
   and intercepts no request — the web is online-only. A push carries a title, a short body and a path inside the portal. */
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const title = data.title || 'InclineYou';
  event.waitUntil(self.registration.showNotification(title, { body: data.body || '', data: { url: typeof data.url === 'string' && data.url.startsWith('/me') ? data.url : '/me/today' } }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/me/today';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((all) => {
    for (const c of all) if ('focus' in c) { c.navigate(url); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
