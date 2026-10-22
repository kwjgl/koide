// 마태복음 5:43~48 이스터에그 둘: "해와 비"와 "다시 기억한 사람 위의 작은 해". 기도 노트(note.html)가 쓴다
//  어디에도 알리지 않고 숨겨 둔 덤이라 사용법·소개·사용자 안내(guide.md)에는 없다(팔복 beatitudes.js와 같다). 모양은 sunrain.css. 소리는 없다
//  원문은 개역개정(저작권이 있는 번역임을 알고 사용자가 2026-10-22 정했다). 안내 글은 쉬운 말로 직접 썼다
//  ① 해와 비: "내가 기도하는 사람들" 끈의 매듭이 이번 주 모두 지어지는 순간(안 다 지어진 상태에서 다 지어진 상태로 바뀔 때) 한 번.
//     해가 천천히 떠올라 모든 매듭에 똑같이 빛을 내리고, 비도 모든 매듭에 고르게 내린 뒤, 작은 카드가 나온다(안내 한 줄 + 마 5:45).
//     처음 한 번은 꼭, 그 뒤로는 한 달에 많아야 한 번. 마지막으로 보여 준 달을 기기에 적어 두고(적을 수 없으면 이 화면을 연 동안 한 번만), 보여 줄 때 적는다
//  ② 작은 해: 한 달(30일) 넘게 기도하지 못한 사람을 위해 다시 기도했어요를 누르면, 그 사람의 매듭 위로 작은 해가 잠깐 떠올랐다 사라지고
//     화면 아래에 작은 카드가 8초쯤 뜬다(안내 한 줄 + 마 5:44. 누르거나 닫기를 누르면 닫힌다). 처음 기도하는 사람은 해당 없음. 기도한 날짜는 note.html이 이미 가진 기록에서 바로 셈하고 따로 저장하지 않는다.
//     사람에게 '원수' 같은 이름표를 붙이지 않고, 기록도 남기지 않는다
//  움직임 줄이기(prefers-reduced-motion)면 움직임 없이 그림만 보여 준다
//  cord({ n, key, force, opener }): ① 해와 비 화면. n은 매듭 수(나 + 사람들). key는 마지막으로 보여 준 달을 적는 자리. force면 늘 띄운다. 띄웠으면 true
//  rise({ idx }): ② 끈의 idx번째 매듭 위에 작은 해
//  line(): ② 화면 아래 작은 카드 (8초)
//  scene(at, ctx): 데모 장면 주소(at=sunrain · sunrise1)용
window.KoideSunrain = (() => {
  const V45 = '이같이 한즉 하늘에 계신 너희 아버지의 아들이 되리니 이는 하나님이 그 해를 악인과 선인에게 비추시며 비를 의로운 자와 불의한 자에게 내려주심이라';
  const V44 = '나는 너희에게 이르노니 너희 원수를 사랑하며 너희를 박해하는 자를 위하여 기도하라';
  const R45 = '마 5:45', R44 = '마 5:44'; 
  const GOLD = '#E9A93A'; // 공동체 화면(index.html)의 반짝이에 이미 쓰는 금빛
  const W = 360, H = 200, CY = 160, SUN_Y = 48;
  const X_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  // 매듭 모양은 beatitudes.js·소개 영상(intro-video.js)과 같은 꼴
  const KNOT = '<circle cx="16" cy="16" r="15" class="sr-kbg"/><path d="M2 16H8.5C11 16 12 13 12 10.5C12 6.5 14.5 4 18 4S24 6.5 24 10.2 21 16 16.5 16.4"/><path d="M11 19.2C15 17 19 16 30 16"/>';
  const still = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const ym = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
  const rays = (r1, r2, k) => Array.from({ length: k }, (_, i) => { const a = i * 2 * Math.PI / k, c = Math.cos(a), s = Math.sin(a); return `<path d="M${(c * r1).toFixed(1)} ${(s * r1).toFixed(1)}L${(c * r2).toFixed(1)} ${(s * r2).toFixed(1)}"/>`; }).join('');

  // 빗방울 하나씩: [매듭 가운데에서 옆으로 벗어난 정도, 시작을 미루는 초, 움직임 줄이기 때 멈춰 선 높이(0~1)]
  const DROPS = [[-1, 0, .1], [-.6, .55, .6], [-.2, .2, .3], [.2, .8, .85], [.6, .35, .45], [1, 1.0, .7]];
  let el = null, opener = null, timers = [], shownThisPage = false;
  const later = (f, ms) => { timers.push(setTimeout(f, ms)); };

  // ── ① 해와 비 ──
  function scene1(n) {
    n = Math.max(2, Math.min(40, Math.floor(n) || 2));
    const gap = (W - 52) / (n - 1), X = k => 26 + k * gap, sz = Math.min(32, gap * .86), s = sz / 32;
    let beams = '', halos = '', cord = `<path class="sr-end" d="M4 ${CY}H${X(0) - sz / 2}M${X(n - 1) + sz / 2} ${CY}H${W - 4}"/>`, knots = '', rain = '', rip = '';
    for (let k = 0; k < n; k++) {
      const x = X(k);
      beams += `<path d="M180 ${SUN_Y + 22}L${x.toFixed(1)} ${CY - sz * .8}"/>`;
      halos += `<circle cx="${x.toFixed(1)}" cy="${CY}" r="${(sz * .95).toFixed(1)}"/>`;
      if (k < n - 1) cord += `<path class="sr-seg" d="M${(x + sz / 2).toFixed(1)} ${CY}H${(X(k + 1) - sz / 2).toFixed(1)}"/>`;
      knots += `<g transform="translate(${(x - 16 * s).toFixed(1)} ${(CY - 16 * s).toFixed(1)}) scale(${s.toFixed(3)})" class="sr-kn">${KNOT}</g>`;
      // 빗방울은 모든 매듭에 똑같은 짜임(같은 개수·길이·때)으로 내리고, 매듭 위에서 잔물결이 한 번씩 인다
      const d = Math.min(15, gap * .4);
      DROPS.forEach(([o, dl, t], j) => { rain += `<path class="sr-drop" style="--t:${t};animation-delay:${dl}s" d="M${(x + o * d).toFixed(1)} 62v14"/>`; });
      rip += `<ellipse class="sr-rip" cx="${x.toFixed(1)}" cy="${(CY - sz / 2 - 3).toFixed(1)}" rx="${(sz * .3).toFixed(1)}" ry="${(sz * .08).toFixed(1)}"/><circle class="sr-fresh" cx="${x.toFixed(1)}" cy="${CY}" r="${(sz * .64).toFixed(1)}"/>`;
    }
    return `<svg class="sr-scene" viewBox="0 -44 ${W} ${H + 44}" aria-hidden="true">
      <defs><radialGradient id="sr-glow"><stop offset="0" stop-color="${GOLD}" stop-opacity=".42"/><stop offset="1" stop-color="${GOLD}" stop-opacity="0"/></radialGradient>
        <clipPath id="sr-clip"><rect x="-300" y="-300" width="960" height="${CY + 20 + 300}"/></clipPath></defs>
      <g clip-path="url(#sr-clip)"><g class="sr-sun"><circle class="sr-glow" r="90" fill="url(#sr-glow)"/><g class="sr-rays">${rays(24, 33, 12)}</g><circle r="17" fill="${GOLD}"/></g></g>
      <g class="sr-beams">${beams}</g><g class="sr-halos">${halos}</g>
      <g class="sr-rain">${rain}</g><g class="sr-ripples">${rip}</g>
      <g class="sr-cord">${cord}${knots}</g></svg>`;
  }
  const cardHtml = () => `<div class="sr-card" hidden aria-live="polite">
      <p class="sr-plain">하나님이 모든 사람에게 똑같이 해와 비를 주듯이, 우리도 모두를 위해 기도해요.</p>
      <p class="sr-text">${V45}</p><p class="sr-ref">${R45}</p></div>`;
  function close() {
    if (!el) return;
    timers.forEach(clearTimeout); timers = [];
    el.remove(); el = null; document.documentElement.classList.remove('sr-open');
    document.removeEventListener('keydown', onKey, true);
    const o = opener && opener.isConnected ? opener : document.querySelector('[data-a=pray]') || document.querySelector('.brand'); if (o && o.focus) o.focus();
  }
  function onKey(e) {
    if (!el) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'Tab') { e.preventDefault(); el.querySelector('[data-sr=x]').focus(); }
  }
  function showCard() {
    if (!el || el.classList.contains('card')) return;
    timers.forEach(clearTimeout); timers = [];
    el.classList.add('sun', 'light', 'rain', 'card');
    const c = el.querySelector('.sr-card'); c.hidden = false;
    const st = el.querySelector('.sr-stage');
    later(() => { try { st.scrollTo({ top: Math.max(0, c.offsetTop - 16), behavior: still() ? 'auto' : 'smooth' }); } catch (e) { /* 무시 */ } }, 120);
  }
  function cord(o) {
    o = o || {};
    // 한 달에 한 번만. 적어 둔 달이 이번 달이면 건너뛴다. 적을 수 없으면 이 화면을 연 동안 한 번만
    if (!o.force) {
      if (shownThisPage || el) return false;
      if (o.key) { try { if (localStorage.getItem(o.key) === ym()) return false; } catch (e) { /* 읽지 못해도 보여 준다 */ } }
    }
    if (o.key && !o.force) { try { localStorage.setItem(o.key, ym()); } catch (e) { /* 이번만 */ } }
    shownThisPage = true;
    if (el) close();
    opener = o.opener || document.activeElement;
    el = document.createElement('div');
    el.className = 'sr'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', '해와 비');
    el.innerHTML = `<div class="sr-top"><button class="sr-x" data-sr="x" aria-label="닫기">${X_ICON}</button></div>
      <div class="sr-stage" data-sr="stage"><div class="sr-body">${scene1(o.n)}${cardHtml()}</div></div>`;
    el.addEventListener('click', e => {
      if (e.target.closest('[data-sr=x]')) return close();
      showCard(); // 화면을 누르면 기다리지 않고 카드로
    });
    document.body.appendChild(el); document.documentElement.classList.add('sr-open');
    document.addEventListener('keydown', onKey, true);
    el.querySelector('[data-sr=x]').focus();
    if (still()) showCard();
    else {
      later(() => el.classList.add('sun'), 80);
      later(() => el.classList.add('light'), 1900);
      later(() => el.classList.add('rain'), 3000);
      later(showCard, 5600);
    }
    return true;
  }

  // ── ② 다시 기억한 사람 위의 작은 해 ──
  let lineEl = null, lineT = 0, knotY = -1;
  function rise(o) {
    const k = document.querySelectorAll('.cord-knots .knot')[o && o.idx];
    const g = k && k.querySelector('.knot-g') || k;
    if (!g) return false; // 끈이 화면에 없으면(다른 탭, 기도하기 화면) 해는 건너뛴다
    const r = g.getBoundingClientRect(), s = document.createElement('span'); knotY = r.top;
    s.className = 'sr-mini'; s.setAttribute('aria-hidden', 'true');
    s.style.left = (r.left + r.width / 2 + window.scrollX) + 'px'; s.style.top = (r.top + window.scrollY) + 'px';
    s.innerHTML = `<svg viewBox="-20 -20 40 40"><circle r="15" fill="${GOLD}" opacity=".25"/><g class="sr-mini-rays">${rays(9.5, 14, 8)}</g><circle r="6.5" fill="${GOLD}"/></svg>`;
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 3600);
    return true;
  }
  function line() {
    if (lineEl) { lineEl.remove(); clearTimeout(lineT); }
    lineEl = document.createElement('section');
    lineEl.className = 'sr-line'; lineEl.setAttribute('role', 'status'); lineEl.setAttribute('aria-label', '작은 해');
    lineEl.innerHTML = `<button class="sr-lx" data-sr="lx" aria-label="닫기">${X_ICON}</button>
      <p class="sr-plain">하나님과 이웃을 사랑하는 것은 가장 큰 계명이에요.</p><p class="sr-text">${V44}</p><p class="sr-ref">${R44}</p>`;
    const me = lineEl, off = () => { clearTimeout(lineT); me.classList.add('out'); setTimeout(() => { me.remove(); if (lineEl === me) lineEl = null; }, 700); };
    me.addEventListener('click', off); // 어디를 눌러도 닫힌다
    // 작은 해가 뜬 매듭이 카드 자리(화면 아래)에 있으면 카드가 가리지 않게 위쪽에 둔다
    if (knotY > innerHeight - 230) me.classList.add('top');
    knotY = -1;
    document.body.appendChild(me);
    lineT = setTimeout(off, 8000);
  }

  // 데모 장면: 매듭 다섯 개의 해와 비 · 두 번째 매듭(엄마) 위의 작은 해와 아래 글
  function scene(at, ctx) {
    if (at === 'sunrain') cord({ n: ctx && ctx.n || 5, force: true });
    else if (at === 'sunrise1') { const k = document.querySelectorAll('.cord-knots .knot')[1]; if (k) k.scrollIntoView({ block: 'center' }); rise({ idx: 1 }); line(); }
    else return false;
    return true;
  }
  return { cord, rise, line, scene, close, verses: { V44, V45 } };
})();
