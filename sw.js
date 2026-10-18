// 网络优先：在线时总取最新版本（绕过 HTTP 缓存），离线时用缓存
const CACHE = 'zuoyou-v1.3.0';
const ASSETS = ['./','index.html','style.css','app.js','notes.js','manifest.json','version.json','data/events.json','data/people.json','data/periods.json','data/rulers.json','data/images.json','icons/icon-192.png'];
// 图片按需缓存（首次查看后离线可用）
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))); });
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req, {cache:'no-cache'});
      if (res.ok) { const c = await caches.open(CACHE); c.put(req, res.clone()); }
      return res;
    } catch (err) {
      return (await caches.match(req, {ignoreSearch:true})) || (req.mode === 'navigate' ? caches.match('index.html') : Response.error());
    }
  })());
});
