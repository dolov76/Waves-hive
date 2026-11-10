const CACHE = 'hive-app-v5';
const SHELL = ['./', './index.html', './hive-post.html', './secure.js', './diag.js', './manifest.json', './manifest-post.json', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './logo.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url), own = u.origin === location.origin;
  if (r.method !== 'GET') return;
  if (!own && u.hostname !== 'cdn.jsdelivr.net') return; // запити до вузлів Hive й картинок ідуть напряму
  // свої сторінки, скрипти й маніфести: спершу мережа (з перевіркою оновлення), кеш лише коли немає інтернету
  if (own && (r.mode === 'navigate' || /\.(html|js|json)$/.test(u.pathname) || u.pathname.endsWith('/'))) {
    e.respondWith(fetch(r.url, { cache: 'no-cache' }).then(res => {
      if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(r, cp)); }
      return res;
    }).catch(() => caches.match(r)));
    return;
  }
  // іконки й бібліотеки: з кешу, оновлення у фоні
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(r);
    const net = fetch(r).then(res => { if (res && res.ok) c.put(r, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
