// V1.4 intentionally does not cache the app shell. This file only retires older cache-first service workers.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('beauty-cabinet-')).map(k => caches.delete(k)));
    await self.registration.unregister();
    const clientsList = await self.clients.matchAll({type:'window'});
    for (const c of clientsList) c.navigate(c.url);
  })());
});
