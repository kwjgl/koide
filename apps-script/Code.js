/**
 * 코이데 서버 (Google Apps Script)
 *
 * 구글 시트 하나를 저장소로 쓰고, 화면(GitHub Pages)은 이 웹 앱에 POST로 요청을 보낸다.
 * 이 파일 하나를 시트의 "확장 프로그램 > Apps Script"에 붙여 넣으면 된다. 자세한 순서는 docs/setup.md.
 *
 * - 로그인: 카카오 로그인으로 받은 code를 여기서 카카오에 직접 확인하고, 앱의 로그인 표시(30일)를 내준다
 * - 연결: 카카오 계정을 가정 안의 실제 사람(김도윤/이수아)과 잇고, 처음 연결은 리더가 승인한다
 * - 기도제목: 달마다 쌓는다. 그 달 기도제목이 없으면 지난달 것을 이어 붙인다(월초 이월)
 *
 * 스크립트 속성(프로젝트 설정 > 스크립트 속성):
 *   KAKAO_REST_KEY       카카오 개발자 앱의 REST API 키
 *   KAKAO_CLIENT_SECRET  (선택) 카카오 로그인 보안의 Client Secret
 *   REDIRECT_URI         카카오에 등록한 앱 주소. 예: https://아이디.github.io/pray-for/app/
 */

const TZ = 'Asia/Seoul';
const SESSION_DAYS = 30;

// 시트 이름과 칸. 칸 이름(오른쪽)은 시트 첫 줄에 그대로 쓰여서 사람이 시트를 열어도 읽을 수 있다
const SCHEMA = {
  rooms: ['사랑방', [['id', '사랑방ID'], ['name', '이름'], ['order', '순서']]],
  families: ['가정', [['id', '가정ID'], ['name', '이름'], ['kids', '자녀'], ['status', '상태'], ['admin', '관리자']]],
  roster: ['편성', [['year', '연도'], ['roomId', '사랑방ID'], ['familyId', '가정ID'], ['role', '역할']]],
  links: ['연결', [['kakaoId', '카카오ID'], ['nick', '닉네임'], ['familyId', '가정ID'], ['person', '사람'], ['status', '상태'], ['requestedAt', '요청일'], ['approvedBy', '승인한 사람'], ['lastSeen', '마지막 접속']]],
  sessions: ['로그인', [['hash', '로그인 표시'], ['kakaoId', '카카오ID'], ['nick', '닉네임'], ['expires', '만료']]],
  items: ['기도제목', [['id', '항목ID'], ['month', '월'], ['familyId', '가정ID'], ['roomId', '당시 사랑방'], ['target', '대상'], ['text', '내용'], ['scope', '공개범위'], ['state', '상태'], ['prevId', '이전 항목ID'], ['same', '지난달과 같음'], ['order', '순서'], ['editedAt', '수정일'], ['editedBy', '고친 사람']]],
  monthly: ['월별 상태', [['month', '월'], ['familyId', '가정ID'], ['status', '상태']]],
  prayers: ['기도기록', [['at', '날짜시각'], ['by', '누른 가정ID'], ['familyId', '기도한 가정ID']]],
  posts: ['카톡 공유', [['roomId', '사랑방ID'], ['familyId', '가정ID'], ['date', '올린 날'], ['by', '올린 사람']]]
};
const SCOPES = ['room', 'leader', 'family'];

// ── 요청 받기 ─────────────────────────────────────────────

// 서버 코드를 고칠 때마다 바꾼다. 웹 앱 주소를 열면 보여서, 새 버전으로 배포됐는지 확인할 수 있다
const VERSION = '2026-10-19 지난 기록';
function doGet() {
  return ContentService.createTextOutput('코이데 서버가 켜져 있어요. (버전: ' + VERSION + ')');
}

function doPost(e) {
  let out;
  try {
    Object.keys(READ_CACHE_).forEach(k => delete READ_CACHE_[k]);
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const fn = ACTIONS[body.action];
    if (!fn) throw fail_('bad', '모르는 요청이에요.');
    out = { ok: true, data: fn(body) };
  } catch (err) {
    out = err && err.code ? { ok: false, code: err.code, message: err.message } : { ok: false, code: 'server', message: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

// 화면에서 부르는 일들. 로그인과 사랑방 목록을 빼고는 모두 연결이 승인된 사람만 쓸 수 있다
const ACTIONS = {
  login: login_,
  me: body => meInfo_(who_(body)),
  // 앱을 열 때 한 번에: 나 + (연결됐으면 이번 달, 연결 전이면 사랑방 목록). 서버와 두 번 이야기하던 것을 한 번으로
  start: body => {
    const w = who_(body), me = meInfo_(w);
    if (!w.link) return { me, rooms: roomsWithFamilies_() };
    if (w.link.status === '연결') return { me, month: monthView_(memberFrom_(w)) };
    return { me };
  },
  rooms: body => { who_(body); return roomsWithFamilies_(); },
  requestLink: requestLink_,
  month: body => monthView_(member_(body)),
  history: body => historyView_(member_(body), String(body.month || '')),
  saveItem: saveItem_,
  endItem: body => setItemState_(body, '마침'),
  deleteItem: deleteItem_,
  confirmSame: body => { const c = member_(body); setMonthly_(c.familyId, month_(), 'confirmed'); return monthView_(c); },
  pray: pray_,
  pending: body => pendingView_(leaderOrAdmin_(body)),
  approve: body => decide_(body, true),
  reject: body => decide_(body, false),
  post: body => setPosted_(body, true),
  unpost: body => setPosted_(body, false),
  importRoom: importRoom_,
  unlink: unlink_,
  logout: logout_
};

// ── 로그인 ───────────────────────────────────────────────

function login_(body) {
  const p = props_();
  if (!body.code) throw fail_('bad', '카카오 로그인 정보가 없어요.');
  if (p.REDIRECT_URI && body.redirectUri !== p.REDIRECT_URI) throw fail_('bad', '등록되지 않은 주소에서 로그인했어요.');
  const payload = { grant_type: 'authorization_code', client_id: p.KAKAO_REST_KEY, redirect_uri: body.redirectUri, code: body.code };
  if (p.KAKAO_CLIENT_SECRET) payload.client_secret = p.KAKAO_CLIENT_SECRET;
  const tok = UrlFetchApp.fetch('https://kauth.kakao.com/oauth/token', { method: 'post', payload, muteHttpExceptions: true });
  if (tok.getResponseCode() !== 200) throw fail_('kakao', '카카오 로그인을 확인하지 못했어요. 다시 해 주세요.');
  const access = JSON.parse(tok.getContentText()).access_token;
  const res = UrlFetchApp.fetch('https://kapi.kakao.com/v2/user/me', { headers: { Authorization: 'Bearer ' + access }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw fail_('kakao', '카카오 사용자 정보를 받지 못했어요.');
  const u = JSON.parse(res.getContentText());
  const kakaoId = String(u.id);
  const nick = (u.properties && u.properties.nickname) || (u.kakao_account && u.kakao_account.profile && u.kakao_account.profile.nickname) || '';
  // 앱의 로그인 표시: 무작위 값은 화면에만 주고, 시트에는 바꾼 값(해시)만 둔다
  const token = Utilities.getUuid() + Utilities.getUuid();
  append_('sessions', { hash: hash_(token), kakaoId, nick, expires: new Date(Date.now() + SESSION_DAYS * 864e5) });
  return { token, nick };
}

function logout_(body) {
  const h = hash_(body.token || '');
  read_('sessions').filter(s => s.hash === h).forEach(s => remove_('sessions', s));
  CacheService.getScriptCache().remove('tok:' + h);
  return { ok: true };
}

// 로그인 표시로 카카오ID를 찾는다. 자주 불리므로 6시간 캐시. 만료가 20일 안쪽이면 30일로 늘린다
function auth_(token) {
  if (!token) throw fail_('login', '다시 로그인해 주세요.');
  const h = hash_(token), cache = CacheService.getScriptCache();
  const hit = cache.get('tok:' + h);
  if (hit) return JSON.parse(hit);
  const s = read_('sessions').find(x => x.hash === h);
  if (!s || new Date(s.expires) < new Date()) throw fail_('login', '로그인이 끝났어요. 다시 로그인해 주세요.');
  if (new Date(s.expires) - Date.now() < 20 * 864e5) { s.expires = new Date(Date.now() + SESSION_DAYS * 864e5); update_('sessions', s); }
  const v = { kakaoId: String(s.kakaoId), nick: s.nick };
  cache.put('tok:' + h, JSON.stringify(v), 21600);
  return v;
}

// 로그인한 사람과 그 사람의 연결(요청/연결). 해제된 연결은 없는 것으로 본다
function who_(body) {
  const a = auth_(body.token);
  const link = read_('links').filter(l => String(l.kakaoId) === a.kakaoId && l.status !== '해제').pop() || null;
  return { kakaoId: a.kakaoId, nick: a.nick, link };
}

// 연결이 승인된 회원: 가정, 올해 사랑방, 역할(회원/리더/코리더), 관리자 여부
function member_(body) { return memberFrom_(who_(body)); }
function memberFrom_(w) {
  if (!w.link || w.link.status !== '연결') throw fail_('notLinked', '아직 리더의 승인을 기다리고 있어요.');
  const fam = read_('families').find(f => f.id === w.link.familyId);
  const r = read_('roster').find(x => String(x.year) === year_() && x.familyId === w.link.familyId);
  if (!fam || !r) throw fail_('notLinked', '올해 편성에서 우리 가정을 찾지 못했어요. 리더에게 알려 주세요.');
  if (w.link.lastSeen !== today_()) { w.link.lastSeen = today_(); update_('links', w.link); }
  return { kakaoId: w.kakaoId, person: w.link.person, familyId: fam.id, family: fam, roomId: r.roomId, role: r.role, admin: yes_(fam.admin) };
}

function leaderOrAdmin_(body) {
  const c = member_(body);
  if (!c.admin && c.role !== '리더' && c.role !== '코리더') throw fail_('forbidden', '리더만 할 수 있어요.');
  return c;
}

function meInfo_(w) {
  const out = { nick: w.nick, link: w.link ? { status: w.link.status, familyId: w.link.familyId, person: w.link.person } : null };
  if (w.link && w.link.status === '연결') return Object.assign(out, memberFrom_(w));
  if (w.link) {
    const fam = read_('families').find(f => f.id === w.link.familyId);
    out.familyName = fam ? fam.name : '';
  }
  return out;
}

// ── 연결 요청 ─────────────────────────────────────────────

function roomsWithFamilies_() {
  const fams = read_('families'), roster = read_('roster').filter(r => String(r.year) === year_());
  return read_('rooms').sort((a, b) => a.order - b.order).map(r => ({
    id: r.id, name: r.name,
    families: roster.filter(x => x.roomId === r.id).map(x => fams.find(f => f.id === x.familyId))
      .filter(f => f && f.status === '활동').map(f => ({ id: f.id, name: f.name }))
  }));
}

// 이미 있는 가정에 연결(familyId + person) 또는 새 가정 신청(newFamily: {a, b, kids}, roomId)
function requestLink_(body) {
  const w = who_(body);
  if (w.link && w.link.status === '연결') throw fail_('bad', '이미 연결되어 있어요.');
  return withLock_(() => {
    if (w.link) { w.link.status = '해제'; update_('links', w.link); }
    let familyId = body.familyId, person = String(body.person || '').trim();
    if (body.newFamily) {
      const a = String(body.newFamily.a || '').trim(), b = String(body.newFamily.b || '').trim();
      if (!a || !read_('rooms').some(r => r.id === body.roomId)) throw fail_('bad', '이름과 사랑방을 확인해 주세요.');
      familyId = 'F' + Date.now().toString(36);
      append_('families', { id: familyId, name: b ? a + ' · ' + b : a, kids: String(body.newFamily.kids || ''), status: '승인 대기', admin: '' });
      append_('roster', { year: year_(), roomId: body.roomId, familyId, role: '회원' });
      person = a;
    } else {
      const fam = read_('families').find(f => f.id === familyId);
      if (!fam || fam.name.split(' · ').indexOf(person) < 0) throw fail_('bad', '가정과 사람을 다시 골라 주세요.');
    }
    // 예시 데이터를 지울 때 기억해 둔 관리자는 승인해 줄 사람이 없으니, 고른 가정에 바로 연결하고 그 가정을 관리자로 만든다
    const next = String(props_().NEXT_ADMIN || '').split(',').filter(Boolean), first = next.indexOf(w.kakaoId) >= 0;
    append_('links', { kakaoId: w.kakaoId, nick: w.nick, familyId, person, status: first ? '연결' : '요청', requestedAt: today_(), approvedBy: first ? '처음 관리자' : '', lastSeen: today_() });
    if (first) {
      const fam = read_('families').find(f => f.id === familyId);
      Object.assign(fam, { status: '활동', admin: '예' }); update_('families', fam);
      const rest = next.filter(k => k !== w.kakaoId);
      if (rest.length) PropertiesService.getScriptProperties().setProperty('NEXT_ADMIN', rest.join(','));
      else PropertiesService.getScriptProperties().deleteProperty('NEXT_ADMIN');
    }
    return meInfo_(who_(body));
  });
}

// 리더(관리자는 모든 사랑방): 승인을 기다리는 요청과, 사랑방 가정마다 연결된 사람
function pendingView_(c) {
  const fams = read_('families'), links = read_('links'), roster = read_('roster').filter(r => String(r.year) === year_());
  const mine = roster.filter(r => c.admin || r.roomId === c.roomId).map(r => r.familyId);
  const famOf = id => fams.find(f => f.id === id) || {};
  const requests = links.filter(l => l.status === '요청' && mine.indexOf(l.familyId) >= 0).map(l => ({
    kakaoId: String(l.kakaoId), nick: l.nick, person: l.person, familyId: l.familyId, familyName: famOf(l.familyId).name,
    newFamily: famOf(l.familyId).status === '승인 대기', kids: famOf(l.familyId).kids || '', requestedAt: fmtDay_(l.requestedAt)
  }));
  const families = roster.filter(r => r.roomId === c.roomId).map(r => famOf(r.familyId)).filter(f => f.status === '활동').map(f => ({
    id: f.id, name: f.name,
    linked: links.filter(l => l.familyId === f.id && l.status === '연결').map(l => ({ kakaoId: String(l.kakaoId), person: l.person }))
  }));
  // 카톡방에 올린 날: 가정마다 마지막으로 올린 날(yyyy-MM-dd)
  const posts = {};
  read_('posts').filter(p => p.roomId === c.roomId).forEach(p => { if (!posts[p.familyId] || p.date > posts[p.familyId]) posts[p.familyId] = p.date; });
  return { requests, families, posts, today: today_() };
}

// 기존 시트 가져오기(관리자): 사랑방 탭 하나를 화면에서 나눠 보낸 것을 이번 달 기도제목으로 넣는다.
//  body: { roomName, families: [{ a, b, kids: [..], items: [{ target, text }] }] }
//  없는 사랑방·가정은 만들고, 이미 있는 가정은 이번 달 기도제목을 가져온 것으로 바꾼다. 실제 교인 내용은 이 시트에만 남는다
function importRoom_(body) {
  const c = member_(body);
  if (!c.admin) throw fail_('forbidden', '관리자만 가져올 수 있어요.');
  const roomName = String(body.roomName || '').trim(), list = Array.isArray(body.families) ? body.families : [];
  if (!roomName || !list.length) throw fail_('bad', '사랑방 이름과 가정을 확인해 주세요.');
  return withLock_(() => {
    const m = month_(), y = year_(), now = new Date();
    const rooms = read_('rooms');
    let room = rooms.find(r => r.name === roomName);
    if (!room) {
      room = { id: 'R' + Date.now().toString(36), name: roomName, order: rooms.reduce((a, r) => Math.max(a, r.order), 0) + 1 };
      append_('rooms', room);
    }
    let made = 0, replaced = 0, count = 0;
    const newFams = [], newRoster = [], newItems = [], monthly = [], drop = [];
    list.forEach((f, n) => {
      const a = String(f.a || '').trim(), b = String(f.b || '').trim();
      if (!a) return;
      const name = b ? a + ' · ' + b : a, kids = (f.kids || []).map(k => String(k).trim()).filter(Boolean);
      let fam = read_('families').find(x => x.name === name && x.status === '활동');
      if (fam) {
        const had = fam.kids ? String(fam.kids).split(/\s*,\s*/) : [];
        const all = had.concat(kids.filter(k => had.indexOf(k) < 0));
        if (all.join(',') !== had.join(',')) { fam.kids = all.join(', '); update_('families', fam); }
        const old = read_('items').filter(i => i.familyId === fam.id && i.month === m);
        if (old.length) { replaced++; drop.push(...old); }
      } else {
        fam = { id: 'F' + Date.now().toString(36) + n, name, kids: kids.join(', '), status: '활동', admin: '' };
        newFams.push(fam); made++;
      }
      if (!read_('roster').some(r => String(r.year) === y && r.familyId === fam.id)) newRoster.push({ year: y, roomId: room.id, familyId: fam.id, role: '회원' });
      (f.items || []).forEach((it, k) => {
        const text = String(it.text || '').trim(); if (!text) return;
        newItems.push({ id: newId_(), month: m, familyId: fam.id, roomId: room.id, target: String(it.target || '우리 가정').trim().slice(0, 10),
          text, scope: 'room', state: '이어짐', prevId: '', same: '아니오', order: k + 1, editedAt: now, editedBy: '가져옴' });
        count++;
      });
      monthly.push(fam.id);
    });
    drop.sort((p, q) => q._row - p._row).forEach(i => remove_('items', i));
    appendMany_('families', newFams); appendMany_('roster', newRoster); appendMany_('items', newItems);
    monthly.forEach(id => setMonthly_(id, m, 'same'));
    return { room: room.name, families: list.length, made, replaced, items: count };
  });
}

// 리더가 카톡용 문구를 복사하면 오늘 올린 것으로 적고, "올림 표시 지우기"면 오늘 적은 것을 지운다
function setPosted_(body, on) {
  const c = leaderOrAdmin_(body);
  if (!canManage_(c, body.familyId)) throw fail_('bad', '우리 사랑방 가정이 아니에요.');
  return withLock_(() => {
    const today = read_('posts').filter(p => p.roomId === c.roomId && p.familyId === body.familyId && p.date === today_());
    if (on && !today.length) append_('posts', { roomId: c.roomId, familyId: body.familyId, date: today_(), by: c.person });
    if (!on) today.sort((a, b) => b._row - a._row).forEach(p => remove_('posts', p));
    return pendingView_(c);
  });
}

function decide_(body, ok) {
  const c = leaderOrAdmin_(body);
  return withLock_(() => {
    const l = read_('links').find(x => String(x.kakaoId) === String(body.kakaoId) && x.status === '요청');
    if (!l || !canManage_(c, l.familyId)) throw fail_('bad', '요청을 찾지 못했어요.');
    l.status = ok ? '연결' : '해제'; l.approvedBy = c.person; update_('links', l);
    const f = read_('families').find(x => x.id === l.familyId);
    if (f && f.status === '승인 대기') { f.status = ok ? '활동' : '거절'; update_('families', f); }
    return pendingView_(c);
  });
}

function unlink_(body) {
  const c = leaderOrAdmin_(body);
  return withLock_(() => {
    const l = read_('links').find(x => String(x.kakaoId) === String(body.kakaoId) && x.status === '연결');
    if (!l || !canManage_(c, l.familyId)) throw fail_('bad', '연결을 찾지 못했어요.');
    if (String(l.kakaoId) === c.kakaoId) throw fail_('bad', '내 연결은 여기서 해제할 수 없어요.');
    l.status = '해제'; l.approvedBy = c.person; update_('links', l);
    return pendingView_(c);
  });
}

function canManage_(c, familyId) {
  return c.admin || read_('roster').some(r => String(r.year) === year_() && r.familyId === familyId && r.roomId === c.roomId);
}

// ── 이번 달 ──────────────────────────────────────────────

// 우리 사랑방 가정과 기도제목. 공개 범위: room은 모두, leader는 리더·코리더와 우리 가정, family는 우리 가정만
// 지난 기록: 과거 기록은 그때 함께한 사람에게만 보인다(설계서 '지난 기록 열람 규칙').
//  그 달이 속한 해의 편성에서 우리 가정이 있던 사랑방을 보여 주고, 사랑방 공개 항목(그때 리더·코리더였으면 리더·목사님 항목까지)을,
//  우리 가정은 모든 항목을 보여 준다. 마친 항목도 그 달의 기록이라 '마침'으로 남긴다
//  돌려주는 것: months(볼 수 있는 달, 최근 순), month(고른 달), room, families(그 달 사랑방), mine(우리 가정의 달마다 기도제목)
function historyView_(c, want) {
  const items = read_('items'), rooms = read_('rooms'), fams = read_('families'), roster = read_('roster');
  const myRoom = y => roster.find(r => String(r.year) === y && r.familyId === c.familyId);
  const seen = {};
  items.forEach(i => { const r = myRoom(i.month.slice(0, 4)); if (i.familyId === c.familyId || (r && i.roomId === r.roomId)) seen[i.month] = true; });
  const months = Object.keys(seen).sort().reverse();
  const m = months.indexOf(want) >= 0 ? want : (months.find(x => x < month_()) || months[0] || month_());
  const r = myRoom(m.slice(0, 4)), lead = !!r && (r.role === '리더' || r.role === '코리더');
  const show = i => ({ target: i.target, text: i.text, scope: i.scope, ended: i.state === '마침' });
  const families = !r ? [] : roster.filter(x => String(x.year) === m.slice(0, 4) && x.roomId === r.roomId).map(x => {
    const f = fams.find(y => y.id === x.familyId); if (!f) return null;
    const own = f.id === c.familyId;
    const its = items.filter(i => i.month === m && i.familyId === f.id && (own || i.scope === 'room' || (i.scope === 'leader' && lead)))
      .sort((a, b) => a.order - b.order).map(show);
    return { id: f.id, name: f.name, own, items: its };
  }).filter(Boolean).sort((a, b) => b.own - a.own);
  const mine = months.map(mm => ({ month: mm, items: items.filter(i => i.month === mm && i.familyId === c.familyId).sort((a, b) => a.order - b.order).map(show) }))
    .filter(x => x.items.length);
  const room = r ? rooms.find(x => x.id === r.roomId) : null;
  return { months, month: m, now: month_(), room: room ? room.name : '', families, mine };
}

function monthView_(c) {
  const m = month_();
  ensureMonth_(c.roomId, m);
  const fams = read_('families'), roster = read_('roster').filter(r => String(r.year) === year_() && r.roomId === c.roomId);
  const items = read_('items').filter(i => i.month === m && i.state !== '마침');
  const monthly = read_('monthly').filter(x => x.month === m);
  const prayed = read_('prayers').filter(p => fmtMonth_(p.at) === m && p.by === c.familyId);
  const isLeader = c.role === '리더' || c.role === '코리더';
  const room = read_('rooms').find(r => r.id === c.roomId) || {};
  const families = roster.map(r => fams.find(f => f.id === r.familyId)).filter(f => f && f.status === '활동').map(f => {
    const own = f.id === c.familyId;
    const st = monthly.find(x => x.familyId === f.id);
    return {
      id: f.id, name: f.name, kids: f.kids ? String(f.kids).split(/\s*,\s*/) : [], own,
      status: st ? st.status : 'same',
      prayed: prayed.filter(p => p.familyId === f.id).length,
      today: prayed.filter(p => p.familyId === f.id && fmtDate_(p.at) === today_()).length,
      items: items.filter(i => i.familyId === f.id && (own || i.scope === 'room' || (i.scope === 'leader' && isLeader)))
        .sort((a, b) => a.order - b.order)
        .map(i => ({ id: i.id, target: i.target, text: i.text, scope: i.scope, same: yes_(i.same), isNew: !i.prevId && !yes_(i.same),
          editedBy: own ? i.editedBy : '', editedAt: own ? fmtDay_(i.editedAt) : '' }))
    };
  });
  return { month: m, room: { id: room.id, name: room.name }, me: { person: c.person, familyId: c.familyId, role: c.role, admin: c.admin }, families };
}

// 월초 이월: 이번 달 기도제목이 없는 가정은 지난달 것(마치지 않은 것)을 이어 붙이고 "지난달과 같음"으로 둔다
function ensureMonth_(roomId, m) {
  const prev = prevMonth_(m);
  const famIds = read_('roster').filter(r => String(r.year) === year_() && r.roomId === roomId).map(r => r.familyId);
  const items = read_('items');
  const need = famIds.filter(id => !items.some(i => i.month === m && i.familyId === id) && items.some(i => i.month === prev && i.familyId === id && i.state !== '마침'));
  if (!need.length) return;
  withLock_(() => {
    const now = read_('items');
    need.forEach(id => {
      if (now.some(i => i.month === m && i.familyId === id)) return; // 그 사이 다른 요청이 이미 옮겼다
      now.filter(i => i.month === prev && i.familyId === id && i.state !== '마침').forEach(i => append_('items', {
        id: newId_(), month: m, familyId: id, roomId, target: i.target, text: i.text, scope: i.scope, state: '이어짐',
        prevId: i.id, same: '예', order: i.order, editedAt: i.editedAt, editedBy: i.editedBy
      }));
      setMonthly_(id, m, 'same');
    });
  });
}

function saveItem_(body) {
  const c = member_(body), m = month_();
  const text = String(body.text || '').trim(), target = String(body.target || '우리 가정').trim().slice(0, 10);
  const scope = SCOPES.indexOf(body.scope) >= 0 ? body.scope : 'room';
  if (!text) throw fail_('bad', '내용을 적어 주세요.');
  return withLock_(() => {
    if (body.id) {
      const i = read_('items').find(x => x.id === body.id && x.familyId === c.familyId && x.month === m);
      if (!i) throw fail_('bad', '고칠 기도제목을 찾지 못했어요.');
      Object.assign(i, { text, target, scope, same: '아니오', editedAt: new Date(), editedBy: c.person });
      update_('items', i);
    } else {
      const order = read_('items').filter(x => x.familyId === c.familyId && x.month === m).reduce((a, x) => Math.max(a, Number(x.order) || 0), 0) + 1;
      append_('items', { id: newId_(), month: m, familyId: c.familyId, roomId: c.roomId, target, text, scope, state: '이어짐', prevId: '', same: '아니오', order, editedAt: new Date(), editedBy: c.person });
    }
    setMonthly_(c.familyId, m, 'edited');
    return monthView_(c);
  });
}

// 마치기: 지난 기록에는 남고 다음 달로 넘어가지 않는다
function setItemState_(body, state) {
  const c = member_(body), m = month_();
  return withLock_(() => {
    const i = read_('items').find(x => x.id === body.id && x.familyId === c.familyId && x.month === m);
    if (!i) throw fail_('bad', '기도제목을 찾지 못했어요.');
    i.state = state; i.editedAt = new Date(); i.editedBy = c.person; update_('items', i);
    setMonthly_(c.familyId, m, 'edited');
    return monthView_(c);
  });
}

// 지우기: 잘못 쓴 것. 행을 남기지 않는다
function deleteItem_(body) {
  const c = member_(body), m = month_();
  return withLock_(() => {
    const i = read_('items').find(x => x.id === body.id && x.familyId === c.familyId && x.month === m);
    if (!i) throw fail_('bad', '기도제목을 찾지 못했어요.');
    remove_('items', i);
    setMonthly_(c.familyId, m, 'edited');
    return monthView_(c);
  });
}

// 기도했어요: 우리 사랑방 가정만, 한 가정에 하루 3번까지
function pray_(body) {
  const c = member_(body);
  if (!read_('roster').some(r => String(r.year) === year_() && r.roomId === c.roomId && r.familyId === body.familyId)) throw fail_('bad', '우리 사랑방 가정이 아니에요.');
  // prayed: 이번 달 횟수, today: 오늘 횟수(가정마다 하루 3번까지)
  const mine = read_('prayers').filter(p => p.by === c.familyId && p.familyId === body.familyId && fmtMonth_(p.at) === month_());
  const n = mine.filter(p => fmtDate_(p.at) === today_()).length;
  if (n >= 3) return { prayed: mine.length, today: n, capped: true };
  append_('prayers', { at: new Date(), by: c.familyId, familyId: body.familyId });
  return { prayed: mine.length + 1, today: n + 1, capped: n + 1 >= 3 };
}

function setMonthly_(familyId, m, status) {
  const row = read_('monthly').find(x => x.month === m && x.familyId === familyId);
  if (row) { if (row.status !== status) { row.status = status; update_('monthly', row); } }
  else append_('monthly', { month: m, familyId, status });
}

// ── 처음 한 번: 시트 만들기와 예시 데이터 ─────────────────────

// Apps Script 편집기에서 setup을 한 번 실행하면 시트(탭)와 첫 줄이 만들어진다. 이미 있으면 건드리지 않는다
function setup() {
  const ss = ss_();
  Object.keys(SCHEMA).forEach(k => {
    const [name, cols] = SCHEMA[k];
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) { sh.getRange(1, 1, 1, cols.length).setValues([cols.map(c => c[1])]); sh.setFrozenRows(1); }
  });
  const first = ss.getSheets()[0];
  if (first && !SCHEMA_NAMES_().includes(first.getName()) && first.getLastRow() === 0) ss.deleteSheet(first);
  return '시트를 만들었어요.';
}

// 지어낸 이름으로 된 예시 데이터. 실제 교인 이름과 기도제목은 동의를 받은 뒤 따로 옮긴다
function sampleData() {
  setup();
  if (read_('rooms').length) return '이미 데이터가 있어서 넣지 않았어요.';
  const y = year_(), m = month_(), prev = prevMonth_(m);
  append_('rooms', { id: 'R1', name: '2-20 사랑방', order: 1 });
  append_('rooms', { id: 'R2', name: '2-21 사랑방', order: 2 });
  const fams = [
    ['F1', '김도윤 · 이수아', '하준', '예', 'R1', '리더'], ['F2', '박민재 · 최예린', '서윤', '', 'R1', '회원'], ['F3', '정우진 · 한지민', '', '', 'R1', '회원'],
    ['F4', '오세훈 · 윤가은', '도하', '', 'R1', '코리더'], ['F5', '서준호 · 임채원', '', '', 'R1', '회원'], ['F6', '임재현 · 고은비', '', '', 'R2', '리더'], ['F7', '송민석 · 유하린', '', '', 'R2', '회원']
  ];
  fams.forEach(([id, name, kids, admin, roomId, role]) => {
    append_('families', { id, name, kids, status: '활동', admin });
    append_('roster', { year: y, roomId, familyId: id, role });
  });
  const it = (fid, roomId, target, text, scope, order, by) => append_('items', { id: newId_(), month: prev, familyId: fid, roomId, target, text, scope, state: '이어짐', prevId: '', same: '아니오', order, editedAt: new Date(), editedBy: by });
  it('F1', 'R1', '우리 가정', '이사할 집을 잘 만나도록', 'room', 1, '김도윤');
  it('F1', 'R1', '하준', '어린이집 새 반에 잘 적응하도록', 'room', 2, '이수아');
  it('F1', 'R1', '아내', '복직 전까지 몸과 마음이 회복되도록', 'leader', 3, '이수아');
  it('F2', 'R1', '우리 가정', '매일 10분이라도 가족이 함께 말씀 읽기', 'room', 1, '박민재');
  it('F3', 'R1', '아내', '임신 기간 건강하게 지내도록', 'room', 1, '한지민');
  it('F4', 'R1', '부모님', '부모님이 신앙을 갖도록', 'room', 1, '오세훈');
  it('F6', 'R2', '우리 가정', '새 직장에 잘 적응하도록', 'room', 1, '임재현');
  return '예시 데이터를 넣었어요. ' + m + '월 기도제목은 처음 열 때 ' + prev + '에서 이어 붙여져요.';
}

// 실제로 쓰기 전에 한 번: sampleData로 넣은 예시 가정(가정ID와 이름이 모두 같을 때만)과 그 기도제목·편성·월별 상태·
//  기도기록·카톡 공유·연결을 지우고, 가정이 남지 않은 예시 사랑방도 지운다. Apps Script 편집기에서 실행한다.
//  예시 가정에 연결돼 있던 관리자의 카카오 계정은 기억해 두었다가, 앱에서 실제 우리 가정을 고르면 승인 없이 연결하고 관리자로 만든다
const SAMPLE_FAMILIES_ = [['F1', '김도윤 · 이수아'], ['F2', '박민재 · 최예린'], ['F3', '정우진 · 한지민'], ['F4', '오세훈 · 윤가은'], ['F5', '서준호 · 임채원'], ['F6', '임재현 · 고은비'], ['F7', '송민석 · 유하린']];
function clearSampleData() {
  return withLock_(() => {
    const fams = read_('families');
    const ids = SAMPLE_FAMILIES_.filter(([id, name]) => fams.some(f => f.id === id && f.name === name)).map(([id]) => id);
    if (!ids.length) return '지울 예시 가정이 없어요.';
    const admins = read_('links').filter(l => ids.indexOf(l.familyId) >= 0 && l.status === '연결' && fams.some(f => f.id === l.familyId && yes_(f.admin))).map(l => String(l.kakaoId));
    const del = (key, hit) => read_(key).filter(hit).sort((a, b) => b._row - a._row).forEach(o => remove_(key, o));
    const mine = o => ids.indexOf(o.familyId) >= 0;
    del('items', mine); del('roster', mine); del('monthly', mine); del('posts', mine); del('links', mine);
    del('prayers', p => mine(p) || ids.indexOf(p.by) >= 0);
    del('families', f => ids.indexOf(f.id) >= 0);
    del('rooms', r => (r.id === 'R1' || r.id === 'R2') && !read_('roster').some(x => x.roomId === r.id));
    if (admins.length) PropertiesService.getScriptProperties().setProperty('NEXT_ADMIN', admins.join(','));
    return '예시 가정 ' + ids.length + '곳을 지웠어요.' + (admins.length ? ' 앱을 다시 열어 실제 우리 가정을 고르면 바로 연결되고 관리자가 돼요.' : '');
  });
}

// ── 시트 읽고 쓰기 ────────────────────────────────────────

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function SCHEMA_NAMES_() { return Object.keys(SCHEMA).map(k => SCHEMA[k][0]); }
function sheet_(key) {
  let sh = ss_().getSheetByName(SCHEMA[key][0]);
  // 새 버전에서 늘어난 시트(카톡 공유 등)는 처음 쓸 때 만든다. setup을 다시 실행하지 않아도 되게
  if (!sh) { setup(); sh = ss_().getSheetByName(SCHEMA[key][0]); }
  return sh;
}

// 한 요청 안에서는 같은 시트를 한 번만 읽는다(쓰면 다시 읽음)
const READ_CACHE_ = {};
function read_(key) {
  if (READ_CACHE_[key]) return READ_CACHE_[key];
  const sh = sheet_(key), cols = SCHEMA[key][1];
  const n = sh.getLastRow() - 1;
  const values = n > 0 ? sh.getRange(2, 1, n, cols.length).getValues() : [];
  READ_CACHE_[key] = values.map((r, i) => {
    const o = { _row: i + 2 };
    cols.forEach((c, k) => { o[c[0]] = r[k] instanceof Date ? r[k].toISOString() : String(r[k]); });
    if (o.order !== undefined) o.order = Number(o.order) || 0;
    return o;
  }).filter(o => cols.some(c => o[c[0]] !== ''));
  return READ_CACHE_[key];
}
// 모든 값을 글자로 저장한다. 숫자·날짜처럼 보이는 글자(2026-10 등)와 =로 시작하는 글자는 앞에 '를 붙여
//  시트가 날짜·수식으로 바꾸지 않게 한다(시트에는 '가 보이지 않는다)
function rowOf_(key, o) {
  return SCHEMA[key][1].map(c => {
    let v = o[c[0]];
    if (v === undefined || v === null) return '';
    v = v instanceof Date ? v.toISOString() : String(v);
    return /^[=+\-@\d]/.test(v) ? "'" + v : v;
  });
}
// 여러 줄을 한 번에 쓴다(가져오기처럼 많을 때 한 줄씩 쓰면 느리다)
function appendMany_(key, list) {
  if (!list.length) return;
  const sh = sheet_(key);
  sh.getRange(sh.getLastRow() + 1, 1, list.length, SCHEMA[key][1].length).setValues(list.map(o => rowOf_(key, o)));
  delete READ_CACHE_[key];
}
function append_(key, o) { sheet_(key).appendRow(rowOf_(key, o)); delete READ_CACHE_[key]; }
function update_(key, o) { sheet_(key).getRange(o._row, 1, 1, SCHEMA[key][1].length).setValues([rowOf_(key, o)]); delete READ_CACHE_[key]; }
function remove_(key, o) { sheet_(key).deleteRow(o._row); delete READ_CACHE_[key]; }

// 저장은 한 번에 하나씩(주일처럼 몰릴 때 서로 덮어쓰지 않게)
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw fail_('busy', '지금 사람이 많아요. 잠시 뒤 다시 해 주세요.');
  try { Object.keys(READ_CACHE_).forEach(k => delete READ_CACHE_[k]); return fn(); } finally { lock.releaseLock(); }
}

// ── 작은 도구 ────────────────────────────────────────────

function props_() { return PropertiesService.getScriptProperties().getProperties(); }
function fail_(code, message) { const e = new Error(message); e.code = code; return e; }
function yes_(v) { return v === true || v === '예' || v === 'TRUE' || v === 'true'; }
function newId_() { return 'I' + Utilities.getUuid().replace(/-/g, '').slice(0, 10); }
function hash_(s) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s).map(b => ('0' + (b & 255).toString(16)).slice(-2)).join(''); }
function fmt_(d, f) { return d ? Utilities.formatDate(new Date(d), TZ, f) : ''; }
function month_() { return fmt_(new Date(), 'yyyy-MM'); }
function year_() { return fmt_(new Date(), 'yyyy'); }
function today_() { return fmt_(new Date(), 'yyyy-MM-dd'); }
function fmtDate_(d) { return fmt_(d, 'yyyy-MM-dd'); }
function fmtMonth_(d) { return fmt_(d, 'yyyy-MM'); }
function fmtDay_(d) { return d ? fmt_(d, 'M월 d일') : ''; }
function prevMonth_(m) { const [y, mo] = m.split('-').map(Number); return mo === 1 ? (y - 1) + '-12' : y + '-' + String(mo - 1).padStart(2, '0'); }
