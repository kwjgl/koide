// 따라 하기(안내): 화면의 한 곳만 밝게 비추고, 말풍선이 한 걸음씩 이끈다. 공동체 앱(index.html)과 기도 노트(note.html)가 함께 쓴다. 모양은 guide.css
//  이 파일은 앱 안쪽을 모른다. 앱이 단계(steps)를 넘기면 그대로 그리고, 끝나거나 건너뛰면 앱이 넘긴 함수를 부른다
//  KoideGuide.run(steps, { onDone, onSkipFirst, onStep })
//   단계 하나 = {
//     target: () => 요소 | 요소들 | 선택자   비출 곳(없으면 화면 가운데 말풍선만). 다시 그려져도 늘 새로 찾는다
//     text, title?                        말풍선 글
//     mode: 'tap' | 'next'                tap: 비춘 곳만 눌리고, 누르면(또는 done이 참이 되면) 넘어간다 / next: 비추기만 하고 [다음]으로 넘어간다
//     done?: () => 참/거짓                 tap에서 "다 했다"의 기준. 없으면 비춘 곳을 누른 것
//     ready?: () => 참/거짓, readyLabel?   tap에서 이 조건이 참일 때만 말풍선에 [다음] 같은 단추를 더한다(글을 다 쓴 뒤 등)
//     wait?: () => 참/거짓                 참이 될 때까지 기다린다(다음 화면이 그려질 때까지). waitText: 기다리는 동안 보여 줄 글
//     before?: () => 미리 할 일             단계가 시작될 때 한 번(다른 탭으로 가기 등)
//     skip?: () => 참/거짓                 참이면 이 단계는 건너뛴다
//     back?: () => 참/거짓                 참이면 앞 단계로 되돌아간다
//     nextLabel?                          [다음] 단추의 글(마지막 단계는 [시작하기])
//     then?: () => 참/거짓                 next 단계에서 단추를 누르면 안내를 잠시 접어 두고, 이 조건이 참이 될 때까지 기다렸다 이어 간다
//     timeout?: ms                        비출 곳이 이만큼 안 나타나면 말풍선과 [다음]만 보여 준다(기본 8초)
//   }
//  첫 단계에만 "이미 써 봤어요"(skipLabel)가 있다. Esc로는 닫히지 않는다. 비출 곳이 없거나 막혀도 영영 갇히지 않게 안전장치가 있다(timeout, 한참 걸리면 [넘어가기])
window.KoideGuide = (() => {
  const calm = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const PAD = 6, STUCK = 30000;
  let G = null;

  const shown = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  // 비출 곳을 요소들로: 요소 하나, 요소 여럿, 선택자 모두 받는다
  function elsOf(t) {
    let v; try { v = typeof t === 'function' ? t() : t; } catch (e) { v = null; }
    if (!v) return [];
    return (Array.isArray(v) ? v : [v]).map(x => typeof x === 'string' ? document.querySelector(x) : x).filter(x => x && x.isConnected && shown(x));
  }
  // 보이는 화면(키보드가 올라오면 줄어든다). 말풍선과 구멍은 이 안에서 계산한다
  function view() {
    const v = window.visualViewport;
    return v ? { x: v.offsetLeft, y: v.offsetTop, w: v.width, h: v.height } : { x: 0, y: 0, w: innerWidth, h: innerHeight };
  }
  function unionRect(els, V) {
    let l = 1e9, t = 1e9, r = -1e9, b = -1e9;
    els.forEach(e => { const q = e.getBoundingClientRect(); l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom); });
    // 화면 가장자리에 2px 남겨서 테두리가 잘리지 않게
    l = Math.max(2, l - V.x - PAD); t = Math.max(2, t - V.y - PAD); r = Math.min(V.w - 2, r - V.x + PAD); b = Math.min(V.h - 2, b - V.y + PAD);
    return { left: l, top: t, width: Math.max(0, r - l), height: Math.max(0, b - t), right: r, bottom: b };
  }
  const fixedIn = el => { for (let e = el; e && e !== document.body; e = e.parentElement) { const p = getComputedStyle(e).position; if (p === 'fixed' || p === 'sticky') return true; } return false; };

  function run(steps, opts) {
    if (G || !steps || !steps.length) return false;
    const root = document.createElement('div');
    root.className = 'kg';
    root.innerHTML = '<div class="kg-full" hidden></div><div class="kg-b"></div><div class="kg-b"></div><div class="kg-b"></div><div class="kg-b"></div><div class="kg-shield" hidden></div><div class="kg-ring" hidden></div>' +
      '<section class="kg-bubble" role="dialog" aria-modal="true" aria-label="따라 하기" tabindex="-1"></section><i class="kg-arrow" hidden></i>';
    G = { steps, opts: opts || {}, root, i: -1, raf: 0, paused: false, sig: '', bsig: '' };
    const q = s => root.querySelector(s);
    Object.assign(G, { full: q('.kg-full'), blocks: [...root.querySelectorAll('.kg-b')], shield: q('.kg-shield'), ring: q('.kg-ring'), bubble: q('.kg-bubble'), arrow: q('.kg-arrow') });
    document.body.appendChild(root);
    document.documentElement.classList.add('kg-on');
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
    root.addEventListener('click', onBubble);
    root.addEventListener('wheel', e => { if (!e.target.closest('.kg-bubble')) e.preventDefault(); }, { passive: false });
    go(0);
    tick();
    return true;
  }

  // 다음 단계로(건너뛸 단계는 건너뛰고, 끝이면 마친다)
  function go(n, dir = 1) {
    while (G && n >= 0 && n < G.steps.length && G.steps[n].skip && safe(G.steps[n].skip)) n += dir;
    if (!G) return;
    if (n < 0) n = 0;
    if (n >= G.steps.length) return finish(false);
    const s = G.steps[n];
    Object.assign(G, { i: n, s, paused: false, clicked: false, born: Date.now(), miss: 0, seen: false, focused: false, els: [], hole: null, bsig: '', lastState: null });
    G.root.hidden = false;
    G.root.classList.toggle('kg-anim', !calm());
    clearTimeout(G.animOff); G.animOff = setTimeout(() => G && G.root.classList.remove('kg-anim'), 400);
    if (s.before) safe(s.before);
    if (G.opts.onStep) safe(() => G.opts.onStep(n, s));
  }
  const safe = f => { try { return f(); } catch (e) { return false; } };

  function finish(skipped) {
    if (!G) return;
    const g = G; G = null;
    cancelAnimationFrame(g.raf); clearTimeout(g.animOff);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKey, true);
    g.root.remove();
    document.documentElement.classList.remove('kg-on');
    if (skipped === null) return; // stop(): 앱이 직접 접은 것이라 마침으로 치지 않는다
    const f = skipped && g.opts.onSkipFirst ? g.opts.onSkipFirst : g.opts.onDone;
    if (f) safe(() => f({ skipped, step: g.i + 1, of: g.steps.length }));
  }

  // 비춘 곳을 눌렀는지 기억한다(done이 따로 없는 단계의 "다 했다"). 앱의 누름 처리가 끝난 다음 틱에서 넘어간다
  function onClick(e) {
    if (!G || G.paused || G.root.contains(e.target)) return;
    const near = e.clientX || e.clientY ? G.hole && inside(G.hole, e.clientX, e.clientY) : false;
    if (G.els.some(x => x.contains(e.target)) || near) G.clicked = true;
  }
  const inside = (h, x, y) => { const V = view(); x -= V.x; y -= V.y; return x >= h.left && x <= h.right && y >= h.top && y <= h.bottom; };

  function onBubble(e) {
    const b = e.target.closest('button'); if (!b || !G) return;
    const s = G.s;
    if (b.classList.contains('kg-skip')) return finish(true);
    if (b.classList.contains('kg-go')) {
      // then: 단추를 누르면 안내를 접어 두고 조건이 될 때까지 기다렸다 이어 간다
      if (s.then && !G.paused) { G.paused = true; G.root.hidden = true; document.documentElement.classList.remove('kg-on'); return; }
      return go(G.i + 1);
    }
  }

  function onKey(e) {
    if (!G) return;
    // 강제 안내: Esc로 닫히지 않는다(앱의 다른 Esc 처리도 막는다)
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return; }
    if (e.key !== 'Tab' || G.paused) return;
    // Tab은 비춘 곳 안과 말풍선 단추 사이에서만 돈다
    const inHole = el => { if (!G.hole || G.s.mode === 'next') return false; const q = el.getBoundingClientRect(), V = view(), h = G.hole;
      return q.left - V.x >= h.left - 4 && q.right - V.x <= h.right + 4 && q.top - V.y >= h.top - 4 && q.bottom - V.y <= h.bottom + 4; };
    const L = [...document.querySelectorAll('button, a[href], input, textarea, select, [tabindex]:not([tabindex="-1"])')]
      .filter(el => !G.root.contains(el) && !el.disabled && shown(el) && inHole(el)).concat([...G.bubble.querySelectorAll('button')]);
    if (!L.length) return;
    const i = L.indexOf(document.activeElement);
    e.preventDefault();
    L[e.shiftKey ? (i <= 0 ? L.length - 1 : i - 1) : (i < 0 || i === L.length - 1 ? 0 : i + 1)].focus();
  }

  // 매 프레임: 지금 단계의 비출 곳을 새로 찾아(앱이 화면을 다시 그려도 따라간다) 구멍·말풍선을 맞추고, 끝났는지 본다
  function tick() {
    if (!G) return;
    G.raf = requestAnimationFrame(tick);
    const s = G.s, now = Date.now();
    if (G.paused) { if (safe(s.then)) { document.documentElement.classList.add('kg-on'); go(G.i + 1); } return; }
    // 눌러서 하는 단계의 끝: 다 했다는 기준이 참이 되면 넘어간다
    if (s.mode === 'tap' && (s.done ? safe(s.done) : G.clicked)) return go(G.i + 1);
    // 앞 단계로 되돌아가야 할 때(미리보기를 다시 쓰기로 닫았을 때 등)
    if (s.back && G.seen && G.i > 0 && safe(s.back)) return go(G.i - 1, -1);
    const V = view();
    // 화면 크기가 바뀌면(키보드, 가로 세로) 비출 곳이 보이게 다시 끌어온다
    const vs = V.w + 'x' + V.h; if (vs !== G.vs) { G.vs = vs; G.seen = false; }
    Object.assign(G.root.style, { left: V.x + 'px', top: V.y + 'px', width: V.w + 'px', height: V.h + 'px' });
    const ok = !s.wait || safe(s.wait), els = ok && s.target ? elsOf(s.target) : [];
    G.els = els;
    let state;
    if (!s.target) state = 'center';
    else if (els.length) { state = 'on'; G.miss = 0; if (!G.seen) { G.seen = true; reveal(els); } }
    else {
      G.miss = G.miss || now;
      // 화면을 다시 그리는 사이에 잠깐 없는 것은 기다린다(깜빡이지 않게)
      if (now - G.miss <= 250) return;
      state = now - G.miss > (s.timeout || 8000) ? 'lost' : 'wait';
    }
    // 안전장치: 눌러도 안 넘어가는 채로 오래 걸리면 [넘어가기]를 보여 준다
    paintBubble(state, now - G.born > STUCK);
    layout(state, els, V);
    if (!G.focused && (state === 'on' || state === 'center' || state === 'lost')) { G.focused = true; focusStart(state, els); }
  }

  // 비출 곳이 화면 밖이면 보이게 끌어온다(이미 다 보이는 위·아래 막대 안의 것은 그대로)
  function reveal(els) {
    const el = els[0], r = el.getBoundingClientRect(), V = view();
    const inView = r.top >= 0 && r.bottom <= V.h;
    if (inView && (fixedIn(el) || (r.top >= 60 && r.bottom <= V.h - 60))) return;
    if (r.height > V.h * .6) el.style.scrollMarginTop = '80px';
    el.scrollIntoView({ block: r.height > V.h * .6 ? 'start' : 'center', behavior: calm() ? 'auto' : 'smooth' });
  }
  // 처음 눌러야 할 단추가 있으면 거기로, 아니면 말풍선으로(글 칸은 건드리지 않는다: 키보드가 갑자기 올라오지 않게)
  function focusStart(state, els) {
    const go = G.bubble.querySelector('.kg-go');
    const t = G.s.mode === 'tap' && els[0] && els[0].matches('button, a[href]') ? els[0] : null;
    (t || go || G.bubble).focus({ preventScroll: true });
  }

  function layout(state, els, V) {
    const full = state !== 'on', s = G.s;
    G.full.hidden = !full; G.ring.hidden = full; G.shield.hidden = full || s.mode !== 'next';
    let h = null;
    if (!full) {
      h = unionRect(els, V);
      const sig = [h.left, h.top, h.width, h.height, V.w, V.h].map(Math.round).join();
      if (sig !== G.sig) {
        G.sig = sig;
        const p = (el, l, t, w, hh) => Object.assign(el.style, { left: l + 'px', top: t + 'px', width: Math.max(0, w) + 'px', height: Math.max(0, hh) + 'px' });
        p(G.ring, h.left, h.top, h.width, h.height); p(G.shield, h.left, h.top, h.width, h.height);
        const [bt, bb, bl, br] = G.blocks;
        p(bt, 0, 0, V.w, h.top); p(bb, 0, h.bottom, V.w, V.h - h.bottom); p(bl, 0, h.top, h.left, h.height); p(br, h.right, h.top, V.w - h.right, h.height);
      }
    } else G.sig = '';
    G.hole = h;
    G.blocks.forEach(b => { b.hidden = full; });
    place(h, V);
  }

  // 말풍선: 구멍 아래에 들어가면 아래, 아니면 위. 화면 밖으로 나가지 않게 가둔다
  function place(h, V) {
    const psig = [h ? [h.left, h.top, h.width, h.height].map(Math.round).join() : '-', Math.round(V.w), Math.round(V.h), G.bsig].join('|');
    if (psig === G.psig) return;
    G.psig = psig;
    const b = G.bubble, a = G.arrow, M = 12, gap = 14;
    // 위·아래 어느 쪽에도 안 들어가면(키보드가 올라온 작은 화면) 말풍선을 작게 줄여서 구멍을 덜 가린다
    b.classList.remove('kg-tight');
    let bw = b.offsetWidth, bh = b.offsetHeight;
    const room = h ? Math.max(V.h - h.bottom, h.top) - gap - M : V.h - 2 * M;
    if (bh > room) { b.classList.add('kg-tight'); bw = b.offsetWidth; bh = b.offsetHeight; }
    let left, top, dir = '';
    if (!h) { left = (V.w - bw) / 2; top = (V.h - bh) / 2; }
    else {
      const below = V.h - h.bottom - gap - M, above = h.top - gap - M;
      dir = below >= bh ? 'down' : above >= bh ? 'up' : below >= above ? 'down' : 'up';
      top = dir === 'down' ? h.bottom + gap : h.top - gap - bh;
      left = h.left + h.width / 2 - bw / 2;
    }
    left = Math.min(Math.max(16, left), Math.max(16, V.w - bw - 16)); top = Math.min(Math.max(M, top), Math.max(M, V.h - bh - M));
    b.style.left = Math.round(left) + 'px'; b.style.top = Math.round(top) + 'px';
    // 말풍선이 구멍과 겹치게 눌려 들어갔으면 가리키는 마름모는 감춘다
    const hit = h && top < h.bottom && top + bh > h.top;
    a.hidden = !h || hit;
    if (!a.hidden) {
      const ax = Math.min(Math.max(h.left + h.width / 2, left + 24), left + bw - 24);
      a.className = 'kg-arrow ' + (dir === 'down' ? 'up' : 'down');
      a.style.left = Math.round(ax - 7) + 'px'; a.style.top = Math.round(dir === 'down' ? top - 7 : top + bh - 7) + 'px';
    }
  }

  // 말풍선 안: 단계 번호, 글, 단추. 바뀔 때만 다시 쓴다(읽는 중에 흔들리지 않게)
  function paintBubble(state, stuck) {
    const s = G.s, n = G.steps.length, last = G.i === n - 1, ready = s.mode === 'tap' && s.ready && safe(s.ready);
    const lost = state === 'lost', waiting = state === 'wait';
    const text = waiting ? (s.waitText || '잠시만 기다려 주세요…') : s.text;
    const goLabel = s.mode === 'next' ? (s.nextLabel || (last ? '시작하기' : '다음')) : lost ? '다음' : ready ? (s.readyLabel || '다음') : '';
    const key = [G.i, state, text, goLabel, stuck].join('|');
    if (key === G.bsig) return;
    G.bsig = key;
    const skip = G.i === 0 && G.opts.skipLabel !== '';
    G.bubble.innerHTML = `<div class="kg-head"><span class="kg-count">${G.i + 1} / ${n}</span>${skip ? `<button class="link quiet kg-skip">${esc(G.opts.skipLabel || '이미 써 봤어요')}</button>` : ''}</div>
      ${s.title && !waiting ? `<h2 class="kg-title">${esc(s.title)}</h2>` : ''}<p class="kg-text" role="status" aria-live="polite">${esc(text)}</p>
      <div class="kg-act">${stuck && !goLabel ? '<button class="link quiet kg-go">넘어가기</button>' : ''}${goLabel ? `<button class="btn kg-go">${esc(goLabel)}</button>` : ''}</div>`;
  }

  return { run, stop: () => finish(null), running: () => !!G };
})();
