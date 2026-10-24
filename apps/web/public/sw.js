/*
 * Cabinet Analysis Pro — offline cache.
 *
 * Strategy: runtime cache-first for same-origin GETs, with a network update in
 * the background (stale-while-revalidate). The application never performs a
 * network request for calculation, storage or export; the only network use is
 * loading the app assets themselves the first time.
 */
const CACHE = 'cap-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(['./', './index.html']).catch(() => undefined)),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => undefined);

      if (cached) return cached;

      const res = await network;
      if (res) return res;

      // Offline fallback for navigations.
      if (req.mode === 'navigate') {
        const shell = await cache.match('./index.html', { ignoreSearch: true });
        if (shell) return shell;
      }
      return new Response('offline', { status: 503, statusText: 'offline' });
    }),
  );
});
