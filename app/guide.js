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
//     typing?: 선택자 | () => 요소          글 칸. 이 칸에 커서가 있는 동안은 "쓰는 중 모드": 어둡게 하는 막과 테두리를 걷고, 말풍선을 보이는 화면 맨 위 얇은 띠로 줄인다
//       typingAlso?: () => 요소들          쓰는 중에도 눌리게 둘 곳(예시 넣어 보기 등. 비춘 곳에 더해진다)
//       typingText?, typingReady?          띠의 글(typingReady는 ready가 참일 때). 띠에는 readyLabel 단추가 붙는다
//       쓰기 단계는 [넘어가기]와 "비출 곳 없음" 안전장치가 없다(빈 칸으로 넘어가 갇히지 않게)
//     nudge?: { ms, when, text }          ms 동안 아무것도 안 했고 when()이 참이면 말풍선 글을 text로 바꾼다(넘어가기 대신 길을 알려 줌)
//     bounce?: () => 글 | ''              글이 있으면 앞 단계로 되돌리고 그 글을 말풍선에 보여 준다(앞 단계에서 글자를 입력하면 사라진다)
//   }
//  둘러보기(mode 'next', then 없음) 단계는 [‹ 이전] [다음 ›]. 앞 단계도 둘러보기일 때만 [이전]이 있다. 누르는 단계(tap)는 머리 줄의 [‹ 이전]이
//  앞 단계 설명만 읽어 보게 하고(읽기만: 한 일을 되돌리거나 다시 시키지 않는다) [돌아가기]로 이 단계에 돌아온다
//  첫 단계에만 "이미 써 봤어요"(skipLabel)가 있다. Esc로는 닫히지 않는다. 비출 곳이 없거나 막혀도 영영 갇히지 않게 안전장치가 있다(timeout, 한참 걸리면 [넘어가기]. 쓰기 단계 제외)
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
    ['pointerdown', 'keydown', 'input', 'focusin'].forEach(t => document.addEventListener(t, onAct, true));
    document.addEventListener('focusout', onOut, true);
    // 키보드가 올라오거나 화면이 밀려도 막과 말풍선이 바로 따라가게(매 프레임 맞추는 것에 더해 바로 한 번 더)
    if (window.visualViewport) ['resize', 'scroll'].forEach(t => visualViewport.addEventListener(t, onView));
    root.addEventListener('click', onBubble);
    // 띠의 단추를 누를 때 글 칸에서 커서가 빠지지 않게(빠지면 키보드가 접히며 화면이 움직여 눌림이 빗나간다)
    ['pointerdown', 'mousedown'].forEach(t => root.addEventListener(t, e => { if (e.target.closest('.kg-bar button')) e.preventDefault(); }));
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
    unfit();
    if (G.s && G.s.typing && document.activeElement && document.activeElement.matches('textarea, input')) document.activeElement.blur(); // 쓰기를 마치면 키보드를 접는다
    if (n >= G.steps.length) return finish(false);
    const s = G.steps[n];
    Object.assign(G, { i: n, s, paused: false, clicked: false, born: Date.now(), act: Date.now(), miss: 0, seen: false, focused: false, els: [], hole: null, bsig: '', lastState: null, peek: false, notice: '', typing: false, keepT: 0, psig: '' });
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
    ['pointerdown', 'keydown', 'input', 'focusin'].forEach(t => document.removeEventListener(t, onAct, true));
    document.removeEventListener('focusout', onOut, true);
    if (window.visualViewport) ['resize', 'scroll'].forEach(t => visualViewport.removeEventListener(t, onView));
    unfit(g);
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

  // 사람이 한 일(누름·입력·글 칸에 들어감)을 적어 둔다: 한참 가만히 있었는지 가늠하는 데 쓴다. 글자를 입력하면 되돌림 안내는 사라진다
  function onAct(e) { if (!G) return; G.act = Date.now(); if (e.type === 'input') G.notice = ''; }
  // 글 칸에서 커서가 빠져도 잠깐은 쓰는 중으로 친다(띠의 단추를 누르는 사이에 띠가 풀리지 않게)
  function onOut(e) { if (G && G.s && G.s.typing && e.target === typingEl()) G.keepT = Date.now() + 300; }
  function onView() { if (G) { G.psig = ''; G.sig = ''; update(); } }
  const lookOnly = s => !!s && s.mode === 'next' && !s.then;
  const typingEl = () => { if (!G || !G.s || !G.s.typing) return null; const t = G.s.typing; return elsOf(typeof t === 'string' ? () => t : t)[0] || null; };

  function onBubble(e) {
    const b = e.target.closest('button'); if (!b || !G) return;
    const s = G.s;
    if (b.classList.contains('kg-skip')) return finish(true);
    // 둘러보기: 앞 둘러보기 단계로. 누르는 단계: 앞 단계 설명만 읽어 본다(한 일은 그대로)
    if (b.classList.contains('kg-prev')) {
      if (s.mode === 'next') return go(G.i - 1, -1);
      G.peek = true; G.bsig = ''; G.focused = false; return;
    }
    if (b.classList.contains('kg-ret')) { G.peek = false; G.bsig = ''; G.focused = false; return; }
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
    update();
  }
  function update() {
    if (!G) return;
    const s = G.s, now = Date.now();
    if (G.paused) { if (safe(s.then)) { document.documentElement.classList.add('kg-on'); go(G.i + 1); } return; }
    if (!G.peek) {
      // 눌러서 하는 단계의 끝: 다 했다는 기준이 참이 되면 넘어간다
      if (s.mode === 'tap' && (s.done ? safe(s.done) : G.clicked)) return go(G.i + 1);
      // 앞 단계로 되돌아가야 할 때(미리보기를 다시 쓰기로 닫았을 때 등)
      if (s.back && G.seen && G.i > 0 && safe(s.back)) return go(G.i - 1, -1);
    }
    const V = view();
    // 화면 크기가 바뀌면(키보드, 가로 세로) 비출 곳이 보이게 다시 끌어온다
    const vs = V.w + 'x' + V.h; if (vs !== G.vs) { G.vs = vs; G.seen = false; }
    Object.assign(G.root.style, { left: V.x + 'px', top: V.y + 'px', width: V.w + 'px', height: V.h + 'px' });
    const ok = !s.wait || safe(s.wait);
    // 이 단계에 꼭 필요한 것이 비었으면 앞 단계로 되돌리고 이유를 알려 준다(빈 칸으로 정리하기를 누르려는 때 등)
    if (!G.peek && s.bounce && ok && G.i > 0) {
      const m = safe(s.bounce);
      if (m) { const to = G.i - 1; go(to, -1); if (G && G.i === to) G.notice = m; return; }
    }
    let els = ok && s.target ? elsOf(s.target) : [];
    // 쓰는 중 모드: 글 칸에 커서가 있는 동안(단계가 정한 칸일 때만)
    const te = !G.peek && els.length ? typingEl() : null;
    const typing = !!te && (document.activeElement === te || now < G.keepT);
    if (typing && s.typingAlso) els = els.concat(elsOf(s.typingAlso).filter(x => !els.includes(x)));
    G.els = els; G.typing = typing;
    let state;
    if (!s.target) state = 'center';
    else if (els.length) { state = 'on'; G.miss = 0; if (!G.seen) { G.seen = true; if (!typing) reveal(els); } }
    else {
      G.miss = G.miss || now;
      // 화면을 다시 그리는 사이에 잠깐 없는 것은 기다린다(깜빡이지 않게)
      if (now - G.miss <= 250) return;
      // 쓰기 단계는 [다음]으로 넘기지 않는다(빈 칸으로 가면 갇힌다)
      state = now - G.miss > (s.timeout || 8000) && !s.typing ? 'lost' : 'wait';
    }
    if (G.peek) state = 'center';
    // 안전장치: 눌러도 안 넘어가는 채로 오래 걸리면 [넘어가기]를 보여 준다(글을 쓰는 단계는 쓰는 동안 시간이 가니 제외)
    paintBubble(state, now - G.born > STUCK && !s.typing, typing);
    layout(state, els, V, typing);
    if (typing) fit(te, V); else unfit();
    if (!G.focused && (state === 'on' || state === 'center' || state === 'lost')) { G.focused = true; focusStart(state, els); }
  }

  // 쓰는 중: 글 칸이 위 띠 바로 아래, 키보드 위에 오게 화면을 맞추고, 칸이 너무 길면 키보드 위에 들어오도록 줄인다(안에서 스크롤)
  function fit(el, V) {
    const want = G.bubble.offsetHeight + 16, top = el.getBoundingClientRect().top - V.y;
    if (G.capEl !== el) { unfit(); G.capEl = el; G.capOld = [el.style.maxHeight, el.style.overflowY]; }
    el.style.maxHeight = Math.max(80, Math.round(V.h - want - 16)) + 'px'; el.style.overflowY = 'auto';
    const d = top - want;
    if (Math.abs(d) <= 3) return;
    // 페이지가 짧아 더 못 올라가면 아래에 잠깐 빈 자리를 깔아서 올라갈 수 있게 한다(쓰기를 마치면 걷는다)
    if (d > 0) {
      const room = document.documentElement.scrollHeight - innerHeight - scrollY;
      if (d > room + 1) { const sp = G.spacer || (G.spacer = Object.assign(document.createElement('div'), { ariaHidden: 'true' })); sp.style.height = Math.round((parseFloat(sp.style.height) || 0) + d - room) + 'px'; if (!sp.isConnected) document.body.appendChild(sp); }
    }
    window.scrollBy({ top: d, behavior: 'instant' });
  }
  function unfit(g = G) {
    if (!g) return;
    if (g.spacer) { g.spacer.remove(); g.spacer = null; }
    if (!g.capEl) return;
    g.capEl.style.maxHeight = g.capOld[0]; g.capEl.style.overflowY = g.capOld[1]; g.capEl = null;
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
    const go = G.bubble.querySelector(G.peek ? '.kg-ret' : '.kg-go');
    const t = !G.peek && G.s.mode === 'tap' && els[0] && els[0].matches('button, a[href]') ? els[0] : null;
    (t || go || G.bubble).focus({ preventScroll: true });
  }

  function layout(state, els, V, typing) {
    const full = state !== 'on', s = G.s;
    // 쓰는 중에는 어둡게 하는 막(full)도 테두리(ring: 그림자가 어둠을 맡는다)도 걷는다. 눌림을 막는 투명 판들은 그대로
    G.full.hidden = !full; G.ring.hidden = full || typing; G.shield.hidden = full || s.mode !== 'next';
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
    place(h, V, typing);
  }

  // 말풍선: 구멍 아래에 들어가면 아래, 아니면 위. 화면 밖으로 나가지 않게 가둔다
  function place(h, V, typing) {
    const psig = [h ? [h.left, h.top, h.width, h.height].map(Math.round).join() : '-', Math.round(V.w), Math.round(V.h), G.bsig].join('|');
    if (psig === G.psig) return;
    G.psig = psig;
    const b = G.bubble, a = G.arrow, M = 12, gap = 14;
    // 쓰는 중: 보이는 화면 맨 위(막 전체가 보이는 화면에 맞춰 있으므로 top 8px이 곧 보이는 화면의 위)에 얇은 띠로
    b.classList.toggle('kg-bar', !!typing);
    if (typing) { b.style.left = '8px'; b.style.top = '8px'; a.hidden = true; return; }
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
  function paintBubble(state, stuck, typing) {
    const s = G.s, n = G.steps.length, last = G.i === n - 1, ready = s.mode === 'tap' && s.ready && safe(s.ready);
    const lost = state === 'lost', waiting = state === 'wait';
    // 글: 되돌림 안내 > 한참 가만히 있을 때의 길잡이 > 단계 글. 앞 설명 보기 중에는 앞 단계 글
    const nd = s.nudge, nudged = !G.notice && nd && Date.now() - G.act > nd.ms && safe(nd.when);
    let text = waiting ? (s.waitText || '잠시만 기다려 주세요…') : G.notice || (nudged ? nd.text : s.text);
    if (G.peek) text = G.steps[G.i - 1].text;
    const look = lookOnly(s), canPrev = G.i > 0 && (look ? lookOnly(G.steps[G.i - 1]) : s.mode === 'tap');
    const goLabel = s.mode === 'next' ? (s.nextLabel || (last ? '시작하기' : '다음 ›')) : lost ? '다음' : ready ? (s.readyLabel || '다음') : '';
    const key = [G.i, state, text, goLabel, stuck, canPrev, G.peek, typing, ready].join('|');
    if (key === G.bsig) return;
    G.bsig = key;
    const skip = G.i === 0 && G.opts.skipLabel !== '';
    if (G.peek) {
      G.bubble.innerHTML = `<div class="kg-head"><span class="kg-count">이전 설명 · ${G.i} / ${n}</span></div>
        <p class="kg-text" role="status" aria-live="polite">${esc(text)}</p>
        <div class="kg-act"><button class="btn kg-ret" aria-label="현재 단계로 돌아가기">돌아가기</button></div>`;
      return;
    }
    if (typing) {
      // 쓰는 중 띠: 한 줄 안내와 [다 썼어요]. 다 쓰기 전에는 단추가 없다
      const bt = ready ? (s.typingReady || '') : (s.typingText || '');
      G.bubble.innerHTML = `<p class="kg-text" role="status" aria-live="polite">${esc(bt || text)}</p>${goLabel ? `<div class="kg-act"><button class="btn kg-go">${esc(goLabel)}</button></div>` : ''}`;
      return;
    }
    const prevBtn = canPrev ? (look ? '<button class="btn ghost kg-prev" aria-label="이전 단계">‹ 이전</button>' : '<button class="link quiet kg-prev" aria-label="이전 단계">‹ 이전</button>') : '';
    const nextAria = s.mode === 'next' && !s.nextLabel && !last ? ' aria-label="다음 단계"' : '';
    G.bubble.innerHTML = `<div class="kg-head"><span class="kg-count">${G.i + 1} / ${n}</span>${skip ? `<button class="link quiet kg-skip">${esc(G.opts.skipLabel || '이미 써 봤어요')}</button>` : ''}${!look && prevBtn ? prevBtn : ''}</div>
      ${s.title && !waiting ? `<h2 class="kg-title">${esc(s.title)}</h2>` : ''}<p class="kg-text" role="status" aria-live="polite">${esc(text)}</p>
      <div class="kg-act">${look ? prevBtn : ''}${stuck && !goLabel ? '<button class="link quiet kg-go">넘어가기</button>' : ''}${goLabel ? `<button class="btn kg-go"${nextAria}>${esc(goLabel)}</button>` : ''}</div>`;
  }

  return { run, stop: () => finish(null), running: () => !!G };
})();
