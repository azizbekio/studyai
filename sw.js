/* sw.js — StudyAI offline qobiq (v8)
   MUHIM O'ZGARISH: studyai-extra.js va boshqa JS fayllar endi
   "avval tarmoq" (network-first) rejimida yuklanadi.
   Sabab: eski versiyada JS "avval kesh" edi — shuning uchun
   siz yangi funksiyalarni (username, xabarlar, klub qidiruvi…)
   deploy qilsangiz ham, telefoningizda ESKI fayl ochilaverardi. */

const CACHE = 'studyai-v8';
const SHELL = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png', '/studyai-extra.js'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      Promise.allSettled(SHELL.map(url => c.add(url).catch(() => {})))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Sahifadan "darhol yangilan" buyrug'i
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

function networkFirst(request, fallbackUrl) {
  return fetch(request).then(r => {
    if (r && r.ok) {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(fallbackUrl || request, copy));
    }
    return r;
  }).catch(() => caches.match(fallbackUrl || request).then(c => c || caches.match('/index.html')));
}

self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);

  if (request.method !== 'GET' ||
      url.pathname.startsWith('/api/') ||
      url.protocol === 'chrome-extension:') {
    return;
  }

  // 1) Sahifa navigatsiyasi — avval tarmoq
  if (request.mode === 'navigate') {
    e.respondWith(networkFirst(request, '/index.html'));
    return;
  }

  // 2) O'z JS fayllarimiz — avval tarmoq (yangilanish darhol yetib boradi)
  if (url.origin === location.origin && /\.(js|json)$/.test(url.pathname)) {
    e.respondWith(networkFirst(request));
    return;
  }

  // 3) Qolgan statik fayllar (rasm, shrift, CDN) — avval kesh
  e.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        const ok = url.origin === location.origin ||
          url.hostname.includes('cdnjs') || url.hostname.includes('fonts.g');
        if (response.ok && ok) {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(request, clone));
        }
        return response;
      }).catch(() => caches.match('/index.html'));
    })
  );
});
