// 코이데 교회 층(Supabase)의 응답을 코이데 교회 화면(index.html)이 아는 옛 Apps Script 모양으로 바꾼다. koinonia-api.js와 같은 모양.
// CHURCH_BACKEND가 'supabase'일 때만 index.html이 부른다(app/config.js, docs/setup.md 13~20장). 서버 함수는 supabase/009_church_setup.sql~025_church_export_log.sql.
//   start·me → church_me(+church_invite_open·church_depts·church_month) · opsJoin → church_admin_accept 뒤 church_me · opsInvite → church_admin_invite · opsRemove → church_admin_remove
//   opsCtx → church_ops_ctx · church → church_overview · deptSave → church_dept_save · deptClose·deptReopen → church_dept_state · deptErase(닫은 부서 기록 모두 지우기, 024) → church_dept_erase
//   saveGroup → church_group_name · roster → church_roster · rosterSave(addRoom·renameRoom·dropRoom) → church_room_save
//   rosterSave(addPerson·addPeople·role·unlink) → church_person_add·people_add·roster_role·unlink
//   rosterSave(move·leave·unleave·admin) → church_roster_move·leave·unleave·admin(017) · 편성 모양에는 이번 달에 뺀 가정(left ← church_roster_left)을 붙인다
//   부서 옮기기(018): deptFind → church_dept_find · moveDept → church_dept_move · moveUndo → church_dept_move_undo · 편성 모양에는 이번 달에 옮긴 가정(moves ← church_move_recent)도 붙인다
//   결혼 합치기(019): marrySave·marryPreview·marryUndo → church_marry_save·preview·undo · beforeMarriage(결혼 전 기록) → church_before_marriage · 편성 모양에는 이번 달에 합친 가정(marries ← church_marry_recent)도 붙인다
//   변경 기록(020): changes → church_changes(부서 관리자는 그 부서, 교회 관리자의 all은 교회 전체. 줄의 되돌리기는 marryUndo·moveUndo가 받는다)
//   앱 상태·새 달·인수인계·의견함(022): ops → church_invites + church_ops_view(초대 링크와 한 응답으로 합침) · openMonth·handover → church_open_month·church_handover
//     feedbackRead → church_feedback_read · sendFeedback → church_feedback_send · church(교회 전체)의 앱 상태·알약은 church_overview가 이제 진짜 값을 보낸다
//   개인정보 요청(023): eraseRequest·eraseRequestCancel → church_erase_request(가정이 기록 지우기 요청·거둠) · eraseState·month의 eraseReq ← church_erase_asked
//     eraseFamily(기록 지우기, 되돌릴 수 없음)·keepFamily(1년 더 두기) → church_erase_family·church_keep_family(운영 화면 모양으로 돌려받아 초대 링크를 붙인다) · ops의 privacy는 church_ops_view가 채운다
//   엑셀 접근 기록(025): logExport(사랑방 엑셀·의견 표를 내려받기 전에 부른다. 실패하면 화면이 내려받지 않는다) → church_log_export
//   churchPeek → church_peek · churchJoin → church_join · churchLeave → church_leave
//   requestLink → church_link_pick·name·new · cancelLink → church_link_cancel · month → church_month · rooms → church_depts
//   pending·approve·reject·approveAll·unlink → church_pending·decide·approve_all·unlink · ops·inviteRenew → church_invites·church_invite_renew
//   pending(리더·코리더) → church_pending + church_leader_view(현황·돌봄 신호·업데이트 이력) · post·unpost → church_post 뒤 church_pending
//   saveItem → church_item_save · saveItems → church_items_add · endItem·reopenItem → church_item_end · deleteItem → church_item_del
//   confirmSame → church_confirm_same · pray → church_pray · saveFamily → church_family_save · tourDone → church_tour_done
//   history → church_history · search → church_search · myPrayers → church_my_prayers · myExport → church_my_export
//   교역자(014): month → church_month(교역자면 목사님 홈) · room → church_staff_room · famTimeline → church_fam_timeline
//     history·search·myPrayers → church_staff_history·church_staff_search·church_staff_my_prayers(교역자일 때) · requestLink(staff) → church_link_staff
//     saveStaff·endStaff → church_staff_save·church_staff_end · 첫 접속 부서 목록의 hasStaff ← church_staff_depts
//   함께 기도해요·기도 문장(015): together·togetherSave·togetherState → church_together·church_together_save·church_together_state
//     prayText·prayTextSave → church_pray_text_list·church_pray_text_save
//   연도 개편(016): reorg·reorgSave·reorgCancel → church_reorg·church_reorg_save·church_reorg_cancel(관리 화면의 부서)
//   logout → KoideSb.signOut(로그인 세션을 끊는다)
// 옛 응답과 다른 곳: ① opsRemove·approve·reject·unlink의 body.kakaoId는 이제 관리자·연결 요청·연결 줄의 id(uuid)다(화면은 data-v를 그대로 넘긴다)
//   ② usage·surveyState·tourSeen은 빈 모양으로 달랜다
//   ③ rosterSave의 pilotRoom(시범 중, 화면에서 숨김)과 표에 없는 액션(주제 흐름·주제 사전·기록 지우기 요청 등)은 '아직 쓸 수 없어요' 오류(화면은 토스트로 알린다)
//   ④ 이번 달(church_month)은 일부러 덜 보낸다: 다른 가정 카드에 손봄 상태(status)·자녀 이름이 없고, 받는 가정 한 줄(received.n)은 가정 수가 아니라 0·1·of 세 단계다.
//     serve·together는 빈 배열, shift·news는 null, room.pilot은 false, me.survey는 ''(화면은 CHURCHSB 갈래에서 견딘다). eraseReq는 church_erase_asked가 채운다(023)
window.koideChurchApi = (() => {
  const SOON = '교회 새 서버에서는 아직 쓸 수 없는 기능이에요. 곧 열려요.';
  const err = (code, message) => ({ code, message });
  const rpc = (name, args) => window.KoideSb.rpc(name, args || {});
  // 편성 모양(rooms가 있는 것)에 이번 달에 뺀 가정(left)·옮겨 온 가정(moves)·합친 가정(marries) 목록(되돌리기용)을 붙인다. 고친 뒤에 읽고, 목록을 못 받아도 편성은 그대로 보여 준다
  const withLeft = async (d, p) => {
    const r = await p;
    if (!r || !Array.isArray(r.rooms)) return r;
    const [left, moves, marries] = await Promise.all([rpc('church_roster_left', { p_dept: d }).catch(() => []), rpc('church_move_recent', { p_dept: d }).catch(() => []),
      rpc('church_marry_recent', { p_dept: d }).catch(() => [])]);
    return Object.assign(r, { left: Array.isArray(left) ? left : [], moves: Array.isArray(moves) ? moves : [], marries: Array.isArray(marries) ? marries : [] });
  };
  // 운영 화면(022): 초대 링크(church_invites)와 앱 상태·의견함(church_ops_view)을 옛 opsView_ 한 응답 모양으로 합친다(view가 있으면 그 응답을 쓴다).
  //   서버 SQL이 022보다 옛 번호면(함수가 없음) 초대 링크는 그대로 보이고 앱 상태는 version이 빈 글('옛 번호')로 온다 → 화면이 "SQL을 더 넣어 주세요"를 알린다
  const opsWith = async (d, view) => {
    const invites = await rpc('church_invites', { p_dept: d });
    try { return Object.assign({ invites }, view || await rpc('church_ops_view', { p_dept: d })); }
    catch (e) {
      if (e && e.code === 'bad' && /받지 못했어요/.test(e.message)) return { invites, version: '', month: { month: '', opened: null, carried: 0, waiting: 0 }, errors: { n: 0, last: '', kinds: [] }, admins: 2, handover: '', privacy: null, feedback: null, opsList: null };
      throw e;
    }
  };
  const need = (v, what) => { if (!v) throw err('bad', what + ' 정보가 없어요. 화면을 다시 열어 주세요.'); return v; };
  // 기도제목 id: 저장 전 임시 id('new…')나 모르는 값은 서버에 보내지 않고 옛 서버와 같은 글로 알린다
  const itemId = (v, msg) => { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''))) throw err('bad', msg || '기도제목을 찾지 못했어요.'); return String(v); };
  // 화면이 보내는 기도제목 한 개({target,text,scope})를 서버 모양으로. 글자 수·공개 범위는 서버가 확인한다
  const itemOf = x => ({ target: String((x && x.target) || ''), text: String((x && x.text) || ''), scope: String((x && x.scope) || '') });
  // 이름은 로그인 계정의 표시 이름(user_metadata)에서 고른다. 서버는 auth.users를 읽지 않는다. 비어도 된다
  const nameOf = s => { const m = (s && s.user && s.user.user_metadata) || {}; return String(m.name || m.full_name || m.nickname || m.preferred_username || '').trim(); };
  async function ident() { const s = await window.KoideSb.session(); return { nick: nameOf(s), uid: s && s.user ? s.user.id : '' }; }
  // church_me의 {church, ops, link}를 화면이 아는 옛 me 모양(meInfo_와 같은 모양)으로 편다
  let staffNow = false; // 지금 로그인한 사람이 교역자인가(meOf가 정한다). 지난 기록·찾기·나의 기도를 교역자 함수로 보낸다
  async function meOf(r) {
    r = r || await rpc('church_me');
    const id = await ident(), L = r.link || null;
    staffNow = !!(L && L.staff && L.status === '연결');
    const me = { nick: id.nick, uid: id.uid, groups: [], church: r.church || null, ops: r.ops || null,
      link: L ? { status: L.status, familyId: L.familyId, person: L.person, since: L.since } : null };
    if (L && L.status === '요청') { me.familyName = L.familyName || ''; me.staff = !!L.staff; }   // 기다리는 화면이 읽는다
    if (L && L.status === '연결') Object.assign(me, { person: L.person, familyId: L.familyId, roomId: L.roomId || '', deptId: L.deptId || '',
      dept: L.dept || null, role: L.role || '회원', admin: !!L.admin });                       // 옛 memberFrom_ 모양(화면이 S.me.person 등을 쓴다)
    if (L && L.status === '연결' && L.staff) Object.assign(me, { staff: true, label: L.label || '' });
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
    const depts = await withStaff(await rpc('church_depts', join && !join.bad ? { p_token: String(body.join) } : {}));
    return { me, usage, join, depts };
  }
  // 교역자가 있는 부서에만 "목사님·장로님으로 들어가기"를 보인다(명단은 받지 않는다)
  async function withStaff(depts) {
    let ids = []; try { ids = await rpc('church_staff_depts'); } catch (e) { if (!(e && e.code === 'bad')) throw e; }
    (depts || []).forEach(d => { d.hasStaff = (ids || []).includes(d.id); });
    return depts;
  }
  // 이번 달 화면(011). 화면이 쓰는 키는 서버가 모두 보낸다. 목록이 비어 오면 빈 배열로만 채운다
  //   eraseReq(우리 가정이 기록 지우기를 요청했나, 023)는 church_month가 안 주므로 나란히 물어 붙인다. 못 받으면(옛 SQL 번호) false
  const erasedAsk = () => rpc('church_erase_asked').then(r => !!(r && r.eraseReq), () => false);
  const withAsk = async p => { const [m, ask] = await Promise.all([p, erasedAsk()]); if (m && typeof m === 'object') m.eraseReq = ask; return m; };
  async function monthOf() { return withAsk(rpc('church_month').then(m => Object.assign({ families: [], serve: [], together: [] }, m))); }
  async function handle(body) {
    const dept = body.ops || null; // 운영 모드로 보는 부서 id(index.html의 api()가 S.op를 ops로 붙인다)
    switch (body.action) {
      case 'start': return start(body);
      case 'me': return meOf();
      case 'rooms': return (await rpc('church_depts')).flatMap(d => d.rooms || []);
      case 'month': return monthOf();
      // 기도제목 쓰기(011). 쓰기 함수는 모두 이번 달 화면을 돌려준다(옛 monthView_와 같다)
      case 'saveItem': {
        const x = itemOf(body);
        return rpc('church_item_save', { p_text: x.text, p_target: x.target, p_scope: x.scope, p_item: body.id ? itemId(body.id, '고칠 기도제목을 찾지 못했어요.') : null });
      }
      case 'saveItems': return rpc('church_items_add', { p_items: (Array.isArray(body.items) ? body.items : []).map(itemOf) });
      case 'endItem': case 'reopenItem': return rpc('church_item_end', { p_item: itemId(body.id), p_end: body.action === 'endItem' });
      case 'deleteItem': return rpc('church_item_del', { p_item: itemId(body.id) });
      case 'confirmSame': return rpc('church_confirm_same');
      case 'pray': return rpc('church_pray', { p_household: need(body.familyId, '가정') });
      case 'saveFamily': return withAsk(rpc('church_family_save', { p_a: body.a || '', p_b: body.b || '', p_kids: (Array.isArray(body.kids) ? body.kids : []).map(String) }));
      case 'tourDone': return rpc('church_tour_done');
      // 지난 기록(012). 그때 함께한 사람에게만 보이는 규칙은 서버가 지킨다. roomId(교역자의 사랑방 고르기)는 ⑤에서 쓴다
      case 'history': return staffNow ? rpc('church_staff_history', { p_period: body.month || null, p_room: body.roomId || null })
        : rpc('church_history', { p_period: body.month || null });
      case 'search': return rpc(staffNow ? 'church_staff_search' : 'church_search', { p_q: String(body.q || '') });
      case 'myPrayers': return rpc(staffNow ? 'church_staff_my_prayers' : 'church_my_prayers');
      // 교역자(014)
      case 'room': return rpc('church_staff_room', { p_room: need(body.roomId, '사랑방') });
      case 'famTimeline': return rpc('church_fam_timeline', { p_household: need(body.familyId, '가정') });
      case 'saveStaff': return rpc('church_staff_save', { p_dept: need(dept, '부서'), p_household: body.familyId || null, p_a: body.a || '', p_b: body.b || '',
        p_title: body.title || '', p_label: body.label || '', p_serve: body.serve !== false });
      // 함께 기도해요(관리 화면이면 그 부서, 아니면 교역자의 부서)·하나님 나라 기도 문장(교회 하나에 한 벌)
      case 'together': return rpc('church_together', { p_dept: dept });
      case 'togetherSave': return rpc('church_together_save', { p_dept: dept, p_item: body.id || null, p_target: body.target || '', p_text: body.text || '' });
      case 'togetherState': return rpc('church_together_state', { p_dept: dept, p_item: need(body.id, '기도제목'), p_op: body.op || '' });
      case 'prayText': return rpc('church_pray_text_list');
      case 'prayTextSave': return rpc('church_pray_text_save', { p_topic: String(body.topic || ''), p_rows: Array.isArray(body.rows) ? body.rows : [] });
      // 연도 개편(교회 관리자·그 부서 관리자). 개편 안내(shift)는 이번 달 응답에 실려 온다
      case 'reorg': return rpc('church_reorg', { p_dept: need(dept, '부서') });
      case 'reorgSave': return rpc('church_reorg_save', { p_dept: need(dept, '부서'), p_start: body.start || '', p_leader_from: body.leaderFrom || '', p_member_from: body.memberFrom || '',
        p_rooms: Array.isArray(body.rooms) ? body.rooms : [], p_rows: Array.isArray(body.rows) ? body.rows : [], p_leave: Array.isArray(body.leave) ? body.leave : [], p_hold: Array.isArray(body.hold) ? body.hold : [] });
      case 'reorgCancel': return rpc('church_reorg_cancel', { p_dept: need(dept, '부서') });
      case 'endStaff': return rpc('church_staff_end', { p_dept: need(dept, '부서'), p_household: need(body.familyId, '교역자') });
      case 'myExport': return rpc('church_my_export');
      // 결혼 전 기록(지난 기록 맨 아래): 서버가 본인 연결의 옛 가정 것만 돌려준다
      case 'beforeMarriage': return rpc('church_before_marriage');
      // 부서 옮기기(018): 받는 부서 관리자가 한다. 처리한 뒤에는 보던 부서의 편성을 읽는다(받는 부서가 아닌 부서를 보고 있을 수도 있다)
      case 'deptFind': return rpc('church_dept_find', { p_q: String(body.q || '') });
      case 'moveDept': {
        const r = await rpc('church_dept_move', { p_household: need(body.familyId, '가정'), p_room: need(body.roomId, '사랑방'), p_confirmed: !!body.confirmed });
        const d = dept || r.deptId;
        return withLeft(d, rpc('church_roster', { p_dept: d }));
      }
      case 'moveUndo': {
        await rpc('church_dept_move_undo', { p_household: need(body.familyId, '가정') });
        return dept ? withLeft(dept, rpc('church_roster', { p_dept: dept })) : { ok: true };
      }
      // 결혼해서 가정 합치기(019): 새 가정이 들어갈 부서의 관리자가 한다. 처리한 뒤에는 보던 부서의 편성을 읽는다
      case 'marrySave': {
        const r = await rpc('church_marry_save', { p_old: Array.isArray(body.famIds) ? body.famIds : [], p_new_person: String(body.newPerson || ''), p_name: String(body.name || ''), p_room: need(body.roomId, '사랑방'),
          p_confirmed: !!body.confirmed, p_inherit: body.inherit !== false, p_carry: body.carry !== false, p_links: (Array.isArray(body.links) ? body.links : []).map(x => ({ link: x.kakaoId, to: x.to || '' })) });
        const d = dept || r.deptId;
        return withLeft(d, rpc('church_roster', { p_dept: d }));
      }
      case 'marryPreview': return rpc('church_marry_preview', { p_household: need(body.familyId, '가정') });
      case 'marryUndo': {
        await rpc('church_marry_undo', { p_household: need(body.familyId, '가정') });
        return dept ? withLeft(dept, rpc('church_roster', { p_dept: dept })) : { ok: true };
      }
      // 변경 기록(020): 화면의 줄 모양({at,who,role,kind,target,extra,dept,ref,undo})을 서버가 그대로 보낸다. 교회 전체(all)는 부서 없이
      case 'changes': return body.all ? rpc('church_changes', { p_dept: null, p_all: true }) : rpc('church_changes', { p_dept: need(dept, '부서'), p_all: false });
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
      case 'deptErase': {   // 닫은 부서만, 부서 이름을 그대로(서버가 확인). 지우면 되돌릴 수 없다
        const r = await rpc('church_dept_erase', { p_dept: need(body.deptId, '부서'), p_name: body.name || '' });
        return { me: await meOf(r.me), n: r.n };
      }
      case 'saveGroup': return rpc('church_group_name', { p_dept: need(dept, '부서'), p_group: body.group || '', p_rename: !!body.rename });
      case 'roster': { const d = need(dept, '부서'); return withLeft(d, rpc('church_roster', { p_dept: d })); }
      case 'rosterSave': {
        const d = need(dept, '부서');
        return withLeft(d, (async () => { switch (body.op) {
          case 'addRoom': case 'renameRoom': case 'dropRoom':
            return rpc('church_room_save', { p_dept: d, p_op: body.op, p_room: body.roomId || null, p_name: body.name || '' });
          case 'addPerson':
            return okOrThrow(await rpc('church_person_add', { p_dept: d, p_room: need(body.roomId, '사랑방'), p_a: body.a || '', p_b: body.b || '', p_force: !!body.force }), '사람을 더하지 못했어요.');
          case 'addPeople': return rpc('church_people_add', { p_dept: d, p_room: need(body.roomId, '사랑방'), p_people: body.people || [] });
          case 'role': return rpc('church_roster_role', { p_dept: d, p_household: need(body.familyId, '가정'), p_role: body.role || '' });
          case 'unlink':
            await rpc('church_unlink', { p_link: need(body.kakaoId, '연결'), p_dept: d });
            return rpc('church_roster', { p_dept: d });   // 화면은 편성 모양을 기대한다
          case 'move': return rpc('church_roster_move', { p_dept: d, p_household: need(body.familyId, '가정'), p_room: need(body.roomId, '사랑방') });
          case 'leave': return rpc('church_roster_leave', { p_dept: d, p_household: need(body.familyId, '가정') });
          case 'unleave': return rpc('church_roster_unleave', { p_dept: d, p_household: need(body.familyId, '가정') });
          case 'admin': return rpc('church_roster_admin', { p_dept: d, p_household: need(body.familyId, '가정'), p_on: !!body.on });
          default: throw err('bad', SOON);
        } })());
      }
      case 'requestLink': {
        let r;
        if (body.staff) r = await rpc('church_link_staff', { p_dept: need(body.deptId, '부서'), p_person: body.person || '' });
        else if (body.newFamily) { const f = body.newFamily; r = await rpc('church_link_new', { p_room: need(body.roomId, '사랑방'), p_a: f.a, p_b: f.b || '', p_kids: f.kids || '' }); }
        else if (body.byName) r = await rpc('church_link_name', { p_room: need(body.roomId, '사랑방'), p_person: body.person });
        else r = await rpc('church_link_pick', { p_family: need(body.familyId, '가정'), p_person: body.person });
        okOrThrow(r, '신청하지 못했어요.');
        return meOf(r.me);
      }
      case 'cancelLink': { const r = await rpc('church_link_cancel'); return r && r.me ? meOf(r.me) : {}; }
      case 'pending': {
        if (dept) return rpc('church_pending', { p_dept: dept });
        const p = await rpc('church_pending');
        // 리더·코리더만 현황을 더 받는다. 부서 관리자 표시만 있는 가정은 서버가 막으니(bad) 연결 승인 몫만 돌려준다
        try { return Object.assign(p, await rpc('church_leader_view')); }
        catch (e) { if (e && e.code === 'bad') return p; throw e; }
      }
      case 'post': case 'unpost': {
        const v = await rpc('church_post', { p_household: need(body.familyId, '가정'), p_on: body.action === 'post' });
        return Object.assign(await rpc('church_pending'), v);
      }
      case 'approve': case 'reject': return rpc('church_decide', { p_link: need(body.kakaoId, '요청'), p_ok: body.action === 'approve', p_dept: dept });
      case 'approveAll': return rpc('church_approve_all', { p_links: body.kakaoIds || [], p_dept: dept });
      case 'unlink': return rpc('church_unlink', { p_link: need(body.kakaoId, '연결'), p_dept: dept });
      case 'ops': return opsWith(need(dept, '부서'));
      case 'inviteRenew': {
        const d = need(dept, '부서'), inv = await rpc('church_invite_renew', { p_dept: d, p_room: body.roomId || null });
        return Object.assign(await opsWith(d), { invites: inv });
      }
      // 새 달 열기·인수인계 확인·의견 읽음(022): 서버가 앱 상태 응답(church_ops_view)을 돌려주면 초대 링크를 붙여 화면에 준다
      case 'openMonth': { const d = need(dept, '부서'); return opsWith(d, await rpc('church_open_month', { p_dept: d })); }
      case 'handover': { const d = need(dept, '부서'); return opsWith(d, await rpc('church_handover', { p_dept: d })); }
      case 'feedbackRead': { const d = need(dept, '부서'); return opsWith(d, await rpc('church_feedback_read', { p_dept: d, p_id: need(body.id, '의견'), p_read: body.read !== false })); }
      // 엑셀·의견 표 내려받기 접근 기록(025): 파일을 만들기 전에 부른다. kind는 'room'(사랑방 엑셀)·'feedback'(의견 표). 개수(n)만 보내고 글은 보내지 않는다
      case 'logExport': return rpc('church_log_export', { p_kind: String(body.kind || ''), p_lead: !!body.lead, p_n: Number(body.n) || 0, p_dept: body.kind === 'feedback' ? (body.dept || null) : null });
      // 의견 보내기(022): 교회에 연결된 사람만. 이름 밝히기가 꺼져 있으면 서버가 가정·이름을 남기지 않는다
      case 'sendFeedback': return rpc('church_feedback_send', { p_kind: String(body.kind || ''), p_text: String(body.text || ''), p_named: body.named === true, p_ver: String(body.ver || ''), p_width: String(body.width || '') });
      // 개인정보 요청(023): 가정이 기록 지우기를 요청·거둠, 관리자가 지우기·1년 더 두기. 지운 기록은 되돌릴 수 없다(서버가 가정 이름을 한 번 더 확인한다)
      case 'eraseRequest': case 'eraseRequestCancel': return rpc('church_erase_request', { p_on: body.action === 'eraseRequest' });
      case 'eraseState': return rpc('church_erase_asked');
      case 'eraseFamily': { const d = need(dept, '부서'); return opsWith(d, await rpc('church_erase_family', { p_dept: d, p_household: need(body.familyId, '가정'), p_name: String(body.name || '') })); }
      case 'keepFamily': { const d = need(dept, '부서'); return opsWith(d, await rpc('church_keep_family', { p_dept: d, p_household: need(body.familyId, '가정') })); }
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
