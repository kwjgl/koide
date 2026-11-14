// 코이데 교회 층(Supabase)의 응답을 코이데 교회 화면(index.html)이 아는 옛 Apps Script 모양으로 바꾼다. koinonia-api.js와 같은 모양.
// CHURCH_BACKEND가 'supabase'일 때만 index.html이 부른다(app/config.js, docs/setup.md 13·14장). 서버 함수는 supabase/009_church_setup.sql·010_church_join.sql.
//   start·me → church_me(+church_invite_open·church_depts·church_month) · opsJoin → church_admin_accept 뒤 church_me · opsInvite → church_admin_invite · opsRemove → church_admin_remove
//   opsCtx → church_ops_ctx · church → church_overview · deptSave → church_dept_save · deptClose·deptReopen → church_dept_state
//   saveGroup → church_group_name · roster → church_roster · rosterSave(addRoom·renameRoom·dropRoom) → church_room_save
//   rosterSave(addPerson·addPeople·role·unlink) → church_person_add·people_add·roster_role·unlink · churchPeek → church_peek · churchJoin → church_join · churchLeave → church_leave
//   requestLink → church_link_pick·name·new · cancelLink → church_link_cancel · month → church_month · rooms → church_depts
//   pending·approve·reject·approveAll·unlink → church_pending·decide·approve_all·unlink · ops·inviteRenew → church_invites·church_invite_renew
//   logout → KoideSb.signOut(로그인 세션을 끊는다)
// 옛 응답과 다른 곳: ① opsRemove·approve·reject·unlink의 body.kakaoId는 이제 관리자·연결 요청·연결 줄의 id(uuid)다(화면은 data-v를 그대로 넘긴다)
//   ② usage·surveyState·tourDone·tourSeen은 빈 모양으로 달랜다 ③ rosterSave의 move·leave·admin·pilotRoom과 표에 없는 액션(기도제목 등)은 '아직 쓸 수 없어요' 오류(화면은 토스트로 알린다)
window.koideChurchApi = (() => {
  const SOON = '교회 새 서버에서는 아직 쓸 수 없는 기능이에요. 곧 열려요.';
  const err = (code, message) => ({ code, message });
  const rpc = (name, args) => window.KoideSb.rpc(name, args || {});
  const need = (v, what) => { if (!v) throw err('bad', what + ' 정보가 없어요. 화면을 다시 열어 주세요.'); return v; };
  // 이름은 로그인 계정의 표시 이름(user_metadata)에서 고른다. 서버는 auth.users를 읽지 않는다. 비어도 된다
  const nameOf = s => { const m = (s && s.user && s.user.user_metadata) || {}; return String(m.name || m.full_name || m.nickname || m.preferred_username || '').trim(); };
  async function ident() { const s = await window.KoideSb.session(); return { nick: nameOf(s), uid: s && s.user ? s.user.id : '' }; }
  // church_me의 {church, ops, link}를 화면이 아는 옛 me 모양(meInfo_와 같은 모양)으로 편다
  async function meOf(r) {
    r = r || await rpc('church_me');
    const id = await ident(), L = r.link || null;
    const me = { nick: id.nick, uid: id.uid, groups: [], church: r.church || null, ops: r.ops || null,
      link: L ? { status: L.status, familyId: L.familyId, person: L.person, since: L.since } : null };
    if (L && L.status === '요청') { me.familyName = L.familyName || ''; me.staff = false; }   // 기다리는 화면이 읽는다
    if (L && L.status === '연결') Object.assign(me, { person: L.person, familyId: L.familyId, roomId: L.roomId || '', deptId: L.deptId || '',
      dept: L.dept || null, role: L.role || '회원', admin: !!L.admin });                       // 옛 memberFrom_ 모양(화면이 S.me.person 등을 쓴다)
    return me;
  }
  // 서버가 값으로 알리는 실패({ok:false, code, message})를 화면이 아는 오류로 바꿔 던진다
  const okOrThrow = (r, msg) => { if (!r || r.ok === false) throw err((r && r.code) || 'bad', (r && r.message) || msg); return r; };
  // 링크 값(사랑방·부서 초대)으로 교회에 들어오고, 화면이 쓸 join을 만든다. 막힌 링크는 {bad:true, message}
  async function openJoin(token) {
    try {
      const o = await rpc('church_invite_open', { p_token: String(token) });
      if (o && o.ok !== false && o.join) return { join: { deptId: o.join.deptId, roomId: o.join.roomId || '' }, again: true };
      return { join: { bad: true, message: (o && o.message) || '' } };
    } catch (e) {
      if (e && (e.code === 'bad' || e.code === 'busy')) return { join: { bad: true, message: e.message } };
      throw e;
    }
  }
  async function start(body) {
    let r = await rpc('church_me');
    const usage = body.events ? { kept: true, n: 0 } : undefined;
    let join;
    if (!r.link && body.join) {
      const o = await openJoin(body.join);
      join = o.join;
      if (o.again) r = await rpc('church_me');   // 방금 소속이 생겼다
    }
    const me = await meOf(r);
    if (me.link && me.link.status === '연결') return { me, month: await monthOf(), usage };
    if (me.link || !me.church) return { me, usage, join };
    const depts = await rpc('church_depts', join && !join.bad ? { p_token: String(body.join) } : {});
    return { me, usage, join, depts };
  }
  // 이번 달 임시판: 화면이 쓰는 키가 모자라면 빈 값으로 채운다
  async function monthOf() {
    const m = Object.assign({ families: [], serve: [], together: [], rooms: [] }, await rpc('church_month'));
    // 010은 news를 빈 배열로 준다. 화면은 없음(null)이나 {married|moved}만 안다(빈 배열이면 N.moved.at에서 깨진다)
    if (!m.news || !(m.news.married || m.news.moved)) m.news = null;
    return m;
  }
  async function handle(body) {
    const dept = body.ops || null; // 운영 모드로 보는 부서 id(index.html의 api()가 S.op를 ops로 붙인다)
    switch (body.action) {
      case 'start': return start(body);
      case 'me': return meOf();
      case 'rooms': return (await rpc('church_depts')).flatMap(d => d.rooms || []);
      case 'month': return monthOf();
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
      case 'rosterSave': {
        const d = need(dept, '부서');
        switch (body.op) {
          case 'addRoom': case 'renameRoom': case 'dropRoom':
            return rpc('church_room_save', { p_dept: d, p_op: body.op, p_room: body.roomId || null, p_name: body.name || '' });
          case 'addPerson':
            return okOrThrow(await rpc('church_person_add', { p_dept: d, p_room: need(body.roomId, '사랑방'), p_a: body.a || '', p_b: body.b || '', p_force: !!body.force }), '사람을 더하지 못했어요.');
          case 'addPeople': return rpc('church_people_add', { p_dept: d, p_room: need(body.roomId, '사랑방'), p_people: body.people || [] });
          case 'role': return rpc('church_roster_role', { p_dept: d, p_household: need(body.familyId, '가정'), p_role: body.role || '' });
          case 'unlink':
            await rpc('church_unlink', { p_link: need(body.kakaoId, '연결'), p_dept: d });
            return rpc('church_roster', { p_dept: d });   // 화면은 편성 모양을 기대한다
          default: throw err('bad', SOON);
        }
      }
      case 'requestLink': {
        if (body.staff) throw err('bad', SOON);
        let r;
        if (body.newFamily) { const f = body.newFamily; r = await rpc('church_link_new', { p_room: need(body.roomId, '사랑방'), p_a: f.a, p_b: f.b || '', p_kids: f.kids || '' }); }
        else if (body.byName) r = await rpc('church_link_name', { p_room: need(body.roomId, '사랑방'), p_person: body.person });
        else r = await rpc('church_link_pick', { p_family: need(body.familyId, '가정'), p_person: body.person });
        okOrThrow(r, '신청하지 못했어요.');
        return meOf(r.me);
      }
      case 'cancelLink': { const r = await rpc('church_link_cancel'); return r && r.me ? meOf(r.me) : {}; }
      case 'pending': return rpc('church_pending', { p_dept: dept });
      case 'approve': case 'reject': return rpc('church_decide', { p_link: need(body.kakaoId, '요청'), p_ok: body.action === 'approve', p_dept: dept });
      case 'approveAll': return rpc('church_approve_all', { p_links: body.kakaoIds || [], p_dept: dept });
      case 'unlink': return rpc('church_unlink', { p_link: need(body.kakaoId, '연결'), p_dept: dept });
      case 'ops': return { invites: await rpc('church_invites', { p_dept: need(dept, '부서') }) };
      case 'inviteRenew': return { invites: await rpc('church_invite_renew', { p_dept: need(dept, '부서'), p_room: body.roomId || null }) };
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
