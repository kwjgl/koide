/*
 * 시범 "해 볼 일" 띠 (공동체 index.html · 기도 노트 note.html이 함께 쓴다)
 *
 * 시범에 함께하는 사람에게만 보인다. 두 길이 있다.
 *  ① 사랑방 단위: 관리자가 부서 관리 › 소그룹과 사람에서 그 사랑방의 '시범 중'을 켜면, 그 사랑방 사람은 어느 기기·어느 앱에서든 로그인한 뒤 보인다.
 *     공동체 앱(index.html)이 서버에서 알게 되면 room(true)로 이 기기에 표시(room)를 남기고, 같은 저장 공간을 쓰는 기도 노트(note.html)도 그 표시를 보고 띠를 보인다. 꺼지면 room(false)로 표시를 지운다.
 *  ② 링크: 시범 링크(주소 뒤에 pilot, 예: /app/?pilot)로 열면 이 기기에 켜 두고 주소에서 pilot을 뺀다. 기도 노트만 쓰는 사람(사랑방이 없는 사람)이 쓴다.
 *     아이폰은 사파리와 홈 화면 앱의 저장 공간이 달라서, 링크로 켠 띠는 연 곳(사파리)에서만 보인다. 그래서 사랑방 단위가 따로 있다.
 *  시범 끝내기(더보기)는 그 사람이 이 기기에서 끈 것이다. 사랑방이 켜져 있을 때 끝냈으면 그 기기에서는 계속 숨기고(off), 사랑방이 꺼지면 처음으로 돌아간다.
 *  ?demo&pilot이면 데모에서 보인다(기억은 메모리에만, 새로 고치면 처음부터).
 * 화면 위쪽에 한 줄로 접힌 띠가 있고, 누르면 해 볼 일 목록이 펴진다. 해 볼 일을 실제로 하면 저절로 체크되고, 눌러서 직접 체크·해제도 된다.
 *  항목은 "무엇을 해 볼지"만 적는다(어떻게는 적지 않는다). 항목을 바꾸면 서버(apps-script/Code.js)의 SURVEY_PILOT_ 키도 같게 맞춘다.
 * 어디에 저장하나: 이 기기(localStorage 'koide-pilot')에 체크한 날까지. 남의 진행은 어디에도 없고, 사람끼리 견주는 숫자도 없다.
 *  교회로 가는 것: 시범 설문 카드에서 '숫자도 함께 보내기'를 켠 사람만, 해 본 항목의 키 목록만(날짜·이름·기도 내용 없음). survey.js가 keys()를 읽는다.
 */
(function () {
  // 항목. k: 키(서버와 같게), 글은 "무엇을 해 볼지"
  const LISTS = {
    community: ['공동체', [
      ['c-edit', '우리 가정 기도제목을 이번 달에 맞게 고쳐 보세요'],
      ['c-pray', '"지금 함께 기도할 가정"을 위해 기도했어요를 눌러 보세요'],
      ['c-cord', '기도의 끈에서 아직 느슨한 곳을 찾아 그 가정을 위해 기도해 보세요'],
      ['c-ps', '기도하기를 처음부터 끝까지 해 보세요'],
      ['c-style', '화면을 어둡게 하거나 색을 바꿔 보세요']
    ]],
    note: ['기도 노트', [
      ['n-two', '같은 사람을 위한 기도제목을 두 개 이상 써 보세요'],
      ['n-today', '오늘의 기도제목을 위해 기도해 보세요'],
      ['n-ps', '기도하기를 1분, 자동으로 넘기기로 해 보세요'],
      ['n-answer', '응답받은 기도를 "응답받았어요"로 남겨 보세요'],
      ['n-thanks', '오늘 감사한 것을 한 줄 남겨 보세요'],
      ['n-sync', '동기화를 켜서 다른 기기와 이어 보세요']
    ]],
    all: ['어디서나', [
      ['a-home', '휴대폰 홈 화면에 코이데를 두세요'],
      ['a-feedback', '불편한 점이나 바라는 점을 의견 보내기로 보내 보세요']
    ]]
  };
  // 개인 단위 부서(청년부 등)는 '우리 가정' 대신 쓰는 말이 다른 항목. 공동체 앱의 words()와 같은 말(mine '나', one '사람')
  const SOLO = {
    'c-edit': '내 기도제목을 이번 달에 맞게 고쳐 보세요',
    'c-pray': '"지금 함께 기도할 사람"을 위해 기도했어요를 눌러 보세요',
    'c-cord': '기도의 끈에서 아직 느슨한 곳을 찾아 그 사람을 위해 기도해 보세요'
  };
  const label = (k, t) => (O && O.solo && O.solo() && SOLO[k]) || t;
  const KEYS = [].concat(...Object.keys(LISTS).map(g => LISTS[g][1].map(x => x[0])));
  const SAVE = 'koide-pilot';

  const iso = d => { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // on: 시범 링크로 함께함 / room: 내 사랑방이 시범 중(공동체 앱이 남긴 표시) / off: 사랑방이 시범 중일 때 내가 끝냈음 / hide: 띠를 숨겨 둠 / open: 목록을 펴 둠 / done: { 키: 'yyyy-mm-dd' }
  let O = null, ST = { on: false, room: false, off: false, hide: false, open: false, done: {} }, demo = false;

  function load() {
    try { const v = JSON.parse(localStorage.getItem(SAVE) || 'null'); if (v && typeof v === 'object') ST = Object.assign(ST, v, { done: Object.assign({}, v.done) }); } catch (e) { /* 처음 */ }
  }
  function save() { if (demo) return; try { localStorage.setItem(SAVE, JSON.stringify(ST)); } catch (e) { /* 이번만 */ } }

  // 공동체 앱이 서버에서 알게 된 '내 사랑방 시범 중' 값을 이 기기에 남긴다(기도 노트가 같은 저장 공간에서 읽는다)
  function room(v) {
    v = !!v;
    if (!O || ST.room === v) return;
    ST.room = v;
    if (!v) ST.off = false;
    if (on() && O.home && O.home() && !ST.done['a-home']) ST.done['a-home'] = iso(new Date());
    save();
  }

  // opts: { where: 'community'|'note', demo, rerender(), feedback(), home(): 홈 화면 앱으로 열었는지, solo(): 개인 단위 부서인지 }
  function init(opts) {
    O = opts; demo = !!O.demo;
    if (!demo) load();
    const q = new URLSearchParams(location.search);
    if (q.has('pilot')) {
      ST.on = true; ST.off = false; ST.hide = false; save();
      q.delete('pilot');
      history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q.toString().replace(/=(&|$)/g, '$1') : '') + location.hash);
    }
    if (on() && O.home && O.home() && !ST.done['a-home']) { ST.done['a-home'] = iso(new Date()); save(); }
  }

  // 링크로 켰거나 내 사랑방이 시범 중이면 함께함(내가 끝낸 기기는 빼고)
  const on = () => !!(O && !ST.off && (ST.on || ST.room));
  // 내 사랑방이 시범 중이라 함께하는지(링크 시범은 아님). 기도 노트는 이 사람에게만 띠를 숨긴다(공동체 앱에서 띠를 보니까)
  const isRoom = () => !!(O && !ST.off && ST.room);
  const total = () => KEYS.length;
  const count = () => KEYS.filter(k => ST.done[k]).length;
  // 설문에 실어 보낼 해 본 항목 키(시범에 함께하지 않으면 null)
  const keys = () => on() ? KEYS.filter(k => ST.done[k]) : null;

  function done(k, off) {
    if (!on() || KEYS.indexOf(k) < 0) return;
    if (off) { if (!ST.done[k]) return; delete ST.done[k]; }
    else { if (ST.done[k]) return; ST.done[k] = iso(new Date()); if (count() === total()) ST.open = false; }
    save(); paint();
  }

  const CHEV = '<svg class="pl-chev" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4.5 6.5L8 10l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const CHECK = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3.2 8.4l3 3 6.6-6.8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function html() {
    const all = count() === total(), open = ST.open;
    // 지금 보는 앱의 목록을 먼저, 다른 앱의 목록을 그 아래에, 어디서나 쓰는 것은 맨 아래에
    const order = [O.where, O.where === 'note' ? 'community' : 'note', 'all'];
    const sec = g => `<li class="pl-sec">${esc(LISTS[g][0])}</li>` + LISTS[g][1].map(([k, t]) => {
      const d = !!ST.done[k];
      return `<li><button type="button" class="pl-task${d ? ' done' : ''}" role="checkbox" aria-checked="${d}" data-pl="tog" data-k="${k}"><span class="pl-box">${d ? CHECK : ''}</span><span class="pl-txt">${esc(label(k, t))}</span></button></li>`;
    }).join('');
    return `<section class="card pl${open ? ' open' : ''}" id="pl-band" aria-label="시범에서 해 볼 일">
      <button type="button" class="pl-head" data-pl="fold" aria-expanded="${open}"><b>시범에서 해 볼 일</b><span class="pl-cnt">${count()}/${total()}</span>${CHEV}</button>
      ${all ? `<p class="pl-all">다 해 봤어요 🙏 불편했던 점을 알려 주세요 <button type="button" class="pl-link" data-pl="fb">의견 보내기</button></p>` : ''}
      ${open ? `<ul class="pl-list">${order.map(sec).join('')}</ul>` : ''}</section>`;
  }

  // 띠를 그 자리에서 다시 그린다(화면 전체를 다시 그리지 않는다)
  function paint() {
    const el = document.getElementById('pl-band'); if (!el) return;
    const t = document.createElement('template'); t.innerHTML = html().trim(); el.replaceWith(t.content.firstChild);
  }
  // 화면을 그린 뒤 부른다. host 안에서 anchor(제목 줄) 바로 아래에 붙인다. can: 지금 이 화면에 띠를 보여도 되는지(기도하기·도움말·설문·로그인이 아닐 때)
  let last = null;
  function mount(host, anchor, can) {
    last = [host, anchor, can];
    const old = document.getElementById('pl-band'); if (old) old.remove();
    if (!on() || ST.hide || !can || !host) return;
    const t = document.createElement('template'); t.innerHTML = html().trim();
    const a = anchor && host.querySelector(anchor);
    a ? a.after(t.content.firstChild) : host.prepend(t.content.firstChild);
  }

  // 설문 카드가 사라진 뒤처럼 화면을 다시 그리지 않고 띠만 다시 붙일 때
  const remount = () => { if (last && last[0] && last[0].isConnected) mount(last[0], last[1], last[2]); };

  // 더보기에 넣는 두 줄(.mrow): 띠 보이기/숨기기, 시범 끝내기. 시범에 함께하지 않으면 없다.
  //  기도 노트에서 사랑방 시범인 사람은 띠가 없어서(나의 배지가 대신한다) 띠 보이기/숨기기 줄은 두지 않고 시범 끝내기만 둔다
  function moreRows() {
    if (!on()) return '';
    const bandless = O.where === 'note' && isRoom();
    const end = `<button type="button" class="mrow" data-pl="off"><span><b>시범 끝내기</b><small>${bandless ? '시범에 함께하는 것을 이 기기에서 끝내요. 나의 배지는 그대로예요' : '해 볼 일 띠와 체크를 이 기기에서 지워요'}</small></span></button>`;
    if (bandless) return end;
    return `<button type="button" class="mrow" data-pl="show"><span><b>시범에서 해 볼 일</b><small>${ST.hide ? '띠를 숨겨 두었어요. 누르면 다시 보여요' : '화면 위에 띠가 보여요. 누르면 숨겨요'} · ${count()}/${total()}</small></span></button>
      ${end}`;
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-pl]'); if (!b || !O) return;
    const a = b.dataset.pl;
    if (a === 'fold') { ST.open = !ST.open; save(); return paint(); }
    if (a === 'tog') { const k = b.dataset.k; return ST.done[k] ? done(k, true) : done(k); }
    if (a === 'fb') return O.feedback && O.feedback();
    if (a === 'show') { ST.hide = !ST.hide; save(); return O.rerender && O.rerender(); }
    if (a === 'off') {
      if (!confirm('시범 "해 볼 일"을 끝낼까요? 체크한 것이 이 기기에서 지워져요.')) return;
      ST.off = ST.room; ST.on = false; ST.hide = false; ST.open = false; ST.done = {}; save(); return O.rerender && O.rerender();
    }
  });

  // 카드 모양: 두 화면이 같은 색 이름(--surface, --line, --accent …)과 .card를 쓴다. 디자인 스타일(basic·new·classic·glass)은 .card가 따라간다
  const css = document.createElement('style');
  css.textContent = `.card.pl{padding:0;gap:0;margin:0 0 12px;overflow:hidden;word-break:keep-all}
.pl-head{display:flex;align-items:center;gap:.5em;width:100%;min-height:44px;padding:0 14px;font:inherit;font-size:.92em;color:var(--ink);background:none;border:0;cursor:pointer;text-align:left}
.pl-head b{font-weight:600}.pl-cnt{color:var(--ink-2);font-weight:500;font-variant-numeric:tabular-nums}
.pl-chev{flex:none;margin-left:auto;color:var(--ink-2);transition:transform .2s}.pl.open .pl-chev{transform:rotate(180deg)}
.pl-all{margin:0;padding:0 14px 12px;font-size:.88em;color:var(--ink-2);line-height:1.55}
.pl-link{font:inherit;color:var(--accent);background:none;border:0;padding:0;margin-left:.3em;text-decoration:underline;cursor:pointer;min-height:32px}
.pl-list{list-style:none;margin:0;padding:0;border-top:1px solid var(--line)}
.pl-list li+li{border-top:1px solid var(--line)}
.pl-sec{padding:.6em 14px .3em;font-size:.76em;font-weight:700;color:var(--ink-2);letter-spacing:.04em;background:var(--surface-2)}
.pl-task{display:flex;align-items:flex-start;gap:.7em;width:100%;min-height:44px;padding:.6em 14px;font:inherit;font-size:.9em;line-height:1.5;color:var(--ink);text-align:left;background:none;border:0;cursor:pointer}
.pl-box{flex:none;width:22px;height:22px;margin-top:.05em;border-radius:50%;border:1.5px solid var(--line-strong);display:grid;place-items:center;color:var(--on-accent)}
.pl-task.done{color:var(--ink-2)}.pl-task.done .pl-txt{text-decoration:line-through;text-decoration-color:var(--line-strong)}
.pl-task.done .pl-box{background:var(--accent);border-color:var(--accent)}`;
  document.head.appendChild(css);

  window.KoidePilot = { init, room, on, isRoom, done, keys, count, total, mount, remount, moreRows, LISTS, KEYS };
})();
