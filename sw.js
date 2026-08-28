// StudyAI Service Worker - faqat GET so'rovlarni cache qiladi
const CACHE = 'studyai-v3';
const ASSETS = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png'];

// O'rnatish - asosiy fayllarni cache qilish
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => {
      return Promise.allSettled(ASSETS.map(url => 
        c.add(url).catch(() => {}) // Xato bo'lsa o'tkazib yuborish
      ));
    })
  );
  self.skipWaiting();
});

// Faollashtirish - eski cache larni o'chirish
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// So'rovlarni ushlash
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  
  // API so'rovlari va POST - HECH QACHON cache qilmaslik
  if(e.request.method !== 'GET' || 
     url.pathname.startsWith('/api/') ||
     url.protocol === 'chrome-extension:') {
    return; // Oddiy network so'rov sifatida o'tkazish
  }
  
  // Faqat GET so'rovlarni cache qilish
  e.respondWith(
    caches.match(e.request).then(cached => {
      return cached || fetch(e.request).then(response => {
        // Faqat muvaffaqiyatli javoblarni saqlash
        if(response.ok) {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return response;
      }).catch(() => caches.match('/index.html'));
    })
  );
});
