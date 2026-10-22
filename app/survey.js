/*
 * 시범 설문 팝업 카드 (공동체 index.html · 기도 노트 note.html이 함께 쓴다)
 *
 * 시작한 지 3·7·14일째에 공동체 '이번 달' / 기도 노트 '오늘' 화면이 그려진 1.5초 뒤 화면 위에 카드를 띄운다(앱을 연 뒤 한 번만).
 *  휴대폰은 아래에서 올라오고 넓은 화면은 가운데. 한 장에 한 문항(n / N)이고 [이전] [다음], 마지막 장에서 [보내기]. UEQ-S 8줄은 한 장에 그대로 둔다.
 *  나중에 / 그만 묻기는 모든 장 아래에 있다. ✕·Esc·바깥을 눌러 닫으면 '나중에'와 같다: 내일 다시 묻고, 같은 회차에서 두 번째 나중에는 그 회차를 건너뛴다.
 *  안내(둘러보기)가 도는 중이거나 이번에 돌았거나, 기도하기·다른 창이 떠 있으면 띄우지 않는다.
 * 진행(마쳤나·나중에·그만 묻기, 답은 없음)은 사람을 따라간다: 기도 노트는 노트 기록(D.survey, 동기화로 기기 사이에 합쳐짐), 공동체는 서버 '연결' 탭의 '설문 진행' 칸(서버가 옛 버전이면 이 기기에만).
 * 문항은 아래 ROUNDS 한 곳에 있다. 문항을 바꾸면 서버(apps-script/Code.js)의 SURVEY_ 허용 목록도 같은 키로 맞춘다(키와 값만, 글은 서버에 없다).
 * 보내는 것: 고른 답, 쓴 글(선택), 그리고 사용자가 '숫자도 함께 보내기'를 켰을 때만 숫자 몇 가지(시범 '해 볼 일'에 함께하면 해 본 항목의 이름표도). 기도 내용은 어디에도 담지 않는다.
 *
 * 14일째의 첫 문항은 표준 척도 UEQ-S(User Experience Questionnaire 짧은판, 8문항, 7점)이다. 낱말·순서·방향은 UEQ 공식 사이트(https://www.ueq-online.org)의
 *  공식 한국어판(Material/UEQ_All_Languages.zip의 UEQ_Korean.pdf, UEQS_Items.pdf의 Korean version)을 그대로 쓴다. 낱말을 바꾸거나 문항을 빼지 않는다
 *  (공식 안내가 권하지 않는다). 공식 사이트는 자료를 무료로 제공한다. 인용: Schrepp, M., Hinderks, A., & Thomaschewski, J. (2017). Design and Evaluation of a Short Version of
 *  the User Experience Questionnaire (UEQ-S). International Journal of Interactive Multimedia and Artificial Intelligence, 4(6), 103-108. / Laugwitz, B., Held, T., & Schrepp, M. (2008). Construction and Evaluation of a User Experience Questionnaire.
 *  UEQ-S에서는 8문항 모두 왼쪽이 부정, 오른쪽이 긍정이라 좌우가 섞인 문항이 없다. 1~4번이 실용성, 5~8번이 감성이고, 점수는 (답 − 4)로 −3~+3으로 바꿔 계산한다(서버 surveyAdmin_).
 */
(function () {
  // 문항. t: face(얼굴 넷) · pick(하나 고르기) · multi(여러 개) · text(글, 선택) · ueq(UEQ-S 8줄, 7칸)
  //  only: 'note' | 'community' 이면 그쪽에서만 묻는다
  // UEQ-S 공식 한국어판 8문항: [왼쪽(부정), 오른쪽(긍정)]. 1~4 실용성, 5~8 감성. 영어 원문: obstructive/supportive, complicated/easy, inefficient/efficient, confusing/clear,
  //  boring/exciting, not interesting/interesting, conventional/inventive, usual/leading edge
  const UEQS = [['어려움', '쉬움'], ['복잡함', '간단함'], ['비효율적', '효율적'], ['명백하지 않음', '명백함'], ['지루함', '흥미로움'], ['재미없음', '재미있음'], ['상투적', '독창적'], ['통상적', '모더니즘적']];
  const ROUNDS = {
    3: { title: '써 보니 어때요?', qs: [
      { k: 'mood', t: 'face', q: '써 보니 어때요?', o: [['bad', '😟', '아쉬워요'], ['soso', '😐', '그저 그래요'], ['good', '🙂', '괜찮아요'], ['great', '😊', '좋아요']] },
      { k: 'stuck', t: 'text', q: '막히거나 헷갈린 곳이 있었나요? (선택)' }
    ] },
    7: { title: '일주일 써 본 느낌', qs: [
      { k: 'amount', only: 'note', t: 'pick', q: '하루에 기도 3개씩은 어때요?', o: [['few', '적어요'], ['fit', '알맞아요'], ['many', '많아요']] },
      { k: 'easy', only: 'community', t: 'pick', q: '내 기도 쓰기가 쉬웠나요?', o: [['yes', '네'], ['soso', '보통'], ['hard', '어려워요']] },
      { k: 'liked', t: 'multi', q: '가장 좋았던 것을 골라 주세요 (여러 개)', o: [['cord', '기도의 끈'], ['art', '이달의 그림'], ['answer', '응답 기록'], ['pray', '기도하기와 음악'], ['share', '나누기']] },
      { k: 'wish', t: 'text', q: '바라는 점이 있나요? (선택)' }
    ] },
    14: { title: '두 주 써 본 느낌', qs: [
      { k: 'ueq', t: 'ueq', q: '코이데를 써 본 느낌에 가까운 곳을 한 줄에 하나씩 눌러 주세요', items: UEQS },
      { k: 'keep', t: 'pick', q: '계속 쓸 것 같나요?', o: [['yes', '네'], ['maybe', '아마도'], ['no', '아니요']] },
      { k: 'recommend', t: 'pick', q: '친구에게 권하고 싶나요?', o: [['yes', '네'], ['maybe', '아마도'], ['no', '아니요']] },
      { k: 'want', t: 'text', q: '있었으면 하는 것이 있나요? (선택)' }
    ] }
  };
  const DAYS = [14, 7, 3];       // 큰 쪽부터 본다
  const GRACE = 4;               // N일째부터 N+4일째까지 보인다(그날 못 열어도 이틀쯤은 기다린다)
  // 보내는 숫자의 이름. 값은 쓰는 쪽 페이지가 고른다
  const NUMS = { days: ['기도한 날', v => v + '일'], items: ['기도제목', v => v + '개'], thanks: ['감사 기록', v => v + '개'], app: ['홈 화면 앱', v => v ? '예' : '아니요'], vault: ['이어 두기', v => v ? '예' : '아니요'] };

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const iso = d => { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
  const dayDiff = (a, b) => Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 864e5);
  const addDays = (s, n) => iso(new Date(Date.parse(s + 'T12:00:00') + n * 864e5));
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  let O = null, ST = fresh(), draft = null, cur = null, busy = false, err = '', thanks = false, test = 0, shown = false, timer = 0, tries = 0, root = null, back = null, lastRaw = null, closeT = 0;

  // ── 진행 상태: { first: 처음 연 날, off: 그만 묻기, r: { '<where><n>': { st: 'done'|'skip', later: 1, until: 'yyyy-mm-dd' } }, num: 숫자도 보내기를 켰었는지 } ──
  //  답은 여기에 없다(어느 문항을 마쳤는지만). 기도 노트는 노트 기록(D.survey)에, 공동체는 이 기기(localStorage)와 서버 '연결' 탭의 '설문 진행' 칸에 둔다
  function fresh() { return { first: '', off: false, r: {}, num: false }; }
  function norm(v) { const s = fresh(); if (v && typeof v === 'object') { if (DATE_RE.test(v.first)) s.first = v.first; s.off = v.off === true; s.num = v.num === true; if (v.r && typeof v.r === 'object') Object.keys(v.r).forEach(k => { if (v.r[k] && typeof v.r[k] === 'object') s.r[k] = Object.assign({}, v.r[k]); }); } return s; }
  // 가장 마침에 가까운 쪽을 남긴다: 보냄 > 건너뜀·그만 > 나중에(나중에끼리는 더 늦은 날). 처음 연 날은 더 이른 쪽, 그만 묻기는 어느 한쪽이라도 켜졌으면 켜진 채
  const rank = e => !e ? 0 : e.st === 'done' ? 3 : e.st === 'skip' ? 2 : e.later || e.until ? 1 : 0;
  function merge(a, b) {
    a = norm(a); b = norm(b);
    const out = fresh();
    out.first = a.first && b.first ? (a.first < b.first ? a.first : b.first) : a.first || b.first;
    out.off = a.off || b.off; out.num = a.num || b.num;
    Object.keys(Object.assign({}, a.r, b.r)).forEach(k => {
      const x = a.r[k], y = b.r[k], rx = rank(x), ry = rank(y);
      out.r[k] = rx > ry ? x : ry > rx ? y : rx === 1 ? ((x.until || '') >= (y.until || '') ? x : y) : x || y;
    });
    return out;
  }
  // 서버로 가는 모양(공동체만): 답도 보낸 시각도 없이 진행만. 보냄 'sent' · 건너뜀 'skip' · 나중에 'later:날짜'
  function toWire(st) {
    const o = {}; if (st.first) o.first = st.first; if (st.off) o.off = true;
    DAYS.forEach(n => { const e = st.r[O.where + n]; if (!e) return; if (e.st === 'done') o[O.where + n] = 'sent'; else if (e.st === 'skip') o[O.where + n] = 'skip'; else if (e.until) o[O.where + n] = 'later:' + e.until; });
    return o;
  }
  function fromWire(raw) {
    let o = raw; if (typeof raw === 'string') { try { o = JSON.parse(raw || 'null'); } catch (e) { o = null; } }
    const st = fresh(); if (!o || typeof o !== 'object') return st;
    if (DATE_RE.test(o.first)) st.first = o.first; st.off = o.off === true;
    DAYS.forEach(n => { const k = O.where + n, v = o[k]; if (v === 'sent') st.r[k] = { st: 'done' }; else if (v === 'skip') st.r[k] = { st: 'skip' }; else if (typeof v === 'string' && /^later:\d{4}-\d{2}-\d{2}$/.test(v)) st.r[k] = { later: 1, until: v.slice(6) }; });
    return st;
  }
  function load() {
    let local = null; try { local = JSON.parse(localStorage.getItem(O.key) || 'null'); } catch (e) { /* 처음 */ }
    if (O.store) {
      // 기도 노트: 노트 기록이 기준이다. 예전에 이 기기에만 있던 진행은 노트 기록으로 옮기고 이 기기 칸은 비운다
      const base = O.store.get();
      if (local && typeof local === 'object') { ST = merge(base, local); O.store.set(ST); try { localStorage.removeItem(O.key); } catch (e) { /* 다음에 */ } }
      else ST = norm(base);
    } else ST = norm(local);
  }
  function save(quiet) {
    if (test) return;
    if (O.store) O.store.set(ST);
    else { try { localStorage.setItem(O.key, JSON.stringify(ST)); } catch (e) { /* 이번만 */ } if (!quiet && O.persist) O.persist(toWire(ST)); }
  }
  const today = () => (O.today ? O.today() : iso(new Date()));

  // opts: { where: 'note'|'community', key, api(action, data), start(): 'yyyy-mm-dd'|'', nums(): {...}, ver, demo, today(),
  //   can(): 지금 화면이 설문을 띄울 화면인지, ready(): 아직 맞추는 중이면 false(기도 노트 동기화),
  //   store: { get(), set(st) } 진행을 노트 기록에 두는 쪽(기도 노트), persist(wire) 진행을 서버에 올리는 쪽(공동체) }
  function init(opts) {
    O = opts; load();
    // 데모에서만: 주소에 survey=3|7|14를 붙이면 그 날짜째인 것처럼 카드를 연다(보낸 기록은 남기지 않는다)
    if (O.demo) { const n = Number(new URLSearchParams(location.search).get('survey')); if (DAYS.indexOf(n) >= 0) test = n; }
    if (!ST.first) { ST.first = today(); save(); }
  }
  // 다른 기기에서 맞춘 진행을 다시 읽는다(기도 노트가 동기화로 노트 기록을 합친 뒤)
  function reload() { if (O && O.store) ST = norm(O.store.get()); }
  // 공동체: 서버가 알려 준 진행(me.survey)을 이 기기 것과 합친다. undefined면 서버가 옛 버전이라 이 기기 것만 쓴다. 이 기기가 더 앞서 있으면 서버에도 올린다
  function adopt(raw) {
    if (!O || O.store || raw === undefined || raw === null || raw === lastRaw) return;
    lastRaw = raw;
    const rm = fromWire(raw); ST = merge(ST, rm);
    // 서버에 없는 진행이 이 기기에 있을 때만 서버에 올린다(같으면 이 기기에만 적는다)
    save(JSON.stringify(toWire(ST)) === JSON.stringify(toWire(rm)));
  }

  // 지금 보여 줄 라운드(없으면 null). startISO: 쓰는 쪽이 아는 시작일(없으면 처음 연 날)
  function pick(startISO) {
    if (!O || ST.off) return null;
    const t = today(), start = test ? addDays(t, -(test - 1)) : startISO || ST.first, no = dayDiff(t, start) + 1;
    for (const n of DAYS) {
      if (no < n) continue;
      const s = test ? null : ST.r[O.where + n];
      if (s && (s.st === 'done' || s.st === 'skip')) return null;
      if (s && s.until && s.until > t) return null;
      if (no <= n + GRACE) return n;
    }
    return null;
  }
  const qsOf = n => ROUNDS[n].qs.filter(q => !q.only || q.only === O.where);
  // 한 장에 한 문항. UEQ-S 8줄은 한 문항이라 한 장에 그대로 둔다(공식 안내: 나누거나 바꾸지 않는다)
  const pagesOf = n => qsOf(n).map(q => [q.k]);

  // ── 언제 띄우나: 쓰는 쪽이 '지금 설문 화면'(can)이라고 하는 화면이 그려진 지 1.5초 뒤, 앱을 연 뒤 한 번만. 안내(둘러보기)·기도하기·다른 창이 떠 있으면 띄우지 않는다 ──
  function blocked() {
    const kg = window.KoideGuide; if (kg && (kg.running() || (kg.ran && kg.ran()))) return true;
    if (document.documentElement.classList.contains('booting')) return true;
    return !!document.querySelector('.pop:not([hidden]), .sheet-back, .pss:not([hidden]), .ps, .gbig, .wbig, .bigview, .kg, .fx-kusu, .tg-tip, #bigv:not(:empty)');
  }
  function schedule() {
    if (!O || shown || cur || timer || !O.can) return;
    if (!O.can() || !pick(O.start ? O.start() : '')) return;
    tries = 0; timer = setTimeout(() => { timer = 0; attempt(); }, 1500);
  }
  function attempt() {
    if (shown || cur || !O.can() || blocked()) return;       // 다음에 화면이 그려질 때 다시 본다
    if (O.ready && !O.ready()) { if (++tries < 20) timer = setTimeout(() => { timer = 0; attempt(); }, 1000); return; }
    const n = pick(O.start ? O.start() : ''); if (!n) return;
    open(n);
  }

  function open(n) {
    shown = true; cur = n; draft = { a: {}, num: !!ST.num, page: 0 }; err = ''; thanks = false; busy = false;
    back = document.activeElement;
    root = document.createElement('div'); root.id = 'sv-pop'; root.className = 'svp';
    root.innerHTML = '<div class="svp-scrim" data-sv="close"></div><section class="svp-card" id="sv-card" role="dialog" aria-modal="true" aria-labelledby="svp-t" tabindex="-1"></section>';
    document.body.appendChild(root); document.body.classList.add('svp-open');
    document.addEventListener('keydown', onKey, true);
    paint(); const h = document.getElementById('svp-t'); if (h) h.focus();
  }
  function close(kind) {
    clearTimeout(closeT);
    if (kind === 'later' && cur) { const s = ST.r[O.where + cur] || {}; mark(cur, s.later ? { st: 'skip' } : { later: 1, until: addDays(today(), 1) }); }
    cur = null; thanks = false; busy = false;
    document.removeEventListener('keydown', onKey, true);
    if (root) root.remove(); root = null; document.body.classList.remove('svp-open');
    try { if (back && back.isConnected && back.focus) back.focus(); } catch (e) { /* 무시 */ }
    back = null;
  }
  function onKey(e) {
    if (!root) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (!busy) close(thanks ? '' : 'later'); return; }
    if (e.key !== 'Tab') return;
    // 창 안에서만 돈다
    const f = [...root.querySelectorAll('button:not([disabled]), textarea, [tabindex="0"]')].filter(x => x.offsetWidth || x.offsetHeight);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1], a = document.activeElement;
    if (!root.contains(a) || a === root.querySelector('.svp-card')) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
    else if (e.shiftKey && (a === first || a === document.getElementById('svp-t'))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
  }

  // 눌러도 다시 그려도 손가락이 있던 단추에 포커스가 남게
  function paint(toTop) {
    const card = document.getElementById('sv-card'); if (!card || !cur) return;
    const a = document.activeElement, keep = !toTop && a && card.contains(a) && a.dataset && a.dataset.sv ? `[data-sv="${a.dataset.sv}"]${a.dataset.k ? `[data-k="${a.dataset.k}"]` : ''}${a.dataset.v ? `[data-v="${a.dataset.v}"]` : ''}` : '';
    card.innerHTML = thanks ? `<p class="svc-thanks" role="status">보냈어요. 고마워요 🙏</p>` : body(cur);
    if (toTop) { card.scrollTop = 0; const h = document.getElementById('svp-t'); if (h) h.focus(); }
    else if (keep) { const el = card.querySelector(keep); if (el && !el.disabled) el.focus(); }
  }
  function body(n) {
    const R = ROUNDS[n], nums = O.nums ? O.nums() : {};
    let numLine = Object.keys(nums).filter(k => NUMS[k] && nums[k] !== undefined).map(k => NUMS[k][0] + ' ' + NUMS[k][1](nums[k])).join(' · ');
    // 시범 '해 볼 일'(pilot.js)에 함께하는 사람은 해 본 일의 수도 같은 스위치에 든다(보내는 것은 해 본 항목의 이름표뿐, 날짜·기도 내용 없음)
    const pl = window.KoidePilot && KoidePilot.keys();
    if (pl) numLine += (numLine ? ' · ' : '') + '해 본 일 ' + pl.length + '가지';
    const pages = pagesOf(n), last = draft.page >= pages.length - 1;
    const qs = qsOf(n).filter(q => pages[draft.page].indexOf(q.k) >= 0).map(q => {
      const v = draft.a[q.k];
      let ctl = '';
      if (q.t === 'face') ctl = `<div class="svc-faces" role="radiogroup" aria-label="${esc(q.q)}">${q.o.map(([val, em, l]) => `<button type="button" class="svc-face${v === val ? ' on' : ''}" role="radio" aria-checked="${v === val}" data-sv="ans" data-k="${q.k}" data-v="${val}"><span aria-hidden="true">${em}</span><small>${l}</small></button>`).join('')}</div>`;
      else if (q.t === 'pick') ctl = `<div class="svc-seg" role="radiogroup" aria-label="${esc(q.q)}">${q.o.map(([val, l]) => `<button type="button" class="${v === val ? 'on' : ''}" role="radio" aria-checked="${v === val}" data-sv="ans" data-k="${q.k}" data-v="${val}">${l}</button>`).join('')}</div>`;
      else if (q.t === 'ueq') { const u = draft.a.ueq || {}, got = Object.keys(u).length; ctl = `<div class="svc-ueq">${q.items.map(([l, r], i) => `<div class="svc-ur" role="radiogroup" aria-label="${esc(l)} ↔ ${esc(r)}"><div class="svc-uw"><span>${esc(l)}</span><span>${esc(r)}</span></div><div class="svc-ud">${[1, 2, 3, 4, 5, 6, 7].map(m => `<button type="button" class="${u[i + 1] === m ? 'on' : ''}" role="radio" aria-checked="${u[i + 1] === m}" aria-label="${m}번째 칸" data-sv="ueq" data-k="${i + 1}" data-v="${m}"></button>`).join('')}</div></div>`).join('')}</div><p class="svc-hint">${got} / ${q.items.length}줄 · 오래 생각하지 말고 처음 느낌대로 눌러 주세요</p>`; }
      else if (q.t === 'multi') ctl = `<div class="svc-chips">${q.o.map(([val, l]) => { const on = (v || []).indexOf(val) >= 0; return `<button type="button" class="${on ? 'on' : ''}" aria-pressed="${on}" data-sv="multi" data-k="${q.k}" data-v="${val}">${l}</button>`; }).join('')}</div>`;
      else ctl = `<textarea class="svc-text" rows="3" maxlength="200" data-svt="${q.k}" aria-label="${esc(q.q)}" placeholder="기도제목은 적지 말아 주세요">${esc(v || '')}</textarea>`;
      return `<div class="svc-q">${q.q === R.title ? '' : `<p class="svc-ql">${esc(q.q)}</p>`}${ctl}</div>`;
    }).join('');
    return `<div class="svp-top"><p class="svc-eye">${n}일차 설문조사</p><span class="svp-pg" aria-label="${pages.length}장 중 ${draft.page + 1}장">${draft.page + 1} / ${pages.length}</span><button type="button" class="svp-x" data-sv="close" aria-label="닫기"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
      <h2 id="svp-t" tabindex="-1">${esc(R.title)}</h2>${qs}
      ${numLine && last ? `<div class="svc-num"><div><b>숫자도 함께 보내기</b><small>${draft.num ? '보내는 숫자: ' + esc(numLine) : '켜면 이 숫자만 함께 가요: ' + esc(numLine)}</small></div>
        <button type="button" class="svc-sw${draft.num ? ' on' : ''}" role="switch" aria-checked="${draft.num}" aria-label="숫자도 함께 보내기" data-sv="num"><span></span></button></div>` : ''}
      ${err ? `<p class="svc-err" role="alert">${esc(err)}</p>` : ''}
      <div class="svc-act svp-nav">${draft.page ? '<button type="button" class="svp-prev" data-sv="prev">이전</button>' : '<span></span>'}${last ? `<button type="button" class="svc-send" data-sv="send"${busy ? ' disabled' : ''}>${busy ? '보내는 중…' : '보내기'}</button>` : '<button type="button" class="svc-send" data-sv="next">다음</button>'}</div>
      <div class="svp-quiet"><button type="button" class="svc-ghost" data-sv="later">나중에</button><button type="button" class="svc-ghost" data-sv="off">그만 묻기</button></div>
      <p class="svc-hint svp-note">기도 내용과 이름은 보내지 않아요.</p>`;
  }

  function mark(n, v) { ST.r[O.where + n] = Object.assign(ST.r[O.where + n] || {}, v); save(); }
  async function send() {
    if (busy || !cur) return;
    const n = cur, answers = {};
    qsOf(n).forEach(q => { const v = draft.a[q.k]; if (q.t === 'text' ? String(v || '').trim() : q.t === 'ueq' ? Object.keys(v || {}).length : Array.isArray(v) ? v.length : v) answers[q.k] = typeof v === 'string' ? v.trim() : v; });
    if (!Object.keys(answers).length) { err = '하나라도 골라 주세요.'; return paint(); }
    busy = true; err = ''; paint();
    try {
      const body = { where: O.where, day: n, answers, width: innerWidth < 640 ? 'phone' : innerWidth < 1024 ? 'tablet' : 'pc', ver: O.ver || '' };
      if (draft.num && O.nums) body.nums = O.nums();
      if (draft.num && window.KoidePilot && KoidePilot.keys()) body.pilot = KoidePilot.keys();
      await O.api('sendSurvey', body);
      ST.num = draft.num; mark(n, { st: 'done' }); busy = false; thanks = true; paint();
      closeT = setTimeout(() => close(''), 2200);
    } catch (e) {
      busy = false; err = e && e.code === 'busy' ? e.message : e && /모르는 요청/.test(e.message || '') ? '서버가 아직 새 버전이 아니에요. 관리자에게 알려 주세요.' : '보내지 못했어요. 잠시 뒤 다시 눌러 주세요.'; paint();
    }
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-sv]'); if (!b || !O || !cur || !root || !root.contains(b)) return;
    const a = b.dataset.sv, k = b.dataset.k, v = b.dataset.v;
    if (busy && a !== 'send') return;
    if (a === 'ans') { draft.a[k] = draft.a[k] === v ? '' : v; err = ''; return paint(); }
    if (a === 'multi') { const l = draft.a[k] || (draft.a[k] = []), i = l.indexOf(v); i >= 0 ? l.splice(i, 1) : l.push(v); err = ''; return paint(); }
    if (a === 'num') { draft.num = !draft.num; return paint(); }
    if (a === 'ueq') { const u = draft.a.ueq || (draft.a.ueq = {}); if (u[k] === Number(v)) delete u[k]; else u[k] = Number(v); err = ''; return paint(); }
    if (a === 'next' || a === 'prev') { draft.page += a === 'next' ? 1 : -1; err = ''; return paint(true); }
    if (a === 'send') return send();
    if (a === 'close' || a === 'later') return thanks ? close('') : close('later');
    if (a === 'off') { if (!confirm('설문을 그만 물을까요? 더보기에서 의견은 언제든 보낼 수 있어요.')) return; ST.off = true; save(); return close(''); }
  });
  document.addEventListener('input', e => { const t = e.target.closest && e.target.closest('[data-svt]'); if (t && draft) draft.a[t.dataset.svt] = t.value; });

  // 창 모양: 두 화면이 같은 색 이름(--surface, --line, --accent …)을 쓴다. 틀은 기존 팝업(.pop, .sheet-back)을 본떴다: 휴대폰은 아래에서 올라오고 넓은 화면은 가운데
  const css = document.createElement('style');
  css.textContent = `.svp{position:fixed;inset:0;z-index:60;display:flex;align-items:flex-end;justify-content:center}
.svp-scrim{position:absolute;inset:0;background:rgb(0 0 0 / .4);animation:svp-fade .2s ease-out}
.svp-card{position:relative;width:100%;max-width:480px;max-height:90vh;max-height:90dvh;overflow-y:auto;box-sizing:border-box;border-radius:18px 18px 0 0;background:var(--surface,#fff);padding:1.1em 1.1em max(1.1em,env(safe-area-inset-bottom));box-shadow:0 -6px 24px rgb(0 0 0 / .18);animation:svp-up .25s ease-out;outline:0;color:var(--ink,#1B2523);word-break:keep-all}
@media (min-width:640px){.svp{align-items:center}.svp-card{border-radius:18px}}
@keyframes svp-up{from{transform:translateY(24px);opacity:0}}@keyframes svp-fade{from{opacity:0}}
@media (prefers-reduced-motion:reduce){.svp-scrim,.svp-card{animation:none}}
body.svp-open{overflow:hidden}
:root[data-style="neu"] .svp-card{background:var(--card,var(--surface));box-shadow:var(--raise,none)}
:root[data-style="glass"] .svp-card{background:var(--glass-strong,var(--surface));-webkit-backdrop-filter:var(--glass-blur,none);backdrop-filter:var(--glass-blur,none)}
.svp-card :focus-visible{outline:2px solid var(--accent,#2B6A62);outline-offset:2px}
.svp-top{display:flex;align-items:center;gap:8px}.svp-top .svc-eye{flex:1}
.svp-pg{font-size:.78em;font-weight:600;color:var(--ink-2,#5B6965)}
.svp-x{flex:none;display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;margin:-8px -8px -8px 0;border:0;background:transparent;color:var(--ink-2,#5B6965);cursor:pointer;border-radius:50%}
.svp-card h2:focus-visible{outline:0}
.svp-nav{justify-content:space-between;flex-wrap:nowrap;margin-top:4px}
.svp-prev{font:inherit;min-height:44px;padding:0 18px;border:1px solid var(--line-strong,#B9C4BF);border-radius:12px;background:transparent;color:var(--ink,#1B2523);cursor:pointer}
.svp-quiet{display:flex;justify-content:center;gap:6px;margin-top:6px}.svp-note{text-align:center}
.svc-q{margin:0 0 12px}.svc-ql{margin:0 0 8px;font-size:1em;font-weight:600}
.svc-eye{margin:0;font-size:.78em;font-weight:600;color:var(--accent,#2B6A62)}
.svp-card h2{margin:.1em 0 .6em;font-size:1.08em}
.svc-faces{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.svc-face{font:inherit;display:flex;flex-direction:column;align-items:center;gap:2px;min-height:64px;padding:6px 2px;border:1px solid var(--line,#DDE4E0);border-radius:12px;background:var(--surface,#fff);color:var(--ink,#1B2523);cursor:pointer}
.svc-face span{font-size:1.6em;line-height:1.1}.svc-face small{font-size:.72em;color:var(--ink-2,#5B6965)}
.svc-face.on,.svc-seg button.on,.svc-chips button.on{border-color:var(--accent,#2B6A62);background:var(--accent,#2B6A62);color:var(--on-accent,#fff)}.svc-face.on small{color:inherit}
.svc-seg{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:6px}
.svc-seg button,.svc-chips button{font:inherit;font-size:.88em;min-height:44px;padding:0 10px;border:1px solid var(--line,#DDE4E0);border-radius:12px;background:var(--surface,#fff);color:var(--ink,#1B2523);cursor:pointer}
.svc-chips{display:flex;flex-wrap:wrap;gap:6px}
.svc-text{width:100%;box-sizing:border-box;font:inherit;font-size:.92em;padding:.6em .7em;border:1px solid var(--line,#DDE4E0);border-radius:12px;background:var(--surface,#fff);color:var(--ink,#1B2523);resize:vertical}
.svc-num{display:flex;justify-content:space-between;align-items:center;gap:10px;border-top:1px solid var(--line,#DDE4E0);padding-top:10px;margin-bottom:10px}
.svc-num b{display:block;font-size:.9em}.svc-num small{display:block;font-size:.78em;color:var(--ink-2,#5B6965);margin-top:2px}
.svc-sw{flex:none;width:48px;height:28px;border-radius:999px;border:1px solid var(--line-strong,#B9C4BF);background:var(--surface,#fff);position:relative;cursor:pointer;padding:0}
.svc-sw span{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:var(--ink-2,#5B6965);transition:transform .15s}
.svc-sw.on{background:var(--accent,#2B6A62);border-color:var(--accent,#2B6A62)}.svc-sw.on span{transform:translateX(20px);background:var(--on-accent,#fff)}
.svc-act{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.svc-send{font:inherit;font-weight:600;min-height:44px;padding:0 24px;border:0;border-radius:12px;background:var(--accent,#2B6A62);color:var(--on-accent,#fff);cursor:pointer}.svc-send:disabled{opacity:.6}
.svc-ghost{font:inherit;font-size:.88em;min-height:44px;padding:0 10px;border:0;background:transparent;color:var(--ink-2,#5B6965);cursor:pointer;text-decoration:underline}
.svc-ueq{display:flex;flex-direction:column;gap:10px}.svc-ur{background:var(--surface,#fff);border:1px solid var(--line,#DDE4E0);border-radius:12px;padding:8px 10px 4px}
.svc-uw{display:flex;justify-content:space-between;gap:8px;font-size:.84em;font-weight:600}.svc-uw span:last-child{text-align:right}
.svc-ud{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;justify-items:center}
.svc-ud button{width:100%;min-width:0;height:44px;border:0;background:transparent;cursor:pointer;padding:0;position:relative}
.svc-ud button::before{content:'';position:absolute;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;border:2px solid var(--line-strong,#B9C4BF);border-radius:50%;box-sizing:border-box}
.svc-ud button.on::before{background:var(--accent,#2B6A62);border-color:var(--accent,#2B6A62);box-shadow:inset 0 0 0 4px var(--surface,#fff)}
.svc-hint{margin:8px 0 0;font-size:.76em;color:var(--ink-2,#5B6965)}.svc-err{margin:0 0 8px;font-size:.85em;color:#B3261E}.svc-thanks{margin:0;text-align:center;font-weight:600;padding:1.2em 0}`;
  document.head.appendChild(css);

  // 보는 쪽(교회 전체 화면, 표 내려받기)에서 쓰는 이름표
  function label(day, k, v) {
    const R = ROUNDS[day]; if (!R) return v;
    const q = R.qs.find(x => x.k === k); if (!q || !q.o) return v;
    const o = q.o.find(x => x[0] === v); return o ? o[o.length - 1] : v;
  }
  window.KOIDE_SURVEY = { init, schedule, adopt, reload, merge, ROUNDS, DAYS, NUMS, UEQS, label };
})();
