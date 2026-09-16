// sw.js — StudyAI offline qobiq (v5)
const CACHE = 'studyai-v5';
const SHELL = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // API — hech qachon keshlanmaydi
  if (url.pathname.startsWith('/api/')) return;

  // Sahifa so'rovlari: avval tarmoq, uzilsa kesh
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request).then(r => {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put('/index.html', copy));
        return r;
      }).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Qolgani: avval kesh, keyin tarmoq
  e.respondWith(
    caches.match(request).then(hit => {
      if (hit) return hit;
      return fetch(request).then(r => {
        if (r.ok && (url.origin === location.origin || url.hostname.includes('cdnjs') || url.hostname.includes('fonts.g'))) {
          const copy = r.clone();
          caches.open(CACHE).then(c => c.put(request, copy));
        }
        return r;
      }).catch(() => caches.match('/index.html'));
    })
  );
});
