// Service Worker：有網路時抓最新版，沒網路時用快取（旅途中也能練習）。
// 修改 App 檔案後，把 VERSION 加一，舊快取會被清掉。
const VERSION = 'v2';
const CACHE = `nihongo-${VERSION}`;
const SHELL = [
  './',
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/data.js',
  'js/furigana.js',
  'js/quiz.js',
  'js/speech.js',
  'js/srs.js',
  'js/state.js',
  'js/stats.js',
  'js/store.js',
  'js/sync.js',
  'data/decks.json',
  'data/n5.json',
  'data/teacher.json',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('nihongo-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // Apps Script 等外部請求不經過快取

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await Promise.race([
        fetch(req),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
      ]);
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
      return Response.error();
    }
  })());
});
