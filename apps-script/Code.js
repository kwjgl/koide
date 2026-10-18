/**
 * 코이데 서버 (Google Apps Script)
 *
 * 구글 시트 하나를 저장소로 쓰고, 화면(GitHub Pages)은 이 웹 앱에 POST로 요청을 보낸다.
 * 이 파일 하나를 시트의 "확장 프로그램 > Apps Script"에 붙여 넣으면 된다. 자세한 순서는 docs/setup.md.
 *
 * - 로그인: 카카오 로그인으로 받은 code를 여기서 카카오에 직접 확인하고, 앱의 로그인 표시(30일)를 내준다
 * - 연결: 카카오 계정을 가정 안의 실제 사람(김도윤/이수아)과 잇고, 처음 연결은 리더가 승인한다
 * - 기도제목: 달마다 쌓는다. 그 달 기도제목이 없으면 지난달 것을 이어 붙인다(월초 이월)
 * - 부서: 교회 > 부서(청장년부, 청년부) > 소그룹(사랑방, 순) > 가정 또는 개인. 부서마다 소그룹 이름과 단위가 다르고,
 *   관리자는 자기 부서만 관리한다. 부서 탭은 처음 요청 때 저절로 생기고, 예전 사랑방은 모두 청장년부로 들어간다
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
  depts: ['부서', [['id', '부서ID'], ['name', '이름'], ['group', '소그룹 이름'], ['unit', '단위'], ['order', '순서']]],
  rooms: ['사랑방', [['id', '사랑방ID'], ['name', '이름'], ['order', '순서'], ['deptId', '부서ID']]],
  families: ['가정', [['id', '가정ID'], ['name', '이름'], ['kids', '자녀'], ['status', '상태'], ['admin', '관리자']]],
  roster: ['편성', [['year', '연도'], ['roomId', '사랑방ID'], ['familyId', '가정ID'], ['role', '역할']]],
  links: ['연결', [['kakaoId', '카카오ID'], ['nick', '닉네임'], ['familyId', '가정ID'], ['person', '사람'], ['status', '상태'], ['requestedAt', '요청일'], ['approvedBy', '승인한 사람'], ['lastSeen', '마지막 접속']]],
  sessions: ['로그인', [['hash', '로그인 표시'], ['kakaoId', '카카오ID'], ['nick', '닉네임'], ['expires', '만료']]],
  items: ['기도제목', [['id', '항목ID'], ['month', '월'], ['familyId', '가정ID'], ['roomId', '당시 사랑방'], ['target', '대상'], ['text', '내용'], ['scope', '공개범위'], ['state', '상태'], ['prevId', '이전 항목ID'], ['same', '지난달과 같음'], ['order', '순서'], ['editedAt', '수정일'], ['editedBy', '고친 사람']]],
  monthly: ['월별 상태', [['month', '월'], ['familyId', '가정ID'], ['status', '상태']]],
  // 누른 사람 카카오ID: 부부가 따로 들어와도 '기도했어요' 횟수는 사람마다 센다(이 칸이 생기기 전 기록은 비어 있다)
  prayers: ['기도기록', [['at', '날짜시각'], ['by', '누른 가정ID'], ['familyId', '기도한 가정ID'], ['kakaoId', '누른 사람 카카오ID']]],
  posts: ['카톡 공유', [['roomId', '사랑방ID'], ['familyId', '가정ID'], ['date', '올린 날'], ['by', '올린 사람']]],
  // 교역자(목사님 부부, 장로님 등): 부서를 섬기는 가정. 가정 탭에 상태 '교역자'로 한 줄 두고(사랑방 편성 없음), 여기서 부서와 카드 이름을 정한다.
  //  섬기는 분들이 '예'면 그 부서 회원의 이번 달 화면 맨 아래 '섬기는 분들' 카드와 기도하기 마지막 장에 나온다
  staff: ['교역자', [['familyId', '가정ID'], ['deptId', '부서ID'], ['label', '카드 이름'], ['title', '직분'], ['serve', '섬기는 분들'], ['status', '상태'], ['endedAt', '종료일']]],
  // 사용기록(설계서 10장): 행동과 숫자·선택지만. 이름·기도제목·가정ID는 넣지 않고, 기기ID는 기기마다 무작위 값이다
  usage: ['사용기록', [['at', '날짜시각'], ['device', '기기ID'], ['deptId', '부서ID'], ['event', '사건'], ['data', '덧붙임']]]
};
const SCOPES = ['room', 'leader', 'family'];
// 교역자의 공개 범위: dept(부서 공개, 섬기는 분들 카드에 나옴) / family(우리 가정만)
const STAFF_SCOPES = ['dept', 'family'];
const STAFF_TITLES = ['목사님', '전도사님', '장로님'];
// 부서 탭이 비어 있을 때 만드는 첫 부서. 단위: 가정(부부·자녀) 또는 개인(한 사람)
const FIRST_DEPT = { id: 'D1', name: '청장년부', group: '사랑방', unit: '가정', order: 1 };

// ── 요청 받기 ─────────────────────────────────────────────

// 서버 코드를 고칠 때마다 바꾼다. 웹 앱 주소를 열면 보여서, 새 버전으로 배포됐는지 확인할 수 있다
const VERSION = '2026-10-18 목사님 홈';
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
  // 앱을 열 때 한 번에: 나 + (연결됐으면 이번 달, 연결 전이면 부서와 사랑방 목록). 서버와 두 번 이야기하던 것을 한 번으로
  start: body => {
    const w = who_(body), me = meInfo_(w);
    // 기기에 모아 둔 사용기록을 앱을 열 때 함께 받는다(요청을 따로 보내지 않게)
    const usage = body.events ? usage_(w, body) : undefined;
    if (!w.link) return { me, depts: deptsWithRooms_(), usage };
    if (w.link.status === '연결') return { me, month: monthView_(memberFrom_(w)), usage };
    return { me, usage };
  },
  rooms: body => { who_(body); return roomsWithFamilies_(); },
  requestLink: requestLink_,
  month: body => monthView_(member_(body)),
  room: body => staffRoomView_(member_(body), body.roomId),
  history: body => historyView_(member_(body), String(body.month || '')),
  saveItem: saveItem_,
  endItem: body => setItemState_(body, '마침'),
  reopenItem: body => setItemState_(body, '이어짐'),
  saveFamily: saveFamily_,
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
  logout: logout_,
  usage: body => usage_(who_(body), body),
  saveStaff: saveStaff_,
  endStaff: endStaff_
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

// 연결이 승인된 회원: 가정, 올해 사랑방과 그 부서, 역할(회원/리더/코리더), 관리자 여부(자기 부서)
function member_(body) { return memberFrom_(who_(body)); }
function memberFrom_(w) {
  if (!w.link || w.link.status !== '연결') throw fail_('notLinked', '아직 리더의 승인을 기다리고 있어요.');
  const fam = read_('families').find(f => f.id === w.link.familyId);
  const r = read_('roster').find(x => String(x.year) === year_() && x.familyId === w.link.familyId);
  // 교역자는 사랑방 편성 없이 교역자 탭으로 부서에 속한다
  const st = !r && fam ? staffOf_(fam.id) : null;
  if (!fam || (!r && !st)) throw fail_('notLinked', st === null && fam && fam.status === '교역자' ? '교역자 목록에서 빠졌어요. 관리자에게 알려 주세요.' : '올해 편성에서 우리 가정을 찾지 못했어요. 리더에게 알려 주세요.');
  if (w.link.lastSeen !== today_()) { w.link.lastSeen = today_(); update_('links', w.link); }
  if (st) {
    const d = deptById_(st.deptId);
    return { kakaoId: w.kakaoId, person: w.link.person, familyId: fam.id, family: fam, roomId: '', deptId: d.id, dept: deptInfo_(d), role: st.title, admin: yes_(fam.admin), staff: true, label: st.label };
  }
  const dept = deptOfRoom_(r.roomId);
  return { kakaoId: w.kakaoId, person: w.link.person, familyId: fam.id, family: fam, roomId: r.roomId, deptId: dept.id, dept: deptInfo_(dept), role: r.role, admin: yes_(fam.admin) };
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
    out.staff = !!fam && fam.status === '교역자';
  }
  return out;
}

// ── 연결 요청 ─────────────────────────────────────────────

function roomsWithFamilies_() {
  const fams = read_('families'), roster = read_('roster').filter(r => String(r.year) === year_());
  return read_('rooms').sort((a, b) => a.order - b.order).map(r => ({
    id: r.id, name: r.name, deptId: deptOfRoom_(r.id).id,
    families: roster.filter(x => x.roomId === r.id).map(x => fams.find(f => f.id === x.familyId))
      .filter(f => f && f.status === '활동').map(f => ({ id: f.id, name: f.name }))
  }));
}
// 첫 접속에서 고르는 순서대로: 부서 → 그 부서의 사랑방 → 가정
function deptsWithRooms_() {
  const rooms = roomsWithFamilies_();
  // 교역자는 사랑방 대신 '목사님·장로님으로 들어가기'에서 고른다
  const fams = read_('families');
  return depts_().map(d => Object.assign(deptInfo_(d), { rooms: rooms.filter(r => r.deptId === d.id),
    staff: activeStaff_(d.id).map(s => ({ id: s.familyId, name: (fams.find(f => f.id === s.familyId) || {}).name || '', label: s.label })).filter(s => s.name) }))
    .filter(d => d.rooms.length || d.staff.length);
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
      // 개인 단위 부서(청년부)는 한 사람이 한 줄이라 배우자·자녀를 받지 않는다
      const one = deptOfRoom_(body.roomId).unit === '개인';
      append_('families', { id: familyId, name: b && !one ? a + ' · ' + b : a, kids: one ? '' : String(body.newFamily.kids || ''), status: '승인 대기', admin: '' });
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

// 리더(관리자는 우리 부서의 모든 사랑방): 승인을 기다리는 요청과, 사랑방 가정마다 연결된 사람
function pendingView_(c) {
  const fams = read_('families'), links = read_('links'), roster = read_('roster').filter(r => String(r.year) === year_());
  const deptRooms = roomIdsOfDept_(c.deptId);
  const mine = roster.filter(r => c.admin ? deptRooms.indexOf(r.roomId) >= 0 : r.roomId === c.roomId).map(r => r.familyId);
  // 교역자의 연결 요청은 그 부서 관리자가 승인한다
  if (c.admin) activeStaff_(c.deptId).forEach(s => mine.push(s.familyId));
  const famOf = id => fams.find(f => f.id === id) || {};
  const requests = links.filter(l => l.status === '요청' && mine.indexOf(l.familyId) >= 0).map(l => ({
    // 교역자 요청은 가정 이름 대신 카드 이름(조믿음 장로님)으로 보여 준다
    kakaoId: String(l.kakaoId), nick: l.nick, person: l.person, familyId: l.familyId, familyName: (staffOf_(l.familyId) || {}).label || famOf(l.familyId).name,
    newFamily: famOf(l.familyId).status === '승인 대기', kids: famOf(l.familyId).kids || '', requestedAt: fmtDay_(l.requestedAt)
  }));
  const families = roster.filter(r => r.roomId === c.roomId).map(r => famOf(r.familyId)).filter(f => f.status === '활동').map(f => ({
    id: f.id, name: f.name,
    linked: links.filter(l => l.familyId === f.id && l.status === '연결').map(l => ({ kakaoId: String(l.kakaoId), person: l.person }))
  }));
  // 카톡방에 올린 날: 가정마다 마지막으로 올린 날(yyyy-MM-dd)
  const posts = {};
  read_('posts').filter(p => p.roomId === c.roomId).forEach(p => { if (!posts[p.familyId] || p.date > posts[p.familyId]) posts[p.familyId] = p.date; });
  return { requests, families, posts, today: today_(), staff: c.admin ? staffList_(c.deptId) : undefined };
}

// 기존 시트 가져오기(관리자): 사랑방 탭 하나를 화면에서 나눠 보낸 것을 이번 달 기도제목으로 넣는다.
//  body: { roomName, families: [{ a, b, kids: [..], items: [{ target, text }] }] }
//  없는 사랑방·가정은 만들고, 이미 있는 가정은 이번 달 기도제목을 가져온 것으로 바꾼다. 실제 교인 내용은 이 시트에만 남는다.
//  사랑방과 가정은 관리자의 부서 안에서만 찾고 만든다(다른 부서에 같은 이름이 있어도 섞이지 않게)
function importRoom_(body) {
  const c = member_(body);
  if (!c.admin) throw fail_('forbidden', '관리자만 가져올 수 있어요.');
  const roomName = String(body.roomName || '').trim(), list = Array.isArray(body.families) ? body.families : [];
  if (!roomName || !list.length) throw fail_('bad', '사랑방 이름과 가정을 확인해 주세요.');
  return withLock_(() => {
    const m = month_(), y = year_(), now = new Date();
    const rooms = read_('rooms');
    let room = rooms.find(r => r.name === roomName && deptOfRoom_(r.id).id === c.deptId);
    if (!room) {
      room = { id: 'R' + Date.now().toString(36), name: roomName, order: rooms.reduce((a, r) => Math.max(a, r.order), 0) + 1, deptId: c.deptId };
      append_('rooms', room);
    }
    const deptFams = read_('roster').filter(r => roomIdsOfDept_(c.deptId).indexOf(r.roomId) >= 0).map(r => r.familyId);
    let made = 0, replaced = 0, count = 0;
    const newFams = [], newRoster = [], newItems = [], monthly = [], drop = [];
    list.forEach((f, n) => {
      const a = String(f.a || '').trim(), b = String(f.b || '').trim();
      if (!a) return;
      const name = b ? a + ' · ' + b : a, kids = (f.kids || []).map(k => String(k).trim()).filter(Boolean);
      let fam = read_('families').find(x => x.name === name && x.status === '활동' && deptFams.indexOf(x.id) >= 0);
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

// 우리 가정 정보 고치기: 부부 이름(1인 가정·개인 단위면 한 이름), 자녀(태어난 순서). 이름이 바뀌면 그 이름으로 연결된 사람도 함께 바꾼다
function saveFamily_(body) {
  const c = member_(body), one = c.dept && c.dept.unit === '개인';
  const a = String(body.a || '').trim().slice(0, 10), b = one ? '' : String(body.b || '').trim().slice(0, 10);
  if (!a) throw fail_('bad', '이름을 적어 주세요.');
  const kids = one ? [] : (Array.isArray(body.kids) ? body.kids : []).map(k => String(k).trim().slice(0, 6)).filter(Boolean);
  return withLock_(() => {
    const fam = read_('families').find(f => f.id === c.familyId);
    const [oa, ob = ''] = String(fam.name).split(' · ');
    Object.assign(fam, { name: b ? a + ' · ' + b : a, kids: kids.join(', ') }); update_('families', fam);
    read_('links').filter(l => l.familyId === fam.id && l.status !== '해제').forEach(l => {
      const p = l.person === oa ? a : l.person === ob && b ? b : null;
      if (p && p !== l.person) { l.person = p; update_('links', l); }
    });
    return monthView_(member_(body));
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
  if (c.admin && activeStaff_(c.deptId).some(s => s.familyId === familyId)) return true;
  const rooms = c.admin ? roomIdsOfDept_(c.deptId) : [c.roomId];
  return read_('roster').some(r => String(r.year) === year_() && r.familyId === familyId && rooms.indexOf(r.roomId) >= 0);
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

// 교역자의 이번 달: 사랑방 대신 우리 가정 하나와 섬기는 분들(목사님 홈은 다음 단계)
function staffMonthView_(c) {
  const m = month_();
  ensureFamilies_([c.familyId], m, () => '');
  const all = read_('items').filter(i => i.month === m && i.familyId === c.familyId);
  const st = read_('monthly').find(x => x.month === m && x.familyId === c.familyId);
  const f = c.family, show = i => ({ id: i.id, target: i.target, text: i.text, scope: i.scope });
  const own = { id: f.id, name: f.name, kids: f.kids ? String(f.kids).split(/\s*,\s*/) : [], own: true, status: st ? st.status : 'same', prayed: 0, today: 0,
    items: all.filter(i => i.state !== '마침').sort((a, b) => a.order - b.order).map(i => Object.assign(show(i), { same: yes_(i.same), isNew: !i.prevId && !yes_(i.same), editedBy: i.editedBy, editedAt: fmtDay_(i.editedAt) })),
    ended: all.filter(i => i.state === '마침').map(show) };
  return { month: m, dept: c.dept, room: { id: '', name: c.dept.name }, me: { person: c.person, familyId: c.familyId, role: c.role, admin: c.admin, staff: true, label: c.label },
    families: [own], received: { n: 0, of: 0 }, serve: serveView_(c.deptId), rooms: staffRooms_(c, m) };
}

// 목사님 홈: 부서의 사랑방마다 이번 달 손봄·확인 수, 새 기도제목 수, 리더, 이번 주에 내가 그 사랑방을 위해 기도했는지(청장년부 기도의 끈)
function staffRooms_(c, m) {
  const fams = read_('families'), roster = read_('roster').filter(r => String(r.year) === year_());
  const monthly = read_('monthly').filter(x => x.month === m);
  const items = read_('items').filter(i => i.month === m && i.state !== '마침' && i.scope !== 'family');
  const wk = weekStart_(), week = read_('prayers').filter(p => p.kakaoId === c.kakaoId && fmtDate_(p.at) >= wk);
  const fam = id => fams.find(f => f.id === id) || {};
  return read_('rooms').filter(r => deptOfRoom_(r.id).id === c.deptId).sort((a, b) => a.order - b.order).map(r => {
    const rs = roster.filter(x => x.roomId === r.id && fam(x.familyId).status === '활동'), ids = rs.map(x => x.familyId);
    const st = k => ids.filter(id => (monthly.find(x => x.familyId === id) || {}).status === k).length;
    return { id: r.id, name: r.name, n: ids.length, edited: st('edited'), confirmed: st('confirmed'),
      leaders: rs.filter(x => x.role === '리더' || x.role === '코리더').map(x => fam(x.familyId).name),
      fresh: items.filter(i => ids.indexOf(i.familyId) >= 0 && !i.prevId && !yes_(i.same)).length,
      week: week.some(p => ids.indexOf(p.familyId) >= 0) };
  });
}

// 목사님·장로님이 고른 사랑방의 이번 달: 리더·목사님 항목까지 보이고, 기도했어요 횟수는 본인 것
function staffRoomView_(c, roomId) {
  if (!c.staff) throw fail_('forbidden', '목사님·장로님만 볼 수 있어요.');
  const room = read_('rooms').find(r => r.id === roomId);
  if (!room || deptOfRoom_(room.id).id !== c.deptId) throw fail_('bad', '우리 부서 사랑방이 아니에요.');
  return { room: { id: room.id, name: room.name }, families: roomFamilies_(c, room.id, month_(), true) };
}

function monthView_(c) {
  if (c.staff) return staffMonthView_(c);
  const m = month_();
  const isLeader = c.role === '리더' || c.role === '코리더';
  const room = read_('rooms').find(r => r.id === c.roomId) || {};
  const families = roomFamilies_(c, c.roomId, m, isLeader);
  // 이번 달 사랑방의 다른 가정 중 몇 가정이 우리 가정을 위해 기도했는지(누가 했는지는 알리지 않는다)
  const by = {}; read_('prayers').forEach(p => { if (p.familyId === c.familyId && p.by !== c.familyId && fmtMonth_(p.at) === m) by[p.by] = true; });
  const received = { n: Object.keys(by).length, of: Math.max(0, families.length - 1) };
  return { month: m, dept: c.dept, room: { id: room.id, name: room.name }, me: { person: c.person, familyId: c.familyId, role: c.role, admin: c.admin }, families, received, serve: serveView_(c.deptId) };
}

// 사랑방 가정들의 이번 달 카드. isLeader면 리더·목사님 항목까지, 기도했어요 횟수는 보는 사람 본인 것
function roomFamilies_(c, roomId, m, isLeader) {
  ensureMonth_(roomId, m);
  const fams = read_('families'), roster = read_('roster').filter(r => String(r.year) === year_() && r.roomId === roomId);
  const items = read_('items').filter(i => i.month === m && i.state !== '마침');
  const monthly = read_('monthly').filter(x => x.month === m);
  const prayed = read_('prayers').filter(p => fmtMonth_(p.at) === m && p.kakaoId === c.kakaoId);
  return roster.map(r => fams.find(f => f.id === r.familyId)).filter(f => f && f.status === '활동').map(f => {
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
          editedBy: own ? i.editedBy : '', editedAt: own ? fmtDay_(i.editedAt) : '' })),
      // 우리 가정이 이번 달에 마친 기도제목(내 기도에서 되돌릴 수 있게)
      ended: own ? read_('items').filter(i => i.month === m && i.familyId === f.id && i.state === '마침').map(i => ({ id: i.id, target: i.target, text: i.text, scope: i.scope })) : []
    };
  });
}

// 월초 이월: 이번 달 기도제목이 없는 가정은 지난달 것(마치지 않은 것)을 이어 붙이고 "지난달과 같음"으로 둔다
function ensureMonth_(roomId, m) {
  ensureFamilies_(read_('roster').filter(r => String(r.year) === year_() && r.roomId === roomId).map(r => r.familyId), m, () => roomId);
}
// 가정들의 월초 이월(사랑방 가정은 그 사랑방, 교역자 가정은 사랑방 없이)
function ensureFamilies_(famIds, m, roomOf) {
  const prev = prevMonth_(m);
  const items = read_('items');
  const need = famIds.filter(id => !items.some(i => i.month === m && i.familyId === id) && items.some(i => i.month === prev && i.familyId === id && i.state !== '마침'));
  if (!need.length) return;
  withLock_(() => {
    const now = read_('items');
    need.forEach(id => {
      if (now.some(i => i.month === m && i.familyId === id)) return; // 그 사이 다른 요청이 이미 옮겼다
      now.filter(i => i.month === prev && i.familyId === id && i.state !== '마침').forEach(i => append_('items', {
        id: newId_(), month: m, familyId: id, roomId: roomOf(id), target: i.target, text: i.text, scope: i.scope, state: '이어짐',
        prevId: i.id, same: '예', order: i.order, editedAt: i.editedAt, editedBy: i.editedBy
      }));
      setMonthly_(id, m, 'same');
    });
  });
}

function saveItem_(body) {
  const c = member_(body), m = month_();
  const text = String(body.text || '').trim(), target = String(body.target || (c.staff ? '함께' : c.dept.unit === '개인' ? '나' : '우리 가정')).trim().slice(0, 10);
  // 교역자는 부서 공개 / 우리 가정만, 회원은 사랑방 공개 / 리더·목사님 / 우리 가정만
  const allowed = c.staff ? STAFF_SCOPES : SCOPES, scope = allowed.indexOf(body.scope) >= 0 ? body.scope : allowed[0];
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

// 기도했어요: 우리 사랑방 가정만(목사님·장로님은 부서 전체), 누른 사람마다 한 가정에 하루 3번까지
function pray_(body) {
  const c = member_(body);
  // 목사님·장로님은 부서의 모든 사랑방 가정을 위해 기도한다
  const ok = r => String(r.year) === year_() && r.familyId === body.familyId && (c.staff ? deptOfRoom_(r.roomId).id === c.deptId : r.roomId === c.roomId);
  if (!read_('roster').some(ok)) throw fail_('bad', c.staff ? '우리 부서 사랑방 가정이 아니에요.' : '우리 사랑방 가정이 아니에요.');
  // prayed: 이번 달 내 횟수, today: 오늘 내 횟수(가정마다 하루 3번까지)
  const mine = read_('prayers').filter(p => p.kakaoId === c.kakaoId && p.familyId === body.familyId && fmtMonth_(p.at) === month_());
  const n = mine.filter(p => fmtDate_(p.at) === today_()).length;
  if (n >= 3) return { prayed: mine.length, today: n, capped: true };
  append_('prayers', { at: new Date(), by: c.familyId, familyId: body.familyId, kakaoId: c.kakaoId });
  return { prayed: mine.length + 1, today: n + 1, capped: n + 1 >= 3 };
}

// ── 사용기록 ─────────────────────────────────────────────
// 화면이 기기에 모아 둔 사건을 한꺼번에 받는다. 정해 둔 사건 이름만, 덧붙임은 정해 둔 칸의 짧은 값(숫자·참거짓·짧은 낱말)만 받아서
//  기도제목이나 이름 같은 글이 섞여 들어오지 못하게 한다. 저장이 몰리면 이번에는 받지 않고(kept: false) 화면이 다음에 다시 보낸다
const USAGE_EVENTS_ = {
  '열기': ['role', 'width', 'style', 'group', 'big', 'mode', 'app'],
  '첫접속 단계': ['step', 'done'],
  '기도제목 저장': ['items', 'split'],
  '기도하기 시작': ['kinds', 'cards', 'secs', 'music'],
  '기도하기 마침': ['kinds', 'cards', 'seen', 'mins', 'music', 'early'],
  '모임 모드 시작': ['cards'],
  '모임 모드 마침': ['cards', 'seen'],
  '화면 보기': ['screen'],
  '내려받기': ['range']
};
function usage_(w, body) {
  const list = Array.isArray(body.events) ? body.events.slice(0, 200) : [];
  const device = /^[a-z0-9]{8,32}$/.test(String(body.device || '')) ? String(body.device) : '';
  if (!list.length || !device) return { kept: true, n: 0 };
  let deptId = '';
  if (w.link && w.link.status === '연결') { try { deptId = memberFrom_(w).deptId || ''; } catch (e) { /* 편성이 없으면 비워 둔다 */ } }
  const clean = v => typeof v === 'number' && isFinite(v) ? Math.round(v * 10) / 10 : typeof v === 'boolean' ? v : /^[\w가-힣·\- ]{1,20}$/.test(String(v)) ? String(v) : null;
  const rows = list.map(ev => {
    const keys = USAGE_EVENTS_[ev && ev.e];
    const at = new Date(ev && ev.at);
    if (!keys || isNaN(at)) return null;
    const d = {}; keys.forEach(k => { const v = ev.d && ev.d[k] !== undefined ? clean(ev.d[k]) : null; if (v !== null) d[k] = v; });
    return { at, device, deptId, event: ev.e, data: JSON.stringify(d) };
  }).filter(Boolean);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) return { kept: false, n: 0 };
  try { appendMany_('usage', rows); } finally { lock.releaseLock(); }
  return { kept: true, n: rows.length };
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
    else {
      // 새 버전에서 늘어난 칸(사랑방의 부서ID 등)은 첫 줄 끝에 이름을 더한다. 있던 줄은 그대로다
      const head = sh.getRange(1, 1, 1, cols.length).getValues()[0];
      cols.forEach((c, k) => { if (head[k] === '' || head[k] === undefined) sh.getRange(1, k + 1, 1, 1).setValues([[c[1]]]); });
    }
  });
  const first = ss.getSheets()[0];
  if (first && !SCHEMA_NAMES_().includes(first.getName()) && first.getLastRow() === 0) ss.deleteSheet(first);
  // 부서가 없으면 첫 부서(청장년부)를 만들고, 부서가 비어 있는 사랑방을 모두 그 부서로 둔다
  Object.keys(READ_CACHE_).forEach(k => delete READ_CACHE_[k]);
  if (!read_('depts').length) append_('depts', FIRST_DEPT);
  const d1 = read_('depts').sort((a, b) => a.order - b.order)[0];
  read_('rooms').filter(r => !r.deptId).forEach(r => { r.deptId = d1.id; update_('rooms', r); });
  return '시트를 만들었어요.';
}

// 지어낸 이름으로 된 예시 데이터. 실제 교인 이름과 기도제목은 동의를 받은 뒤 따로 옮긴다
function sampleData() {
  setup();
  if (read_('rooms').length) return '이미 데이터가 있어서 넣지 않았어요.';
  const y = year_(), m = month_(), prev = prevMonth_(m);
  const d1 = read_('depts')[0].id;
  if (!read_('depts').some(d => d.name === '청년부')) append_('depts', { id: 'D2', name: '청년부', group: '순', unit: '개인', order: 2 });
  const d2 = read_('depts').find(d => d.name === '청년부').id;
  append_('rooms', { id: 'R1', name: '2-20 사랑방', order: 1, deptId: d1 });
  append_('rooms', { id: 'R2', name: '2-21 사랑방', order: 2, deptId: d1 });
  append_('rooms', { id: 'R3', name: '1순', order: 3, deptId: d2 });
  append_('rooms', { id: 'R4', name: '2순', order: 4, deptId: d2 });
  const fams = [
    ['F1', '김도윤 · 이수아', '하준', '예', 'R1', '리더'], ['F2', '박민재 · 최예린', '서윤', '', 'R1', '회원'], ['F3', '정우진 · 한지민', '', '', 'R1', '회원'],
    ['F4', '오세훈 · 윤가은', '도하', '', 'R1', '코리더'], ['F5', '서준호 · 임채원', '', '', 'R1', '회원'], ['F6', '임재현 · 고은비', '', '', 'R2', '리더'], ['F7', '송민석 · 유하린', '', '', 'R2', '회원'],
    // 청년부: 한 사람이 한 줄
    ['F8', '윤하람', '', '예', 'R3', '리더'], ['F9', '장서진', '', '', 'R3', '회원'], ['F10', '문태오', '', '', 'R3', '회원'], ['F11', '배유나', '', '', 'R4', '리더']
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
  it('F8', 'R3', '나', '졸업 논문을 잘 마무리하도록', 'room', 1, '윤하람');
  it('F8', 'R3', '가족', '할머니 수술이 잘 끝나도록', 'leader', 2, '윤하람');
  it('F9', 'R3', '학교·직장', '첫 직장에서 좋은 동료를 만나도록', 'room', 1, '장서진');
  it('F10', 'R3', '나', '매일 아침 말씀 묵상을 이어 가도록', 'room', 1, '문태오');
  // 섬기는 분들(청장년부): 목사님 부부와 담당 장로님. 지어낸 이름
  append_('families', { id: 'S1', name: '한기쁨 · 서평안', kids: '은솔', status: '교역자', admin: '' });
  append_('staff', { familyId: 'S1', deptId: d1, label: '목사님 부부', title: '목사님', serve: '예', status: '활동', endedAt: '' });
  append_('families', { id: 'S2', name: '조믿음', kids: '', status: '교역자', admin: '' });
  append_('staff', { familyId: 'S2', deptId: d1, label: '조믿음 장로님', title: '장로님', serve: '예', status: '활동', endedAt: '' });
  it('S1', '', '함께', '청장년부 가을 수련회를 잘 준비하도록', 'dept', 1, '한기쁨');
  it('S1', '', '사모님', '허리 통증이 낫고 건강을 되찾도록', 'dept', 2, '서평안');
  it('S1', '', '은솔', '새 학교에 잘 적응하도록', 'family', 3, '서평안');
  it('S2', '', '함께', '사랑방 리더들이 지치지 않도록', 'dept', 1, '조믿음');
  return '예시 데이터를 넣었어요. ' + m + '월 기도제목은 처음 열 때 ' + prev + '에서 이어 붙여져요.';
}

// 실제로 쓰기 전에 한 번: sampleData로 넣은 예시 가정(가정ID와 이름이 모두 같을 때만)과 그 기도제목·편성·월별 상태·
//  기도기록·카톡 공유·연결을 지우고, 가정이 남지 않은 예시 사랑방도 지운다. 부서(청장년부·청년부)는 그대로 둔다. Apps Script 편집기에서 실행한다.
//  예시 가정에 연결돼 있던 관리자의 카카오 계정은 기억해 두었다가, 앱에서 실제 우리 가정을 고르면 승인 없이 연결하고 관리자로 만든다
const SAMPLE_FAMILIES_ = [['F1', '김도윤 · 이수아'], ['F2', '박민재 · 최예린'], ['F3', '정우진 · 한지민'], ['F4', '오세훈 · 윤가은'], ['F5', '서준호 · 임채원'], ['F6', '임재현 · 고은비'], ['F7', '송민석 · 유하린'],
  ['F8', '윤하람'], ['F9', '장서진'], ['F10', '문태오'], ['F11', '배유나'], ['S1', '한기쁨 · 서평안'], ['S2', '조믿음']];
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
    del('staff', mine);
    del('families', f => ids.indexOf(f.id) >= 0);
    del('rooms', r => ['R1', 'R2', 'R3', 'R4'].indexOf(r.id) >= 0 && !read_('roster').some(x => x.roomId === r.id));
    if (admins.length) PropertiesService.getScriptProperties().setProperty('NEXT_ADMIN', admins.join(','));
    return '예시 가정 ' + ids.length + '곳을 지웠어요.' + (admins.length ? ' 앱을 다시 열어 실제 우리 가정을 고르면 바로 연결되고 관리자가 돼요.' : '');
  });
}

// ── 부서 ────────────────────────────────────────────────

function depts_() {
  const seen = {};
  return read_('depts').sort((a, b) => a.order - b.order).filter(d => !seen[d.id] && (seen[d.id] = true));
}
// 사랑방의 부서. 부서ID가 비었거나 없는 부서면 첫 부서로 본다
function deptOfRoom_(roomId) {
  const room = read_('rooms').find(r => r.id === roomId) || {}, all = depts_();
  return all.find(d => d.id === room.deptId) || all[0] || FIRST_DEPT;
}
function roomIdsOfDept_(deptId) { return read_('rooms').filter(r => deptOfRoom_(r.id).id === deptId).map(r => r.id); }
// 화면에 주는 부서: 소그룹 이름과 단위로 화면의 말이 바뀐다
function deptInfo_(d) { return { id: d.id, name: d.name, group: d.group || '사랑방', unit: d.unit === '개인' ? '개인' : '가정' }; }
function deptById_(id) { const all = depts_(); return all.find(d => d.id === id) || all[0] || FIRST_DEPT; }

// ── 교역자와 섬기는 분들 ─────────────────────────────────────
// 지금 섬기는(상태가 '종료'가 아닌) 교역자 줄. 같은 가정이 두 줄이면 마지막 줄
function activeStaff_(deptId) { return read_('staff').filter(s => s.status !== '종료' && (!deptId || s.deptId === deptId)); }
function staffOf_(familyId) { return activeStaff_().filter(s => s.familyId === familyId).pop() || null; }
// 섬기는 분들 카드: 그 부서에서 섬기는 분들이 '예'인 교역자 가정의 부서 공개 기도제목(이번 달, 마친 것 빼고)
function serveView_(deptId) {
  const m = month_(), list = activeStaff_(deptId).filter(s => yes_(s.serve));
  if (!list.length) return [];
  ensureFamilies_(list.map(s => s.familyId), m, () => '');
  const items = read_('items').filter(i => i.month === m && i.state !== '마침' && i.scope === 'dept');
  return list.map(s => ({ familyId: s.familyId, label: s.label,
    items: items.filter(i => i.familyId === s.familyId).sort((a, b) => a.order - b.order).map(i => ({ id: i.id, target: i.target, text: i.text, scope: 'dept', isNew: !i.prevId && !yes_(i.same) })) }));
}
// 관리자: 우리 부서 교역자 목록과 연결된 사람
function staffList_(deptId) {
  const fams = read_('families'), links = read_('links');
  return activeStaff_(deptId).map(s => { const f = fams.find(x => x.id === s.familyId) || {};
    return { familyId: s.familyId, name: f.name || '', label: s.label, title: s.title, serve: yes_(s.serve),
      linked: links.filter(l => l.familyId === s.familyId && l.status === '연결').map(l => ({ kakaoId: String(l.kakaoId), person: l.person })) }; });
}
// 관리자가 교역자를 더하거나 고친다: 이름(부부면 두 이름), 카드 이름, 직분, 섬기는 분들에 나오는지
function saveStaff_(body) {
  const c = member_(body);
  if (!c.admin) throw fail_('forbidden', '관리자만 할 수 있어요.');
  const a = String(body.a || '').trim().slice(0, 10), b = String(body.b || '').trim().slice(0, 10);
  const title = STAFF_TITLES.indexOf(body.title) >= 0 ? body.title : STAFF_TITLES[0];
  // 카드 이름을 비우면: 부부면 '목사님 부부', 한 분이면 '조믿음 장로님'처럼 이름과 직분
  const label = String(body.label || '').trim().slice(0, 20) || (b ? title + ' 부부' : a + ' ' + title);
  if (!a) throw fail_('bad', '이름을 적어 주세요.');
  return withLock_(() => {
    let s = body.familyId ? activeStaff_(c.deptId).find(x => x.familyId === body.familyId) : null;
    if (body.familyId && !s) throw fail_('bad', '교역자를 찾지 못했어요.');
    if (s) {
      const fam = read_('families').find(f => f.id === s.familyId);
      if (fam) { fam.name = b ? a + ' · ' + b : a; update_('families', fam); }
      Object.assign(s, { label, title, serve: body.serve ? '예' : '' }); update_('staff', s);
    } else {
      const id = 'S' + Date.now().toString(36);
      append_('families', { id, name: b ? a + ' · ' + b : a, kids: '', status: '교역자', admin: '' });
      append_('staff', { familyId: id, deptId: c.deptId, label, title, serve: body.serve ? '예' : '', status: '활동', endedAt: '' });
    }
    return pendingView_(c);
  });
}
// 교역자가 부서를 떠나면 '종료'로 두고 연결도 푼다. 기도제목 기록은 남는다
function endStaff_(body) {
  const c = member_(body);
  if (!c.admin) throw fail_('forbidden', '관리자만 할 수 있어요.');
  return withLock_(() => {
    const s = activeStaff_(c.deptId).find(x => x.familyId === body.familyId);
    if (!s) throw fail_('bad', '교역자를 찾지 못했어요.');
    if (s.familyId === c.familyId) throw fail_('bad', '내 자리는 여기서 마칠 수 없어요.');
    Object.assign(s, { status: '종료', endedAt: today_() }); update_('staff', s);
    read_('links').filter(l => l.familyId === s.familyId && l.status !== '해제').forEach(l => { l.status = '해제'; l.approvedBy = c.person; update_('links', l); });
    return pendingView_(c);
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
// 이번 주 월요일(yyyy-MM-dd). 날짜 글자끼리 크기를 견줘 이번 주 기록을 고른다
function weekStart_() { const d = new Date(today_() + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d.toISOString().slice(0, 10); }
function fmtMonth_(d) { return fmt_(d, 'yyyy-MM'); }
function fmtDay_(d) { return d ? fmt_(d, 'M월 d일') : ''; }
function prevMonth_(m) { const [y, mo] = m.split('-').map(Number); return mo === 1 ? (y - 1) + '-12' : y + '-' + String(mo - 1).padStart(2, '0'); }
