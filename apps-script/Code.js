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
  // 편성 일정: 부서마다 그 해 편성(편성 탭의 연도)이 시작하는 달. 적어 두지 않은 편성은 그 해 1월부터다(예: 2027년 편성을 2026-12부터).
  //  리더 미리 보기·회원 안내 시작일은 개편 때 새 편성을 미리 알리는 날
  //  떠남·보류: 새 편성에 넣지 않은 가정(적용 날짜부터 그 안내가 나온다). 새 사랑방·새 가정: 예약할 때 만든 것(고치거나 취소하면 지운다)
  terms: ['편성 일정', [['deptId', '부서ID'], ['year', '편성 연도'], ['start', '적용 시작 달'], ['leaderFrom', '리더 미리 보기 시작일'], ['memberFrom', '회원 안내 시작일'], ['status', '상태'], ['by', '만든 사람'], ['at', '만든 날'],
    ['leave', '떠남 가정ID'], ['hold', '보류 가정ID'], ['newRooms', '새 사랑방ID'], ['newFams', '새 가정ID']]],
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
  usage: ['사용기록', [['at', '날짜시각'], ['device', '기기ID'], ['deptId', '부서ID'], ['event', '사건'], ['data', '덧붙임']]],
  // 접속 기록(설계서 10장): 그달 앱을 한 번이라도 연 가정. 날짜·시각 없이 달과 가정만 한 줄(분석의 '앱에 들어온 가정')
  visits: ['접속 기록', [['month', '월'], ['familyId', '가정ID']]]
};
const SCOPES = ['room', 'leader', 'family'];
// 교역자의 공개 범위: dept(부서 공개, 섬기는 분들 카드에 나옴) / family(우리 가정만)
const STAFF_SCOPES = ['dept', 'family'];
const STAFF_TITLES = ['목사님', '전도사님', '장로님'];
// 부서 탭이 비어 있을 때 만드는 첫 부서. 단위: 가정(부부·자녀) 또는 개인(한 사람)
const FIRST_DEPT = { id: 'D1', name: '청장년부', group: '사랑방', unit: '가정', order: 1 };

// ── 요청 받기 ─────────────────────────────────────────────

// 서버 코드를 고칠 때마다 바꾼다. 웹 앱 주소를 열면 보여서, 새 버전으로 배포됐는지 확인할 수 있다
const VERSION = '2026-10-19 목사님 지난 기록';
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
  history: body => historyView_(member_(body), String(body.month || ''), String(body.roomId || '')),
  famTimeline: body => famTimeline_(member_(body), String(body.familyId || '')),
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
  endStaff: endStaff_,
  reorg: body => reorgView_(adminOf_(body)),
  reorgSave: reorgSave_,
  reorgCancel: body => reorgCancel_(adminOf_(body)),
  analysis: body => analysisView_(adminOf_(body))
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
  const r = read_('roster').find(x => activeRow_(x) && x.familyId === w.link.familyId);
  // 교역자는 사랑방 편성 없이 교역자 탭으로 부서에 속한다
  const st = !r && fam ? staffOf_(fam.id) : null;
  if (!fam || (!r && !st)) throw fail_('notLinked', st === null && fam && fam.status === '교역자' ? '교역자 목록에서 빠졌어요. 관리자에게 알려 주세요.' : notInTerm_(w.link.familyId));
  if (w.link.lastSeen !== today_()) { w.link.lastSeen = today_(); update_('links', w.link); markVisit_(fam.id); }
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
  const fams = read_('families'), roster = read_('roster').filter(activeRow_);
  return activeRooms_().sort((a, b) => a.order - b.order).map(r => ({
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
      append_('roster', { year: termNow_(deptOfRoom_(body.roomId).id), roomId: body.roomId, familyId, role: '회원' });
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
  const fams = read_('families'), links = read_('links'), roster = read_('roster').filter(activeRow_);
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
  // 돌봄 신호: 리더·코리더가 우리 사랑방 것을 본다
  const lead = c.role === '리더' || c.role === '코리더';
  return { requests, families, posts, today: today_(), staff: c.admin ? staffList_(c.deptId) : undefined, signals: lead ? careSignals_([c.roomId], month_()) : undefined,
    history: lead ? updateHistory_(c.roomId, c.deptId, month_()) : undefined };
}

// 가정별 업데이트 이력(설계서 10장): 지금 편성의 담당 리더·코리더만 본다. 편성이 시작한 달부터 이번 달까지, 가정마다 달의 상태만.
//  edited 손봄 / confirmed 그대로 확인 / same 지난달 그대로 / none 그 달 기도제목이 없음. 비율·순위는 만들지 않는다.
//  월별 상태가 적혀 있지 않은 달은 기도제목으로 짐작한다(새로 쓰거나 고친 항목이 있으면 손봄, 모두 이어 온 것이면 그대로)
function updateHistory_(roomId, deptId, m) {
  const t = terms_(deptId).filter(x => x.start <= m).pop(), from = t ? t.start : m.slice(0, 4) + '-01';
  const months = [];
  for (let mm = m; mm >= from && months.length < 24; mm = prevMonth_(mm)) months.unshift(mm);
  const status = {}, guess = {};
  read_('monthly').forEach(x => { status[x.familyId + '|' + x.month] = x.status; });
  read_('items').forEach(i => { const k = i.familyId + '|' + i.month; if (months.indexOf(i.month) >= 0) guess[k] = guess[k] === 'edited' || !yes_(i.same) ? 'edited' : 'same'; });
  const fams = read_('families');
  const rows = read_('roster').filter(r => activeRow_(r) && r.roomId === roomId).map(r => fams.find(f => f.id === r.familyId)).filter(f => f && f.status === '활동')
    .map(f => ({ id: f.id, name: f.name, marks: months.map(mm => status[f.id + '|' + mm] || guess[f.id + '|' + mm] || 'none') }));
  return { term: t ? t.year : m.slice(0, 4), months, rows };
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
    const m = month_(), y = termNow_(c.deptId), now = new Date();
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
  return read_('roster').some(r => activeRow_(r) && r.familyId === familyId && rooms.indexOf(r.roomId) >= 0);
}

// ── 이번 달 ──────────────────────────────────────────────

// 우리 사랑방 가정과 기도제목. 공개 범위: room은 모두, leader는 리더·코리더와 우리 가정, family는 우리 가정만
// 지난 기록: 과거 기록은 그때 함께한 사람에게만 보인다(설계서 '지난 기록 열람 규칙').
//  그 달이 속한 해의 편성에서 우리 가정이 있던 사랑방을 보여 주고, 사랑방 공개 항목(그때 리더·코리더였으면 리더·목사님 항목까지)을,
//  우리 가정은 모든 항목을 보여 준다. 마친 항목도 그 달의 기록이라 '마침'으로 남긴다
//  돌려주는 것: months(볼 수 있는 달, 최근 순), month(고른 달), room, families(그 달 사랑방), mine(우리 가정의 달마다 기도제목)
function historyView_(c, want, roomId) {
  if (c.staff) return staffHistory_(c, want, roomId);
  const items = read_('items'), rooms = read_('rooms'), fams = read_('families'), roster = read_('roster');
  // 그 달에 적용 중이던 편성에서 우리 가정이 속한 사랑방(12월부터 새 편성이면 12월은 새 사랑방)
  const myRows = roster.filter(r => r.familyId === c.familyId), at = {};
  const myRoom = mm => at[mm] !== undefined ? at[mm] : (at[mm] = myRows.find(r => String(r.year) === termAt_(deptOfRoom_(r.roomId).id, mm)) || null);
  const seen = {};
  items.forEach(i => { const r = myRoom(i.month); if (i.familyId === c.familyId || (r && i.roomId === r.roomId)) seen[i.month] = true; });
  const months = Object.keys(seen).sort().reverse();
  const m = months.indexOf(want) >= 0 ? want : (months.find(x => x < month_()) || months[0] || month_());
  const r = myRoom(m), lead = !!r && (r.role === '리더' || r.role === '코리더');
  const show = i => ({ target: i.target, text: i.text, scope: i.scope, ended: i.state === '마침' });
  const families = !r ? [] : roster.filter(x => String(x.year) === String(r.year) && x.roomId === r.roomId).map(x => {
    const f = fams.find(y => y.id === x.familyId); if (!f) return null;
    const own = f.id === c.familyId;
    const its = items.filter(i => i.month === m && i.familyId === f.id && (own || i.scope === 'room' || (i.scope === 'leader' && lead)))
      .sort((a, b) => a.order - b.order).map(show);
    return { id: f.id, name: f.name, own, items: its };
  }).filter(Boolean).sort((a, b) => b.own - a.own);
  const mine = months.map(mm => ({ month: mm, items: items.filter(i => i.month === mm && i.familyId === c.familyId).sort((a, b) => a.order - b.order).map(show) }))
    .filter(x => x.items.length);
  const room = r ? rooms.find(x => x.id === r.roomId) : null;
  return { months, month: m, now: month_(), room: room ? room.name : '', families, mine, threads: threads_(items.filter(i => i.familyId === c.familyId)) };
}

// 목사님·장로님의 지난 기록: 달과 사랑방을 골라 그 달의 사랑방 모습(그때 편성 그대로). 리더·목사님 항목까지, 우리 가정만 항목은 빼고.
//  우리 가정 지난 기도제목과 기도 타임라인은 회원과 같다
function staffHistory_(c, want, roomId) {
  const items = read_('items'), fams = read_('families'), roster = read_('roster');
  const deptRooms = read_('rooms').filter(r => deptOfRoom_(r.id).id === c.deptId).sort((a, b) => a.order - b.order), ids = deptRooms.map(r => r.id);
  const seen = {};
  items.forEach(i => { if (i.familyId === c.familyId || ids.indexOf(i.roomId) >= 0) seen[i.month] = true; });
  const months = Object.keys(seen).sort().reverse();
  const m = months.indexOf(want) >= 0 ? want : (months.find(x => x < month_()) || months[0] || month_());
  // 그 달에 적용 중이던 편성에 가정이 있던 사랑방만 고를 수 있다
  const term = termAt_(c.deptId, m), rows = roster.filter(r => String(r.year) === term && ids.indexOf(r.roomId) >= 0);
  const rooms = deptRooms.filter(r => rows.some(x => x.roomId === r.id)).map(r => ({ id: r.id, name: r.name }));
  const room = rooms.find(r => r.id === roomId) || rooms[0] || null;
  const show = i => ({ target: i.target, text: i.text, scope: i.scope, ended: i.state === '마침' });
  const families = !room ? [] : rows.filter(x => x.roomId === room.id).map(x => {
    const f = fams.find(y => y.id === x.familyId); if (!f) return null;
    const its = items.filter(i => i.month === m && i.familyId === f.id && i.scope !== 'family').sort((a, b) => a.order - b.order).map(show);
    return { id: f.id, name: f.name, own: false, role: x.role, items: its };
  }).filter(Boolean).sort((a, b) => (b.role === '리더') - (a.role === '리더') || (b.role === '코리더') - (a.role === '코리더'));
  const mine = months.map(mm => ({ month: mm, items: items.filter(i => i.month === mm && i.familyId === c.familyId).sort((a, b) => a.order - b.order).map(show) }))
    .filter(x => x.items.length);
  return { months, month: m, now: month_(), room: room ? room.name : '', roomId: room ? room.id : '', rooms, families, mine, threads: threads_(items.filter(i => i.familyId === c.familyId)) };
}

// 목사님·장로님이 사랑방 가정 하나의 기도 타임라인을 본다(설계서 S5). 리더·목사님 항목까지, 우리 가정만 항목은 빼고.
//  우리 부서의 어느 편성에든 있었던 가정만
function famTimeline_(c, familyId) {
  if (!c.staff) throw fail_('forbidden', '목사님·장로님만 볼 수 있어요.');
  const row = read_('roster').filter(r => r.familyId === familyId && deptOfRoom_(r.roomId).id === c.deptId).pop();
  const f = read_('families').find(x => x.id === familyId);
  if (!row || !f) throw fail_('bad', '우리 부서 ' + (c.dept.unit === '개인' ? '사람' : '가정') + '이 아니에요.');
  return { id: f.id, name: f.name, now: month_(), threads: threads_(read_('items').filter(i => i.familyId === familyId && i.scope !== 'family')) };
}

// 기도 타임라인(우리 가정만 봄): 이전 항목ID로 이어진 기도제목을 한 줄로. 처음 올린 달(from)부터 마지막 달(to)까지,
//  글은 마지막 달 것. 마쳤으면 ended. 지금 이어지는 것을 먼저, 그 안에서는 오래된 순
function threads_(own) {
  const byId = {}, next = {};
  own.forEach(i => { byId[i.id] = i; });
  own.forEach(i => { if (i.prevId && byId[i.prevId]) next[i.prevId] = i; });
  const out = own.filter(i => !i.prevId || !byId[i.prevId]).map(first => {
    let last = first, n = 1;
    while (next[last.id] && n < 600) { last = next[last.id]; n++; }
    return { target: last.target, text: last.text, scope: last.scope, from: first.month, to: last.month, ended: last.state === '마침' };
  });
  const now = month_(), on = t => t.to === now && !t.ended;
  return out.sort((a, b) => on(b) - on(a) || (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
}

// 교역자의 이번 달: 사랑방 대신 우리 가정 하나와 섬기는 분들(목사님 홈은 다음 단계)
function staffMonthView_(c) {
  const m = month_();
  // 부서의 모든 사랑방을 이번 달로 이월해 둔다(사랑방 현황과 돌봄 신호가 이번 달 기준이 되게)
  const roomIds = activeRooms_(c.deptId).map(r => r.id);
  roomIds.forEach(id => ensureMonth_(id, m));
  ensureFamilies_([c.familyId], m, () => '');
  const all = read_('items').filter(i => i.month === m && i.familyId === c.familyId);
  const st = read_('monthly').find(x => x.month === m && x.familyId === c.familyId);
  const f = c.family, show = i => ({ id: i.id, target: i.target, text: i.text, scope: i.scope });
  const own = { id: f.id, name: f.name, kids: f.kids ? String(f.kids).split(/\s*,\s*/) : [], own: true, status: st ? st.status : 'same', prayed: 0, today: 0,
    items: all.filter(i => i.state !== '마침').sort((a, b) => a.order - b.order).map(i => Object.assign(show(i), { same: yes_(i.same), isNew: !i.prevId && !yes_(i.same), editedBy: i.editedBy, editedAt: fmtDay_(i.editedAt) })),
    ended: all.filter(i => i.state === '마침').map(show) };
  return { month: m, term: termNow_(c.deptId), dept: c.dept, room: { id: '', name: c.dept.name }, me: { person: c.person, familyId: c.familyId, role: c.role, admin: c.admin, staff: true, label: c.label },
    families: [own], received: { n: 0, of: 0 }, serve: serveView_(c.deptId), rooms: staffRooms_(c, m), signals: careSignals_(roomIds, m),
    // 함께 섬기는 교역자: 섬기는 분들 카드에 나오지 않는 동역자(본인 빼고). 기도하기의 '함께 섬기는 분들' 장에 이름만
    mates: activeStaff_(c.deptId).filter(s => s.familyId !== c.familyId && !yes_(s.serve)).map(s => s.label) };
}

// 목사님 홈: 부서의 사랑방마다 이번 달 손봄·확인 수, 새 기도제목 수, 리더, 이번 주에 내가 그 사랑방을 위해 기도했는지(청장년부 기도의 끈)
function staffRooms_(c, m) {
  const fams = read_('families'), roster = read_('roster').filter(activeRow_);
  const monthly = read_('monthly').filter(x => x.month === m);
  const items = read_('items').filter(i => i.month === m && i.state !== '마침' && i.scope !== 'family');
  const wk = weekStart_(), week = read_('prayers').filter(p => p.kakaoId === c.kakaoId && fmtDate_(p.at) >= wk);
  const fam = id => fams.find(f => f.id === id) || {};
  return activeRooms_(c.deptId).sort((a, b) => a.order - b.order).map(r => {
    const rs = roster.filter(x => x.roomId === r.id && fam(x.familyId).status === '활동'), ids = rs.map(x => x.familyId);
    const st = k => ids.filter(id => (monthly.find(x => x.familyId === id) || {}).status === k).length;
    return { id: r.id, name: r.name, n: ids.length, edited: st('edited'), confirmed: st('confirmed'),
      leaders: rs.filter(x => x.role === '리더' || x.role === '코리더').map(x => fam(x.familyId).name),
      lead: rs.filter(x => x.role === '리더').map(x => fam(x.familyId).name), co: rs.filter(x => x.role === '코리더').map(x => fam(x.familyId).name),
      fresh: items.filter(i => ids.indexOf(i.familyId) >= 0 && !i.prevId && !yes_(i.same)).length,
      week: week.some(p => ids.indexOf(p.familyId) >= 0) };
  });
}

// 돌봄 신호(설계서 10장): 오래 그대로인 가정(3달 넘게 이어서 지난달 그대로)과 오래 이어진 기도제목(3개월 넘게 이어 옴).
//  심방·연락 참고용이라 리더(우리 사랑방)와 목사님·장로님(부서 전체)만 본다. 우리 가정만 항목은 넣지 않는다. 오래된 순
function careSignals_(roomIds, m) {
  const fams = read_('families'), rooms = read_('rooms'), items = read_('items');
  const byId = {}, has = {}, status = {};
  items.forEach(i => { byId[i.id] = i; has[i.familyId + '|' + i.month] = true; });
  read_('monthly').forEach(x => { status[x.familyId + '|' + x.month] = x.status; });
  const out = [];
  read_('roster').filter(r => activeRow_(r) && roomIds.indexOf(r.roomId) >= 0).forEach(r => {
    const f = fams.find(x => x.id === r.familyId);
    if (!f || f.status !== '활동') return;
    const at = { roomId: r.roomId, room: (rooms.find(x => x.id === r.roomId) || {}).name || '', familyId: f.id, name: f.name };
    // 이번 달부터 거슬러 기도제목이 있고 '지난달 그대로'(상태가 없으면 그대로로 본다)인 달을 센다
    let n = 0;
    for (let mm = m; has[f.id + '|' + mm] && (status[f.id + '|' + mm] || 'same') === 'same'; mm = prevMonth_(mm)) n++;
    if (n >= 3) out.push(Object.assign({ type: 'same', n, note: '' }, at));
    items.filter(i => i.familyId === f.id && i.month === m && i.state !== '마침' && i.scope !== 'family').forEach(i => {
      let k = 1;
      for (let p = byId[i.prevId]; p && k < 600; p = byId[p.prevId]) k++;
      if (k >= 3) out.push(Object.assign({ type: 'long', n: k, note: i.target + ' · ' + i.text }, at));
    });
  });
  return out.sort((a, b) => b.n - a.n);
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
  return { month: m, term: termNow_(c.deptId), shift: shift_(c), dept: c.dept, room: { id: room.id, name: room.name }, me: { person: c.person, familyId: c.familyId, role: c.role, admin: c.admin }, families, received, serve: serveView_(c.deptId) };
}

// 개편 안내(설계서 6장): 예약한 새 편성의 우리 가정 사랑방을 회원 안내 시작일부터, 새 리더에게는 맡을 가정 명단을 리더 미리 보기 시작일부터.
//  새 편성이 시작된 달에는 시작했다는 것(화면이 한 번만 보여 준다). 기도제목 내용은 보내지 않는다
function shift_(c) {
  const d = c.deptId, now = termNow_(d), today = today_(), cur = termRow_(d, now);
  if (cur && cur.start === month_()) return { started: now, room: (read_('rooms').find(r => r.id === c.roomId) || {}).name || '' };
  const next = String(Number(now) + 1), t = termRow_(d, next);
  if (!t || today < String(t.memberFrom).slice(0, 10) && today < String(t.leaderFrom).slice(0, 10)) return null;
  const roster = read_('roster').filter(r => String(r.year) === next), mine = roster.find(r => r.familyId === c.familyId);
  if (!mine) return null;
  const fams = read_('families'), room = (read_('rooms').find(r => r.id === mine.roomId) || {}).name || '';
  const out = { start: t.start, year: next, room };
  if ((mine.role === '리더' || mine.role === '코리더') && today >= String(t.leaderFrom).slice(0, 10)) {
    out.lead = mine.role;
    out.families = roster.filter(r => r.roomId === mine.roomId).map(r => (fams.find(f => f.id === r.familyId) || {}).name).filter(Boolean);
  } else if (today < String(t.memberFrom).slice(0, 10)) return null;
  return out;
}

// 사랑방 가정들의 이번 달 카드. isLeader면 리더·목사님 항목까지, 기도했어요 횟수는 보는 사람 본인 것
function roomFamilies_(c, roomId, m, isLeader) {
  ensureMonth_(roomId, m);
  const fams = read_('families'), roster = read_('roster').filter(r => activeRow_(r) && r.roomId === roomId);
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
  ensureFamilies_(read_('roster').filter(r => activeRow_(r) && r.roomId === roomId).map(r => r.familyId), m, () => roomId);
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
  const ok = r => activeRow_(r) && r.familyId === body.familyId && (c.staff ? deptOfRoom_(r.roomId).id === c.deptId : r.roomId === c.roomId);
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
  '기도하기 시작': ['kinds', 'cards', 'secs', 'music', 'flow'],
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

// 그달 처음 연 가정을 접속 기록에 한 줄 남긴다(사람마다 하루 한 번만 확인한다)
function markVisit_(familyId) {
  const m = month_();
  if (!read_('visits').some(v => v.month === m && v.familyId === familyId)) append_('visits', { month: m, familyId });
}

// ── 분석 ① 우리 공동체 (관리자, 설계서 10장) ─────────────────────
// 부서 단위 합계만 내보낸다. 가정 이름, 가정별 숫자, 사랑방 순위, 기도제목 내용은 없다. 사랑방은 정해 둔 순서 그대로
//  - 들어온 가정: 접속 기록 + 그달 기도했어요를 누르거나 기도제목을 손본 가정(접속 기록이 생기기 전 달도 셀 수 있게)
//  - 손봄·확인: 월별 상태가 edited 또는 confirmed
//  - 그달의 가정은 그달 편성(편성 일정)의 활동 가정이다. 지금 떠난 가정은 지난달에서도 빼고 센다
function analysisView_(c) {
  const m = month_(), months = [m];
  while (months.length < 6) months.unshift(prevMonth_(months[0]));
  const deptRooms = roomIdsOfDept_(c.deptId), rooms = activeRooms_(c.deptId).sort((a, b) => a.order - b.order);
  const fams = read_('families'), live = id => (fams.find(f => f.id === id) || {}).status === '활동';
  const roster = read_('roster').filter(r => deptRooms.indexOf(r.roomId) >= 0 && live(r.familyId));
  const famsAt = mm => { const y = termAt_(c.deptId, mm); return roster.filter(r => String(r.year) === y); };
  const seen = {}, st = {}, mark = (f, mm) => { seen[f + '|' + mm] = true; };
  read_('visits').forEach(v => mark(v.familyId, v.month));
  read_('monthly').forEach(x => { st[x.familyId + '|' + x.month] = x.status; if (x.status !== 'same') mark(x.familyId, x.month); });
  const inDept = {}; roster.forEach(r => { inDept[r.familyId] = true; });
  const prayers = read_('prayers').filter(p => inDept[p.familyId]);
  read_('prayers').forEach(p => mark(p.by, fmtMonth_(p.at)));
  const done = (f, mm) => st[f + '|' + mm] === 'edited' || st[f + '|' + mm] === 'confirmed';
  const pct = (k, n) => n ? Math.round(k / n * 100) : null;
  const trend = months.map(mm => {
    const ids = famsAt(mm).map(r => r.familyId);
    return { month: mm, n: ids.length, visit: pct(ids.filter(f => seen[f + '|' + mm]).length, ids.length), edit: pct(ids.filter(f => done(f, mm)).length, ids.length) };
  });
  const now = famsAt(m), ids = now.map(r => r.familyId);
  // 주별 '기도했어요': 이번 주(월요일부터)까지 8주
  const day = 864e5, start = Date.parse(weekStart_() + 'T00:00:00Z') - 7 * 7 * day;
  const weeks = Array.from({ length: 8 }, (_, i) => { const d = new Date(start + i * 7 * day); return { label: (d.getUTCMonth() + 1) + '/' + d.getUTCDate(), n: 0 }; });
  prayers.forEach(p => { const i = Math.floor((Date.parse(fmtDate_(p.at) + 'T00:00:00Z') - start) / (7 * day)); if (i >= 0 && i < 8) weeks[i].n++; });
  const reached = {}; prayers.forEach(p => { if (fmtMonth_(p.at) === m) reached[p.familyId] = true; });
  // 기도하는 때: 최근 4주, 요일(월~일) × 때(새벽 5~9, 오전 9~12, 오후 12~18, 저녁 18~22, 밤 22~5). 서울 시각은 UTC+9(서머타임 없음)
  const since = Date.now() - 28 * day, time = Array.from({ length: 7 }, () => [0, 0, 0, 0, 0]);
  prayers.forEach(p => {
    const t = new Date(p.at).getTime(); if (!(t > since)) return;
    const k = new Date(t + 9 * 3600e3), h = k.getUTCHours();
    time[(k.getUTCDay() + 6) % 7][h >= 5 && h < 9 ? 0 : h >= 9 && h < 12 ? 1 : h >= 12 && h < 18 ? 2 : h >= 18 && h < 22 ? 3 : 4]++;
  });
  return {
    month: m, months, trend,
    now: { n: ids.length, visit: ids.filter(f => seen[f + '|' + m]).length, edit: ids.filter(f => done(f, m)).length,
      unreached: rooms.filter(r => now.some(x => x.roomId === r.id && !reached[x.familyId])).length, day: Number(today_().slice(8)) },
    weeks,
    rooms: rooms.map(r => ({ name: r.name, vals: months.map(mm => { const f = famsAt(mm).filter(x => x.roomId === r.id).map(x => x.familyId); return pct(f.filter(id => done(id, mm)).length, f.length); }) })),
    time
  };
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
  // 돌봄 신호 예시: n달 전부터 지난달까지 같은 기도제목을 이전 항목ID로 잇는다. same이면 이어 온 달은 '지난달 그대로'
  const chain = (fid, roomId, target, text, scope, order, by, n, same) => {
    const ms = [prev]; while (ms.length < n) ms.unshift(prevMonth_(ms[0]));
    let prevId = '';
    ms.forEach(mm => {
      const id = newId_();
      append_('items', { id, month: mm, familyId: fid, roomId, target, text, scope, state: '이어짐', prevId, same: prevId ? '예' : '아니오', order, editedAt: new Date(), editedBy: by });
      append_('monthly', { month: mm, familyId: fid, status: prevId && same ? 'same' : 'edited' });
      prevId = id;
    });
  };
  // 지난 기록 › 기도 타임라인 예시: 석 달 전에 올려 두 달 이어 오다 마친 기도제목
  const pp = prevMonth_(prev), p3 = prevMonth_(pp), done = newId_();
  append_('items', { id: done, month: p3, familyId: 'F1', roomId: 'R1', target: '우리 가정', text: '전세 대출 심사가 잘 통과되도록', scope: 'room', state: '이어짐', prevId: '', same: '아니오', order: 1, editedAt: new Date(), editedBy: '김도윤' });
  append_('items', { id: newId_(), month: pp, familyId: 'F1', roomId: 'R1', target: '우리 가정', text: '전세 대출 심사가 잘 통과되도록', scope: 'room', state: '마침', prevId: done, same: '예', order: 1, editedAt: new Date(), editedBy: '김도윤' });
  chain('F2', 'R1', '우리 가정', '매일 10분이라도 가족이 함께 말씀 읽기', 'room', 1, '박민재', 2, false);
  it('F3', 'R1', '아내', '임신 기간 건강하게 지내도록', 'room', 1, '한지민');
  chain('F4', 'R1', '부모님', '부모님이 신앙을 갖도록', 'room', 1, '오세훈', 3, true);
  it('F6', 'R2', '우리 가정', '새 직장에 잘 적응하도록', 'room', 1, '임재현');
  it('F8', 'R3', '나', '졸업 논문을 잘 마무리하도록', 'room', 1, '윤하람');
  it('F8', 'R3', '가족', '할머니 수술이 잘 끝나도록', 'leader', 2, '윤하람');
  it('F9', 'R3', '학교·직장', '첫 직장에서 좋은 동료를 만나도록', 'room', 1, '장서진');
  it('F10', 'R3', '나', '매일 아침 말씀 묵상을 이어 가도록', 'room', 1, '문태오');
  // 분석 예시: 지난 다섯 달의 손봄·확인(이미 적힌 달은 그대로)과 어제까지 8주의 '기도했어요'(같은 사랑방 가정끼리,
  //  수요 기도회 저녁과 주일 오전에 많게). 오늘 것은 넣지 않아서 하루 3번 제한에 걸리지 않는다
  let seed = 7;
  const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647, pick = a => a[Math.floor(rnd() * a.length)];
  const groups = [['F1', 'F2', 'F3', 'F4', 'F5'], ['F6', 'F7']], had = {};
  read_('monthly').forEach(x => { had[x.familyId + '|' + x.month] = true; });
  const pastMonths = [prev]; while (pastMonths.length < 5) pastMonths.unshift(prevMonth_(pastMonths[0]));
  appendMany_('monthly', pastMonths.flatMap(mm => [].concat(...groups).filter(f => !had[f + '|' + mm])
    .map(f => ({ month: mm, familyId: f, status: rnd() < .3 ? 'same' : rnd() < .75 ? 'edited' : 'confirmed' }))));
  const plist = [];
  for (let d = 56; d >= 1; d--) {
    const date = fmtDate_(new Date(Date.now() - d * 864e5)), wd = new Date(date + 'T00:00:00Z').getUTCDay();
    for (let k = 1 + Math.floor(rnd() * 4) + (wd === 3 || wd === 0 ? 3 : 0); k > 0; k--) {
      const g = pick(groups), by = pick(g), hh = wd === 3 ? pick([19, 20, 21]) : wd === 0 ? pick([9, 10, 11, 21]) : pick([6, 7, 8, 12, 13, 20, 22, 23]);
      plist.push({ at: new Date(date + 'T' + String(hh).padStart(2, '0') + ':' + String(Math.floor(rnd() * 60)).padStart(2, '0') + ':00+09:00'), by, familyId: pick(g.filter(f => f !== by)), kakaoId: '' });
    }
  }
  appendMany_('prayers', plist);
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
    del('items', mine); del('roster', mine); del('monthly', mine); del('posts', mine); del('links', mine); del('visits', mine);
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

// ── 편성 연도 ─────────────────────────────────────────────
// 편성은 부서마다 해마다 새로 만든다(편성 탭의 연도). 편성 일정에 시작 달을 적어 두면 그 달 1일부터, 없으면 그 해 1월부터 적용된다.
//  새 편성을 만들지 않으면 지난 편성이 그대로 이어진다(1월이 되어도 사랑방이 비지 않게)

// 부서의 편성 목록 [{ year, start }], 시작 달 순. 한 요청 안에서는 한 번만 계산한다(편성·일정을 쓰면 다시)
function terms_(deptId) {
  const memo = READ_CACHE_._terms || (READ_CACHE_._terms = {});
  if (memo[deptId]) return memo[deptId];
  const ys = {};
  read_('roster').forEach(r => { if (!ys[r.year] && deptOfRoom_(r.roomId).id === deptId) ys[r.year] = r.year + '-01'; });
  read_('terms').forEach(t => { if (t.deptId === deptId && ys[t.year] && t.status !== '취소') ys[t.year] = t.start; });
  return (memo[deptId] = Object.keys(ys).map(y => ({ year: y, start: ys[y] })).sort((a, b) => a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}
// 그 달(yyyy-MM)에 적용 중인 편성 연도. 편성이 하나도 없으면 달력 연도
function termAt_(deptId, m) { const t = terms_(deptId).filter(x => x.start <= m).pop(); return t ? t.year : m.slice(0, 4); }
function termNow_(deptId) { return termAt_(deptId, month_()); }
// 지금 적용 중인 편성의 줄인지(편성 탭 한 줄)
function activeRow_(r) { return String(r.year) === termNow_(deptOfRoom_(r.roomId).id); }
// 지금 쓰는 사랑방: 지금 편성에 가정이 있거나, 아직 어느 편성에도 쓰이지 않은 새 사랑방. 지난 편성에만 있던 사랑방은 지난 기록에만 남는다
function activeRooms_(deptId) {
  const roster = read_('roster');
  return read_('rooms').filter(r => (!deptId || deptOfRoom_(r.id).id === deptId)
    && (roster.some(x => x.roomId === r.id && activeRow_(x)) || !roster.some(x => x.roomId === r.id)));
}
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
  delete READ_CACHE_[key]; delete READ_CACHE_._terms;
}
function append_(key, o) { sheet_(key).appendRow(rowOf_(key, o)); delete READ_CACHE_[key]; delete READ_CACHE_._terms; }
function update_(key, o) { sheet_(key).getRange(o._row, 1, 1, SCHEMA[key][1].length).setValues([rowOf_(key, o)]); delete READ_CACHE_[key]; delete READ_CACHE_._terms; }
function remove_(key, o) { sheet_(key).deleteRow(o._row); delete READ_CACHE_[key]; delete READ_CACHE_._terms; }

// 저장은 한 번에 하나씩(주일처럼 몰릴 때 서로 덮어쓰지 않게)
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw fail_('busy', '지금 사람이 많아요. 잠시 뒤 다시 해 주세요.');
  try { Object.keys(READ_CACHE_).forEach(k => delete READ_CACHE_[k]); return fn(); } finally { lock.releaseLock(); }
}

// ── 연도 개편 ─────────────────────────────────────────────
// 관리자가 새 편성을 예약한다(설계서 6장). 새 편성은 편성 탭에 다음 연도로 미리 넣어 두고, 편성 일정의 시작 달이 되면 저절로 적용된다.
//  그 전까지는 아무에게도 보이지 않는다. 다시 예약하면 지난 예약을 지우고 새로 넣고, 취소하면 예약 때 만든 사랑방·가정까지 지운다

function adminOf_(body) {
  const c = member_(body);
  if (!c.admin) throw fail_('forbidden', '관리자만 할 수 있어요.');
  return c;
}
const ids_ = v => String(v || '').split(/\s*,\s*/).filter(Boolean);
// 그 부서의 그 연도 편성 일정(취소된 것은 빼고)
function termRow_(deptId, year) { return read_('terms').filter(t => t.deptId === deptId && String(t.year) === String(year) && t.status !== '취소').pop() || null; }
// 지금 편성에 없는 가정이 들어왔을 때: 개편 때 보류·떠남으로 정했으면 그 말로
function notInTerm_(familyId) {
  const last = read_('roster').filter(r => r.familyId === familyId).sort((a, b) => Number(b.year) - Number(a.year))[0];
  const d = last ? deptOfRoom_(last.roomId).id : '', t = d ? termRow_(d, termNow_(d)) : null;
  if (t && ids_(t.hold).indexOf(familyId) >= 0) return '새 편성을 정하고 있어요. 사랑방이 정해지면 열려요. 리더에게 알려 주세요.';
  if (t && ids_(t.leave).indexOf(familyId) >= 0) return '올해 편성에 우리 가정이 없어요. 다시 함께하려면 리더에게 알려 주세요.';
  return '올해 편성에서 우리 가정을 찾지 못했어요. 리더에게 알려 주세요.';
}

// 마법사가 여는 정보: 지금 편성(사랑방·가정), 새 편성 연도, 이미 예약한 것
function reorgView_(c) {
  const d = c.deptId, now = termNow_(d), next = String(Number(now) + 1), fams = read_('families'), rooms = read_('rooms');
  const roomName = id => (rooms.find(r => r.id === id) || {}).name || '';
  const famOf = id => fams.find(f => f.id === id) || {};
  const current = read_('roster').filter(r => activeRow_(r) && deptOfRoom_(r.roomId).id === d && famOf(r.familyId).status === '활동')
    .map(r => ({ id: r.familyId, name: famOf(r.familyId).name, room: roomName(r.roomId), role: r.role }));
  const t = termRow_(d, next);
  const plan = !t ? null : {
    start: t.start, leaderFrom: String(t.leaderFrom).slice(0, 10), memberFrom: String(t.memberFrom).slice(0, 10), at: fmtDay_(t.at), by: t.by, leave: ids_(t.leave), hold: ids_(t.hold),
    rows: read_('roster').filter(r => String(r.year) === next && deptOfRoom_(r.roomId).id === d)
      .map(r => ({ room: roomName(r.roomId), familyId: r.familyId, name: famOf(r.familyId).name, role: r.role }))
  };
  return { dept: c.dept, now, next, month: month_(), current, plan };
}

// 예약(새로 하거나 고치기). body: { start: 'yyyy-MM', leaderFrom, memberFrom: 'yyyy-MM-dd',
//  rooms: [사랑방 이름(순서대로)], rows: [{ room, familyId 또는 name(새 가정), role }], leave: [가정ID], hold: [가정ID] }
function reorgSave_(body) {
  const c = adminOf_(body), d = c.deptId;
  const start = String(body.start || ''), lf = String(body.leaderFrom || ''), mf = String(body.memberFrom || '');
  if (!/^\d{4}-\d{2}$/.test(start) || start <= month_()) throw fail_('bad', '적용 시작 달은 다음 달 이후로 골라 주세요.');
  if (![lf, mf].every(x => /^\d{4}-\d{2}-\d{2}$/.test(x) && x < start + '-01')) throw fail_('bad', '안내 날짜는 적용 시작일보다 앞으로 골라 주세요.');
  const names = (body.rooms || []).map(x => String(x).trim()).filter(Boolean);
  const rows = (body.rows || []).map(r => ({ room: String(r.room || '').trim(), familyId: String(r.familyId || ''), name: String(r.name || '').trim(), role: ['리더', '코리더'].indexOf(r.role) >= 0 ? r.role : '회원' }));
  if (!names.length || !rows.length || rows.some(r => names.indexOf(r.room) < 0 || (!r.familyId && !r.name))) throw fail_('bad', '편성표를 다시 확인해 주세요.');
  const seen = {};
  rows.forEach(r => { if (r.familyId && seen[r.familyId]) throw fail_('bad', '한 가정이 두 번 들어갔어요. 이름 맞추기를 다시 확인해 주세요.'); seen[r.familyId] = true; });
  return withLock_(() => {
    const now = termNow_(d), next = String(Number(now) + 1), old = termRow_(d, next);
    // 지난 예약은 편성 줄만 지우고, 그때 만든 사랑방·가정은 새 예약이 다시 쓰면 이어 간다(쓰지 않게 된 것만 아래에서 지운다)
    dropPlan_(d, next, true);
    // 사랑방: 지금 부서에 같은 이름이 있으면 그대로 이어 가고, 없으면 새로 만든다(이름을 바꾼 사랑방도 새 사랑방. 예전 이름은 지난 기록에 남는다)
    const rooms = read_('rooms'), mine = rooms.filter(r => deptOfRoom_(r.id).id === d), newRooms = [], newFams = [];
    let order = rooms.reduce((a, r) => Math.max(a, r.order), 0);
    const idOf = {};
    names.forEach((n, k) => {
      const hit = mine.filter(r => r.name === n).sort((a, b) => b.order - a.order)[0];
      if (hit) { idOf[n] = hit.id; return; }
      const id = 'R' + Date.now().toString(36) + k;
      append_('rooms', { id, name: n, order: ++order, deptId: d });
      idOf[n] = id; newRooms.push(id);
    });
    const fams = read_('families'), list = [];
    rows.forEach((r, k) => {
      let id = r.familyId;
      if (!id || !fams.some(f => f.id === id)) {
        // 처음 보는 가정: 새로 등록한다. 적용 날짜가 되면 목록에 나오고, 처음 들어올 때 카카오로 연결을 요청한다
        id = 'F' + Date.now().toString(36) + 'n' + k;
        append_('families', { id, name: r.name.slice(0, 40), kids: '', status: '활동', admin: '' });
        newFams.push(id);
      }
      list.push({ year: next, roomId: idOf[r.room], familyId: id, role: r.role });
    });
    appendMany_('roster', list);
    if (old) {
      const usedNow = id => list.some(r => r.roomId === id || r.familyId === id);
      ids_(old.newRooms).forEach(id => { if (usedNow(id)) newRooms.push(id); });
      ids_(old.newFams).forEach(id => { if (usedNow(id)) newFams.push(id); });
      cleanPlan_(old);
    }
    const keep = x => ids_((x || []).join(',')).filter(id => !seen[id]);
    append_('terms', { deptId: d, year: next, start, leaderFrom: lf, memberFrom: mf, status: '예약', by: c.person, at: new Date(),
      leave: keep(body.leave).join(','), hold: keep(body.hold).join(','), newRooms: newRooms.join(','), newFams: newFams.join(',') });
    return reorgView_(c);
  });
}

function reorgCancel_(c) {
  return withLock_(() => { const now = termNow_(c.deptId); dropPlan_(c.deptId, String(Number(now) + 1)); return reorgView_(c); });
}

// 아직 적용되지 않은 다음 편성을 지운다: 그 연도의 편성 줄을 지우고 일정은 '취소'로 남긴다.
//  keep이 아니면(예약 취소) 예약 때 만든 사랑방·가정도 지운다
function dropPlan_(d, year, keep) {
  const t = termRow_(d, year);
  if (t && t.start <= month_()) throw fail_('bad', '이미 적용된 편성은 고칠 수 없어요.');
  read_('roster').filter(r => String(r.year) === year && deptOfRoom_(r.roomId).id === d).sort((a, b) => b._row - a._row).forEach(r => remove_('roster', r));
  if (!t) return;
  t.status = '취소'; update_('terms', t);
  if (!keep) cleanPlan_(t);
}
// 예약 때 만든 사랑방·가정 중 이제 어디에도 쓰이지 않는 것을 지운다(편성·연결이 하나라도 있으면 둔다)
function cleanPlan_(t) {
  const used = id => read_('roster').some(r => r.roomId === id || r.familyId === id) || read_('links').some(l => l.familyId === id);
  read_('rooms').filter(r => ids_(t.newRooms).indexOf(r.id) >= 0 && !used(r.id)).sort((a, b) => b._row - a._row).forEach(r => remove_('rooms', r));
  read_('families').filter(f => ids_(t.newFams).indexOf(f.id) >= 0 && !used(f.id)).sort((a, b) => b._row - a._row).forEach(f => remove_('families', f));
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
