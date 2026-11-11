const CACHE = 'hive-app-v6';
const SHELL = ['./', './index.html', './hive-post.html', './secure.js', './diag.js', './editor.js', './manifest.json', './manifest-post.json', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './logo.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url), own = u.origin === location.origin;
  if (r.method === 'POST' && own && u.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      try {
        const fd = await r.formData(), files = fd.getAll('media').filter(f => f && f.size);
        await caches.delete('share-tmp'); const c = await caches.open('share-tmp');
        await Promise.all(files.map((f, i) => c.put('f' + i, new Response(f, { headers: { 'Content-Type': f.type || 'image/jpeg', 'X-Name': encodeURIComponent(f.name || 'photo.jpg') } }))));
        await c.put('meta', new Response(JSON.stringify({ n: files.length, title: fd.get('title') || '', text: fd.get('text') || '', url: fd.get('url') || '' })));
      } catch (err) {}
      return Response.redirect(new URL('./hive-post.html?share=1', self.registration.scope).href, 303);
    })());
    return;
  }
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
