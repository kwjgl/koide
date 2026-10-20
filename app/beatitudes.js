// 팔복 이스터에그 "여덟 매듭의 복": 기도한 날 8일마다 팔복(마태복음 5:3~10) 하나가 끈에 매듭으로 묶인다. 8개를 다 묶으면 64일이고, 끈이 팽팽해지며 "너희는 세상의 빛이라"(마 5:14)가 나온다
//  어디에도 알리지 않고 숨겨 둔 덤이라 사용법·소개에는 없다. 공동체 화면과 기도 노트가 함께 쓴다. 모양은 beatitudes.css. 소리는 없다
//  원문은 개역개정(저작권이 있는 번역임을 알고 사용자가 정했다), 풀이는 쉬운 말. 묶인 개수는 기도한 날 수에서 바로 셈하므로 따로 저장하지 않는다
//  init({ count }): 로고를 빠르게 8번 누르면 묶음 화면을 연다. count()는 기도한 날 수(또는 그 수를 주는 Promise)
//  open({ n, last }): 묶음 화면. last면 앞 매듭은 이미 묶여 있고 새로 묶인 마지막 매듭만 묶인다
//  gift({ n, key, force }): 기도한 날이 8의 배수가 된 날 한 번 뜨는 작은 카드. key에 '이미 보여 준 날 수'를 기기에 적어 두고(적을 수 없어도 된다), force면 늘 띄운다
//  scene(at): 데모 장면 주소(at=beatitudes · beatitudes8 · beatitudes64)용
window.KoideBeatitudes = (() => {
  const B = [
    ['심령이 가난한 자는 복이 있나니 천국이 그들의 것임이요', '마 5:3', '내 힘으로 안 된다는 것을 아는 사람에게 하나님 나라가 임해요.'],
    ['애통하는 자는 복이 있나니 그들이 위로를 받을 것임이요', '마 5:4', '슬퍼하며 우는 사람을 하나님이 직접 위로하세요.'],
    ['온유한 자는 복이 있나니 그들이 땅을 기업으로 받을 것임이요', '마 5:5', '부드럽고 겸손한 사람이 결국 땅을 물려받아요.'],
    ['의에 주리고 목마른 자는 복이 있나니 그들이 배부를 것임이요', '마 5:6', '옳은 일을 간절히 바라는 사람은 그 바람이 이루어져요.'],
    ['긍휼히 여기는 자는 복이 있나니 그들이 긍휼히 여김을 받을 것임이요', '마 5:7', '남을 불쌍히 여기는 사람은 하나님께 불쌍히 여김을 받아요.'],
    ['마음이 청결한 자는 복이 있나니 그들이 하나님을 볼 것임이요', '마 5:8', '마음이 깨끗한 사람은 하나님을 뵈어요.'],
    ['화평하게 하는 자는 복이 있나니 그들이 하나님의 아들이라 일컬음을 받을 것임이요', '마 5:9', '사람들 사이의 평화를 이루는 사람은 하나님의 자녀라 일컬어져요.'],
    ['의를 위하여 박해를 받은 자는 복이 있나니 천국이 그들의 것임이라', '마 5:10', '옳은 일 때문에 괴로움을 당하는 사람에게 하나님 나라가 임해요.']
  ];
  const FIN = ['너희는 세상의 빛이라', '마 5:14'], ORD = ['첫째', '둘째', '셋째', '넷째', '다섯째', '여섯째', '일곱째', '여덟째'], RND = ['', '', '두 번째', '세 번째', '네 번째', '다섯 번째'];
  const STEP = 1100, N = 8, W = 360, Y = 38, X = k => 26 + k * (W - 52) / (N - 1);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const still = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  // 기도한 날 n일 → 매듭: 8일마다 하나, 한 바퀴(64일)가 차면 다음 바퀴가 처음부터. full은 한 바퀴의 여덟 매듭이 다 묶인 때(64일, 128일…)
  const calc = n => { n = Math.max(0, Math.floor(n) || 0); const k = Math.floor(n / 8); return { n, k, t: k ? (k - 1) % 8 + 1 : 0, round: k ? Math.floor((k - 1) / 8) + 1 : 1, full: k > 0 && k % 8 === 0 }; };
  const X_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  // 매듭 모양은 소개 영상(intro-video.js)의 KNOT과 같은 꼴
  const KNOT = '<circle cx="16" cy="16" r="15" class="bt-kbg"/><path d="M2 16H8.5C11 16 12 13 12 10.5C12 6.5 14.5 4 18 4S24 6.5 24 10.2 21 16 16.5 16.4"/><path d="M11 19.2C15 17 19 16 30 16"/>';

  let el = null, gf = null, S = null, O = {}, timer = 0, opener = null, tied = -1, sel = -1, fin = false;

  // ── 묶음 화면 ──
  function cord() {
    let s = `<path class="bt-end" d="M4 ${Y}H${X(0) - 14}M${X(N - 1) + 14} ${Y}H${W - 4}"/>`;
    for (let k = 0; k < N - 1; k++) {
      const a = X(k), b = X(k + 1);
      s += `<g class="bt-seg"><path class="loose" d="M${a} ${Y}Q${(a + b) / 2} ${Y + 14} ${b} ${Y}"/><path class="taut" d="M${a} ${Y}H${b}"/></g>`;
    }
    for (let k = 0; k < N; k++) s += `<g class="bt-k" data-k="${k}"><circle class="bt-slot" cx="${X(k)}" cy="${Y}" r="17"/><g transform="translate(${X(k) - 16} ${Y - 16})"><g class="bt-kn">${KNOT}</g></g><text x="${X(k)}" y="${Y + 36}" text-anchor="middle">${k + 1}</text></g>`;
    return `<svg class="bt-cord" viewBox="0 0 ${W} ${Y + 44}" aria-hidden="true">${s}</svg>`;
  }
  function line() {
    if (sel < 0) return `<p class="bt-hint">${S.t ? '매듭이 하나씩 묶여요' : '8일마다 하나씩 묶여요'}</p>`;
    if (sel >= S.t) return `<p class="bt-ref">${ORD[sel]} 매듭</p><p class="bt-hint">아직 묶이지 않았어요</p><p class="bt-plain">8일마다 하나씩 묶여요.</p>`;
    const [text, ref, plain] = B[sel];
    return `<p class="bt-ref">${ORD[sel]} 매듭 · ${ref}</p><p class="bt-text">${esc(text)}</p><p class="bt-plain">${esc(plain)}</p>`;
  }
  function sync(fresh) {
    if (!el) return;
    el.querySelectorAll('.bt-k').forEach((g, k) => {
      g.classList.toggle('tied', k <= tied); g.classList.toggle('sel', k === sel); g.classList.toggle('lock', k >= S.t);
      g.querySelector('.bt-kn').classList.toggle('fresh', k === fresh);
    });
    el.querySelectorAll('.bt-seg').forEach((g, k) => g.classList.toggle('on', fin || k + 1 <= tied));
    el.classList.toggle('taut', fin);
    el.querySelector('.bt-line').innerHTML = line();
    const f = el.querySelector('.bt-fin');
    f.hidden = !fin; f.classList.toggle('fresh', fin && !still());
  }
  const foot = () => `기도한 지 ${S.n}일째예요${S.t || S.n ? ` · 다음 매듭까지 ${8 - S.n % 8}일` : ''}`;
  // 한 칸 앞으로: 아직 안 묶인 매듭이 있으면 묶고, 다 묶였으면 둘러보다가 끈이 팽팽해지고(한 바퀴가 찼을 때), 처음으로 돌아간다
  function next() {
    if (tied + 1 < S.t) { tied = sel = tied + 1; sync(tied); }
    else if (sel < S.t - 1) { sel++; sync(); }
    else if (S.full && !fin) { fin = true; sync(); }
    else if (!S.full && sel === S.t - 1 && S.t < N) { sel = S.t; sync(); }
    else if (S.t) { sel = 0; sync(); }
  }
  function step() {
    if (!el) return;
    if (tied + 1 < S.t) { next(); timer = setTimeout(step, STEP); }
    else if (S.full && !fin) { next(); }
  }
  function close() {
    if (!el) return;
    clearTimeout(timer); el.remove(); el = null; document.documentElement.classList.remove('bt-open');
    document.removeEventListener('keydown', onKey, true);
    const o = opener && opener.isConnected ? opener : document.querySelector('.brand'); if (o) o.focus();
  }
  function onKey(e) {
    if (!el) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'Tab') { e.preventDefault(); el.querySelector('[data-bt=x]').focus(); }
    else if (e.key === 'ArrowRight' || ((e.key === 'Enter' || e.key === ' ') && !(e.target.closest && e.target.closest('button')))) { e.preventDefault(); clearTimeout(timer); next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); clearTimeout(timer); if (sel > 0) { sel--; sync(); } }
  }
  function open(o) {
    if (el) close();
    closeGift();
    O = o || {}; S = calc(O.n); opener = document.activeElement;
    tied = O.last ? S.t - 2 : -1; sel = O.last ? S.t - 2 : -1; fin = false;
    el = document.createElement('div');
    el.className = 'bt'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', '여덟 매듭의 복');
    el.innerHTML = `<div class="bt-top"><span class="bt-title">여덟 매듭의 복${RND[S.round] ? ' · ' + RND[S.round] + ' 묶음' : ''}</span><button class="bt-x" data-bt="x" aria-label="닫기">${X_ICON}</button></div>
      <div class="bt-stage" data-bt="stage"><div class="bt-body">${cord()}<div class="bt-line" aria-live="polite"></div>
        <div class="bt-fin" hidden><p class="bt-ref">여덟 매듭이 다 묶였어요 · ${FIN[1]}</p><p class="bt-light">${FIN[0]}</p></div></div></div>
      <p class="bt-foot">${foot()}<br><small>${S.t < N || !S.full ? '화면을 누르면 다음 매듭으로 넘어가요' : '화면을 누르면 처음부터 다시 볼 수 있어요'}</small></p>`;
    el.addEventListener('click', e => {
      if (e.target.closest('[data-bt=x]')) return close();
      clearTimeout(timer);
      const g = e.target.closest('[data-k]');
      if (g) { const k = Number(g.dataset.k); if (k <= tied || k >= S.t) { sel = k; sync(); } else { while (tied < k) next(); } }
      else next();
    });
    document.body.appendChild(el); document.documentElement.classList.add('bt-open');
    document.addEventListener('keydown', onKey, true);
    el.querySelector('[data-bt=x]').focus();
    if (still()) { tied = S.t - 1; sel = S.t - 1; fin = S.full; sync(); }
    else { sync(); timer = setTimeout(step, 500); }
  }

  // ── 선물 카드: 기도한 날이 8의 배수가 된 날, 화면 아래에 한 번 ──
  function closeGift() { if (gf) { gf.remove(); gf = null; } }
  function gift(o) {
    const s = calc(o && o.n);
    if (!s.k || s.n % 8) return;
    if (!o.force && o.key) { try { if (localStorage.getItem(o.key) === String(s.n)) return; } catch (e) { /* 적지 못해도 괜찮아요 */ } }
    if (o.key) { try { localStorage.setItem(o.key, String(s.n)); } catch (e) { /* 이번만 */ } }
    closeGift();
    const [text, ref, plain] = B[s.t - 1];
    gf = document.createElement('section');
    gf.className = 'bt-gift'; gf.setAttribute('role', 'region'); gf.setAttribute('aria-label', '기도한 날 선물');
    gf.innerHTML = `<p class="bt-g-day">기도한 지 ${s.n}일째예요</p>
      <p class="bt-ref">${ORD[s.t - 1]} 매듭이 묶였어요 · ${ref}</p><p class="bt-text">${esc(text)}</p><p class="bt-plain">${esc(plain)}</p>
      ${s.full ? '<p class="bt-plain bt-g-full">여덟 매듭이 다 묶여 끈이 팽팽해졌어요.</p>' : ''}
      <div class="bt-g-btns"><button class="btn" data-bt="go">묶음 보기</button><button class="btn ghost" data-bt="no">닫기</button></div>`;
    gf.addEventListener('click', e => {
      const b = e.target.closest('[data-bt]'); if (!b) return;
      if (b.dataset.bt === 'go') open({ n: s.n, last: !still() });
      else closeGift();
    });
    document.body.appendChild(gf);
  }

  // ── 로고를 빠르게 8번: 누르는 사이가 1.2초 안이어야 이어서 센다. 화면이 다시 그려져도 세는 값은 여기(모듈)에 있다 ──
  let taps = 0, lastTap = 0, cnt = null;
  function wiggle() {
    if (still()) return;
    setTimeout(() => { const m = document.querySelector('.brand-mark'); if (!m) return; m.classList.remove('bt-wig'); void m.offsetWidth; m.classList.add('bt-wig'); setTimeout(() => m.classList.remove('bt-wig'), 800); }, 40);
  }
  function tap(brand) {
    const now = Date.now();
    taps = now - lastTap <= 1200 ? taps + 1 : 1; lastTap = now;
    if (taps >= 3 && taps < 8) wiggle();
    if (taps < 8) return;
    taps = 0;
    if (!cnt) return;
    opener = brand;
    Promise.resolve().then(cnt).then(n => { if (typeof n === 'number') open({ n }); }).catch(() => {});
  }
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('.brand'); if (b) tap(b); }, true);

  // 데모 장면: 28일(매듭 셋) · 24일째 선물 카드 · 64일(끈이 팽팽해짐)
  function scene(at) {
    if (at === 'beatitudes') open({ n: 28 });
    else if (at === 'beatitudes8') gift({ n: 24, force: true });
    else if (at === 'beatitudes64') open({ n: 64 });
    else return false;
    return true;
  }
  return { init: o => { cnt = o && o.count || null; }, open, gift, scene, close, calc, lines: B };
})();
