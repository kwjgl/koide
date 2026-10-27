/**
 * 코이데 기본 서버 (Google Apps Script) · 교회 코드(결정 기록 2026-10-27)
 *
 * 교회마다 서버(시트와 apps-script/Code.js)가 따로 있다. 이 기본 서버는 그 위에서 세 가지만 한다.
 *  ① 카카오 로그인: 카카오 code를 확인하고 기본 서버 로그인 표시(서명한 값, 시트에 남기지 않음)를 내준다
 *  ② 교회 코드: 코드 → 교회 서버. 코드가 맞으면 그 교회 서버가 믿는 확인증(5분)을 서명해 준다. 코드가 없으면 코이데를 쓸 수 없다
 *  ③ 앱 관리자 보기: 교회마다 서버 버전·오류·연결 수. 기도제목과 이름은 오지 않는다
 * 새 구글 시트를 하나 만들고 "확장 프로그램 > Apps Script"에 이 파일을 붙여 넣은 뒤 setup을 한 번 실행한다. 순서는 apps-script/hub/README.md
 *
 * 스크립트 속성(프로젝트 설정 > 스크립트 속성):
 *   KAKAO_REST_KEY       카카오 개발자 앱의 REST API 키(교회 서버와 같은 카카오 앱)
 *   KAKAO_CLIENT_SECRET  (선택) 카카오 로그인 보안의 Client Secret
 *   REDIRECT_URI         카카오에 등록한 앱 주소. 예: https://koide.koinobia.com/app/
 *   HUB_SECRET           서명 값. 아무도 모르는 긴 글자(40자 이상). 모든 교회 서버의 HUB_SECRET에도 같은 값을 넣는다
 *   APP_ADMINS           앱 관리자의 카카오ID(쉼표로 여럿). 앱 관리자 보기에서 '내 카카오ID'로 확인할 수 있다
 */

const HUB_VERSION = '2026-10-27 교회 코드 · 들어가기·초대';
const HUB_DAYS = 30, TICKET_MIN = 5;

// 시트 이름과 칸(첫 줄에 그대로 쓰인다)
//  교회: 코드는 여럿이면 쉼표로. 종류는 교회 / 테스트. 상태가 '멈춤'이면 코드로 들어올 수 없고 앱 관리자 보기에만 나온다.
//   이름표는 그 교회 서버의 CHURCH_ID와 같게 쓴다(같은 서버에 코드를 바꿔 달아도 이어지게 코드와 따로 둔다)
//  사람: 누가 어느 교회로 들어갔는지(카카오ID와 교회 이름표만). 다시 로그인하거나 휴대폰을 바꾸면 코드 없이 그 교회로 간다
const HUB_SCHEMA = {
  churches: ['교회', [['id', '이름표'], ['name', '이름'], ['kind', '종류'], ['codes', '코드'], ['url', '서버 주소'], ['status', '상태'], ['memo', '메모']]],
  members: ['사람', [['kakaoId', '카카오ID'], ['church', '교회 이름표'], ['at', '들어간 날']]]
};

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, data: { hub: HUB_VERSION } })).setMimeType(ContentService.MimeType.JSON);
}
function doPost(e) {
  let out, body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const fn = HUB_ACTIONS[body.action];
    if (!fn) throw fail_('bad', '모르는 요청이에요.');
    out = { ok: true, data: fn(body) };
  } catch (err) {
    out = err && err.code ? { ok: false, code: err.code, message: err.message } : { ok: false, code: 'server', message: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

const HUB_ACTIONS = {
  login: login_,
  // 이 사람이 갈 교회(아는 교회가 없으면 church: null → 화면이 코드를 묻는다)
  where: body => { const a = auth_(body.token); return Object.assign(whereOf_(a), { admin: isAdmin_(a) }); },
  // 코드 확인만(교회 이름을 보여 주고 "이 교회가 맞나요?"를 묻는다)
  peek: body => { const a = auth_(body.token), c = byCode_(a, body.code); return { name: c.name, kind: kindOf_(c) }; },
  // 코드로 들어가기: 사람 탭에 적고 확인증을 준다
  join: body => {
    const a = auth_(body.token), c = byCode_(a, body.code);
    withLock_(() => {
      const old = read_('members').filter(m => m.kakaoId === a.kakaoId);
      if (old.length) { old[0].church = c.id; old[0].at = new Date(); update_('members', old[0]); }
      else append_('members', { kakaoId: a.kakaoId, church: c.id, at: new Date() });
    });
    return goTo_(a, c);
  },
  admin: adminView_,
  // 앱 관리자 보기에서 교회(테스트 공간) 더하기·고치기. 지우기는 없다(사람 탭이 이름표를 가리킨다). 쓰지 않으면 상태를 멈춤으로
  churchSave: churchSave_,
  // 앱 관리자가 코드 없이 그 교회로 들어가 본다. 사람 탭은 바꾸지 않는다(다시 로그인하면 원래 교회로)
  enter: body => {
    const a = auth_(body.token);
    if (!isAdmin_(a)) throw fail_('forbidden', '앱 관리자만 할 수 있어요.');
    const c = read_('churches').find(x => x.id === String(body.id || '') && x.url);
    if (!c) throw fail_('bad', '교회를 찾지 못했어요.');
    return goTo_(a, c);
  },
  invite: inviteFirst_
};

// ── ① 카카오 로그인 ─────────────────────────────────────────
function login_(body) {
  // 설정값 앞뒤에 빈칸이 들어가도 되게 다듬는다(붙여 넣다 들어가기 쉽다)
  const p = {}; Object.entries(props_()).forEach(([k, v]) => { p[k] = String(v).trim(); });
  if (!body.code) throw fail_('bad', '카카오 로그인 정보가 없어요.');
  if (p.REDIRECT_URI && body.redirectUri !== p.REDIRECT_URI) throw fail_('bad', '등록되지 않은 주소에서 로그인했어요.');
  const payload = { grant_type: 'authorization_code', client_id: p.KAKAO_REST_KEY, redirect_uri: body.redirectUri, code: body.code };
  if (p.KAKAO_CLIENT_SECRET) payload.client_secret = p.KAKAO_CLIENT_SECRET;
  const tok = UrlFetchApp.fetch('https://kauth.kakao.com/oauth/token', { method: 'post', payload, muteHttpExceptions: true });
  // 카카오가 거절한 까닭(예: KOE010 Client Secret이 다름, KOE320 로그인 정보를 이미 씀)을 함께 보여 준다. 비밀 값은 들어 있지 않다
  if (tok.getResponseCode() !== 200) {
    let why = ''; try { const j = JSON.parse(tok.getContentText()); why = [j.error_code, j.error, j.error_description].filter(Boolean).join(' · '); } catch (e) { /* 까닭 없이 */ }
    throw fail_('kakao', '카카오 로그인을 확인하지 못했어요. 다시 해 주세요.' + (why ? ' (' + why + ')' : ''));
  }
  const access = JSON.parse(tok.getContentText()).access_token;
  const res = UrlFetchApp.fetch('https://kapi.kakao.com/v2/user/me', { headers: { Authorization: 'Bearer ' + access }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw fail_('kakao', '카카오 사용자 정보를 받지 못했어요.');
  const u = JSON.parse(res.getContentText());
  const kakaoId = String(u.id);
  const nick = (u.properties && u.properties.nickname) || (u.kakao_account && u.kakao_account.profile && u.kakao_account.profile.nickname) || '';
  return { token: seal_({ typ: 'hub', kakaoId, nick, exp: Date.now() + HUB_DAYS * 864e5 }), nick };
}
function auth_(token) {
  const x = open_(token);
  if (!x || x.typ !== 'hub' || !(Number(x.exp) > Date.now())) throw fail_('login', '다시 로그인해 주세요.');
  return { kakaoId: String(x.kakaoId), nick: String(x.nick || '') };
}

// ── ② 교회 코드 ──────────────────────────────────────────
const normCode_ = s => String(s || '').toUpperCase().replace(/[^A-Z0-9가-힣]/g, '');
const kindOf_ = c => String(c.kind).trim() === '테스트' ? '테스트' : '교회';
const live_ = c => c.id && c.url && String(c.status).trim() !== '멈춤';
// 코드를 마구 넣어 보지 못하게: 한 사람이 10분에 10번까지 틀릴 수 있다
function byCode_(a, code) {
  const cache = CacheService.getScriptCache(), key = 'miss:' + a.kakaoId, miss = Number(cache.get(key) || 0);
  if (miss >= 10) throw fail_('busy', '코드를 여러 번 틀렸어요. 10분 뒤에 다시 넣어 주세요.');
  const k = normCode_(code);
  const c = k && read_('churches').find(x => live_(x) && String(x.codes).split(',').map(normCode_).indexOf(k) >= 0);
  if (!c) { cache.put(key, String(miss + 1), 600); throw fail_('notfound', '맞는 교회 코드가 없어요. 받은 코드를 다시 확인해 주세요.'); }
  return c;
}
// 확인증(5분): 그 교회 서버의 ticketLogin이 받는다
function goTo_(a, c) {
  return { church: { id: c.id, name: c.name, kind: kindOf_(c), url: c.url },
    ticket: seal_({ typ: 'ticket', kakaoId: a.kakaoId, nick: a.nick, church: c.id, exp: Date.now() + TICKET_MIN * 60e3 }) };
}
// 갈 교회: 사람 탭에 있으면 그 교회. 없으면(교회 코드 전부터 쓰던 사람의 새 휴대폰 등) 교회 서버들에 이 사람을 아는지 물어보고 적어 둔다
function whereOf_(a) {
  const L = read_('churches').filter(live_);
  const m = read_('members').find(x => x.kakaoId === a.kakaoId), mine = m && L.find(c => c.id === m.church);
  if (mine) return goTo_(a, mine);
  if (!L.length) return { church: null };
  const at = Date.now();
  const res = UrlFetchApp.fetchAll(L.map(c => post_(c.url, { action: 'hubKnows', kakaoId: a.kakaoId, at, sig: sign_('knows|' + a.kakaoId + '|' + at) })));
  const i = res.findIndex(r => { try { const j = JSON.parse(r.getContentText()); return j.ok && j.data.known; } catch (e) { return false; } });
  if (i < 0) return { church: null };
  withLock_(() => { if (!read_('members').some(x => x.kakaoId === a.kakaoId)) append_('members', { kakaoId: a.kakaoId, church: L[i].id, at: new Date() }); });
  return goTo_(a, L[i]);
}

// ── ③ 앱 관리자 보기 ─────────────────────────────────────────
function isAdmin_(a) { return String(props_().APP_ADMINS || '').split(',').map(s => s.trim()).filter(Boolean).indexOf(a.kakaoId) >= 0; }
function adminView_(body) {
  const a = auth_(body.token);
  if (!isAdmin_(a)) throw fail_('forbidden', '앱 관리자만 볼 수 있어요. 내 카카오ID: ' + a.kakaoId);
  const L = read_('churches').filter(c => c.id && c.url), at = Date.now(), sig = sign_('status|' + at);
  const res = L.length ? UrlFetchApp.fetchAll(L.map(c => post_(c.url, { action: 'appStatus', at, sig }))) : [];
  const people = read_('members');
  return { me: a.kakaoId, version: HUB_VERSION, churches: L.map((c, i) => {
    let st = null, err = '';
    try { const j = JSON.parse(res[i].getContentText()); if (j.ok) st = j.data; else err = j.message || j.code; }
    catch (e) { err = '서버가 답하지 않아요(' + res[i].getResponseCode() + ')'; }
    return { id: c.id, name: c.name, kind: kindOf_(c), codes: String(c.codes || ''), url: c.url, stopped: String(c.status).trim() === '멈춤', memo: String(c.memo || ''),
      came: people.filter(m => m.church === c.id).length, status: st, err };
  }) };
}

// 첫 관리자 초대 링크(앱 관리자만): 그 교회 서버에 전체 관리자 초대를 만들게 하고, 앱 주소에 초대 값과 그 교회 코드를 붙여 돌려준다.
//  받은 사람은 링크로 열어 카카오 로그인 → 코드 확인 → 그 교회의 전체 관리자가 된다
function inviteFirst_(body) {
  const a = auth_(body.token);
  if (!isAdmin_(a)) throw fail_('forbidden', '앱 관리자만 할 수 있어요.');
  const c = read_('churches').find(x => x.id === String(body.id || '') && x.url);
  if (!c) throw fail_('bad', '교회를 찾지 못했어요.');
  const at = Date.now(), r = UrlFetchApp.fetchAll([post_(c.url, { action: 'hubOpsInvite', at, sig: sign_('invite|' + at) })])[0];
  let j; try { j = JSON.parse(r.getContentText()); } catch (e) { throw fail_('bad', '그 교회 서버가 답하지 않아요. 서버 주소를 확인해 주세요.'); }
  if (!j.ok) throw fail_('bad', /모르는 요청/.test(j.message || '') ? '그 교회 서버를 새 버전으로 배포해야 초대 링크를 만들 수 있어요.' : j.message);
  const code = String(c.codes || '').split(',')[0].trim(), base = String(props_().REDIRECT_URI || '').trim();
  return { link: base + '?opsjoin=' + encodeURIComponent(j.data.token) + (code ? '&church=' + encodeURIComponent(code) : ''), until: j.data.until };
}

// 교회 더하기·고치기(앱 관리자만). orig가 있으면 그 이름표의 줄을 고친다(이름표는 바꾸지 않는다)
function churchSave_(body) {
  const a = auth_(body.token);
  if (!isAdmin_(a)) throw fail_('forbidden', '앱 관리자만 바꿀 수 있어요.');
  const id = String(body.orig || body.id || '').trim(), name = String(body.name || '').trim().slice(0, 30);
  const kind = body.kind === '테스트' ? '테스트' : '교회', url = String(body.url || '').trim(), memo = String(body.memo || '').trim().slice(0, 60);
  const codes = String(body.codes || '').split(',').map(x => x.trim()).filter(Boolean);
  if (!/^[A-Za-z0-9_-]{1,20}$/.test(id)) throw fail_('bad', '이름표는 영어·숫자로 20자까지 써 주세요.');
  if (!name) throw fail_('bad', '이름을 써 주세요.');
  if (!/^https:\/\/script\.google\.com\/(a\/macros\/[^/]+|macros)\/s\/[^/]+\/exec$/.test(url)) throw fail_('bad', '서버 주소는 Apps Script 웹 앱 주소(https://script.google.com/macros/s/…/exec)로 넣어 주세요.');
  if (!codes.length) throw fail_('bad', '코드를 하나 이상 써 주세요.');
  if (codes.some(c => normCode_(c).length < 3)) throw fail_('bad', '코드는 3글자 이상으로 써 주세요.');
  return withLock_(() => {
    const L = read_('churches'), row = L.find(c => c.id === id);
    if (body.orig ? !row : row) throw fail_('bad', body.orig ? '고칠 교회를 찾지 못했어요.' : '같은 이름표가 이미 있어요.');
    const taken = {}; L.filter(c => c.id !== id).forEach(c => String(c.codes).split(',').map(normCode_).filter(Boolean).forEach(k => { taken[k] = c.name; }));
    const dup = codes.find(c => taken[normCode_(c)]);
    if (dup) throw fail_('bad', `코드 ${dup}는 ${taken[normCode_(dup)]}에서 쓰고 있어요.`);
    const o = { id, name, kind, codes: codes.join(', '), url, status: body.stopped ? '멈춤' : '', memo };
    if (row) update_('churches', Object.assign(row, o)); else append_('churches', o);
    return adminView_(body);
  });
}

// ── 서명 ────────────────────────────────────────────────
function sign_(msg) {
  const secret = props_().HUB_SECRET;
  if (!secret) throw fail_('server', '기본 서버에 HUB_SECRET이 없어요.');
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(msg, secret));
}
// 내용(JSON을 base64로).서명
function seal_(o) { const msg = Utilities.base64EncodeWebSafe(JSON.stringify(o), Utilities.Charset.UTF_8); return msg + '.' + sign_(msg); }
function open_(t) {
  t = String(t || ''); const dot = t.lastIndexOf('.');
  if (dot < 1 || sign_(t.slice(0, dot)) !== t.slice(dot + 1)) return null;
  try { return JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(t.slice(0, dot))).getDataAsString()); } catch (e) { return null; }
}
// 교회 서버에 묻기(교회 서버는 본문을 글자로 받는다)
function post_(url, body) { return { url, method: 'post', contentType: 'text/plain', payload: JSON.stringify(body), muteHttpExceptions: true, followRedirects: true }; }

// ── 시트 ────────────────────────────────────────────────
// 처음 한 번 실행: 탭과 첫 줄을 만든다(있으면 그대로)
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(HUB_SCHEMA).forEach(k => {
    const [name, cols] = HUB_SCHEMA[k];
    const sh = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sh.getLastRow() === 0) { sh.appendRow(cols.map(c => c[1])); sh.setFrozenRows(1); }
  });
}
function sheet_(key) {
  const ss = SpreadsheetApp.getActiveSpreadsheet(), name = HUB_SCHEMA[key][0];
  let sh = ss.getSheetByName(name);
  if (!sh) { setup(); sh = ss.getSheetByName(name); }
  return sh;
}
function read_(key) {
  const sh = sheet_(key), cols = HUB_SCHEMA[key][1], n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, cols.length).getValues().map((r, i) => {
    const o = { _row: i + 2 }; cols.forEach(([k], j) => { o[k] = typeof r[j] === 'string' ? r[j].trim() : String(r[j] === '' ? '' : r[j]); }); return o;
  });
}
const rowOf_ = (key, o) => HUB_SCHEMA[key][1].map(([k]) => o[k] === undefined ? '' : o[k] instanceof Date ? o[k] : "'" + String(o[k]));
function append_(key, o) { sheet_(key).appendRow(rowOf_(key, o)); }
function update_(key, o) { sheet_(key).getRange(o._row, 1, 1, HUB_SCHEMA[key][1].length).setValues([rowOf_(key, o)]); }
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw fail_('busy', '지금 사람이 많아요. 잠시 뒤 다시 해 주세요.');
  try { return fn(); } finally { lock.releaseLock(); }
}
function props_() { return PropertiesService.getScriptProperties().getProperties(); }
function fail_(code, message) { const e = new Error(message); e.code = code; return e; }
