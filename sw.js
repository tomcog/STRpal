const CACHE_NAME = 'strpal-v17';
const ASSETS = [
  '/',
  '/index.html',
  '/css/app.css',
  '/js/supabase-client.js',
  '/js/notifications.js',
  '/js/photo-picker.js',
  '/js/options-list.js',
  '/js/stock-status.js',
  '/js/router.js',
  '/js/app.js',
  '/js/views/feed.js',
  '/js/views/task-detail.js',
  '/js/views/report.js',
  '/js/views/calendar.js',
  '/js/views/inventory.js',
  '/js/views/admin.js',
  '/js/views/sms.js',
  '/js/views/profile.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
