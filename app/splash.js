// 시작 화면(공동체 index.html과 기도 노트 note.html이 함께 쓴다). <body> 맨 앞에서 불러, 화면이 그려지기 전에 고른다.
//  ① 앱을 새로 켰을 때(이번 창에서 처음): 코이데 시작 화면(매듭이 지어지고 "코이데", 맨 아래에 작게 만든 곳 코이노비아 로고). 마지막에 기도 노트나 코이데 공동체를 쓰다 껐으면 그곳으로 바로 간다
//  ② 공동체 ↔ 기도 노트를 오갈 때: 가는 곳의 전환 화면(기도 노트 / 공동체). 짧게 보여 준다
//  ③ 같은 곳을 다시 열 때(새로고침, 카카오 로그인을 다녀옴 등): 시작 화면 없이
//  ④ 자율 모임으로 들어갈 때(기도 노트의 '내 모임', 함께하는 곳 메뉴): 모임 전환 화면(수틀에 실이 걸림 · 모임 이름). 모임 자료가 올 때까지 계속 보인다
//  ⑤ 관리 화면(교회 전체 · 부서 관리)으로 들어갈 때: 관리 전환 화면(끈 위의 매듭 셋 · 화면 이름 · 불러오는 중이에요). 자료가 올 때까지 계속 보인다
//  마지막에 쓴 곳은 기기에(localStorage), 이번 창에서 보던 곳은 창에만(sessionStorage) 둔다. 기도제목은 담지 않는다
(() => {
  const me = document.currentScript, q = new URLSearchParams(location.search), demo = q.has('demo');
  // 장면 모드(데모 주소에 ?as=사람 또는 ?at=화면): 화면 지도처럼 한 브라우저에 앱 창을 여러 개 띄워도 서로 로그인·기억을 덮어쓰지 않게,
  //  이 창의 localStorage를 메모리 판으로 바꾼다(창을 닫으면 사라짐). 데모 데이터(koide-demo-db)만 기기에서 읽어 오고 쓰지는 않는다.
  //  시작 화면도 없다. 실제 앱(서버 주소가 있고 ?demo가 없음)에서는 쓰지 않는다
  const CFG = window.KOIDE_CONFIG || {};
  // 따라 하기 페이지(공동체·기도 노트의 ?tutorial)도 같은 메모리 판을 쓴다: 연습한 것이 진짜 노트와 로그인에 닿지 않게. 장면 표시(KOIDE_SCENE)는 달지 않는다.
  //  공동체의 연습 페이지는 데모 데이터를 늘 새로 만든다(예전에 ?demo를 쓴 기기의 데이터를 읽어 오지 않는다)
  const tutorial = q.has('tutorial');
  if (((q.has('as') || q.has('at')) && (!CFG.API_URL || demo)) || tutorial) {
    const mem = new Map(), real = (() => { try { return window.localStorage; } catch (e) { return null; } })();
    const store = {
      getItem: k => mem.has(k) ? mem.get(k) : k === 'koide-demo-db' && real && !tutorial ? real.getItem(k) : null,
      setItem: (k, v) => { mem.set(String(k), String(v)); },
      removeItem: k => { mem.set(String(k), null); },
      clear: () => mem.clear(), key: () => null, get length() { return mem.size; }
    };
    try { Object.defineProperty(window, 'localStorage', { value: store, configurable: true }); } catch (e) { /* 막히면 기기 저장소를 그대로 */ }
    if (!tutorial) window.KOIDE_SCENE = { as: q.get('as') || '', at: q.get('at') || '', fresh: q.has('fresh') };
    window.koideSpace = { going() {}, used() {} };
    window.koideSplash = { mode: 'quiet', hide() { document.documentElement.classList.remove('booting'); } };
    document.documentElement.classList.remove('booting');
    return;
  }
  const SPACE_KEY = demo ? 'koide-demo-space' : 'koide-space', LAST_CIRCLE = demo ? 'koide-demo-last-circle' : 'koide-last-circle', LAST = 'koide-last-space', TOKEN = demo ? 'koide-demo-token' : 'koide-token';
  const get = (st, k) => { try { return st.getItem(k); } catch (e) { return null; } };
  const set = (st, k, v) => { try { st.setItem(k, v); } catch (e) { /* 이번만 */ } };
  // 이 화면이 어느 곳인지: 공동체 화면이라도 기도 노트의 '내 모임'에서 연 모임(?grp=)은 기도 노트 쪽이다
  // 교회 화면을 공동체 주소(?c=)로 열면 코이데 공동체다
  const page = me.dataset.space, space = page === 'community' && q.has('c') ? 'koinonia' : page === 'community' && q.has('grp') ? 'note' : page;
  const prev = get(sessionStorage, LAST);
  // ① 새로 켰는데 마지막에 기도 노트를 쓰다 껐으면(교회 로그인이나 노트 로그인이 돼 있고, 초대 링크 같은 특별한 주소가 아닐 때) 기도 노트로
  const special = ['code', 'gjoin', 'grp', 'join', 'connect', 'opsjoin', 'door', 'c'].some(k => q.has(k));
  if (!prev && page === 'community' && !special && get(localStorage, SPACE_KEY) === 'note' && (get(localStorage, TOKEN) || get(localStorage, 'koide-note-sbh')) && !get(localStorage, 'koide-share')) {
    location.replace('note.html' + (demo ? '?demo' : '')); return;
  }
  // 공동체는 여러 곳일 수 있어 마지막으로 연 공동체 ID도 함께 기억한다.
  // 로그인 상태와 ID가 유효할 때만 자동으로 돌아가고, ?c= 직접 연 링크는 건드리지 않는다.
  const lastCircle = get(localStorage, LAST_CIRCLE);
  if (!prev && page === 'community' && !special && get(localStorage, SPACE_KEY) === 'koinonia'
      && lastCircle && /^[\w-]{1,64}$/.test(lastCircle)
      && (demo || get(localStorage, 'koide-note-sb'))) {
    location.replace('index.html' + (demo ? '?demo&c=' : '?c=') + encodeURIComponent(lastCircle)); return;
  }
  // 기도 노트에서 모임 화면(?grp=)을 열면 모임 전환 화면. 모임 이름(gn)과 남은 날(gl)을 알고 넘어왔으면 바로 보여 준다
  const mode = !prev ? 'main' : page === 'community' && q.has('grp') ? 'group' : prev !== space ? 'switch' : 'quiet';
  set(sessionStorage, LAST, space);
  window.koideSpace = {
    // 다른 곳으로 바로 넘길 때(예: 혼자 시작한 사람을 기도 노트로) 전환 화면이 두 번 나오지 않게 미리 적어 둔다
    going: s => set(sessionStorage, LAST, s),
    // 마지막에 쓴 곳: 화면이 실제로 그 곳을 보여 줄 때 적는다
    used: (s, id) => { set(localStorage, SPACE_KEY, s); if (s === 'koinonia' && id && /^[\w-]{1,64}$/.test(id)) set(localStorage, LAST_CIRCLE, id); }
  };
  const css = `.splash { position: fixed; inset: 0; z-index: 60; background: var(--page); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .5em; padding: 24px; text-align: center; transition: opacity .25s ease-out; }
.splash.out { opacity: 0; pointer-events: none; }
.splash-mark { width: 88px; height: 88px; border-radius: 50%; background: var(--accent); color: var(--on-accent); display: grid; place-items: center; margin-bottom: .4em; }
.splash-mark svg { width: 54px; height: 54px; overflow: visible; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.splash-mark path { stroke-dasharray: 1; animation: splash-tie .45s cubic-bezier(.4, 0, .2, 1) .1s both; }
.splash-mark path + path { animation-duration: .3s; animation-delay: .5s; }
@keyframes splash-tie { 0% { stroke-dashoffset: 1; opacity: 0; } 1% { opacity: 1; } 100% { stroke-dashoffset: 0; opacity: 1; } }
.splash-name { margin: 0; font-family: var(--f-display); font-size: 1.6em; font-weight: 700; color: var(--ink); }
.splash-sub { margin: 0; color: var(--ink-2); font-size: .9em; }
/* 시작 화면 맨 아래: 만든 곳 코이노비아 로고(매듭 + KOINOBIA). 보조 글자색 한 가지로 작게, 앱 이름보다 늦게 나타난다. 전환 화면에는 두지 않는다 */
.splash-by { position: absolute; left: 0; right: 0; bottom: calc(40px + env(safe-area-inset-bottom, 0px)); display: flex; align-items: center; justify-content: center; gap: 7px; color: var(--ink-2); animation: sw-in .45s cubic-bezier(.2, .7, .3, 1) .35s both; }
.splash-by svg { display: block; } .splash-by .by-knot { width: 18px; height: 18px; } .splash-by .wm { height: 11px; width: auto; }
@media (max-height: 420px) { .splash-by { display: none; } }
.splash .loading { padding: 0; min-height: 1.5em; font-size: .85em; max-width: 22em; word-break: keep-all; color: var(--ink-2); }
/* 전환 화면: 기도 노트는 종이 한 장에 매듭 하나(나 혼자), 공동체는 끈 위의 매듭 셋(함께) */
.sw-in { animation: sw-in .45s cubic-bezier(.2, .7, .3, 1) both; }
.sw-in.d1 { animation-delay: .12s; } .sw-in.d2 { animation-delay: .22s; }
@keyframes sw-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.sw-note { width: 76px; height: 92px; border-radius: 12px; border: 2px solid var(--line-strong); background: var(--surface); display: grid; place-items: center; margin-bottom: .4em; position: relative; }
.sw-note::before, .sw-note::after { content: ''; position: absolute; left: 14px; right: 14px; height: 6px; border-radius: 3px; background: var(--surface-2); }
.sw-note::before { bottom: 22px; } .sw-note::after { bottom: 12px; right: 30px; }
.sw-note svg, .sw-cord svg { overflow: visible; fill: none; stroke: var(--accent); stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
.sw-note svg { width: 40px; height: 30px; margin-bottom: 16px; }
.sw-cord { width: 240px; height: 64px; margin-bottom: .4em; }
.sw-cord svg { width: 100%; height: 100%; }
.sw-cord .c { stroke: var(--accent-mid); stroke-dasharray: 1; animation: splash-tie .5s ease-out both; }
.sw-cord .k { stroke-dasharray: 1; animation: splash-tie .35s ease-out both; }
/* 모임 전환 화면: 그물 수틀 위에 실이 두 가닥 걸리고 만나는 곳에 매듭이 짓는다(2D라서 three.js를 기다리지 않는다) */
.sw-hoop { width: 156px; height: 156px; margin-bottom: .4em; }
.sw-hoop svg { width: 100%; height: 100%; overflow: visible; fill: none; stroke-linecap: round; stroke-linejoin: round; }
.sw-hoop .ring { stroke: var(--line-strong); stroke-width: 5; fill: var(--surface); }
.sw-hoop .net { stroke: var(--line); stroke-width: 1.2; }
.sw-hoop .t { stroke: var(--accent); stroke-width: 2.4; stroke-dasharray: 1; animation: splash-tie .7s cubic-bezier(.4, 0, .2, 1) .15s both; }
.sw-hoop .t + .t { stroke: var(--accent-mid); animation-delay: .4s; }
.sw-hoop .kn { fill: var(--accent); stroke: none; transform-box: fill-box; transform-origin: center; animation: sw-pop .3s ease-out both; }
.sw-hoop .kn.k2 { animation-delay: 1.15s; }
@keyframes sw-pop { from { opacity: 0; transform: scale(.3); } to { opacity: 1; transform: none; } }
/* 관리 전환 화면: 불러오는 동안 매듭이 지어지고(길이 1→0), 가만히 있다가, 계속 같은 쪽으로 풀려 사라진 뒤 다시 지어진다 */
.sw-cord.loop .k { animation: sw-loop 2.4s ease-in-out infinite both; }
@keyframes sw-loop { 0% { stroke-dashoffset: 1; opacity: 0; } 1% { opacity: 1; } 30% { stroke-dashoffset: 0; opacity: 1; } 70% { stroke-dashoffset: 0; opacity: 1; } 96% { stroke-dashoffset: -1; opacity: 0; } 100% { stroke-dashoffset: -1; opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .splash { transition: none; } .splash-mark path, .sw-in, .splash-by, .sw-cord .c, .sw-cord .k, .sw-cord.loop .k, .sw-hoop .t, .sw-hoop .kn { animation: none; } }`;
  // 코이노비아 로고(대문 koinobia 저장소의 tabs.js LOGO·WORDMARK를 옮겨 옴. 로고가 바뀌면 같이 바꾼다)
  const BY = '<div class="splash-by"><svg class="by-knot" viewBox="0 0 100 100" aria-hidden="true"><g fill="none" stroke-width="9.5" stroke-linecap="round" stroke-linejoin="round"><path stroke="currentColor" stroke-opacity="1" d="M77.0 49.7L77.6 50.1L78.2 50.5L78.7 50.9L79.3 51.3L79.8 51.8L80.4 52.2L80.9 52.6L81.4 53.1L81.9 53.5L82.4 53.9L82.8 54.4L83.3 54.9L83.7 55.3L84.2 55.8L84.6 56.3L85.0 56.8L85.4 57.2L85.8 57.7L86.2 58.2L86.5 58.7L86.9 59.2L87.2 59.7L87.5 60.2L87.8 60.7L88.1 61.2L88.4 61.8L88.7 62.3L88.9 62.8L89.2 63.3L89.4 63.8L89.6 64.3L89.8 64.9L90.0 65.4L90.1 65.9L90.3 66.4L90.4 66.9L90.5 67.4L90.6 68.0L90.7 68.5L90.8 69.0L90.9 69.5L90.9 70.0L91.0 70.5L91.0 71.0L91.0 71.5L91.0 72.0L91.0 72.5L90.9 73.0L90.9 73.5L90.8 74.0L90.8 74.5L90.7 74.9L90.6 75.4L90.4 75.9L90.3 76.3L90.2 76.8L90.0 77.2L89.8 77.7L89.6 78.1L89.4 78.5L89.2 79.0L89.0 79.4L88.8 79.8L88.5 80.2L88.3 80.6L88.0 80.9L87.7 81.3L87.4 81.7L87.1 82.0L86.8 82.4L86.4 82.7L86.1 83.1L85.7 83.4L85.4 83.7L85.0 84.0L84.6 84.3L84.2 84.6L83.8 84.8L83.3 85.1L82.9 85.4L82.5 85.6L82.0 85.8L81.6 86.0L81.1 86.3L80.6 86.5L80.1 86.6L79.6 86.8L79.1 87.0L78.6 87.1L78.1 87.3L77.6 87.4L77.0 87.5L76.5 87.6L75.9 87.7L75.4 87.7L74.8 87.8L74.3 87.9L73.7 87.9L73.1 87.9L72.5 87.9L71.9 87.9L71.3 87.9L70.7 87.9L70.1 87.8L69.5 87.8L68.9 87.7L68.3 87.6L67.7 87.6L67.1 87.4L66.4 87.3L65.8 87.2L65.2 87.0L64.6 86.9L63.9 86.7L63.3 86.5L62.7 86.3L62.0 86.1L61.4 85.9L60.8 85.7L60.1 85.4L59.5 85.1L58.9 84.9L58.3 84.6L57.6 84.3L57.0 84.0L56.4 83.6L55.7 83.3L55.1 83.0L54.5 82.6L53.9 82.2L53.3 81.8L52.7 81.4L52.1 81.0L51.5 80.6L50.9 80.2L50.3 79.7L49.7 79.3L49.1 78.8L48.5 78.3L47.9 77.8L47.4 77.3L46.8 76.8L46.3 76.3L45.7 75.8L45.2 75.2L44.6 74.7L44.1 74.1L43.6 73.5L43.1 73.0L42.6 72.4L42.1 71.8L41.6 71.2L41.1 70.6L40.6 70.0L40.2 69.3L39.7 68.7L39.3 68.1L38.8 67.4L38.4 66.7L38.0 66.1L37.6 65.4L37.2 64.7L36.8 64.1L36.4 63.4L36.0 62.7L35.7 62.0L35.3 61.3L35.0 60.6L34.6 59.9L34.3 59.2L34.0 58.4L33.7 57.7L33.4 57.0L33.2 56.3L32.9 55.5L32.6 54.8L32.5 54.3"/><path stroke="currentColor" stroke-opacity=".78" d="M30.2 37.3L30.2 36.6L30.3 35.9L30.4 35.2L30.4 34.5L30.5 33.8L30.6 33.1L30.7 32.5L30.9 31.8L31.0 31.2L31.1 30.5L31.3 29.9L31.5 29.3L31.7 28.6L31.8 28.0L32.0 27.4L32.3 26.8L32.5 26.2L32.7 25.7L33.0 25.1L33.2 24.5L33.5 24.0L33.7 23.5L34.0 22.9L34.3 22.4L34.6 21.9L34.9 21.4L35.2 20.9L35.5 20.4L35.9 20.0L36.2 19.5L36.5 19.1L36.9 18.7L37.3 18.2L37.6 17.8L38.0 17.5L38.4 17.1L38.8 16.7L39.2 16.4L39.6 16.0L40.0 15.7L40.4 15.4L40.8 15.1L41.2 14.8L41.6 14.5L42.1 14.3L42.5 14.0L42.9 13.8L43.4 13.6L43.8 13.4L44.3 13.2L44.7 13.0L45.2 12.9L45.6 12.7L46.1 12.6L46.6 12.5L47.0 12.4L47.5 12.3L48.0 12.2L48.4 12.1L48.9 12.1L49.4 12.1L49.8 12.1L50.3 12.1L50.8 12.1L51.3 12.1L51.7 12.2L52.2 12.2L52.7 12.3L53.1 12.4L53.6 12.5L54.1 12.6L54.5 12.8L55.0 12.9L55.4 13.1L55.9 13.2L56.3 13.4L56.8 13.6L57.2 13.9L57.6 14.1L58.1 14.3L58.5 14.6L58.9 14.9L59.4 15.2L59.8 15.5L60.2 15.8L60.6 16.1L61.0 16.5L61.4 16.8L61.8 17.2L62.1 17.6L62.5 18.0L62.9 18.4L63.2 18.8L63.6 19.2L63.9 19.7L64.3 20.1L64.6 20.6L64.9 21.1L65.2 21.6L65.5 22.1L65.8 22.6L66.1 23.1L66.4 23.6L66.6 24.2L66.9 24.7L67.1 25.3L67.4 25.9L67.6 26.4L67.8 27.0L68.0 27.6L68.2 28.2L68.4 28.9L68.6 29.5L68.7 30.1L68.9 30.7L69.0 31.4L69.2 32.0L69.3 32.7L69.4 33.4L69.5 34.0L69.6 34.7L69.7 35.4L69.7 36.1L69.8 36.8L69.8 37.5L69.9 38.2L69.9 38.9L69.9 39.6L69.9 40.3L69.9 41.1L69.8 41.8L69.8 42.5L69.7 43.2L69.7 44.0L69.6 44.7L69.5 45.4L69.4 46.2L69.3 46.9L69.2 47.7L69.0 48.4L68.9 49.1L68.7 49.9L68.6 50.6L68.4 51.4L68.2 52.1L68.0 52.8L67.7 53.6L67.5 54.3L67.3 55.0L67.0 55.8L66.8 56.5L66.5 57.2L66.2 58.0L65.9 58.7L65.6 59.4L65.3 60.1L64.9 60.8L64.6 61.5L64.2 62.2L63.9 62.9L63.5 63.6L63.1 64.3L62.7 65.0L62.3 65.6L61.9 66.3L61.5 67.0L61.0 67.6L60.6 68.3L60.1 68.9L59.7 69.5L59.2 70.2L58.7 70.8L58.3 71.4L57.8 72.0L57.3 72.6L56.8 73.2L56.4 73.5"/><path stroke="currentColor" stroke-opacity=".56" d="M42.8 84.1L42.2 84.4L41.5 84.7L40.9 85.0L40.3 85.2L39.6 85.5L39.0 85.7L38.4 86.0L37.7 86.2L37.1 86.4L36.5 86.6L35.9 86.8L35.2 86.9L34.6 87.1L34.0 87.2L33.3 87.4L32.7 87.5L32.1 87.6L31.5 87.7L30.9 87.8L30.3 87.8L29.7 87.9L29.1 87.9L28.5 87.9L27.9 87.9L27.3 87.9L26.7 87.9L26.1 87.9L25.6 87.8L25.0 87.8L24.4 87.7L23.9 87.6L23.3 87.6L22.8 87.5L22.3 87.3L21.7 87.2L21.2 87.1L20.7 86.9L20.2 86.8L19.7 86.6L19.2 86.4L18.8 86.2L18.3 86.0L17.8 85.8L17.4 85.5L16.9 85.3L16.5 85.0L16.1 84.8L15.7 84.5L15.3 84.2L14.9 83.9L14.5 83.6L14.2 83.3L13.8 83.0L13.5 82.6L13.1 82.3L12.8 81.9L12.5 81.6L12.2 81.2L11.9 80.8L11.6 80.4L11.4 80.0L11.1 79.6L10.9 79.2L10.7 78.8L10.5 78.4L10.3 78.0L10.1 77.5L9.9 77.1L9.8 76.6L9.6 76.2L9.5 75.7L9.4 75.3L9.3 74.8L9.2 74.3L9.1 73.8L9.1 73.3L9.0 72.9L9.0 72.4L9.0 71.9L9.0 71.4L9.0 70.9L9.0 70.4L9.1 69.8L9.1 69.3L9.2 68.8L9.3 68.3L9.4 67.8L9.5 67.3L9.6 66.8L9.8 66.2L9.9 65.7L10.1 65.2L10.3 64.7L10.5 64.2L10.7 63.6L10.9 63.1L11.2 62.6L11.4 62.1L11.7 61.6L12.0 61.1L12.3 60.6L12.6 60.1L12.9 59.6L13.2 59.0L13.6 58.6L14.0 58.1L14.3 57.6L14.7 57.1L15.1 56.6L15.5 56.1L16.0 55.6L16.4 55.2L16.9 54.7L17.3 54.2L17.8 53.8L18.3 53.3L18.8 52.9L19.3 52.5L19.8 52.0L20.3 51.6L20.9 51.2L21.4 50.8L22.0 50.4L22.6 50.0L23.2 49.6L23.8 49.2L24.4 48.9L25.0 48.5L25.6 48.1L26.2 47.8L26.9 47.5L27.5 47.1L28.2 46.8L28.9 46.5L29.5 46.2L30.2 45.9L30.9 45.6L31.6 45.4L32.3 45.1L33.0 44.8L33.7 44.6L34.5 44.4L35.2 44.2L35.9 43.9L36.7 43.7L37.4 43.6L38.1 43.4L38.9 43.2L39.7 43.1L40.4 42.9L41.2 42.8L41.9 42.7L42.7 42.5L43.5 42.4L44.3 42.3L45.0 42.3L45.8 42.2L46.6 42.1L47.4 42.1L48.2 42.1L49.0 42.0L49.7 42.0L50.5 42.0L51.3 42.1L52.1 42.1L52.9 42.1L53.7 42.2L54.4 42.2L55.2 42.3L56.0 42.4L56.8 42.5L57.5 42.6L58.3 42.7L59.1 42.8L59.8 43.0L60.6 43.1L61.1 43.2"/></g></svg><svg class="wm" viewBox="0 -26 6024 752" aria-hidden="true"><g fill="currentColor" stroke="currentColor" stroke-width="14" stroke-linejoin="round"><path d="M0 700H91V454L204 333L470 700H574L262 271L516 0H466L91 394V0H0Z"/><path d="M1778 0V700H1869V0Z"/><path d="M2823 0V535H2819L2264 -12H2259V700H2305V165H2309L2864 712H2869V0Z"/><path d="M4153 700H4404Q4471 700 4517.0 682.5Q4563 665 4591.0 637.0Q4619 609 4631.5 573.5Q4644 538 4644 502Q4644 445 4619.5 411.0Q4595 377 4561.0 359.0Q4527 341 4491.0 335.0Q4455 329 4433 328V324Q4468 324 4499.0 310.5Q4530 297 4553.5 275.5Q4577 254 4591.0 225.5Q4605 197 4605 165Q4605 137 4593.0 108.0Q4581 79 4556.5 55.0Q4532 31 4493.5 15.5Q4455 0 4403 0H4153ZM4244 656V350H4354Q4403 350 4439.0 363.0Q4475 376 4498.5 398.0Q4522 420 4533.5 449.0Q4545 478 4545 510Q4545 545 4532.5 572.0Q4520 599 4499.0 618.0Q4478 637 4449.5 646.5Q4421 656 4389 656ZM4244 306V44H4366Q4405 44 4432.5 55.0Q4460 66 4477.5 84.0Q4495 102 4503.0 125.0Q4511 148 4511 171Q4511 200 4499.5 225.0Q4488 250 4467.5 268.0Q4447 286 4420.5 296.0Q4394 306 4364 306Z"/><path d="M4964 0V700H5055V0Z"/><path d="M5345 700 L5681 -12 L6017 700 L5921.4 700 L5681 190.6 L5440.6 700Z"/></g><g fill="none" stroke="currentColor" stroke-width="105"><circle cx="1096" cy="350" r="316.5"/><circle cx="3511" cy="350" r="316.5"/></g></svg></div>';
  const KNOT = 'M.5 8.5h3.8c1.2 0 1.7-1.5 1.7-2.8C6 3.7 7.3 2.5 9 2.5s3 1.2 3 3.1-1.8 3.1-4 3.3', KNOT2 = 'M5.6 10.1C7.6 9 9.6 8.5 15.5 8.5';
  const esc = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  // 끈 위의 매듭 셋(공동체 전환 화면, 관리 전환 화면). 매듭은 공동체 화면의 매듭과 같은 꼴(16×12)을 2.4배로, 끈이 먼저 그어지고 매듭이 차례로 지어진다
  const cordInner = (name, sub, loop) => {
    const k = (x, t) => `<g transform="translate(${x - 19.2} 6.2) scale(2.4)" style="stroke-width:1"><path class="k" pathLength="1" style="animation-delay:${t}s" d="${KNOT}"/><path class="k" pathLength="1" style="animation-delay:${t + .2}s" d="${KNOT2}"/></g>`;
    // loop(관리 전환 화면): 매듭이 하나씩 지어지고 천천히 풀렸다가 다시 지어진다(한 바퀴 2.4초). 기다리는 동안 계속 움직인다
    return `<span class="sw-cord${loop ? ' loop' : ''}"><svg viewBox="0 0 220 48"><path class="c" pathLength="1" d="M4 26.6H216"/>${loop ? `${k(48, 0)}${k(110, .45)}${k(172, .9)}` : `${k(48, .25)}${k(110, .4)}${k(172, .55)}`}</svg></span>
  <p class="splash-name sw-in d1">${esc(name)}</p><p class="splash-sub sw-in d2">${esc(sub)}</p><p class="loading"></p>`;
  };
  let inner = '';
  if (mode === 'main') {
    inner = `<span class="splash-mark"><svg viewBox="0 0 16 12"><path pathLength="1" d="${KNOT}"/><path pathLength="1" d="${KNOT2}"/></svg></span>
  <p class="splash-name">코이데</p><p class="splash-sub">나의 기도가 쌓이는 곳</p><p class="loading"></p>${BY}`;
  } else if (mode === 'switch' && space === 'note') {
    inner = `<span class="sw-note sw-in"><svg viewBox="0 0 16 12"><path d="${KNOT}"/><path d="${KNOT2}"/></svg></span>
  <p class="splash-name sw-in d1">코이데 노트</p><p class="splash-sub sw-in d2">하나님과 나누는 이야기</p><p class="loading"></p>`;
  } else if (mode === 'switch') {
    // 공동체: 사랑방 이름이 아니라 항상 '코이데 교회'로 보여 준다
    inner = space === 'koinonia' ? cordInner('코이데 공동체', '함께 기도하는 공동체') : cordInner('코이데 교회', '사랑방과 함께 기도해요');
  }
  // 모임 전환 화면의 속: 수틀(바깥 고리와 속천), 그물 눈금, 걸리는 실 둘, 실이 만나는 매듭 둘
  const groupInner = (name, left) => `<span class="sw-hoop"><svg viewBox="0 0 156 156"><defs><clipPath id="sw-clip"><circle cx="78" cy="78" r="70"/></clipPath></defs>
    <circle class="ring" cx="78" cy="78" r="73"/>
    <g class="net" clip-path="url(#sw-clip)"><path class="net" d="M8 48H148M8 78H148M8 108H148M48 8V148M78 8V148M108 8V148"/></g>
    <path class="t" pathLength="1" d="M18 112C50 40 96 128 138 44"/><path class="t" pathLength="1" d="M26 36C60 94 100 20 132 118"/>
    <circle class="kn" cx="62" cy="80" r="4.5"/><circle class="kn k2" cx="111" cy="75" r="4.5"/></svg></span>
  <p class="splash-name sw-in d1" data-g="name">${esc(name || '모임')}</p><p class="splash-sub sw-in d2" data-g="sub">${groupSub(left)}</p><p class="loading"></p>`;
  const groupSub = left => (left == null || left === '' || isNaN(left) ? '' : (left <= 0 ? 'D-day' : 'D-' + left) + ' · ') + '함께 기도하는 모임';
  if (mode === 'group') inner = groupInner(q.get('gn'), q.get('gl'));
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  // 바탕 그림(glass·classic)은 시작 화면이 걷힐 때 함께 보인다. 시작 화면이 없으면 바로
  //  걷힐 때 앱에 알린다(앱이 그 사이 그린 화면은 booting이라 따라 하기 자동 시작을 건너뛰었다)
  const unboot = () => { const de = document.documentElement, was = de.classList.contains('booting'); de.classList.remove('booting'); if (was) window.dispatchEvent(new Event('koide-unboot')); };
  if (!inner) unboot();
  if (inner) me.insertAdjacentHTML('afterend', `<div id="splash" class="splash" aria-hidden="true">${inner}</div>`);
  window.SPLASH_AT = performance.now();
  // 시작 화면 닫기: 처음 켤 때도 전환 화면도 1.5초 머문다(움직임 줄이기는 0.6초). 관리 전환 화면만 2.5초(dataset.min)
  window.koideSplash = {
    mode,
    // 모임 전환 화면을 (앱 안에서 모임을 바꿀 때) 띄우거나, 이미 떠 있으면 이름·남은 날만 새로 쓴다. 닫는 것은 hide()
    group(name, left) {
      let s = document.getElementById('splash');
      if (!s || s.classList.contains('out')) {
        if (s) s.remove();
        document.body.insertAdjacentHTML('beforeend', `<div id="splash" class="splash" aria-hidden="true">${groupInner(name, left)}</div>`);
        window.SPLASH_AT = performance.now();
        return;
      }
      const n = s.querySelector('[data-g=name]'), b = s.querySelector('[data-g=sub]');
      if (n && name) n.textContent = name;
      if (b && left != null) b.textContent = groupSub(left);
    },
    // 관리 전환 화면(교회 전체 · 부서 관리)을 띄운다. 누른 바로 그때 띄우고, 자료가 올 때까지 두었다가 hide()로 닫는다(머무는 시간은 아래와 같다)
    admin(name) {
      const s = document.getElementById('splash'); if (s) s.remove();
      document.body.insertAdjacentHTML('beforeend', `<div id="splash" class="splash" aria-hidden="true">${cordInner(name, '불러오는 중이에요', true)}</div>`);
      // 관리 전환 화면만 2.5초(불러오는 데 보통 2~3초 걸려서). 다른 전환 화면은 1.5초 그대로
      document.getElementById('splash').dataset.min = '2500';
      window.SPLASH_AT = performance.now();
    },
    hide() {
      const s = document.getElementById('splash'); if (!s || s.classList.contains('out')) return unboot();
      const calm = matchMedia('(prefers-reduced-motion: reduce)').matches, shown = performance.now() - window.SPLASH_AT;
      const stay = calm ? 600 : +s.dataset.min || 1500;
      setTimeout(() => { s.classList.add('out'); unboot(); setTimeout(() => s.remove(), calm ? 0 : 300); }, Math.max(0, stay - shown));
    }
  };
})();
