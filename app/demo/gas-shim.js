/*
 * 데모 모드: 계정을 만들기 전에도 앱을 눌러 볼 수 있게, Apps Script가 쓰는 구글 서비스(시트, 캐시, 카카오 요청 등)를
 * 브라우저 안에서 흉내 낸다. 진짜 서버 코드(apps-script/Code.js)를 그대로 불러와 돌리므로, 여기서 되는 것은 실제로도 된다.
 * 데이터는 이 브라우저(localStorage)에만 남고, "데모 데이터 지우기"로 처음 상태로 돌아간다.
 */
(function () {
  const KEY = 'koide-demo-db';
  let db = {};
  try { db = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { db = {}; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* 저장소를 못 쓰면 이번 화면에서만 */ } };
  const unquote = v => typeof v === 'string' && v[0] === "'" ? v.slice(1) : v;

  function sheet(name) {
    const rows = db[name];
    const api = {
      getName: () => name,
      getLastRow: () => rows.length,
      setFrozenRows() {},
      appendRow(arr) { rows.push(arr.map(unquote)); save(); },
      deleteRow(r) { rows.splice(r - 1, 1); save(); },
      getRange(r, c, nr, nc) {
        nr = nr || 1; nc = nc || 1;
        return {
          getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, k) => ((rows[r - 1 + i] || [])[c - 1 + k] ?? ''))),
          setValues(vals) { vals.forEach((row, i) => { const t = rows[r - 1 + i] || (rows[r - 1 + i] = []); row.forEach((v, k) => { t[c - 1 + k] = unquote(v); }); }); save(); }
        };
      }
    };
    return api;
  }
  const ss = {
    getSheetByName: n => (db[n] ? sheet(n) : null),
    insertSheet(n) { db[n] = []; save(); return sheet(n); },
    getSheets: () => Object.keys(db).map(sheet),
    deleteSheet(sh) { delete db[sh.getName()]; save(); }
  };
  window.SpreadsheetApp = { getActiveSpreadsheet: () => ss };

  // 데모용 해시(실제 서버는 SHA-256). 같은 글자면 같은 값이면 충분하다
  const hashBytes = s => { const out = []; let h = 2166136261; for (let r = 0; r < 32; r++) { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i) + r; h = Math.imul(h, 16777619); } out.push((h >>> 0) & 255); } return out; };
  const two = n => String(n).padStart(2, '0');
  const seoul = d => { const x = new Date(new Date(d).getTime() + 9 * 3600e3); return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate() }; };
  window.Utilities = {
    getUuid: () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()),
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    computeDigest: (_, s) => hashBytes(s),
    formatDate(d, _tz, f) {
      const t = seoul(d);
      return f === 'yyyy' ? String(t.y) : f === 'yyyy-MM' ? t.y + '-' + two(t.m) : f === 'yyyy-MM-dd' ? t.y + '-' + two(t.m) + '-' + two(t.d) : f === 'M월 d일' ? t.m + '월 ' + t.d + '일' : String(d);
    }
  };
  const cache = new Map();
  window.CacheService = { getScriptCache: () => ({ get: k => cache.get(k) ?? null, put: (k, v) => cache.set(k, v), remove: k => cache.delete(k) }) };
  window.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) };
  const props = { KAKAO_REST_KEY: 'demo', REDIRECT_URI: '' };
  window.PropertiesService = { getScriptProperties: () => ({ getProperties: () => Object.assign({}, props), setProperty: (k, v) => { props[k] = v; }, deleteProperty: k => { delete props[k]; } }) };
  window.ContentService = { MimeType: { JSON: 'json' }, createTextOutput: s => ({ content: s, setMimeType() { return this; } }) };

  // 카카오 흉내: code가 곧 사람이다(demo:김도윤 → 카카오ID d-김도윤). 실제로는 카카오 화면에서 로그인한다
  const res = (code, obj) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(obj) });
  window.UrlFetchApp = {
    fetch(url, opt) {
      if (url.indexOf('/oauth/token') > 0) return res(200, { access_token: 'at|' + opt.payload.code });
      if (url.indexOf('/v2/user/me') > 0) {
        const code = opt.headers.Authorization.split('|')[1] || '';
        const who = code.replace(/^demo:/, '');
        return res(200, { id: 'd-' + who, properties: { nickname: DEMO_NICK[who] || who } });
      }
      return res(404, {});
    }
  };
  const DEMO_NICK = { 김도윤: '도윤아빠', 이수아: '수아', 박민재: '민재', 서준호: '준호아빠' };

  // 처음 열면 예시 데이터를 넣고, 김도윤(리더)과 박민재(회원)는 이미 연결된 것으로 둔다
  window.koideDemo = {
    ready() {
      if (!db['연결']) {
        setup(); sampleData();
        const today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
        [['김도윤', 'F1'], ['박민재', 'F2']].forEach(([p, f]) => db['연결'].push(['d-' + p, DEMO_NICK[p], f, p, '연결', today, '데모', today]));
        save();
      }
    },
    call(body) { this.ready(); return JSON.parse(doPost({ postData: { contents: JSON.stringify(body) } }).content); },
    reset() { db = {}; save(); cache.clear(); localStorage.removeItem(KEY); }
  };
})();
