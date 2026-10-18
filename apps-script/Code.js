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
  prayers: ['기도기록', [['at', '날짜시각'], ['by', '누른 가정ID'], ['familyId', '기도한 가정ID']]]
};
const SCOPES = ['room', 'leader', 'family'];

// ── 요청 받기 ─────────────────────────────────────────────

function doGet() {
  return ContentService.createTextOutput('코이데 서버가 켜져 있어요.');
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
  rooms: body => { who_(body); return roomsWithFamilies_(); },
  requestLink: requestLink_,
  month: body => monthView_(member_(body)),
  saveItem: saveItem_,
  endItem: body => setItemState_(body, '마침'),
  deleteItem: deleteItem_,
  confirmSame: body => { const c = member_(body); setMonthly_(c.familyId, month_(), 'confirmed'); return monthView_(c); },
  pray: pray_,
  pending: body => pendingView_(leaderOrAdmin_(body)),
  approve: body => decide_(body, true),
  reject: body => decide_(body, false),
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
    append_('links', { kakaoId: w.kakaoId, nick: w.nick, familyId, person, status: '요청', requestedAt: today_(), approvedBy: '', lastSeen: today_() });
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
  return { requests, families };
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
  const today = today_();
  const n = read_('prayers').filter(p => p.by === c.familyId && p.familyId === body.familyId && fmtDate_(p.at) === today).length;
  if (n >= 3) return { prayed: n, capped: true };
  append_('prayers', { at: new Date(), by: c.familyId, familyId: body.familyId });
  return { prayed: n + 1, capped: n + 1 >= 3 };
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

// ── 시트 읽고 쓰기 ────────────────────────────────────────

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function SCHEMA_NAMES_() { return Object.keys(SCHEMA).map(k => SCHEMA[k][0]); }
function sheet_(key) {
  const sh = ss_().getSheetByName(SCHEMA[key][0]);
  if (!sh) throw fail_('server', '"' + SCHEMA[key][0] + '" 시트가 없어요. setup을 먼저 실행해 주세요.');
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
