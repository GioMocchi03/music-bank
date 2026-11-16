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

// La cache è un aiuto, non un requisito: se è piena o non disponibile, la rete deve funzionare lo stesso.
async function cached(key) {
  try {
    return await (await caches.open(CACHE)).match(key);
  } catch {
    return undefined;
  }
}

function store(key, response) {
  if (!response.ok) return;
  const copy = response.clone();
  caches.open(CACHE).then((cache) => cache.put(key, copy)).catch(() => {});
}

async function networkFirst(request, fallback) {
  const key = fallback ?? request;
  let response;
  try {
    response = await fetch(request);
  } catch (error) {
    const hit = await cached(key);
    if (hit) return hit;
    throw error;
  }
  store(key, response);
  return response;
}

async function cacheFirst(request) {
  const hit = await cached(request);
  if (hit) return hit;
  const response = await fetch(request);
  store(request, response);
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
