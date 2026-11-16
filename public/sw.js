// Service worker della webapp: tiene in cache solo l'interfaccia, mai i dati o l'audio del server.
const CACHE = 'music-bank-shell-v1';
const SHELL = ['/', '/manifest.json', '/icons/icon-180.png', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function isShellRequest(request, url) {
  if (request.method !== 'GET' || url.origin !== self.location.origin) return false;
  if (request.headers.has('range')) return false;
  return !url.pathname.startsWith('/rest/') && !url.pathname.startsWith('/share/');
}

async function networkFirst(request, fallback) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(fallback ?? request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(fallback ?? request);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (!isShellRequest(request, url)) return;
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, '/'));
  } else if (url.pathname.startsWith('/_expo/static/')) {
    // I file in /_expo/static hanno l'hash nel nome: una volta scaricati non cambiano.
    event.respondWith(cacheFirst(request));
  } else {
    event.respondWith(networkFirst(request));
  }
});
