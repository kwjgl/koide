// 시작 화면(공동체 index.html과 기도 노트 note.html이 함께 쓴다). <body> 맨 앞에서 불러, 화면이 그려지기 전에 고른다.
//  ① 앱을 새로 켰을 때(이번 창에서 처음): 코이데 시작 화면(매듭이 지어지고 "코이데"). 마지막에 기도 노트를 쓰다 껐으면 기도 노트로 바로 간다
//  ② 공동체 ↔ 기도 노트를 오갈 때: 가는 곳의 전환 화면(기도 노트 / 공동체). 짧게 보여 준다
//  ③ 같은 곳을 다시 열 때(새로고침, 카카오 로그인을 다녀옴 등): 시작 화면 없이
//  ④ 자율 모임으로 들어갈 때(기도 노트의 '내 모임', 함께하는 곳 메뉴): 모임 전환 화면(수틀에 실이 걸림 · 모임 이름). 모임 자료가 올 때까지 계속 보인다
//  마지막에 쓴 곳은 기기에(localStorage), 이번 창에서 보던 곳은 창에만(sessionStorage) 둔다. 기도제목은 담지 않는다
(() => {
  const me = document.currentScript, q = new URLSearchParams(location.search), demo = q.has('demo');
  // 장면 모드(데모 주소에 ?as=사람 또는 ?at=화면): 화면 지도처럼 한 브라우저에 앱 창을 여러 개 띄워도 서로 로그인·기억을 덮어쓰지 않게,
  //  이 창의 localStorage를 메모리 판으로 바꾼다(창을 닫으면 사라짐). 데모 데이터(koide-demo-db)만 기기에서 읽어 오고 쓰지는 않는다.
  //  시작 화면도 없다. 실제 앱(서버 주소가 있고 ?demo가 없음)에서는 쓰지 않는다
  const CFG = window.KOIDE_CONFIG || {};
  if ((q.has('as') || q.has('at')) && (!CFG.API_URL || demo)) {
    const mem = new Map(), real = (() => { try { return window.localStorage; } catch (e) { return null; } })();
    const store = {
      getItem: k => mem.has(k) ? mem.get(k) : k === 'koide-demo-db' && real ? real.getItem(k) : null,
      setItem: (k, v) => { mem.set(String(k), String(v)); },
      removeItem: k => { mem.set(String(k), null); },
      clear: () => mem.clear(), key: () => null, get length() { return mem.size; }
    };
    try { Object.defineProperty(window, 'localStorage', { value: store, configurable: true }); } catch (e) { /* 막히면 기기 저장소를 그대로 */ }
    window.KOIDE_SCENE = { as: q.get('as') || '', at: q.get('at') || '', fresh: q.has('fresh') };
    window.koideSpace = { going() {}, used() {} };
    window.koideSplash = { mode: 'quiet', hide() { document.documentElement.classList.remove('booting'); } };
    document.documentElement.classList.remove('booting');
    return;
  }
  const SPACE_KEY = demo ? 'koide-demo-space' : 'koide-space', LAST = 'koide-last-space', TOKEN = demo ? 'koide-demo-token' : 'koide-token';
  const get = (st, k) => { try { return st.getItem(k); } catch (e) { return null; } };
  const set = (st, k, v) => { try { st.setItem(k, v); } catch (e) { /* 이번만 */ } };
  // 이 화면이 어느 곳인지: 공동체 화면이라도 기도 노트의 '내 모임'에서 연 모임(?grp=)은 기도 노트 쪽이다
  const page = me.dataset.space, space = page === 'community' && q.has('grp') ? 'note' : page;
  const prev = get(sessionStorage, LAST);
  // ① 새로 켰는데 마지막에 기도 노트를 쓰다 껐으면(로그인돼 있고, 초대 링크 같은 특별한 주소가 아닐 때) 기도 노트로
  const special = ['code', 'gjoin', 'grp', 'join', 'connect', 'opsjoin'].some(k => q.has(k));
  if (!prev && page === 'community' && !special && get(localStorage, SPACE_KEY) === 'note' && get(localStorage, TOKEN) && !get(localStorage, 'koide-share')) {
    location.replace('note.html' + (demo ? '?demo' : '')); return;
  }
  // 기도 노트에서 모임 화면(?grp=)을 열면 모임 전환 화면. 모임 이름(gn)과 남은 날(gl)을 알고 넘어왔으면 바로 보여 준다
  const mode = !prev ? 'main' : page === 'community' && q.has('grp') ? 'group' : prev !== space ? 'switch' : 'quiet';
  set(sessionStorage, LAST, space);
  window.koideSpace = {
    // 다른 곳으로 바로 넘길 때(예: 혼자 시작한 사람을 기도 노트로) 전환 화면이 두 번 나오지 않게 미리 적어 둔다
    going: s => set(sessionStorage, LAST, s),
    // 마지막에 쓴 곳: 화면이 실제로 그 곳을 보여 줄 때 적는다
    used: s => set(localStorage, SPACE_KEY, s)
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
@media (prefers-reduced-motion: reduce) { .splash { transition: none; } .splash-mark path, .sw-in, .sw-cord .c, .sw-cord .k, .sw-hoop .t, .sw-hoop .kn { animation: none; } }`;
  const KNOT = 'M.5 8.5h3.8c1.2 0 1.7-1.5 1.7-2.8C6 3.7 7.3 2.5 9 2.5s3 1.2 3 3.1-1.8 3.1-4 3.3', KNOT2 = 'M5.6 10.1C7.6 9 9.6 8.5 15.5 8.5';
  const esc = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  let inner = '';
  if (mode === 'main') {
    inner = `<span class="splash-mark"><svg viewBox="0 0 16 12"><path pathLength="1" d="${KNOT}"/><path pathLength="1" d="${KNOT2}"/></svg></span>
  <p class="splash-name">코이데</p><p class="splash-sub">함께 기도하는 공동체</p><p class="loading"></p>`;
  } else if (mode === 'switch' && space === 'note') {
    inner = `<span class="sw-note sw-in"><svg viewBox="0 0 16 12"><path d="${KNOT}"/><path d="${KNOT2}"/></svg></span>
  <p class="splash-name sw-in d1">나의 기도 노트</p><p class="splash-sub sw-in d2">나만 보는 기도</p><p class="loading"></p>`;
  } else if (mode === 'switch') {
    // 공동체: 이 기기에 남은 지난번 화면에서 사랑방 이름을 가져온다(없으면 '코이데 공동체')
    let room = ''; try { const c = JSON.parse(localStorage.getItem(demo ? 'koide-demo-cache' : 'koide-cache') || 'null'); room = c && c.month && c.month.room ? c.month.room.name : ''; } catch (e) { /* 없음 */ }
    // 매듭은 공동체 화면의 매듭과 같은 꼴(16×12)을 2.4배로, 끈 위에 셋. 끈이 먼저 그어지고 매듭이 차례로 지어진다
    const k = (x, t) => `<g transform="translate(${x - 19.2} 6.2) scale(2.4)" style="stroke-width:1"><path class="k" pathLength="1" style="animation-delay:${t}s" d="${KNOT}"/><path class="k" pathLength="1" style="animation-delay:${t + .2}s" d="${KNOT2}"/></g>`;
    inner = `<span class="sw-cord"><svg viewBox="0 0 220 48"><path class="c" pathLength="1" d="M4 26.6H216"/>${k(48, .25)}${k(110, .4)}${k(172, .55)}</svg></span>
  <p class="splash-name sw-in d1">${esc(room || '코이데 공동체')}</p><p class="splash-sub sw-in d2">함께 기도하는 공동체</p><p class="loading"></p>`;
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
  const unboot = () => document.documentElement.classList.remove('booting');
  if (!inner) unboot();
  if (inner) me.insertAdjacentHTML('afterend', `<div id="splash" class="splash" aria-hidden="true">${inner}</div>`);
  window.SPLASH_AT = performance.now();
  // 시작 화면 닫기: 처음 켤 때도 전환 화면도 1.5초 머문다(움직임 줄이기는 0.6초)
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
    hide() {
      const s = document.getElementById('splash'); if (!s || s.classList.contains('out')) return unboot();
      const calm = matchMedia('(prefers-reduced-motion: reduce)').matches, shown = performance.now() - window.SPLASH_AT;
      const stay = calm ? 600 : 1500;
      setTimeout(() => { s.classList.add('out'); unboot(); setTimeout(() => s.remove(), calm ? 0 : 300); }, Math.max(0, stay - shown));
    }
  };
})();
