// 알림 설정(웹 푸시) 공용 도구 (2026-11-23). 코이데 기도 노트와 디다코 노트가 이 파일 하나를 함께 쓴다(원본: gbs shared/family-ui, sync.sh로 복사).
// 하는 일: ① 이 기기에서 알림을 받을 수 있는지 살핀다 ② 켜면 폰의 허락을 받고, 이름 없는 기기 정보(알림 주소·열쇠·시각)만 서버에 맡긴다 ③ 설정 칸(더보기 › 앱 설정 › 알림)의 글과 단추를 그려 준다.
// 서버에 가는 것: 폰 알림 주소와 열쇠, 어느 앱인지, 알림 시각 목록, 시간대. 카카오 계정·이름·기도제목·내용은 가지 않는다(supabase/044_push_device.sql).
// 설정은 이 기기에만 기억한다(알림 허락도 기기마다 따로다). 켜고 끄는 값은 localStorage 'family-push-<앱>'.
// 쓰는 법(앱 화면 파일):
//   FamilyPush.init({ app: 'koide'|'didako', url, key, vapid, render: () => 화면을 다시 그리는 함수, tip: (글, 이름) => ⓘ 툴팁 html(각 앱의 info-tip 도구), toast: msg => 알림 글, a2hs: () => '홈 화면에 두기' 안내 열기(선택) })
//   FamilyPush.on()  → 알림 설정 칸을 보여 줄 수 있는가(설정값이 있고 데모가 아닐 때)
//   FamilyPush.hint() → 설정 줄 아래에 보일 짧은 말("꺼짐" 등)
//   FamilyPush.panel() → 펼친 안쪽 html
(function () {
  'use strict';
  // 앱마다 알림 종류. k는 서버(044)가 아는 종류 이름, 알림 글은 서버(push-send)가 정한다
  const KINDS = {
    koide: [
      { k: 'pray', type: 'times', max: 3, def: ['08:00', '14:00', '20:00'], name: '기도 시간', desc: '정한 시각에 "기도할 시간이에요"라고 알려요. 하루에 세 번까지 정할 수 있어요.' },
      { k: 'month', type: 'fixed', t: '09:00', m: 1, name: '새 달 기도제목', desc: '매달 1일 아침 9시에 이번 달 기도제목을 적어 보라고 알려요.' }
    ],
    didako: [
      { k: 'today', type: 'time', def: '07:00', name: '오늘의 질문', desc: '정한 시각에 오늘의 질문이 기다린다고 알려요.' },
      { k: 'week', type: 'weekday', t: '08:00', def: 0, name: '이번 주의 질문', desc: '정한 요일 아침 8시에 이번 주의 질문이 열렸다고 알려요. 이번 주의 질문은 주일마다 바뀌어요.' }
    ]
  };
  const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
  let C = null, ST = null, busy = false, msg = '', dirty = false, timer = 0;

  const rand = () => { const a = new Uint8Array(24); crypto.getRandomValues(a); return [...a].map(x => x.toString(16).padStart(2, '0')).join(''); };
  const key = () => 'family-push-' + C.app;
  const load = () => {
    let s = null; try { s = JSON.parse(localStorage.getItem(key()) || 'null'); } catch (e) { s = null; }
    if (!s || typeof s !== 'object') s = {};
    s.secret = /^[0-9a-f]{32,}$/.test(s.secret || '') ? s.secret : rand();
    s.items = s.items && typeof s.items === 'object' ? s.items : {};
    s.endpoint = typeof s.endpoint === 'string' ? s.endpoint : '';
    s.dirty = !!s.dirty;
    return s;
  };
  const save = () => { ST.dirty = dirty; try { localStorage.setItem(key(), JSON.stringify(ST)); } catch (e) { /* 저장하지 못해도 이번에는 동작한다 */ } };
  const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const kinds = () => KINDS[C.app] || [];
  const item = k => ST.items[k];
  const anyOn = () => kinds().some(d => item(d.k) && item(d.k).on);

  // 알림을 받을 수 있는 기기인가. ok / ios(홈 화면에 둔 앱에서만) / no(이 브라우저는 안 됨) / denied(폰 설정에서 막음)
  function support() {
    const standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (ios && !standalone) return 'ios';
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'no';
    if (Notification.permission === 'denied') return 'denied';
    return 'ok';
  }
  const b64 = s => { const p = '='.repeat((4 - s.length % 4) % 4), r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, c => c.charCodeAt(0)); };
  const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul'; } catch (e) { return 'Asia/Seoul'; } };

  // 서버에 보낼 알림 시각 목록(044의 slots 모양)
  function slots() {
    const out = [];
    kinds().forEach(d => {
      const it = item(d.k); if (!it || !it.on) return;
      if (d.type === 'times') (it.times || []).slice(0, d.max).forEach(t => out.push({ k: d.k, t }));
      else if (d.type === 'time') out.push({ k: d.k, t: it.t || d.def });
      else if (d.type === 'fixed') out.push({ k: d.k, t: d.t, m: d.m });
      else if (d.type === 'weekday') out.push({ k: d.k, t: d.t, d: [Number(it.day == null ? d.def : it.day)] });   // 고른 요일
    });
    return out;
  }
  async function rpc(name, args) {
    const ctl = new AbortController(), stop = setTimeout(() => ctl.abort(), 20000);
    try {
      const res = await fetch(String(C.url).replace(/\/+$/, '') + '/rest/v1/rpc/' + name, {
        method: 'POST', signal: ctl.signal,
        headers: { apikey: C.key, 'Content-Type': 'application/json' }, body: JSON.stringify(args)
      });
      if (!res.ok) { let m = ''; try { m = (await res.json()).message || ''; } catch (e) { /* 본문 없음 */ } const e = new Error(m); e.status = res.status; throw e; }
      return await res.json();
    } finally { clearTimeout(stop); }
  }
  async function reg() { return navigator.serviceWorker.ready; }
  async function sub(create) {
    const r = await reg(); let s = await r.pushManager.getSubscription();
    if (!s && create) s = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(C.vapid) });
    return s;
  }
  // 서버와 맞춘다: 켜진 알림이 있으면 등록(바꾸기), 없으면 지우고 구독도 푼다
  async function sync() {
    if (!anyOn()) {
      const s = await sub(false);
      if (s) { try { await rpc('push_unregister', { p_secret: ST.secret, p_endpoint: s.endpoint }); } catch (e) { if (e.status && e.status < 500) { /* 서버에 없던 기기 */ } else throw e; } await s.unsubscribe().catch(() => {}); }
      ST.endpoint = ''; dirty = false; save(); return;
    }
    let s = await sub(true), j = s.toJSON(), p = j.keys || {};
    try {
      await rpc('push_register', { p_secret: ST.secret, p_endpoint: s.endpoint, p_p256dh: p.p256dh || b64u(s.getKey('p256dh')), p_auth: p.auth || b64u(s.getKey('auth')), p_app: C.app, p_slots: slots(), p_tz: tz() });
    } catch (e) {
      // 같은 알림 주소가 다른 비밀로 남아 있으면(앱 데이터를 지운 뒤 등) 새 주소를 받아 다시 한 번
      if (/다시 켜 주세요/.test(e.message || '')) { await s.unsubscribe().catch(() => {}); s = await sub(true); j = s.toJSON(); p = j.keys || {};
        await rpc('push_register', { p_secret: ST.secret, p_endpoint: s.endpoint, p_p256dh: p.p256dh, p_auth: p.auth, p_app: C.app, p_slots: slots(), p_tz: tz() }); }
      else throw e;
    }
    ST.endpoint = s.endpoint; dirty = false; save();
  }
  const fail = e => { dirty = true; save(); msg = e && /알림 (주소|열쇠)/.test(e.message || '') ? '이 기기에서는 알림을 켤 수 없었어요.' : '서버에 알리지 못했어요. 잠시 뒤 다시 해 보세요.'; };
  // 바꾼 뒤 잠깐 기다렸다가 한 번에 서버에 보낸다(시각을 여러 번 고쳐도 한 번만)
  function later() { clearTimeout(timer); timer = setTimeout(async () => { const before = msg; try { await sync(); msg = ''; } catch (e) { fail(e); } if (msg !== before) C.render(); }, 700); }   // 문제가 생겼거나 풀렸을 때만 다시 그린다(시각 고르는 창이 닫히지 않게)

  // 켜기·끄기는 누른 그 자리에서 폰의 허락을 받는다(허락창은 사용자가 직접 누른 뒤에만 뜬다)
  async function toggle(k) {
    const d = kinds().find(x => x.k === k); if (!d || busy) return;
    const it = ST.items[k] = ST.items[k] || {};
    if (!it.on) {
      busy = true; msg = ''; C.render();
      try {
        const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
        if (perm !== 'granted') { msg = perm === 'denied' ? '알림이 막혀 있어요. 폰 설정에서 이 앱의 알림을 켜 주세요.' : '알림을 허락해야 켤 수 있어요.'; busy = false; return C.render(); }
        if (d.type === 'times') it.times = it.times && it.times.length ? it.times : d.def.slice();
        else if (d.type === 'time') it.t = it.t || d.def;
        else if (d.type === 'weekday') it.day = it.day == null ? d.def : it.day;
        it.on = true; save();
        await sync(); C.toast && C.toast('알림을 켰어요.');
      } catch (e) { it.on = false; fail(e); if (!msg || /서버/.test(msg)) msg = '알림을 켜지 못했어요. 잠시 뒤 다시 해 보세요.'; save(); }
      busy = false; return C.render();
    }
    it.on = false; save(); busy = true; C.render();
    try { await sync(); msg = ''; } catch (e) { fail(e); }
    busy = false; C.render();
  }
  function edit(k, field, v) {
    const it = ST.items[k]; if (!it) return;
    if (field === 'day') it.day = Number(v);
    else if (field === 't') it.t = /^\d\d:\d\d$/.test(v) ? v : it.t;
    else if (field.startsWith('t')) { const i = Number(field.slice(1)); if (/^\d\d:\d\d$/.test(v)) { it.times = it.times || []; it.times[i] = v; } }
    save(); later();
  }
  function addTime(k) {
    const d = kinds().find(x => x.k === k), it = ST.items[k]; if (!d || !it || (it.times || []).length >= d.max) return;
    const have = it.times || []; const pick = ['08:00', '12:00', '14:00', '18:00', '20:00', '21:00'].find(t => !have.includes(t)) || '12:00';
    it.times = have.concat(pick); save(); later(); C.render();
  }
  function dropTime(k, i) {
    const it = ST.items[k]; if (!it || !it.times) return;
    it.times.splice(i, 1);
    if (!it.times.length) it.on = false;
    save(); busy = true; C.render();
    sync().then(() => { msg = ''; }).catch(fail).finally(() => { busy = false; C.render(); });
  }
  // 지금 이 기기에서 알림이 보이는지 시험(서버를 거치지 않고 이 기기에서만)
  async function test() {
    try {
      if (Notification.permission !== 'granted') { msg = '먼저 알림을 켜 주세요.'; return C.render(); }
      const r = await reg();
      await r.showNotification(C.app === 'koide' ? '코이데' : '디다코', { body: '알림이 이렇게 보여요.', icon: 'icons/icon-192.png', tag: 'family-push-test' });
      C.toast && C.toast('알림을 보냈어요. 위에 보이나요?');
    } catch (e) { msg = '알림을 보여 주지 못했어요.'; C.render(); }
  }

  // 설명은 글로 늘어놓지 않고 이름 옆 ⓘ 툴팁으로(각 앱의 툴팁 도구를 init의 tip으로 받는다. 없으면 작은 글)
  const tip = (text, label) => C.tip ? C.tip(text, label) : `<small class="fp-sm">${esc(text)}</small>`;
  function timeInput(k, field, v, label) {
    return `<input class="fp-time" type="time" step="300" value="${esc(v)}" aria-label="${esc(label)}" data-fp="edit" data-k="${k}" data-f="${field}">`;
  }
  function itemHtml(d) {
    const it = item(d.k) || {}, on = !!it.on;
    const sw = `<button type="button" class="switch${on ? ' on' : ''}${busy ? ' busy' : ''}" role="switch" aria-checked="${on}" aria-label="${esc(d.name)}" data-fp="toggle" data-k="${d.k}"><span></span></button>`;
    let ex = '';
    if (on && d.type === 'times') {
      const ts = it.times || [];
      ex = `<div class="fp-times">${ts.map((t, i) => `<span class="fp-t">${timeInput(d.k, 't' + i, t, d.name + ' ' + (i + 1))}<button type="button" class="fp-x" aria-label="이 시각 지우기" data-fp="drop" data-k="${d.k}" data-i="${i}">×</button></span>`).join('')}${ts.length < d.max ? `<button type="button" class="fp-add" data-fp="add" data-k="${d.k}">+ 시각 더하기</button>` : ''}</div>`;
    } else if (on && d.type === 'time') ex = `<div class="fp-times">${timeInput(d.k, 't', it.t || d.def, d.name + ' 시각')}</div>`;
    else if (on && d.type === 'weekday') {
      const dv = it.day == null ? d.def : it.day;
      ex = `<div class="fp-days" role="group" aria-label="알림 받을 요일">${DAYS.map((n, i) => `<button type="button" class="fp-day${dv === i ? ' on' : ''}" aria-pressed="${dv === i}" data-fp="day" data-k="${d.k}" data-v="${i}">${n}</button>`).join('')}</div>`;
    }
    return `<div class="fp-item"><div class="fp-head"><span class="fp-name"><b>${esc(d.name)}</b>${tip(d.desc, d.name)}</span>${sw}</div>${ex}</div>`;
  }
  let styled = false;
  function style() {
    if (styled) return; styled = true;
    const s = document.createElement('style');
    // 숫자는 family-tokens.css의 이름표만 쓴다(AGENTS.md 공용 디자인 파일). 스위치는 각 화면의 .switch를 그대로 쓴다
    s.textContent = `.fp-box{display:flex;flex-direction:column;gap:var(--sp-4);padding:.9em 0;border-top:1px solid var(--line)}
.fp-item{display:flex;flex-direction:column;gap:var(--sp-2)}
.fp-head{display:flex;justify-content:space-between;align-items:center;gap:var(--sp-3)}
.fp-head b{display:block;font-weight:600}
.fp-name{display:inline-flex;align-items:center;gap:.2em}
.fp-priv{margin-left:auto}
.fp-sm,.fp-note{display:block;color:var(--ink-2);font-size:var(--fs-hint);line-height:1.5;margin:.15em 0 0;word-break:keep-all}
.fp-times{display:flex;flex-wrap:wrap;gap:var(--sp-2);align-items:center}
.fp-t{display:inline-flex;align-items:center;gap:.2em}
.fp-time{min-height:var(--touch);padding:.4em .6em;border:1px solid var(--line-strong);border-radius:var(--r-sm);background:var(--surface);color:var(--ink);font:inherit}
.fp-x,.fp-add,.fp-link{min-height:var(--touch);padding:0 .6em;border:0;background:none;color:var(--accent);font:inherit;font-size:.9em;cursor:pointer}
.fp-x{color:var(--ink-2);font-size:1.2em;padding:0 .4em}
.fp-days{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}
.fp-day{min-height:var(--touch);border:1px solid var(--line-strong);border-radius:var(--r-sm);background:var(--surface);color:var(--ink);font:inherit}
.fp-day.on{background:var(--accent);border-color:var(--accent);color:var(--on-accent);font-weight:600}
.fp-warn{color:var(--ink);background:var(--surface-2);border-radius:var(--r-sm);padding:.7em .8em;font-size:var(--fs-hint);line-height:1.5;word-break:keep-all}
.fp-foot{display:flex;flex-wrap:wrap;gap:var(--sp-3);align-items:center}`;
    document.head.appendChild(s);
  }
  // 위 막대·표 같은 눌림은 문서 하나에서 받는다(화면을 다시 그려도 이어진다)
  function wire() {
    document.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('[data-fp]'); if (!b || !C || b.tagName === 'INPUT') return;
      const a = b.dataset.fp, k = b.dataset.k;
      if (a === 'toggle') toggle(k);
      else if (a === 'add') addTime(k);
      else if (a === 'drop') dropTime(k, Number(b.dataset.i));
      else if (a === 'day') { edit(k, 'day', b.dataset.v); C.render(); }
      else if (a === 'test') test();
      else if (a === 'a2hs') C.a2hs && C.a2hs();
    });
    document.addEventListener('change', e => {
      const t = e.target; if (C && t && t.dataset && t.dataset.fp === 'edit') edit(t.dataset.k, t.dataset.f, t.value);
    });
  }
  // 앱을 열 때: 켜 둔 기기인데 구독이 사라졌거나 주소가 바뀌었으면 맞추고, 지난번에 못 보낸 것이 있으면 다시 보낸다
  async function reconcile() {
    if ((!anyOn() && !dirty) || support() !== 'ok' || Notification.permission !== 'granted') return;
    try {
      const s = await sub(false);
      if (!s) { await sync(); }                     // 구독이 사라졌다 → 다시 만든다
      else if (dirty || s.endpoint !== ST.endpoint) await sync();
    } catch (e) { /* 다음에 연 때 다시 */ }
  }
  window.FamilyPush = {
    init(opts) {
      C = opts; ST = load(); style();
      // 앱에서 없앤 알림 종류(예: 옛 '모임 전날 저녁')가 이 기기에 켜진 채 남아 있으면 지우고 서버에도 알린다
      Object.keys(ST.items).forEach(k => { if (!kinds().some(d => d.k === k)) { delete ST.items[k]; ST.dirty = true; } });
      dirty = ST.dirty; if (!window.__fpWired) { window.__fpWired = true; wire(); }
      setTimeout(reconcile, 2500);
    },
    on() { return !!(C && C.url && C.key && C.vapid && kinds().length); },
    hint() {
      const sp = support();
      if (!anyOn()) return sp === 'ios' ? '홈 화면 앱에서 켤 수 있어요' : '꺼짐';
      return '켜짐';
    },
    panel() {
      const sp = support();
      let top = '';
      if (sp === 'ios') top = `<div class="fp-warn">아이폰은 <b>홈 화면에 추가한 앱</b>에서만 알림을 받을 수 있어요(iOS 16.4 이상). 홈 화면에 둔 앱으로 열어서 켜 주세요.${C.a2hs ? ` <button type="button" class="fp-link" data-fp="a2hs">홈 화면에 두는 방법 ›</button>` : ''}</div>`;
      else if (sp === 'no') top = '<div class="fp-warn">이 브라우저에서는 알림을 켤 수 없어요. 크롬·사파리 같은 최신 브라우저나 홈 화면에 추가한 앱에서 열어 주세요.</div>';
      else if (sp === 'denied') top = '<div class="fp-warn">이 기기에서 알림이 막혀 있어요. 폰 설정에서 이 앱(또는 브라우저)의 알림을 켠 뒤 다시 열어 주세요.</div>';
      const body = sp === 'ok' ? kinds().map(itemHtml).join('') : '';
      const priv = `알림은 이 기기에서만 켜져요. 서버에는 이 기기의 알림 주소와 시각만 맡기고, 계정·이름·${C.app === 'koide' ? '기도제목' : '내가 쓴 글'}은 보내지 않아요. 알림 글에도 들어가지 않아요. 언제든 꺼도 돼요.`;
      const foot = sp === 'ok' ? `<div class="fp-foot">${anyOn() ? '<button type="button" class="fp-link" data-fp="test">알림 보내 보기</button>' : ''}<span class="fp-name fp-priv"><small class="fp-sm">이 기기에서만 켜져요</small>${tip(priv, '알림과 개인정보')}</span></div>` : '';
      return `<div class="fp-box">${top}${body}${msg ? `<p class="fp-note" role="status">${esc(msg)}</p>` : ''}${foot}
        </div>`;
    },
    // 시험용(화면 확인): 내부 상태를 직접 지정한다
    _test: { slots: () => slots(), support, state: () => ST }
  };
})();
