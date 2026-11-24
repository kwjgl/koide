/*
 * 홈 화면 앱(PWA)용 작은 도우미. 앱 화면 파일을 휴대폰에 한 벌 남겨 두었다가, 인터넷이 끊기거나 느릴 때 그걸로 연다.
 * 늘 인터넷의 새 파일을 먼저 받아서(받으면 남겨 둔 것도 바꿈) 고친 화면이 바로 보인다. 브라우저에 남은 사본은 쓰지 않고 서버에 확인한다.
 * 이달의 그림(img/ 아래 그림 파일)은 따로 남겨 둔다: 있으면 바로 보여 주고 뒤에서 새로 받아 바꾼다. 화면 파일이 새 버전으로 넘어가도 그림은 지우지 않는다.
 * 기도제목은 여기 남기지 않는다: 서버(Apps Script)와 주고받는 요청과 다른 주소의 파일은 건드리지 않는다. 영상(mp4 등)도 건드리지 않는다.
 */
const CACHE = 'koide-v264';
const IMG = 'koide-img', IMG_MAX = 300; // 그림 사본 이름은 버전을 붙이지 않는다. 300장이 넘으면 오래된 것부터 지운다
const SHELL = ['./', 'index.html', 'note.html', 'koinonia.html', 'koinonia.js', 'koinonia-api.js', 'church-api.js', 'usage-fields.js', 'koinonia.css', 'sb.js', 'account-delete.js', 'config.js', 'pray-data.js', 'pray-open.js', 'pray-dim.js', 'guide.js', 'info-tip.js', 'font-warm.js', 'family-flow.js', 'family-push.js', 'family-vault.js', 'ask.js', 'art-data.js', 'intro-video.js', 'beatitudes.js', 'sunrain.js', 'words-ko.js', 'splash.js', 'places.js', 'survey.js', 'pilot.js', 'intro-video.css', 'pray-open.css', 'pray-dim.css', 'beatitudes.css', 'sunrain.css', 'guide.css', 'family-tokens.css', 'family-ui.css', 'design-styles.css', 'church-survey.css', 'church-survey.js', 'church-survey-qr.js', 'manifest.webmanifest', 'icons/favicon.svg', 'icons/icon-192.png', 'icons/apple-touch-icon.png', 'pilgrim/hero.png', 'pilgrim/tiles.png', 'pilgrim/objects.png', 'pilgrim/wild-tiles.png', 'pilgrim/wild-objects.png', 'pilgrim/land-tiles.png', 'pilgrim/land-objects.png', 'pilgrim/david-tiles.png', 'pilgrim/david-objects.png', 'pilgrim/sprites.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== IMG).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// 그림: 사본이 있으면 바로 쓰고, 뒤에서 새로 받아 바꿔 둔다. 사본이 없으면 인터넷에서 받고, 실패하면 실패 그대로(화면 파일로 대신하지 않는다)
const artFirst = e => caches.open(IMG).then(c => c.match(e.request, { ignoreSearch: true }).then(hit => {
  const fresh = fetch(new Request(e.request.url, { cache: 'no-cache', credentials: 'same-origin' })).then(res => {
    if (res.ok) return c.put(e.request, res.clone()).then(() => c.keys()).then(ks => Promise.all(ks.slice(0, Math.max(0, ks.length - IMG_MAX)).map(k => c.delete(k)))).then(() => res);
    return res;
  });
  if (hit) { e.waitUntil(fresh.catch(() => {})); return hit; }
  return fresh.catch(() => Response.error());
}));
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  // 같은 주소의 파일만. 카카오에서 돌아오는 주소(?code=)는 늘 새로 연다
  if (req.method !== 'GET' || url.origin !== location.origin || url.searchParams.has('code')) return;
  // 영상은 건드리지 않는다: 새 요청으로 바꾸면 Range 헤더가 사라져 사파리가 재생하지 못하고, 부분 응답(206)은 caches.put도 안 된다. 브라우저가 직접 받게 둔다
  if (/\.(mp4|webm|mov)$/i.test(url.pathname) || req.headers.has('range')) return;
  // 그림은 앱 폴더 밖(../prototype/img/)에 있을 수도 있어서 폴더와 상관없이 img/ 아래 그림 파일이면 여기서 다룬다
  if (/\/img\/.+\.(webp|png|jpe?g)$/i.test(url.pathname)) return e.respondWith(artFirst(e));
  if (!url.pathname.startsWith(new URL('./', location).pathname)) return;
  // GitHub Pages가 파일을 10분 동안 그대로 쓰라고 해도, 서버에 바뀌었는지 늘 물어본다(바뀌지 않았으면 확인만 하고 끝난다).
  //  화면 주소 요청(navigate)에는 옵션을 붙일 수 없어서 주소로 새 요청을 만든다
  e.respondWith(fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' })).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  // 실패하면 남겨 둔 사본. 사본이 없을 때 화면 주소만 첫 화면으로 대신하고, 나머지는 실패 그대로 돌려준다
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || (req.mode === 'navigate' ? caches.match('./') : Response.error()))));
});

// 알림(웹 푸시): 서버(supabase/functions/push-send)가 정한 시각에 보낸다. 글은 종류별 고정 문장이라 이름·내용이 없다. 누르면 해당 화면을 연다(family-push.js)
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (err) { d = {}; }
  e.waitUntil(self.registration.showNotification(d.t || '코이데', { body: d.b || '', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: d.k || 'koide', data: { u: d.u || './' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const to = new URL((e.notification.data && e.notification.data.u) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const c = list.find(w => w.url.startsWith(self.registration.scope));
    if (c) return c.focus().then(w => (w && w.navigate ? w.navigate(to) : self.clients.openWindow(to))).catch(() => self.clients.openWindow(to));
    return self.clients.openWindow(to);
  }));
});
