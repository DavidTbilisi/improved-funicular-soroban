// ============================================================================
// The service worker — what makes this a trainer you can use on a train.
//
// The app is a static checkout of ~110 files with no build step, so there is no
// bundle to cache and no hashed filenames to invalidate against. Two decisions
// follow from that, and they are the whole design:
//
//   • THE PRECACHE LIST IS FETCHED, NOT HARD-CODED. offline-manifest.json is
//     generated from the real import graph (scripts/offline-manifest.mjs) and
//     checked by the unit suite, so a page added without regenerating fails
//     `npm test` rather than failing silently on someone's commute.
//
//   • EVERY RESPONSE IS STALE-WHILE-REVALIDATE. With no content hashes there is
//     no safe way to know a cached file is current, so the cache always answers
//     first and the network refreshes it behind the answer. The cost is being
//     at most ONE LOAD behind after a deploy; the benefit is that the app opens
//     instantly and works with no network at all, which for a drill you do
//     daily is the right trade. Progress lives in localStorage, which the cache
//     never touches, so a stale shell can never cost you a day's practice.
//
// Everything is registered and cached RELATIVE to this file's own scope: the
// app is served from the domain root locally and from /improved-funicular-
// soroban/ on GitHub Pages, and an absolute '/styles.css' would silently cache
// the wrong path on one of them.
// ============================================================================

const CACHE = 'npv-shell-v1';
const MANIFEST = 'offline-manifest.json';

// --- install: take the whole shell ------------------------------------------
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    let assets = [];
    try {
      const res = await fetch(MANIFEST, { cache: 'no-cache' });
      if (res.ok) assets = (await res.json()).assets || [];
    } catch { /* offline during install: the fetch handler will fill the cache */ }

    // Deliberately NOT cache.addAll: that rejects the entire install if a
    // single file 404s, which would leave a learner with no offline app at all
    // because one figure went missing. Each file stands on its own.
    await Promise.allSettled(assets.map(async path => {
      const res = await fetch(path, { cache: 'no-cache' });
      if (res && res.ok) await cache.put(path, res.clone());
    }));

    // The manifest itself, so a later install can read it offline.
    try {
      const res = await fetch(MANIFEST, { cache: 'no-cache' });
      if (res.ok) await cache.put(MANIFEST, res.clone());
    } catch { /* ignore */ }

    await self.skipWaiting();
  })());
});

// --- activate: drop every older shell ----------------------------------------
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n !== CACHE).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

// --- fetch: cache first, refresh behind --------------------------------------
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(staleWhileRevalidate(event, req, url));
});

async function staleWhileRevalidate(event, req, url) {
  const cache = await caches.open(CACHE);
  // A deep link (practice.html?level=big-sub) is the same document as the page
  // it links to, so query strings are ignored when matching. A directory URL is
  // its index.html, which is what the precache list actually holds.
  const key = url.pathname.endsWith('/') ? new Request(new URL('index.html', url).href) : req;
  const cached = await cache.match(key, { ignoreSearch: true });

  const network = fetch(req).then(res => {
    if (res && res.ok && res.type === 'basic') cache.put(key, res.clone()).catch(() => {});
    return res;
  }).catch(() => null);

  if (cached) {
    event.waitUntil(network);   // refresh behind the answer, without blocking it
    return cached;
  }
  const res = await network;
  if (res) return res;

  // Offline and never cached. A navigation gets the front door rather than the
  // browser's error page — every page of the app is reachable from it.
  if (req.mode === 'navigate') {
    const home = await cache.match('index.html', { ignoreSearch: true });
    if (home) return home;
  }
  return Response.error();
}
