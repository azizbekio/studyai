// sw.js — StudyAI offline qobiq (v6, birlashtirilgan)
const CACHE = 'studyai-v7';
const SHELL = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png', '/studyai-extra.js'];

// O'rnatish — bitta fayl yuklanmasa ham, qolganlari saqlanadi
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      Promise.allSettled(SHELL.map(url => c.add(url).catch(() => {})))
    ).then(() => self.skipWaiting())
  );
});

// Faollashtirish — eski versiyadagi keshlarni tozalash
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);

  // POST, API so'rovlar va brauzer kengaytmalari — hech qachon keshlanmaydi
  if (request.method !== 'GET' ||
      url.pathname.startsWith('/api/') ||
      url.protocol === 'chrome-extension:') {
    return;
  }

  // Sahifa navigatsiyasi (index.html): avval tarmoq — har doim eng yangi versiya.
  // Internet uzilsa, keshdagi oxirgi nusxa ko'rsatiladi.
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

  // Qolgan statik fayllar (CSS, JS, shriftlar, rasmlar): avval kesh — tezroq yuklanadi.
  e.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        const sameOrThirdParty = url.origin === location.origin ||
          url.hostname.includes('cdnjs') || url.hostname.includes('fonts.g');
        if (response.ok && sameOrThirdParty) {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(request, clone));
        }
        return response;
      }).catch(() => caches.match('/index.html'));
    })
  );
});
