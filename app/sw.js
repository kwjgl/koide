/*
 * 홈 화면 앱(PWA)용 작은 도우미. 앱 화면 파일을 휴대폰에 한 벌 남겨 두었다가, 인터넷이 끊기거나 느릴 때 그걸로 연다.
 * 늘 인터넷의 새 파일을 먼저 받아서(받으면 남겨 둔 것도 바꿈) 고친 화면이 바로 보인다.
 * 기도제목은 여기 남기지 않는다: 서버(Apps Script)와 주고받는 요청과 다른 주소의 파일은 건드리지 않는다.
 */
const CACHE = 'koide-v1';
const SHELL = ['./', 'index.html', 'config.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  // 이 앱 폴더 안의 파일만. 카카오에서 돌아오는 주소(?code=)는 늘 새로 연다
  if (req.method !== 'GET' || url.origin !== location.origin || !url.pathname.startsWith(new URL('./', location).pathname) || url.searchParams.has('code')) return;
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('./'))));
});
