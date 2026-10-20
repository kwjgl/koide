/*
 * 시범 설문 카드 (공동체 index.html · 기도 노트 note.html이 함께 쓴다)
 *
 * 시작한 지 3·7·14일째에 '오늘' 화면 위에 짧은 카드를 한 장 붙인다(창이 아니다). 보내기 / 나중에 / 그만 묻기.
 * 문항은 아래 ROUNDS 한 곳에 있다. 문항을 바꾸면 서버(apps-script/Code.js)의 SURVEY_ 허용 목록도 같은 키로 맞춘다(키와 값만, 글은 서버에 없다).
 * 보내는 것: 고른 답, 쓴 글(선택), 그리고 사용자가 '숫자도 함께 보내기'를 켰을 때만 숫자 몇 가지. 기도 내용은 어디에도 담지 않는다.
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
    14: { title: '두 주 써 본 느낌', pages: [['ueq'], ['keep', 'recommend', 'want']], qs: [
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

  let O = null, ST = { first: '', off: false, r: {}, num: false }, draft = null, cur = null, busy = false, err = '', thanks = false, test = 0;

  function load() { try { const v = JSON.parse(localStorage.getItem(O.key) || 'null'); if (v && typeof v === 'object') ST = Object.assign({ first: '', off: false, r: {}, num: false }, v); } catch (e) { /* 처음 */ } }
  function save() { if (test) return; try { localStorage.setItem(O.key, JSON.stringify(ST)); } catch (e) { /* 이번만 */ } }
  const today = () => (O.today ? O.today() : iso(new Date()));

  // opts: { where: 'note'|'community', key, api(action, data), start(): 'yyyy-mm-dd'|'', nums(): {days, items, thanks, app, vault}, ver, demo, today() }
  function init(opts) {
    O = opts; load();
    // 데모에서만: 주소에 survey=3|7|14를 붙이면 그 날짜째인 것처럼 카드를 연다(보낸 기록은 남기지 않는다)
    if (O.demo) { const n = Number(new URLSearchParams(location.search).get('survey')); if (DAYS.indexOf(n) >= 0) test = n; }
    if (!ST.first) { ST.first = today(); save(); }
  }

  // 지금 보여 줄 라운드(없으면 null). startISO: 쓰는 쪽이 아는 시작일(없으면 이 기기에서 처음 연 날)
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

  function html() {
    if (!O) return '';
    if (thanks) return `<section class="svc" id="sv-card"><p class="svc-thanks">보냈어요. 고마워요 🙏</p></section>`;
    const n = pick(O.start ? O.start() : ''); if (!n) { cur = null; return ''; }
    if (cur !== n) { cur = n; draft = { a: {}, num: !!ST.num, page: 0 }; err = ''; }
    return card(n);
  }
  function card(n) {
    const R = ROUNDS[n], nums = O.nums ? O.nums() : {};
    const numLine = Object.keys(nums).filter(k => NUMS[k] && nums[k] !== undefined).map(k => NUMS[k][0] + ' ' + NUMS[k][1](nums[k])).join(' · ');
    const pages = R.pages || [qsOf(n).map(q => q.k)], last = draft.page >= pages.length - 1;
    const body = qsOf(n).filter(q => pages[draft.page].indexOf(q.k) >= 0).map(q => {
      const v = draft.a[q.k];
      let ctl = '';
      if (q.t === 'face') ctl = `<div class="svc-faces" role="radiogroup" aria-label="${esc(q.q)}">${q.o.map(([val, em, l]) => `<button type="button" class="svc-face${v === val ? ' on' : ''}" role="radio" aria-checked="${v === val}" data-sv="ans" data-k="${q.k}" data-v="${val}"><span aria-hidden="true">${em}</span><small>${l}</small></button>`).join('')}</div>`;
      else if (q.t === 'pick') ctl = `<div class="svc-seg" role="radiogroup" aria-label="${esc(q.q)}">${q.o.map(([val, l]) => `<button type="button" class="${v === val ? 'on' : ''}" role="radio" aria-checked="${v === val}" data-sv="ans" data-k="${q.k}" data-v="${val}">${l}</button>`).join('')}</div>`;
      else if (q.t === 'ueq') { const u = draft.a.ueq || {}, got = Object.keys(u).length; ctl = `<div class="svc-ueq">${q.items.map(([l, r], i) => `<div class="svc-ur" role="radiogroup" aria-label="${esc(l)} ↔ ${esc(r)}"><div class="svc-uw"><span>${esc(l)}</span><span>${esc(r)}</span></div><div class="svc-ud">${[1, 2, 3, 4, 5, 6, 7].map(m => `<button type="button" class="${u[i + 1] === m ? 'on' : ''}" role="radio" aria-checked="${u[i + 1] === m}" aria-label="${m}번째 칸" data-sv="ueq" data-k="${i + 1}" data-v="${m}"></button>`).join('')}</div></div>`).join('')}</div><p class="svc-hint">${got} / ${q.items.length}줄 · 오래 생각하지 말고 처음 느낌대로 눌러 주세요</p>`; }
      else if (q.t === 'multi') ctl = `<div class="svc-chips">${q.o.map(([val, l]) => { const on = (v || []).indexOf(val) >= 0; return `<button type="button" class="${on ? 'on' : ''}" aria-pressed="${on}" data-sv="multi" data-k="${q.k}" data-v="${val}">${l}</button>`; }).join('')}</div>`;
      else ctl = `<textarea class="svc-text" rows="2" maxlength="200" data-svt="${q.k}" aria-label="${esc(q.q)}" placeholder="기도제목은 적지 말아 주세요">${esc(v || '')}</textarea>`;
      return `<div class="svc-q"><p class="svc-ql">${esc(q.q)}</p>${ctl}</div>`;
    }).join('');
    return `<section class="svc" id="sv-card" aria-label="짧은 설문">
      <p class="svc-eye">${n}일째 · 1분이면 돼요${pages.length > 1 ? ' · ' + (draft.page + 1) + '/' + pages.length : ''}</p><h2>${esc(R.title)}</h2>${body}
      ${numLine && last ? `<div class="svc-num"><div><b>숫자도 함께 보내기</b><small>${draft.num ? '보내는 숫자: ' + esc(numLine) : '켜면 이 숫자만 함께 가요: ' + esc(numLine)}</small></div>
        <button type="button" class="svc-sw${draft.num ? ' on' : ''}" role="switch" aria-checked="${draft.num}" aria-label="숫자도 함께 보내기" data-sv="num"><span></span></button></div>` : ''}
      ${err ? `<p class="svc-err" role="alert">${esc(err)}</p>` : ''}
      <div class="svc-act">${last ? `<button type="button" class="svc-send" data-sv="send"${busy ? ' disabled' : ''}>${busy ? '보내는 중…' : '보내기'}</button>${draft.page ? '<button type="button" class="svc-ghost" data-sv="prev">이전</button>' : ''}` : '<button type="button" class="svc-send" data-sv="next">다음</button>'}
        <button type="button" class="svc-ghost" data-sv="later">나중에</button><button type="button" class="svc-ghost" data-sv="off">그만 묻기</button></div>
      <p class="svc-hint">기도 내용과 이름은 보내지 않아요.</p></section>`;
  }
  function redraw() { const el = document.getElementById('sv-card'); if (!el) return; const h = html(); if (!h) { el.remove(); return; } const t = document.createElement('template'); t.innerHTML = h.trim(); el.replaceWith(t.content.firstChild); }

  function mark(n, v) { ST.r[O.where + n] = Object.assign(ST.r[O.where + n] || {}, v); save(); }
  async function send() {
    if (busy || !cur) return;
    const n = cur, answers = {};
    qsOf(n).forEach(q => { const v = draft.a[q.k]; if (q.t === 'text' ? String(v || '').trim() : q.t === 'ueq' ? Object.keys(v || {}).length : Array.isArray(v) ? v.length : v) answers[q.k] = typeof v === 'string' ? v.trim() : v; });
    if (!Object.keys(answers).length) { err = '하나라도 골라 주세요.'; return redraw(); }
    busy = true; err = ''; redraw();
    try {
      const body = { where: O.where, day: n, answers, width: innerWidth < 640 ? 'phone' : innerWidth < 1024 ? 'tablet' : 'pc', ver: O.ver || '' };
      if (draft.num && O.nums) body.nums = O.nums();
      await O.api('sendSurvey', body);
      ST.num = draft.num; mark(n, { st: 'done' }); busy = false; thanks = true; redraw();
      setTimeout(() => { thanks = false; const el = document.getElementById('sv-card'); if (el) el.remove(); }, 2200);
    } catch (e) {
      busy = false; err = e && e.code === 'busy' ? e.message : e && /모르는 요청/.test(e.message || '') ? '서버가 아직 새 버전이 아니에요. 관리자에게 알려 주세요.' : '보내지 못했어요. 잠시 뒤 다시 눌러 주세요.'; redraw();
    }
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-sv]'); if (!b || !O || !cur) return;
    const a = b.dataset.sv, k = b.dataset.k, v = b.dataset.v;
    if (a === 'ans') { draft.a[k] = draft.a[k] === v ? '' : v; err = ''; return redraw(); }
    if (a === 'multi') { const l = draft.a[k] || (draft.a[k] = []), i = l.indexOf(v); i >= 0 ? l.splice(i, 1) : l.push(v); err = ''; return redraw(); }
    if (a === 'num') { draft.num = !draft.num; return redraw(); }
    if (a === 'ueq') { const u = draft.a.ueq || (draft.a.ueq = {}); if (u[k] === Number(v)) delete u[k]; else u[k] = Number(v); err = ''; return redraw(); }
    if (a === 'next' || a === 'prev') { draft.page += a === 'next' ? 1 : -1; err = ''; return redraw(); }
    if (a === 'send') return send();
    if (a === 'later') {
      const s = ST.r[O.where + cur] || {};
      mark(cur, s.later ? { st: 'skip' } : { later: 1, until: addDays(today(), 1) }); cur = null; return redraw();
    }
    if (a === 'off') { if (!confirm('설문을 그만 물을까요? 더보기에서 의견은 언제든 보낼 수 있어요.')) return; ST.off = true; save(); cur = null; return redraw(); }
  });
  document.addEventListener('input', e => { const t = e.target.closest('[data-svt]'); if (t && draft) draft.a[t.dataset.svt] = t.value; });

  // 카드 모양: 두 화면이 같은 색 이름(--surface, --line, --accent …)을 쓴다
  const css = document.createElement('style');
  css.textContent = `.svc{background:var(--accent-soft,#DCEBE7);border:1px solid var(--accent-mid,#8DBDB5);border-radius:18px;padding:14px 14px 12px;margin:0 0 14px;color:var(--ink,#1B2523);word-break:keep-all}
.svc h2{margin:.1em 0 .5em;font-size:1.08em}.svc-eye{margin:0;font-size:.78em;font-weight:600;color:var(--accent,#2B6A62)}
.svc-q{margin:0 0 12px}.svc-ql{margin:0 0 6px;font-size:.92em;font-weight:600}
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
.svc-send{font:inherit;font-weight:600;min-height:44px;padding:0 20px;border:0;border-radius:12px;background:var(--accent,#2B6A62);color:var(--on-accent,#fff);cursor:pointer}.svc-send:disabled{opacity:.6}
.svc-ghost{font:inherit;font-size:.88em;min-height:44px;padding:0 10px;border:0;background:transparent;color:var(--ink-2,#5B6965);cursor:pointer;text-decoration:underline}
.svc-ueq{display:flex;flex-direction:column;gap:10px}.svc-ur{background:var(--surface,#fff);border:1px solid var(--line,#DDE4E0);border-radius:12px;padding:8px 10px 4px}
.svc-uw{display:flex;justify-content:space-between;gap:8px;font-size:.84em;font-weight:600}.svc-uw span:last-child{text-align:right}
.svc-ud{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;justify-items:center}
.svc-ud button{width:100%;min-width:0;height:44px;border:0;background:transparent;cursor:pointer;padding:0;position:relative}
.svc-ud button::before{content:'';position:absolute;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;border:2px solid var(--line-strong,#B9C4BF);border-radius:50%;box-sizing:border-box}
.svc-ud button.on::before{background:var(--accent,#2B6A62);border-color:var(--accent,#2B6A62);box-shadow:inset 0 0 0 4px var(--surface,#fff)}
.svc-hint{margin:8px 0 0;font-size:.76em;color:var(--ink-2,#5B6965)}.svc-err{margin:0 0 8px;font-size:.85em;color:#B3261E}.svc-thanks{margin:0;text-align:center;font-weight:600;padding:.4em 0}`;
  document.head.appendChild(css);

  // 보는 쪽(교회 전체 화면, 표 내려받기)에서 쓰는 이름표
  function label(day, k, v) {
    const R = ROUNDS[day]; if (!R) return v;
    const q = R.qs.find(x => x.k === k); if (!q || !q.o) return v;
    const o = q.o.find(x => x[0] === v); return o ? o[o.length - 1] : v;
  }
  window.KOIDE_SURVEY = { init, html, ROUNDS, DAYS, NUMS, UEQS, label };
})();
