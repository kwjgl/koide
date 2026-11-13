// 코이데 교회 층(Supabase)의 응답을 코이데 교회 화면(index.html)이 아는 옛 Apps Script 모양으로 바꾼다. koinonia-api.js와 같은 모양.
// CHURCH_BACKEND가 'supabase'일 때만 index.html이 부른다(app/config.js, docs/setup.md 13장). 서버 함수는 supabase/009_church_setup.sql.
//   start·me → church_me · opsJoin → church_admin_accept 뒤 church_me · opsInvite → church_admin_invite · opsRemove → church_admin_remove
//   opsCtx → church_ops_ctx · church → church_overview · deptSave → church_dept_save · deptClose·deptReopen → church_dept_state
//   saveGroup → church_group_name · roster → church_roster · rosterSave(addRoom·renameRoom·dropRoom) → church_room_save
//   churchPeek → church_peek · churchJoin → church_join · churchLeave → church_leave · logout → KoideSb.signOut(로그인 세션을 끊는다)
// 옛 응답과 다른 곳: ① opsRemove의 body.kakaoId는 이제 교회 관리자 id(uuid)다(화면은 data-v를 그대로 넘긴다)
//   ② pending·usage·surveyState·tourDone·tourSeen은 빈 모양으로 달랜다 ③ 그 밖의 액션은 '아직 쓸 수 없어요' 오류(화면은 토스트로 알린다)
window.koideChurchApi = (() => {
  const SOON = '교회 새 서버에서는 아직 쓸 수 없는 기능이에요. 곧 열려요.';
  const err = (code, message) => ({ code, message });
  const rpc = (name, args) => window.KoideSb.rpc(name, args || {});
  const need = (v, what) => { if (!v) throw err('bad', what + ' 정보가 없어요. 화면을 다시 열어 주세요.'); return v; };
  const pad = n => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  // 이름은 로그인 계정의 표시 이름(user_metadata)에서 고른다. 서버는 auth.users를 읽지 않는다. 비어도 된다
  const nameOf = s => { const m = (s && s.user && s.user.user_metadata) || {}; return String(m.name || m.full_name || m.nickname || m.preferred_username || '').trim(); };
  async function ident() { const s = await window.KoideSb.session(); return { nick: nameOf(s), uid: s && s.user ? s.user.id : '' }; }
  // church_me의 {church, ops}에 화면이 바라는 nick·uid·link·groups를 붙인다(가정 연결은 ③부터라 link는 늘 null)
  async function meOf(r) {
    r = r || await rpc('church_me');
    const id = await ident();
    return { nick: id.nick, uid: id.uid, link: null, groups: [], church: r.church || null, ops: r.ops || null };
  }
  async function handle(body) {
    const dept = body.ops || null; // 운영 모드로 보는 부서 id(index.html의 api()가 S.op를 ops로 붙인다)
    switch (body.action) {
      case 'start': { const me = await meOf(); return body.events ? { me, usage: { kept: true, n: 0 } } : { me }; }
      case 'me': return meOf();
      case 'opsJoin': {
        const id = await ident();
        await rpc('church_admin_accept', { p_token: need(body.invite, '초대 링크'), p_name: id.nick });
        return meOf();
      }
      case 'opsInvite': return rpc('church_admin_invite');
      case 'opsRemove': return rpc('church_admin_remove', body.invite ? { p_token: body.invite } : { p_admin: need(body.kakaoId, '관리자') });
      case 'opsCtx': return rpc('church_ops_ctx', { p_dept: dept });
      case 'church': return rpc('church_overview');
      case 'deptSave': {
        const r = await rpc('church_dept_save', { p_name: body.name || '', p_group: body.group || '', p_unit: body.unit || '' });
        return { id: r.id, me: await meOf(r.me) };
      }
      case 'deptClose': case 'deptReopen': {
        const r = await rpc('church_dept_state', { p_dept: need(body.deptId, '부서'), p_close: body.action === 'deptClose' });
        return { me: await meOf(r.me) };
      }
      case 'saveGroup': return rpc('church_group_name', { p_dept: need(dept, '부서'), p_group: body.group || '', p_rename: !!body.rename });
      case 'roster': return rpc('church_roster', { p_dept: need(dept, '부서') });
      case 'rosterSave':
        if (!['addRoom', 'renameRoom', 'dropRoom'].includes(body.op)) throw err('bad', SOON);
        return rpc('church_room_save', { p_dept: need(dept, '부서'), p_op: body.op, p_room: body.roomId || null, p_name: body.name || '' });
      case 'churchPeek': case 'churchJoin': {
        const peek = body.action === 'churchPeek';
        const r = await rpc(peek ? 'church_peek' : 'church_join', { p_code: body.code || '' });
        // 못 찾은 코드는 예외가 아니라 값으로 온다(예외면 서버가 틀린 횟수를 되돌린다). 여기서 오류로 바꿔 던진다
        if (!r || r.ok === false) throw err((r && r.code) || 'bad', (r && r.message) || '맞는 교회 코드가 없어요. 받은 코드를 다시 확인해 주세요.');
        return peek ? { name: r.church.name, kind: r.church.kind, member: !!r.member } : { church: r.church, joined: !!r.joined };
      }
      case 'churchLeave': return rpc('church_leave');
      case 'logout': await window.KoideSb.signOut(); return {};
      case 'usage': return { kept: true, n: 0 };
      case 'pending': return { requests: [], families: [], posts: {}, today: today(), staff: [] };
      case 'surveyState': return { survey: body.survey || {} };
      case 'tourDone': return { tourDone: true };
      case 'tourSeen': return { seen: false };
      default: throw err('bad', SOON);
    }
  }
  async function call(body) {
    try { return { ok: true, data: await handle(body || {}) }; }
    catch (e) {
      if (e && e.ok === false) return e;
      return { ok: false, code: (e && e.code) || 'bad', message: (e && e.message) || '교회 서버에 연결하지 못했어요. 잠시 뒤 다시 해 주세요.' };
    }
  }
  return { call };
})();
