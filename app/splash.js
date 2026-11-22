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
  //  시작 화면도 없다. 실제 앱(서버 주소나 Supabase 설정이 있고 ?demo가 없음)에서는 쓰지 않는다
  const CFG = window.KOIDE_CONFIG || {};
  // 실제 앱 판정: 옛 서버 주소(API_URL)가 있거나 Supabase 설정(NOTE_BACKEND 또는 CHURCH_BACKEND 'supabase' + 주소 + 키)이 있을 때(2026-11-20)
  const SB_ON = !!CFG.SUPABASE_URL && !!CFG.SUPABASE_KEY && (CFG.NOTE_BACKEND === 'supabase' || CFG.CHURCH_BACKEND === 'supabase'); const LIVE = !!CFG.API_URL || SB_ON;
  // 따라 하기 페이지(공동체·기도 노트의 ?tutorial)도 같은 메모리 판을 쓴다: 연습한 것이 진짜 노트와 로그인에 닿지 않게. 장면 표시(KOIDE_SCENE)는 달지 않는다.
  //  공동체의 연습 페이지는 데모 데이터를 늘 새로 만든다(예전에 ?demo를 쓴 기기의 데이터를 읽어 오지 않는다)
  const tutorial = q.has('tutorial');
  if (((q.has('as') || q.has('at')) && (!LIVE || demo)) || tutorial) {
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
  // 코이노비아 로고(대문 koinobia 저장소의 tabs.js LOGO·WORDMARK를 옮겨 옴. 매듭은 2026-11-22 띠 모양. 로고가 바뀌면 같이 바꾼다)
  const BY = '<div class="splash-by"><svg class="by-knot" viewBox="0 0 100 100" aria-hidden="true"><g transform="translate(-1.15 -1.35) scale(0.20083)" fill="currentColor"><path d="M199.83 412.89 C194.17 414.99 188.52 416.70 182.97 418.05 C177.42 419.39 171.95 420.36 166.63 420.97 C161.32 421.58 156.15 421.83 151.18 421.75 C146.21 421.67 141.45 421.26 136.93 420.55 C132.41 419.84 128.15 418.84 124.17 417.59 C120.19 416.34 116.49 414.85 113.10 413.16 C109.71 411.47 106.62 409.59 103.82 407.56 C101.03 405.54 98.54 403.37 96.33 401.10 C94.11 398.83 92.17 396.45 90.48 393.98 C88.80 391.50 87.35 388.94 86.13 386.27 C84.92 383.61 83.92 380.84 83.14 377.95 C82.36 375.07 81.80 372.05 81.48 368.90 C81.15 365.75 81.06 362.46 81.23 359.02 C81.39 355.58 81.83 352.00 82.56 348.29 C83.29 344.58 84.32 340.75 85.67 336.81 C87.03 332.88 88.71 328.85 90.74 324.77 C92.77 320.69 95.15 316.56 97.88 312.42 C100.61 308.28 103.70 304.14 107.13 300.06 C110.57 295.97 114.36 291.93 118.49 287.99 C122.62 284.05 127.09 280.22 131.88 276.54 C136.66 272.85 141.76 269.32 147.15 265.99 C152.54 262.65 158.21 259.51 164.13 256.61 C170.05 253.72 176.22 251.05 182.59 248.67 C188.96 246.28 195.53 244.16 202.26 242.35 C208.99 240.54 215.88 239.03 222.86 237.84 C229.85 236.65 236.93 235.78 244.07 235.25 C251.20 234.72 258.38 234.52 265.54 234.67 C272.71 234.82 279.86 235.30 286.95 236.13 C294.03 236.95 301.04 238.11 307.93 239.60 L312.63 205.10 C304.77 203.44 296.79 202.09 288.74 201.07 C280.69 200.04 272.57 199.33 264.42 198.95 C256.28 198.57 248.10 198.52 239.94 198.80 C231.78 199.07 223.63 199.68 215.55 200.62 C207.46 201.56 199.43 202.83 191.51 204.43 C183.59 206.02 175.77 207.95 168.09 210.20 C160.42 212.45 152.90 215.02 145.57 217.90 C138.24 220.79 131.10 223.98 124.20 227.48 C117.30 230.97 110.64 234.76 104.26 238.84 C97.87 242.91 91.77 247.27 85.99 251.88 C80.22 256.50 74.76 261.37 69.67 266.48 C64.59 271.59 59.86 276.93 55.55 282.48 C51.24 288.03 47.33 293.78 43.88 299.70 C40.42 305.61 37.42 311.70 34.91 317.90 C32.40 324.11 30.38 330.43 28.89 336.82 C27.40 343.21 26.45 349.66 26.06 356.09 C25.66 362.53 25.84 368.96 26.59 375.28 C27.34 381.60 28.68 387.82 30.58 393.84 C32.48 399.85 34.96 405.66 37.96 411.16 C40.96 416.66 44.49 421.85 48.49 426.65 C52.48 431.45 56.93 435.87 61.75 439.83 C66.57 443.80 71.76 447.32 77.24 450.37 C82.72 453.42 88.49 456.01 94.46 458.12 C100.44 460.23 106.62 461.87 112.95 463.05 C119.28 464.23 125.76 464.95 132.33 465.23 C138.90 465.51 145.56 465.34 152.28 464.75 C158.99 464.16 165.76 463.15 172.53 461.73 C179.31 460.31 186.10 458.48 192.87 456.27 C199.63 454.05 206.37 451.45 213.06 448.49 C219.74 445.52 226.37 442.18 232.90 438.50 Z"/><path d="M389.91 278.24 C394.56 282.10 398.86 286.13 402.80 290.27 C406.75 294.40 410.32 298.65 413.51 302.95 C416.69 307.25 419.50 311.60 421.91 315.95 C424.32 320.29 426.35 324.62 427.99 328.89 C429.63 333.15 430.90 337.35 431.81 341.42 C432.72 345.49 433.27 349.44 433.50 353.22 C433.74 357.00 433.66 360.62 433.30 364.05 C432.94 367.48 432.31 370.72 431.45 373.78 C430.59 376.83 429.50 379.70 428.20 382.40 C426.90 385.10 425.40 387.63 423.71 390.01 C422.01 392.40 420.11 394.65 418.00 396.77 C415.88 398.88 413.56 400.88 410.99 402.74 C408.42 404.60 405.62 406.32 402.56 407.89 C399.50 409.47 396.18 410.88 392.60 412.10 C389.02 413.32 385.19 414.35 381.10 415.14 C377.02 415.94 372.69 416.49 368.14 416.78 C363.59 417.06 358.82 417.07 353.87 416.77 C348.93 416.48 343.80 415.87 338.54 414.94 C333.28 414.01 327.89 412.74 322.41 411.13 C316.94 409.53 311.38 407.57 305.80 405.27 C300.22 402.97 294.61 400.32 289.02 397.32 C283.44 394.32 277.89 390.98 272.42 387.30 C266.95 383.62 261.56 379.61 256.31 375.29 C251.05 370.96 245.93 366.33 241.00 361.41 C236.07 356.48 231.31 351.28 226.79 345.82 C222.27 340.37 217.98 334.67 213.95 328.75 C209.92 322.84 206.17 316.72 202.71 310.45 C199.25 304.17 196.10 297.73 193.27 291.18 C190.44 284.64 187.94 277.98 185.78 271.27 L153.55 284.45 C156.05 292.09 158.87 299.67 162.01 307.16 C165.14 314.64 168.59 322.03 172.34 329.27 C176.08 336.52 180.12 343.62 184.44 350.55 C188.76 357.48 193.36 364.23 198.22 370.77 C203.07 377.30 208.19 383.62 213.53 389.68 C218.88 395.75 224.46 401.55 230.24 407.07 C236.03 412.59 242.01 417.82 248.18 422.73 C254.34 427.64 260.67 432.22 267.15 436.45 C273.63 440.68 280.24 444.55 286.96 448.04 C293.68 451.53 300.50 454.64 307.39 457.33 C314.27 460.03 321.22 462.32 328.19 464.17 C335.16 466.02 342.15 467.44 349.11 468.40 C356.07 469.36 363.00 469.87 369.86 469.90 C376.71 469.93 383.48 469.49 390.11 468.57 C396.74 467.64 403.22 466.22 409.50 464.32 C415.77 462.41 421.84 460.01 427.61 457.13 C433.38 454.25 438.86 450.89 443.96 447.08 C449.06 443.27 453.78 439.00 458.03 434.35 C462.29 429.69 466.08 424.65 469.34 419.29 C472.60 413.94 475.34 408.29 477.50 402.43 C479.66 396.57 481.26 390.51 482.28 384.36 C483.31 378.20 483.76 371.94 483.66 365.67 C483.56 359.39 482.92 353.11 481.76 346.88 C480.60 340.65 478.93 334.47 476.79 328.40 C474.64 322.33 472.03 316.36 468.99 310.53 C465.94 304.70 462.47 299.01 458.60 293.49 C454.73 287.97 450.47 282.62 445.85 277.46 C441.23 272.31 436.25 267.34 430.96 262.59 C425.66 257.83 420.03 253.30 414.12 248.99 C408.21 244.69 402.01 240.62 395.55 236.80 Z"/><path d="M178.26 180.96 C179.28 175.00 180.61 169.26 182.22 163.77 C183.84 158.29 185.73 153.08 187.86 148.17 C189.99 143.25 192.36 138.65 194.91 134.39 C197.47 130.13 200.21 126.21 203.08 122.65 C205.95 119.10 208.95 115.90 212.02 113.08 C215.10 110.26 218.24 107.81 221.40 105.71 C224.55 103.62 227.73 101.88 230.88 100.47 C234.03 99.07 237.15 97.99 240.22 97.21 C243.30 96.43 246.33 95.94 249.31 95.72 C252.30 95.49 255.24 95.52 258.16 95.80 C261.08 96.08 263.97 96.60 266.86 97.37 C269.75 98.14 272.64 99.16 275.53 100.45 C278.43 101.74 281.33 103.31 284.22 105.18 C287.11 107.04 289.99 109.21 292.84 111.69 C295.69 114.18 298.50 116.99 301.22 120.13 C303.95 123.27 306.60 126.74 309.12 130.54 C311.64 134.34 314.03 138.46 316.25 142.90 C318.46 147.33 320.51 152.07 322.33 157.10 C324.15 162.12 325.75 167.42 327.10 172.96 C328.44 178.51 329.53 184.30 330.33 190.28 C331.12 196.27 331.63 202.45 331.83 208.78 C332.02 215.12 331.90 221.60 331.45 228.17 C331.00 234.75 330.22 241.42 329.10 248.13 C327.99 254.85 326.53 261.60 324.74 268.33 C322.94 275.07 320.81 281.78 318.35 288.43 C315.88 295.07 313.09 301.64 309.98 308.08 C306.88 314.53 303.46 320.84 299.75 326.97 C296.04 333.11 292.04 339.06 287.79 344.78 C283.53 350.50 279.02 356.00 274.29 361.22 L301.82 382.54 C307.18 376.56 312.34 370.32 317.25 363.86 C322.16 357.41 326.84 350.73 331.24 343.86 C335.64 337.00 339.78 329.94 343.62 322.74 C347.46 315.53 351.00 308.17 354.24 300.70 C357.47 293.23 360.38 285.64 362.96 277.98 C365.54 270.32 367.78 262.58 369.66 254.82 C371.55 247.05 373.09 239.25 374.26 231.46 C375.42 223.67 376.23 215.89 376.65 208.16 C377.07 200.44 377.12 192.78 376.78 185.21 C376.45 177.65 375.72 170.18 374.62 162.87 C373.51 155.56 372.01 148.40 370.13 141.44 C368.25 134.48 365.99 127.72 363.34 121.21 C360.69 114.70 357.67 108.44 354.27 102.49 C350.87 96.54 347.10 90.90 342.99 85.62 C338.87 80.34 334.40 75.43 329.61 70.95 C324.82 66.47 319.71 62.42 314.34 58.86 C308.96 55.30 303.30 52.24 297.45 49.73 C291.60 47.22 285.55 45.26 279.39 43.91 C273.23 42.55 266.96 41.79 260.70 41.64 C254.43 41.49 248.17 41.95 242.02 43.01 C235.86 44.06 229.82 45.71 223.97 47.90 C218.12 50.09 212.48 52.83 207.09 56.05 C201.71 59.27 196.59 62.97 191.78 67.09 C186.96 71.21 182.45 75.75 178.26 80.64 C174.07 85.53 170.21 90.78 166.69 96.33 C163.16 101.88 159.97 107.73 157.12 113.84 C154.28 119.95 151.77 126.32 149.62 132.90 C147.46 139.48 145.64 146.27 144.18 153.24 C142.71 160.20 141.59 167.34 140.82 174.61 C140.05 181.88 139.62 189.29 139.55 196.79 Z"/></g></svg><svg class="wm" viewBox="0 -26 6024 752" aria-hidden="true"><g fill="currentColor" stroke="currentColor" stroke-width="14" stroke-linejoin="round"><path d="M0 700H91V454L204 333L470 700H574L262 271L516 0H466L91 394V0H0Z"/><path d="M1778 0V700H1869V0Z"/><path d="M2823 0V535H2819L2264 -12H2259V700H2305V165H2309L2864 712H2869V0Z"/><path d="M4153 700H4404Q4471 700 4517.0 682.5Q4563 665 4591.0 637.0Q4619 609 4631.5 573.5Q4644 538 4644 502Q4644 445 4619.5 411.0Q4595 377 4561.0 359.0Q4527 341 4491.0 335.0Q4455 329 4433 328V324Q4468 324 4499.0 310.5Q4530 297 4553.5 275.5Q4577 254 4591.0 225.5Q4605 197 4605 165Q4605 137 4593.0 108.0Q4581 79 4556.5 55.0Q4532 31 4493.5 15.5Q4455 0 4403 0H4153ZM4244 656V350H4354Q4403 350 4439.0 363.0Q4475 376 4498.5 398.0Q4522 420 4533.5 449.0Q4545 478 4545 510Q4545 545 4532.5 572.0Q4520 599 4499.0 618.0Q4478 637 4449.5 646.5Q4421 656 4389 656ZM4244 306V44H4366Q4405 44 4432.5 55.0Q4460 66 4477.5 84.0Q4495 102 4503.0 125.0Q4511 148 4511 171Q4511 200 4499.5 225.0Q4488 250 4467.5 268.0Q4447 286 4420.5 296.0Q4394 306 4364 306Z"/><path d="M4964 0V700H5055V0Z"/><path d="M5345 700 L5681 -12 L6017 700 L5921.4 700 L5681 190.6 L5440.6 700Z"/></g><g fill="none" stroke="currentColor" stroke-width="105"><circle cx="1096" cy="350" r="316.5"/><circle cx="3511" cy="350" r="316.5"/></g></svg></div>';
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
    inner = space === 'koinonia' ? cordInner('코이데 공동체', '함께 기도하는 공동체') : cordInner('코이데 교회', '한 몸으로 기도하는 교회');
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
