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
  // 상태: 비어 있으면 쓰는 중, '닫음'이면 첫 접속에서 빠지고 그 부서 사람은 들어오지 못한다(기록은 남고 다시 열 수 있다), '지움'이면 기록까지 지운 부서
  depts: ['부서', [['id', '부서ID'], ['name', '이름'], ['group', '소그룹 이름'], ['unit', '단위'], ['order', '순서'], ['status', '상태'], ['closedAt', '닫은 날']]],
  // 시범: '예'이면 이 사랑방 사람들에게 시범 "해 볼 일" 띠가 보인다(비어 있으면 꺼짐). 부서 관리 › 소그룹과 사람에서 켠다
  rooms: ['사랑방', [['id', '사랑방ID'], ['name', '이름'], ['order', '순서'], ['deptId', '부서ID'], ['pilot', '시범 중']]],
  // 상태: 활동 / 승인 대기 / 거절 / 교역자 / 지움 / 합침(결혼해서 새 가정으로 합쳐진 옛 가정. 합친 가정ID·합친 달이 적힌다. 기록은 그대로 남는다) / 취소(합침을 되돌려 없앤 새 가정)
  families: ['가정', [['id', '가정ID'], ['name', '이름'], ['kids', '자녀'], ['status', '상태'], ['admin', '관리자'], ['mergedInto', '합친 가정ID'], ['mergedAt', '합친 달']]],
  // 들어온 달·나간 달: 한 해 중간에 결혼으로 새 가정이 되거나 다른 부서로 옮긴 줄. 비어 있으면 그 편성 연도 내내다(나간 달부터는 그 줄이 쓰이지 않는다)
  roster: ['편성', [['year', '연도'], ['roomId', '사랑방ID'], ['familyId', '가정ID'], ['role', '역할'], ['from', '들어온 달'], ['to', '나간 달']]],
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
  visits: ['접속 기록', [['month', '월'], ['familyId', '가정ID']]],
  // 주제사전(설계서 10장 주제 자동 분류): 주제마다 키워드를 쉼표로. 기도제목 내용에 키워드가 있으면 그 주제(여럿 가능), 없으면 기타.
  //  분류는 저장하지 않고 볼 때마다 해서, 사전을 고치면 지난 달까지 다시 분류된다. 비어 있으면 처음 읽을 때 기본 사전을 넣는다
  topics: ['주제사전', [['topic', '주제'], ['words', '키워드'], ['order', '순서']]],
  // 변경기록(설계서 S7 › ④): 누가 언제 무엇을 바꿨는지. 기도제목 내용은 넣지 않는다. 13개월 뒤 지운다
  //  관련 ID: 결혼 처리·부서 옮김을 되돌릴 때 쓰는 가정ID(그달 안에서만 되돌릴 수 있다)
  changes: ['변경기록', [['at', '날짜시각'], ['deptId', '부서ID'], ['who', '한 사람'], ['role', '역할'], ['kind', '종류'], ['target', '대상'], ['extra', '덧붙임'], ['ref', '관련 ID']]],
  // 요청(설계서 S7 › ②): 가정의 '기록 지우기' 요청과, 관리자가 떠난 가정을 '1년 더 두기'로 미룬 것
  requests: ['요청', [['familyId', '가정ID'], ['deptId', '부서ID'], ['kind', '종류'], ['at', '요청한 날'], ['status', '상태'], ['doneAt', '처리한 날'], ['doneBy', '처리한 사람']]],
  // 오류 기록(설계서 S7 › ①): 서버에서 뜻밖에 난 오류의 요청 이름과 종류만. 이름·기도제목은 없다. 30일 뒤 지운다
  errors: ['오류 기록', [['at', '날짜시각'], ['action', '요청'], ['kind', '종류']]],
  // 초대 링크(설계서 S7 › ⑤): 부서 링크(사랑방ID 비움)와 사랑방 링크. 링크 값은 무작위. 새로 만들면 예전 링크는 '막힘'
  // 노트 보관(설계서 13장 '나 · 기도 노트'): 개인 기도 노트를 다른 기기와 이어 두려고 맡긴 것. 내용은 휴대폰에서 비밀 문구로 잠근 글이라
  //  서버와 시트를 여는 사람은 읽을 수 없다. 한 칸에 다 들어가지 않으면 조각으로 나눠 여러 줄에 둔다. 판은 맡길 때마다 1씩 는다
  vault: ['노트 보관', [['kakaoId', '카카오ID'], ['part', '조각'], ['data', '잠긴 내용'], ['at', '맡긴 시각'], ['salt', '소금'], ['rev', '판'], ['wrap', '잠긴 열쇠'], ['rsalt', '복구 소금'], ['rwrap', '복구로 잠긴 열쇠']]],
  //  뒤의 세 칸은 복구용 문구용: 노트를 잠그는 진짜 열쇠를 비밀 문구 열쇠(wrap)와 복구용 문구 열쇠(rwrap)로 한 번씩 더 잠근 것. 열쇠는 잠긴 채로만 있다.
  //  모든 조각 줄에 같은 값을 둔다(salt처럼). 예전 방식(wrap 없음)은 비밀 문구 열쇠가 곧 진짜 열쇠다
  // 기도문장(설계서 S7 › ③): 하나님 나라 기도 문장 중 교역자·관리자가 고친 주제만. 주제는 church·nation 같은 키, 감사와 찬양은 thanks,
  //  절기 문장은 season:lent처럼. 묶음 a(간구 문장)·b(성경의 기도, 장절)·next(내 말로 이어서). 상태 '뺌'은 돌아가는 순서에서 빠진다.
  //  한 주제에 줄이 하나도 없으면 앱에 들어 있는 기본 문장을 쓴다(기본으로 되돌리기 = 그 주제 줄을 모두 지우기)
  prayText: ['기도문장', [['topic', '주제'], ['kind', '묶음'], ['order', '순서'], ['text', '내용'], ['ref', '장절'], ['status', '상태'], ['by', '고친 사람'], ['at', '고친 날']]],
  // 입장 코드(설계서 S0 '카카오톡을 쓰지 않는 분'): 리더가 그 사람 이름으로 만든 일회용 코드. 코드는 화면에 한 번만 보이고 시트에는 바꾼 값(해시)만.
  //  7일 안에 한 번 쓰면 '씀', 같은 사람에게 새 코드를 만들면 예전 것은 '막힘'
  codes: ['입장코드', [['hash', '코드 표시'], ['familyId', '가정ID'], ['person', '사람'], ['by', '만든 사람'], ['at', '만든 날'], ['expires', '만료'], ['status', '상태']]],
  invites: ['초대링크', [['token', '링크 값'], ['deptId', '부서ID'], ['roomId', '사랑방ID'], ['at', '만든 날'], ['status', '상태']]],
  // 의견함(설계서 S7 › ⑥): 이름을 밝히지 않으면 가정ID와 사람을 남기지 않는다. 13개월 뒤 지운다
  // 운영 관리자(설계서 13장): 부서에 속하지 않고, 기도제목 내용을 보지 않고 맡은 부서를 꾸리는 사람. 범위는 부서ID들(쉼표) 또는 '전체'.
  //  맨 처음 한 사람은 시트에 직접 적는다(카카오ID는 연결 탭에서). 그다음부터는 앱의 일회용 초대 링크(초대 값)로 붙는다
  opsAdmins: ['전체 관리자', [['kakaoId', '카카오ID'], ['name', '이름'], ['scope', '범위'], ['status', '상태'], ['token', '초대 값'], ['at', '만든 날'], ['by', '만든 사람']]],
  // 자율 모임(설계서 13장, 2026-10-23 · 2026-10-21 기도 노트로 옮김): 카카오로 로그인한 누구나 만드는 모임. 한 모임 12명, 한 사람 3곳(원래 소그룹 포함), 모임장은 한 사람당 1곳.
  //  모임은 잠깐 모이는 임시 공간: 만들 때 끝나는 날(1·3·6·12개월 뒤, 늘리기 없음)을 정하고, 끝나는 날이 지나면 모임·사람·기도제목·기도 기록을 모두 지운다(개수만 변경기록에 남는다).
  //  교회가 꾸리는 것이 아니어서 관리 화면에는 나오지 않는다. 사람 이름은 교회에 연결된 사람은 명단 이름, 아니면 모임에 들어올 때 적은 이름
  //  사람마다 모임 안의 ID(모임 사람ID)가 있어서, 기도제목·기도했어요는 그 ID를 가정ID 자리에 쓴다(모임마다 따로)
  groups: ['모임', [['id', '모임ID'], ['name', '이름'], ['owner', '모임장 카카오ID'], ['token', '초대 값'], ['status', '상태'], ['at', '만든 날'], ['endsAt', '끝나는 날']]],
  gmembers: ['모임 사람', [['groupId', '모임ID'], ['id', '모임 사람ID'], ['kakaoId', '카카오ID'], ['person', '이름'], ['role', '역할'], ['status', '상태'], ['at', '들어온 날']]],
  //  부서ID가 비어 있으면 교회에 연결되지 않은 기도 노트 사용자가 보낸 것(전체 관리자만 본다)
  feedback: ['의견', [['at', '보낸 날'], ['deptId', '부서ID'], ['kind', '종류'], ['text', '내용'], ['familyId', '가정ID'], ['person', '사람'], ['ver', '화면 버전'], ['width', '기기 폭'], ['read', '읽음']]],
  // 시범 설문(3·7·14일째 카드): 누가 보냈는지는 남기지 않는다(카카오ID·가정ID·이름 없음). 답은 정해 둔 키와 값만(JSON), 숫자는 사용자가 '숫자도 함께 보내기'를 켰을 때만
  survey: ['설문', [['at', '보낸 날'], ['where', '어디'], ['day', '몇째 날'], ['answers', '답'], ['nums', '숫자'], ['deptId', '부서ID'], ['width', '기기 폭'], ['ver', '화면 버전'], ['pilot', '해 본 일']]]
};
const SCOPES = ['room', 'leader', 'family'];
// 교역자의 공개 범위: dept(부서 공개, 섬기는 분들 카드에 나옴) / family(우리 가정만)
const STAFF_SCOPES = ['dept', 'family'];
const STAFF_TITLES = ['목사님', '전도사님', '장로님'];
// 부서 탭이 비어 있을 때 만드는 첫 부서. 단위: 가정(부부·자녀) 또는 개인(한 사람)
const FIRST_DEPT = { id: 'D1', name: '청장년부', group: '사랑방', unit: '가정', order: 1 };

// ── 요청 받기 ─────────────────────────────────────────────

// 서버 코드를 고칠 때마다 바꾼다. 웹 앱 주소를 열면 보여서, 새 버전으로 배포됐는지 확인할 수 있다
const VERSION = '2026-11-07 사랑방 시범 중';
function doGet() {
  return ContentService.createTextOutput('코이데 서버가 켜져 있어요. (버전: ' + VERSION + ')');
}

function doPost(e) {
  let out, body = {};
  try {
    Object.keys(READ_CACHE_).forEach(k => delete READ_CACHE_[k]);
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const fn = ACTIONS[body.action];
    if (!fn) throw fail_('bad', '모르는 요청이에요.');
    // 운영 관리자로 보낸 요청은 운영에 쓰는 일만(내 가정의 일은 운영 화면에서 하지 않는다)
    if (body.ops && OPS_ACTIONS_.indexOf(body.action) < 0) throw fail_('forbidden', '운영 화면에서는 할 수 없는 일이에요.');
    out = { ok: true, data: fn(body) };
  } catch (err) {
    out = err && err.code ? { ok: false, code: err.code, message: err.message } : { ok: false, code: 'server', message: String(err && err.message || err) };
    if (!(err && err.code)) logError_(body.action, err);
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

// 화면에서 부르는 일들. 로그인과 사랑방 목록을 빼고는 모두 연결이 승인된 사람만 쓸 수 있다
const ACTIONS = {
  login: login_,
  me: body => meInfo_(who_(body)),
  // 앱을 열 때 한 번에: 나 + (연결됐으면 이번 달, 연결 전이면 부서와 사랑방 목록). 서버와 두 번 이야기하던 것을 한 번으로
  start: body => {
    groupsDaily_();
    const w = who_(body), me = meInfo_(w);
    // 기기에 모아 둔 사용기록을 앱을 열 때 함께 받는다(요청을 따로 보내지 않게)
    const usage = body.events ? usage_(w, body) : undefined;
    // 초대 링크로 들어왔으면 그 부서·사랑방(막힌 링크면 bad)
    if (!w.link) {
      const join = body.join ? inviteOf_(String(body.join)) || { bad: true } : undefined;
      return { me, depts: deptsWithRooms_(join && join.roomId), usage, join };
    }
    if (w.link.status === '연결') return { me, month: monthView_(memberFrom_(w)), usage };
    return { me, usage };
  },
  rooms: body => { who_(body); return roomsWithFamilies_(''); },
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
  analysis: body => analysisView_(adminOf_(body)),
  saveGroup: saveGroup_,
  topics: body => topicFlow_(staffOrAdmin_(body)),
  topicWord: topicWord_,
  myPrayers: body => myPrayers_(member_(body)),
  search: body => search_(member_(body), String(body.q || '')),
  // 관리 › 운영(설계서 S7): 앱 상태, 개인정보 요청
  ops: body => opsView_(adminOf_(body)),
  openMonth: openMonth_,
  handover: handover_,
  eraseFamily: eraseFamily_,
  keepFamily: keepFamily_,
  // 가정: 우리 가정 기록 내려받기, 지우기 요청
  myExport: body => myExport_(member_(body)),
  eraseRequest: body => eraseRequest_(member_(body), true),
  eraseRequestCancel: body => eraseRequest_(member_(body), false),
  // 초대 링크(관리자: 부서와 모든 사랑방, 리더: 리더 현황에서 우리 사랑방) · 의견함
  inviteRenew: inviteRenew_,
  feedbackRead: feedbackRead_,
  sendFeedback: sendFeedback_,
  sendSurvey: sendSurvey_,
  surveyAdmin: surveyAdmin_,
  // 자율 모임
  groupCreate: groupCreate_,
  groupInfo: body => groupInfo_(groupMember_(body)),
  groupJoin: groupJoin_,
  groupDecide: groupDecide_,
  groupLeave: groupLeave_,
  groupRename: groupRename_,
  groupRemove: groupRemove_,
  groupRenew: groupRenew_,
  groupPeek: groupPeek_,
  groupExport: groupExport_,
  // 운영 관리자·부서 만들기·소그룹과 사람(편성 관리)
  opsCtx: body => opsCtxView_(adminOf_(body)),
  church: churchView_,
  churchAnalysis: churchAnalysis_,
  groupAdmin: groupAdmin_,
  together: body => togetherItems_(togetherOf_(body).deptId, true),
  togetherSave: togetherSave_,
  togetherState: togetherState_,
  changes: changesView_,
  opsJoin: opsJoin_,
  opsInvite: opsInvite_,
  opsRemove: opsRemove_,
  deptSave: deptSave_,
  deptClose: body => deptState_(body, '닫음'),
  deptReopen: body => deptState_(body, ''),
  deptErase: deptErase_,
  roster: body => rosterView_(adminOf_(body)),
  rosterSave: rosterSave_,
  // 결혼해서 가정 합치기 · 다른 부서로 옮기기(설계서 6장). 이름으로 사람 찾기는 이름·연결 닉네임만 준다
  deptFind: deptFind_,
  marryPreview: marryPreview_,
  marrySave: marrySave_,
  marryUndo: marryUndo_,
  moveDept: moveDept_,
  moveUndo: moveUndo_,
  beforeMarriage: body => beforeMarriage_(member_(body)),
  // 나 · 기도 노트 이어 두기: 카카오로 로그인한 사람이면 누구나(교회에 연결되지 않아도). 잠긴 글만 주고받는다
  // 하나님 나라 기도 문장: 로그인한 사람은 읽고, 교역자·관리자가 주제마다 고친다
  prayText: body => { auth_(body.token); return read_('prayText').map(r => ({ topic: r.topic, kind: r.kind, order: Number(r.order) || 0, text: String(r.text), ref: String(r.ref || ''), status: r.status || '' })); },
  prayTextSave: body => { const c = staffOrAdmin_(body); return withLock_(() => prayTextSave_(c, body)); },
  // 카카오톡이 없는 분: 리더가 일회용 코드를 만들고(codeMake), 그분은 코드로 들어온다(codeLogin, 로그인 없이 부를 수 있는 일)
  codeMake: body => { const c = leaderOrAdmin_(body); return withLock_(() => codeMake_(c, body)); },
  codeLogin: body => withLock_(() => codeLogin_(body)),
  noteGet: body => noteGet_(auth_(body.token)),
  noteKeys: body => { const a = auth_(body.token); return withLock_(() => noteKeys_(a, body)); },
  notePut: body => { const a = auth_(body.token); return withLock_(() => notePut_(a, body)); },
  noteDel: body => { const a = auth_(body.token); return withLock_(() => noteDel_(a)); }
};
const OPS_ACTIONS_ = ['opsCtx', 'church', 'churchAnalysis', 'groupAdmin', 'changes', 'together', 'togetherSave', 'togetherState', 'opsInvite', 'opsRemove', 'deptSave', 'deptClose', 'deptReopen', 'deptErase', 'roster', 'rosterSave', 'deptFind', 'marryPreview', 'marrySave', 'marryUndo', 'moveDept', 'moveUndo', 'pending', 'approve', 'reject', 'unlink', 'saveStaff', 'endStaff',
  'reorg', 'reorgSave', 'reorgCancel', 'analysis', 'saveGroup', 'ops', 'groups', 'openMonth', 'handover', 'eraseFamily', 'keepFamily', 'inviteRenew', 'feedbackRead', 'usage', 'surveyAdmin'];

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
  return { token, nick, uid: noteUid_(kakaoId) };
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

// 로그인한 사람과 그 사람의 연결(요청/연결). 해제된 연결과 결혼으로 새 가정에 옮겨 간 옛 연결(합침)은 없는 것으로 본다
function who_(body) {
  const a = auth_(body.token);
  const link = read_('links').filter(l => String(l.kakaoId) === a.kakaoId && l.status !== '해제' && l.status !== '합침').pop() || null;
  return { kakaoId: a.kakaoId, nick: a.nick, link };
}

// 연결이 승인된 회원: 가정, 올해 사랑방과 그 부서, 역할(회원/리더/코리더), 관리자 여부(자기 부서)
function member_(body) { return body.grp ? groupMember_(body) : memberFrom_(who_(body)); }
function memberFrom_(w) {
  if (!w.link || w.link.status !== '연결') throw fail_('notLinked', '아직 리더의 승인을 기다리고 있어요.');
  const fam = read_('families').find(f => f.id === w.link.familyId);
  const r = read_('roster').find(x => activeRow_(x) && x.familyId === w.link.familyId);
  // 교역자는 사랑방 편성 없이 교역자 탭으로 부서에 속한다
  const st = !r && fam ? staffOf_(fam.id) : null;
  if (!fam || (!r && !st)) throw fail_('notLinked', st === null && fam && fam.status === '교역자' ? '교역자 목록에서 빠졌어요. 관리자에게 알려 주세요.' : notInTerm_(w.link.familyId));
  if (w.link.lastSeen !== today_()) { w.link.lastSeen = today_(); update_('links', w.link); markVisit_(fam.id); }
  const shut = d => { if (d && d.status) throw fail_('notLinked', d.name + '는 지금 닫혀 있어요. 다시 열리면 들어올 수 있어요.'); };
  if (st) {
    const d = deptById_(st.deptId); shut(d);
    return { kakaoId: w.kakaoId, person: w.link.person, familyId: fam.id, family: fam, roomId: '', deptId: d.id, dept: deptInfo_(d), role: st.title, admin: yes_(fam.admin), staff: true, label: st.label };
  }
  const dept = deptOfRoom_(r.roomId); shut(dept);
  return { kakaoId: w.kakaoId, person: w.link.person, familyId: fam.id, family: fam, roomId: r.roomId, deptId: dept.id, dept: deptInfo_(dept), role: r.role, admin: yes_(fam.admin) };
}

function leaderOrAdmin_(body) {
  if (body.ops) return opsOf_(body);
  const c = member_(body);
  if (!c.admin && c.role !== '리더' && c.role !== '코리더') throw fail_('forbidden', '리더만 할 수 있어요.');
  return c;
}

function meInfo_(w) {
  const out = { nick: w.nick, uid: noteUid_(w.kakaoId), link: w.link ? { status: w.link.status, familyId: w.link.familyId, person: w.link.person, since: w.link.requestedAt ? fmtDate_(w.link.requestedAt) : '' } : null, ops: opsScope_(w.kakaoId), groups: myGroups_(w.kakaoId) };
  if (w.link && w.link.status === '연결') return Object.assign(out, memberFrom_(w));
  if (w.link) {
    const fam = read_('families').find(f => f.id === w.link.familyId);
    out.familyName = fam ? fam.name : '';
    out.staff = !!fam && fam.status === '교역자';
  }
  return out;
}

// ── 연결 요청 ─────────────────────────────────────────────

// 첫 접속의 소그룹 목록. 가정 이름은 그 소그룹 초대 링크로 들어온 사람에게만(openRoom) 보여 준다.
//  링크 없이(또는 부서 링크로) 들어오면 소그룹 이름까지만 보이고, 내 이름을 직접 써서 찾는다(교인 명단이 퍼지지 않게)
function roomsWithFamilies_(openRoom) {
  const fams = read_('families'), roster = read_('roster').filter(activeRow_);
  return activeRooms_().sort((a, b) => a.order - b.order).map(r => ({
    id: r.id, name: r.name, deptId: deptOfRoom_(r.id).id,
    families: r.id !== openRoom ? undefined : roster.filter(x => x.roomId === r.id).map(x => fams.find(f => f.id === x.familyId))
      .filter(f => f && f.status === '활동').map(f => ({ id: f.id, name: f.name }))
  }));
}
// 첫 접속에서 고르는 순서대로: 부서 → 그 부서의 사랑방 → 가정
function deptsWithRooms_(openRoom) {
  const rooms = roomsWithFamilies_(openRoom || '');
  // 교역자는 사랑방 대신 '목사님·장로님으로 들어가기'에서 이름을 써서 찾는다(교역자 명단도 보여 주지 않는다)
  return depts_().filter(deptOpen_).map(d => Object.assign(deptInfo_(d), { rooms: rooms.filter(r => r.deptId === d.id), hasStaff: activeStaff_(d.id).length > 0 }))
    .filter(d => d.rooms.length || d.hasStaff);
}
// 이름으로 가정 찾기: 그 소그룹(또는 부서의 교역자) 가정 중 이름이 같은 사람. 띄어쓰기는 무시한다
function findByName_(body, person) {
  const key = x => String(x).replace(/\s+/g, '');
  const has = f => f && String(f.name).split(' · ').some(n => key(n) === key(person));
  const fams = read_('families');
  if (body.staff) return activeStaff_(String(body.deptId || '')).map(x => fams.find(f => f.id === x.familyId)).find(has) || null;
  return read_('roster').filter(r => activeRow_(r) && r.roomId === body.roomId).map(r => fams.find(f => f.id === r.familyId)).filter(f => f && f.status === '활동').find(has) || null;
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
    } else if (body.byName) {
      const fam = findByName_(body, person);
      if (!fam) throw fail_('notfound', body.staff ? '교역자 목록에서 그 이름을 찾지 못했어요. 부서 관리자에게 알려 주세요.' : '이 소그룹에서 그 이름을 찾지 못했어요.');
      familyId = fam.id; person = fam.name.split(' · ').find(n => n.replace(/\s+/g, '') === person.replace(/\s+/g, '')) || person;
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
    history: lead ? updateHistory_(c.roomId, c.deptId, month_()) : undefined, trend: lead ? updateTrend_(c.roomId, c.deptId, month_()) : undefined,
    invite: lead ? (invites_(c).rooms.find(r => r.id === c.roomId) || {}).token : undefined };
}

// 월별 업데이트 추이(설계서 10장, 리더): 최근 12개월, 그달 편성에서 우리 사랑방 가정 수와 손봄·그대로 확인 수. 사랑방 합계만.
//  그달에 이 사랑방이 없었으면 n이 0이다
function updateTrend_(roomId, deptId, m) {
  const months = [m];
  while (months.length < 12) months.unshift(prevMonth_(months[0]));
  const status = {}; read_('monthly').forEach(x => { status[x.familyId + '|' + x.month] = x.status; });
  const roster = read_('roster').filter(r => r.roomId === roomId);
  return months.map(mm => {
    const ids = roster.filter(r => rowIn_(r, mm)).map(r => r.familyId);
    const k = st => ids.filter(f => status[f + '|' + mm] === st).length;
    return { month: mm, n: ids.length, edited: k('edited'), confirmed: k('confirmed') };
  });
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
    logChange_(c, '시트 가져오기', room.name, '가정 ' + list.length + ' · 새 가정 ' + made + ' · 기도제목 ' + count);
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
    logChange_(c, (f && f.status === '승인 대기' ? '새 가정 ' : '연결 ') + (ok ? '승인' : '거절'), (f ? f.name + ' · ' : '') + l.person);
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
    logChange_(c, '연결 해제', ((read_('families').find(x => x.id === l.familyId) || {}).name || '') + ' · ' + l.person);
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
  if (c.grp) return groupHistory_(c, want);
  const items = read_('items'), rooms = read_('rooms'), fams = read_('families'), roster = read_('roster');
  // 그 달에 적용 중이던 편성에서 우리 가정이 속한 사랑방(12월부터 새 편성이면 12월은 새 사랑방)
  const myRows = roster.filter(r => r.familyId === c.familyId), at = {};
  const myRoom = mm => at[mm] !== undefined ? at[mm] : (at[mm] = myRows.find(r => rowIn_(r, mm)) || null);
  const seen = {};
  items.forEach(i => { const r = myRoom(i.month); if (i.familyId === c.familyId || (r && i.roomId === r.roomId)) seen[i.month] = true; });
  const months = Object.keys(seen).sort().reverse();
  const m = months.indexOf(want) >= 0 ? want : (months.find(x => x < month_()) || months[0] || month_());
  const r = myRoom(m), lead = !!r && (r.role === '리더' || r.role === '코리더');
  const show = i => ({ target: i.target, text: i.text, scope: i.scope, ended: i.state === '마침' });
  const families = !r ? [] : roster.filter(x => x.roomId === r.roomId && rowIn_(x, m)).map(x => {
    const f = fams.find(y => y.id === x.familyId); if (!f || f.status === '지움') return null;
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

// 지난 기록 검색(설계서 S3): 지난 기록 열람 규칙 그대로, 내가 볼 수 있던 기도제목 중 대상이나 내용에 낱말이 있는 것.
//  같은 가정·대상·내용이 여러 달 이어졌으면 한 줄로(처음 달 ~ 마지막 달). 최근 순 40개까지
function search_(c, q) {
  q = q.trim();
  if (!q || q.length > 20) throw fail_('bad', '찾을 낱말을 20글자까지 써 주세요.');
  const items = read_('items'), fams = read_('families'), roster = read_('roster');
  let can;
  if (c.staff) {
    const ids = roomIdsOfDept_(c.deptId);
    can = i => i.familyId === c.familyId || (ids.indexOf(i.roomId) >= 0 && i.scope !== 'family');
  } else {
    const myRows = roster.filter(r => r.familyId === c.familyId), at = {};
    const myRoom = mm => at[mm] !== undefined ? at[mm] : (at[mm] = myRows.find(r => rowIn_(r, mm)) || null);
    can = i => {
      if (i.familyId === c.familyId) return true;
      const r = myRoom(i.month);
      return !!r && i.roomId === r.roomId && (i.scope === 'room' || (i.scope === 'leader' && (r.role === '리더' || r.role === '코리더')));
    };
  }
  const groups = {};
  items.filter(i => (String(i.text).indexOf(q) >= 0 || String(i.target).indexOf(q) >= 0) && can(i)).forEach(i => {
    const k = i.familyId + '|' + i.target + '|' + i.text, g = groups[k];
    if (!g) groups[k] = { name: (fams.find(f => f.id === i.familyId) || {}).name || '', own: i.familyId === c.familyId, roomId: i.roomId, target: i.target, text: i.text, from: i.month, to: i.month };
    else { if (i.month < g.from) g.from = i.month; if (i.month > g.to) g.to = i.month; }
  });
  const list = Object.keys(groups).map(k => groups[k]).sort((a, b) => a.to < b.to ? 1 : a.to > b.to ? -1 : 0);
  return { q, now: month_(), n: list.length, list: list.slice(0, 40) };
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
  const rows = roster.filter(r => rowIn_(r, m) && ids.indexOf(r.roomId) >= 0);
  const rooms = deptRooms.filter(r => rows.some(x => x.roomId === r.id)).map(r => ({ id: r.id, name: r.name }));
  const room = rooms.find(r => r.id === roomId) || rooms[0] || null;
  const show = i => ({ target: i.target, text: i.text, scope: i.scope, ended: i.state === '마침' });
  const families = !room ? [] : rows.filter(x => x.roomId === room.id).map(x => {
    const f = fams.find(y => y.id === x.familyId); if (!f || f.status === '지움') return null;
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
  const own = { id: f.id, name: f.name, kids: f.kids ? String(f.kids).split(/\s*,\s*/) : [], own: true, status: st ? st.status : 'same', prayed: 0, today: 0, week: 0,
    items: all.filter(i => i.state !== '마침').sort((a, b) => a.order - b.order).map(i => Object.assign(show(i), { same: yes_(i.same), isNew: !i.prevId && !yes_(i.same), editedBy: i.editedBy, editedAt: fmtDay_(i.editedAt) })),
    ended: all.filter(i => i.state === '마침').map(show) };
  return { month: m, term: termNow_(c.deptId), dept: c.dept, room: { id: '', name: c.dept.name }, me: { person: c.person, familyId: c.familyId, role: c.role, admin: c.admin, staff: true, label: c.label },
    families: [own], received: { n: 0, of: 0 }, serve: serveView_(c.deptId), rooms: staffRooms_(c, m), signals: careSignals_(roomIds, m),
    // 함께 섬기는 교역자: 섬기는 분들 카드에 나오지 않는 동역자(본인 빼고). 기도하기의 '함께 섬기는 분들' 장에 이름만
    mates: activeStaff_(c.deptId).filter(s => s.familyId !== c.familyId && !yes_(s.serve)).map(s => s.label), eraseReq: eraseAsked_(c.familyId), together: togetherItems_(c.deptId) };
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
  if (c.grp) return groupMonthView_(c);
  const m = month_();
  const isLeader = c.role === '리더' || c.role === '코리더';
  const room = read_('rooms').find(r => r.id === c.roomId) || {};
  const families = roomFamilies_(c, c.roomId, m, isLeader);
  // 이번 달 사랑방의 다른 가정 중 몇 가정이 우리 가정을 위해 기도했는지(누가 했는지는 알리지 않는다)
  const by = {}; read_('prayers').forEach(p => { if (p.familyId === c.familyId && p.by !== c.familyId && fmtMonth_(p.at) === m) by[p.by] = true; });
  const received = { n: Object.keys(by).length, of: Math.max(0, families.length - 1) };
  return { month: m, term: termNow_(c.deptId), shift: shift_(c), dept: c.dept, room: { id: room.id, name: room.name, pilot: yes_(room.pilot) }, me: { person: c.person, familyId: c.familyId, role: c.role, admin: c.admin }, families, received, serve: serveView_(c.deptId),
    art: artNums_(c, [m])[0], eraseReq: eraseAsked_(c.familyId), together: togetherItems_(c.deptId), news: newsOfFamily_(c.familyId) };
}

// 이달의 그림 모으기(설계서 4장): 내가 누른 '기도했어요'로 달마다 세 숫자를 센다. 나만 본다. 기도기록에서 바로 세어서 줄지 않는다.
//  hero: 기도한 날 수(날마다 주인공 하나) / fams: 기도한 다른 가정 수(소품은 화면에서 그달 소품 수까지) / hearts: 같은 날 같은 가정을 위해 한 번 더 기도한 수.
//  누른 사람 칸이 생기기 전 기록은 우리 가정이 누른 것으로 함께 센다
function artNums_(c, months) {
  // 누른 사람 칸이 없던 옛 기록은 가정ID로 센다. 결혼 전 내 옛 가정(합침 연결)의 기록도 함께
  const before = beforeIds_(c.kakaoId), mine = read_('prayers').filter(p => (p.kakaoId ? p.kakaoId === c.kakaoId : (p.by === c.familyId || before.indexOf(p.by) >= 0)) && p.familyId !== c.familyId && before.indexOf(p.familyId) < 0);
  return months.map(mm => {
    const days = {}, fams = {}, pair = {};
    mine.filter(p => fmtMonth_(p.at) === mm).forEach(p => { const d = fmtDate_(p.at); days[d] = 1; fams[p.familyId] = 1; pair[d + '|' + p.familyId] = (pair[d + '|' + p.familyId] || 0) + 1; });
    return { month: mm, hero: Object.keys(days).length, fams: Object.keys(fams).length, hearts: Object.keys(pair).reduce((a, k) => a + pair[k] - 1, 0) };
  });
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
  const mineAll = read_('prayers').filter(p => p.kakaoId === c.kakaoId), prayed = mineAll.filter(p => fmtMonth_(p.at) === m);
  // 이번 주(주일부터) 횟수는 달과 상관없이 센다(한 주가 두 달에 걸칠 수 있어서)
  const wk = weekStart_(), weekP = mineAll.filter(p => fmtDate_(p.at) >= wk);
  return roster.map(r => fams.find(f => f.id === r.familyId)).filter(f => f && f.status === '활동').map(f => {
    const own = f.id === c.familyId;
    const st = monthly.find(x => x.familyId === f.id);
    return {
      id: f.id, name: f.name, kids: f.kids ? String(f.kids).split(/\s*,\s*/) : [], own,
      status: st ? st.status : 'same',
      prayed: prayed.filter(p => p.familyId === f.id).length,
      today: prayed.filter(p => p.familyId === f.id && fmtDate_(p.at) === today_()).length,
      week: weekP.filter(p => p.familyId === f.id).length,
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
    // 앱 상태(관리 › 운영)에 보여 줄 '새 달이 처음 열린 때'
    if (!props_()['OPENED_' + m]) PropertiesService.getScriptProperties().setProperty('OPENED_' + m, new Date().toISOString());
  });
}

function saveItem_(body) {
  const c = member_(body), m = month_();
  const text = String(body.text || '').trim(), target = String(body.target || (c.staff ? '함께' : c.dept.unit === '개인' ? '나' : '우리 가정')).trim().slice(0, 10);
  // 교역자는 부서 공개 / 우리 가정만, 회원은 사랑방 공개 / 리더·목사님 / 우리 가정만
  const allowed = c.staff ? STAFF_SCOPES : c.grp ? GROUP_SCOPES : SCOPES, scope = allowed.indexOf(body.scope) >= 0 ? body.scope : allowed[0];
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
  if (c.grp ? !groupPeople_(c.grp).some(m => m.id === body.familyId) : !read_('roster').some(ok)) throw fail_('bad', c.staff ? '우리 부서 사랑방 가정이 아니에요.' : '우리 사랑방 가정이 아니에요.');
  // prayed: 이번 달 내 횟수, today: 오늘 내 횟수(가정마다 하루 3번까지), week: 이번 주(주일부터) 내 횟수
  const all = read_('prayers').filter(p => p.kakaoId === c.kakaoId && p.familyId === body.familyId), wk = weekStart_();
  const mine = all.filter(p => fmtMonth_(p.at) === month_());
  const n = mine.filter(p => fmtDate_(p.at) === today_()).length, w = all.filter(p => fmtDate_(p.at) >= wk).length;
  if (n >= 3) return { prayed: mine.length, today: n, week: w, capped: true };
  append_('prayers', { at: new Date(), by: c.familyId, familyId: body.familyId, kakaoId: c.kakaoId });
  return { prayed: mine.length + 1, today: n + 1, week: w + 1, capped: n + 1 >= 3, art: c.staff ? undefined : artNums_(c, [month_()])[0] };
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
  const famsAt = mm => roster.filter(r => rowIn_(r, mm));
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
  // 주별 '기도했어요': 이번 주(주일부터)까지 8주
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
    time,
    topics: topicFlow_(c)
  };
}

// ── 나의 기도 (지난 기록, 설계서 10장 '누구를 위해 기도했나') ────────────
// 내가 누른 '기도했어요'를 최근 6개월, 가정마다(목사님·장로님은 사랑방마다) 센다. 나만 본다.
//  누른 사람 칸이 생기기 전 기록은 우리 가정이 누른 것으로 함께 센다
function myPrayers_(c) {
  const m = month_(), months = [m];
  while (months.length < 6) months.unshift(prevMonth_(months[0]));
  const fams = read_('families'), live = id => (fams.find(f => f.id === id) || {}).status === '활동';
  const rows = c.staff
    ? activeRooms_(c.deptId).sort((a, b) => a.order - b.order).map(r => ({ id: r.id, name: r.name, fams: read_('roster').filter(x => activeRow_(x) && x.roomId === r.id && live(x.familyId)).map(x => x.familyId) }))
    : read_('roster').filter(x => activeRow_(x) && x.roomId === c.roomId && x.familyId !== c.familyId && live(x.familyId))
      .map(x => ({ id: x.familyId, name: (fams.find(f => f.id === x.familyId) || {}).name || '', fams: [x.familyId] }));
  const mine = read_('prayers').filter(p => p.kakaoId ? p.kakaoId === c.kakaoId : p.by === c.familyId);
  // 달마다 모은 그림(목사님·장로님은 그림이 없다): 최근 24개월 중 기도한 달과 이번 달
  const artMonths = [m]; while (artMonths.length < 24) artMonths.unshift(prevMonth_(artMonths[0]));
  return { months, unit: c.staff ? 'room' : 'family', rows: rows.map(r => ({ id: r.id, name: r.name,
    cells: months.map(mm => mine.filter(p => r.fams.indexOf(p.familyId) >= 0 && fmtMonth_(p.at) === mm).length) })),
    art: c.staff ? undefined : artNums_(c, artMonths).filter(a => a.hero || a.month === m),
    // 한 해 마무리 앨범: 해마다 내가 기도한 다른 가정 수
    artYears: c.staff ? undefined : (() => { const y = {}; mine.filter(p => p.familyId !== c.familyId).forEach(p => { const k = fmtMonth_(p.at).slice(0, 4); (y[k] = y[k] || {})[p.familyId] = 1; });
      Object.keys(y).forEach(k => { y[k] = Object.keys(y[k]).length; }); return y; })() };
}

// ── 기도 주제 흐름 (목사님·관리자, 설계서 10장) ─────────────────
const DEFAULT_TOPICS_ = [
  ['건강', '건강, 수술, 회복, 병원, 검사, 치료, 통증, 알레르기, 체중, 입덧, 감기, 허리, 무릎, 재활'],
  ['직장·진로', '직장, 회사, 복직, 이직, 취업, 사업, 구조조정, 승진, 야근, 면접, 업무'],
  ['자녀·양육', '자녀, 육아, 어린이집, 유치원, 학교, 입학, 발달, 사춘기, 한글'],
  ['임신·출산', '임신, 출산, 태아, 난임, 산후'],
  ['학업·연구', '시험, 공부, 논문, 연구, 학위, 수업, 자격증, 실험, 학술지, 투고'],
  ['가정·생활', '결혼, 부부, 부모님, 이사, 전세, 영주권, 비자, 여행, 가족 시간'],
  ['신앙', '신앙, 말씀, 큐티, 예배, 거룩, 전도, 경건']
];
function topicDict_() {
  if (!read_('topics').length) appendMany_('topics', DEFAULT_TOPICS_.map(([topic, words], i) => ({ topic, words, order: i + 1 })));
  return read_('topics').sort((a, b) => a.order - b.order).map(t => ({ row: t, topic: t.topic, words: String(t.words).split(/\s*,\s*/).filter(Boolean) }));
}
function classify_(dict, text) {
  const hit = dict.filter(d => d.words.some(w => String(text).indexOf(w) >= 0)).map(d => d.topic);
  return hit.length ? hit : ['기타'];
}
function staffOrAdmin_(body) {
  const c = member_(body);
  if (!c.staff && !c.admin) throw fail_('forbidden', '목사님·관리자만 볼 수 있어요.');
  return c;
}
// 부서의 최근 6개월 기도제목을 주제로 나눠 센다(합계만, 이름 없이). 우리 가정만 항목도 개수에는 넣고 내용은 내보내지 않는다.
//  목사님·장로님에게만 이번 달 '기타'로 빠진 사랑방 공개 항목의 내용(가정 이름 없이)과 사전을 함께 준다(키워드 다듬기용).
//  관리자는 다른 사랑방 기도제목 내용을 보지 않으므로 주제별 숫자만 본다
function topicFlow_(c, allRooms) {
  const m = month_(), months = [m];
  while (months.length < 6) months.unshift(prevMonth_(months[0]));
  const dict = topicDict_(), names = dict.map(d => d.topic).concat('기타');
  const rooms = allRooms || roomIdsOfDept_(c.deptId), items = read_('items').filter(i => months.indexOf(i.month) >= 0 && rooms.indexOf(i.roomId) >= 0);
  const flow = months.map(mm => {
    const list = items.filter(i => i.month === mm), counts = {};
    names.forEach(t => { counts[t] = 0; });
    list.forEach(i => classify_(dict, i.text).forEach(t => { counts[t]++; }));
    return { month: mm, n: list.length, counts };
  });
  const out = { months, topics: names, flow };
  if (c.staff) {
    out.dict = dict.map(d => ({ topic: d.topic, words: d.words }));
    out.etc = items.filter(i => i.month === m && i.scope === 'room' && classify_(dict, i.text)[0] === '기타').map(i => ({ target: i.target, text: i.text }));
  }
  return out;
}
// 목사님·장로님: 주제사전에 키워드를 더하거나 뺀다
function topicWord_(body) {
  const c = member_(body);
  if (!c.staff) throw fail_('forbidden', '목사님·장로님만 고칠 수 있어요.');
  const word = String(body.word || '').trim(), dict = topicDict_(), d = dict.find(x => x.topic === body.topic);
  if (!d) throw fail_('bad', '모르는 주제예요.');
  if (!word || word.length > 10 || /[,\n]/.test(word)) throw fail_('bad', '키워드는 쉼표 없이 10글자까지 써 주세요.');
  const words = body.remove ? d.words.filter(w => w !== word) : d.words.indexOf(word) >= 0 ? d.words : d.words.concat(word);
  d.row.words = words.join(', ');
  update_('topics', d.row);
  return topicFlow_(c);
}

// ── 분석 ② 앱 개선 (만드는 쪽, 설계서 10장) ─────────────────────
// 교회 전체 합계만. 사용기록(기기ID는 무작위 값)과 '그달 들어온 가정'(seen)으로 센다. 이름·가정ID·기도제목은 내보내지 않는다
//  - 계속 쓰기: 처음 들어온 달별로 1·2·3개월 뒤에도 들어온 가정 %. 최근 6개월 중 새로 들어온 가정이 있는 달만, 최근 4개
//  - 첫 접속: 최근 90일, 단계마다 도착한 기기 수(뒤 단계에 간 기기는 앞 단계에도 센다)
//  - 기능 사용·쓰는 환경: 이번 달 앱을 연 기기 중 %
//  - 기도하기 한 번: 이번 달 마친 기도하기의 평균
const FUNNEL_ = [['login', '로그인 화면', ['login']], ['room', '부서·사랑방 고르기', ['dept', 'room', 'staffpick']], ['family', '가정 고르기', ['family', 'who', 'newfam', 'typename']],
  ['consent', '동의', ['consent']], ['wait', '리더 승인 기다림', ['wait']], ['app', '연결 완료', ['app']], ['save', '첫 기도제목 저장', []]];
function appStats_(m, seen) {
  const pct = (k, n) => n ? Math.round(k / n * 100) : null;
  const addM = (mm, k) => { const [y, mo] = mm.split('-').map(Number), t = y * 12 + mo - 1 + k; return Math.floor(t / 12) + '-' + String(t % 12 + 1).padStart(2, '0'); };
  // 계속 쓰기: seen 열쇠는 '가정ID|달'
  const first = {}, by = {};
  Object.keys(seen).forEach(k => { const [f, mm] = k.split('|'); (by[f] = by[f] || {})[mm] = true; if (!first[f] || mm < first[f]) first[f] = mm; });
  const cohorts = [0, 1, 2, 3, 4, 5].map(k => addM(m, k - 5)).map(cm => {
    const fs = Object.keys(first).filter(f => first[f] === cm);
    return { month: cm, n: fs.length, vals: [0, 1, 2, 3].map(k => addM(cm, k) > m ? null : pct(fs.filter(f => by[f][addM(cm, k)]).length, fs.length)) };
  }).filter(c => c.n).slice(-4);
  const rows = read_('usage').map(u => { let d = {}; try { d = JSON.parse(u.data || '{}'); } catch (e) { /* 깨진 줄은 비워 둔다 */ } return { at: u.at, device: u.device, event: u.event, d }; });
  // 첫 접속: 최근 90일
  const since = fmtDate_(new Date(Date.now() - 90 * 864e5)), steps = {}, linked = {};
  rows.filter(u => fmtDate_(u.at) >= since && u.event === '첫접속 단계').forEach(u => {
    const i = FUNNEL_.findIndex(s => s[2].indexOf(u.d.step) >= 0);
    if (i < 0) return;
    steps[u.device] = Math.max(steps[u.device] === undefined ? -1 : steps[u.device], i);
    if (u.d.step === 'app' && !linked[u.device]) linked[u.device] = u.at;
  });
  rows.forEach(u => { if (u.event === '기도제목 저장' && linked[u.device] && u.at >= linked[u.device]) steps[u.device] = FUNNEL_.length - 1; });
  const funnel = FUNNEL_.map((s, i) => ({ label: s[1], n: Object.keys(steps).filter(d => steps[d] >= i).length }));
  // 이번 달: 앱을 연 기기(열기)마다 마지막 열기 값
  const now = rows.filter(u => fmtMonth_(u.at) === m), opened = {}, used = {};
  now.forEach(u => { if (u.event === '열기') opened[u.device] = u.d; });
  const devs = Object.keys(opened), N = devs.length;
  const FEATS = [['기도하기', u => u.event === '기도하기 시작'], ['기도제목 저장', u => u.event === '기도제목 저장'], ['카톡 글 붙여 넣기', u => u.event === '기도제목 저장' && u.d.split === true],
    ['표 보기', u => u.event === '화면 보기' && u.d.screen === '표'], ['지난 기록', u => u.event === '화면 보기' && u.d.screen === '지난 기록'], ['모임 모드', u => u.event === '모임 모드 시작'], ['엑셀 내려받기', u => u.event === '내려받기']];
  now.forEach(u => FEATS.forEach(([l, hit]) => { if (hit(u)) (used[l] = used[l] || {})[u.device] = true; }));
  const ends = now.filter(u => u.event === '기도하기 마침'), starts = now.filter(u => u.event === '기도하기 시작');
  const avg = k => ends.length ? Math.round(ends.reduce((a, u) => a + (Number(u.d[k]) || 0), 0) / ends.length * 10) / 10 : null;
  const env = hit => pct(devs.filter(d => hit(opened[d])).length, N);
  return {
    cohorts, funnel, devices: N,
    features: FEATS.map(([l]) => ({ label: l, pct: pct(devs.filter(d => used[l] && used[l][d]).length, N) })),
    pray: { n: ends.length, done: pct(ends.filter(u => u.d.early === false).length, ends.length), seen: avg('seen'), mins: avg('mins'),
      music: pct(starts.filter(u => u.d.music === true).length, starts.length), flow: pct(starts.filter(u => u.d.flow === true).length, starts.length) },
    env: { phone: env(d => d.width === 'phone'), tablet: env(d => d.width === 'tablet'), pc: env(d => d.width === 'pc'), app: env(d => d.app === true), dark: env(d => d.mode === 'dark'), big: env(d => d.big === true) }
  };
}

function setMonthly_(familyId, m, status) {
  const row = read_('monthly').find(x => x.month === m && x.familyId === familyId);
  if (row) { if (row.status !== status) { row.status = status; update_('monthly', row); } }
  else append_('monthly', { month: m, familyId, status });
}

// ── 관리 › 운영 (설계서 S7) ─────────────────────────────────

// 변경기록: 관리자·리더가 바꾼 것. 기록하다 실패해도 하던 일은 그대로 마친다
function logChange_(c, kind, target, extra, ref, deptId) {
  try { append_('changes', { at: new Date(), deptId: deptId || c.deptId, who: c.person, role: c.ops ? (c.all ? '전체 관리자' : '운영 지원') : c.admin ? '부서 관리자' : c.role, kind, target: target || '', extra: extra || '', ref: ref || '' }); }
  catch (e) { /* 기록을 못 남겨도 하던 일은 마친다 */ }
}
// 오류 기록: 요청 이름과 오류 종류만(오류 글은 80자까지)
function logError_(action, err) {
  try {
    Object.keys(READ_CACHE_).forEach(k => delete READ_CACHE_[k]);
    append_('errors', { at: new Date(), action: String(action || '').slice(0, 20), kind: (String(err && err.name || 'Error') + ': ' + String(err && err.message || err)).slice(0, 100) });
  } catch (e) { /* 오류 기록도 못 하면 그냥 둔다 */ }
}
// 오래된 기록 지우기: 오류 30일, 변경기록 13개월, 만료된 로그인. 관리자가 운영을 열 때 함께 한다
function trimLogs_() {
  const cut = (key, ms) => read_(key).filter(x => !(Date.parse(x.at) > Date.now() - ms)).sort((a, b) => b._row - a._row).forEach(x => remove_(key, x));
  cut('errors', 30 * 864e5);
  cut('changes', 396 * 864e5);
  cut('feedback', 396 * 864e5);
  cut('survey', 396 * 864e5);
  tidyGroups_();
  // 로그인 탭: 만료된 줄(카카오ID·닉네임)을 남겨 두지 않는다
  read_('sessions').filter(x => !(Date.parse(x.expires) > Date.now())).sort((a, b) => b._row - a._row).forEach(x => remove_('sessions', x));
}
const monAdd_ = (m, k) => { const [y, mo] = m.split('-').map(Number), t = y * 12 + mo - 1 + k; return Math.floor(t / 12) + '-' + String(t % 12 + 1).padStart(2, '0'); };

// ① 앱 상태와 ② 개인정보 요청을 한 번에
function opsView_(c) {
  trimLogs_();
  const d = c.deptId, m = month_(), prev = prevMonth_(m), p = props_();
  // 새 달: 이번 달로 넘어온 기도제목 수, 아직 아무도 열지 않아 넘어오기를 기다리는 소그룹 수
  const rooms = activeRooms_(d).map(r => r.id), roster = read_('roster').filter(r => activeRow_(r) && rooms.indexOf(r.roomId) >= 0);
  const has = {}, open = {};
  read_('items').forEach(i => { has[i.familyId + '|' + i.month] = true; if (i.month === prev && i.state !== '마침') open[i.familyId] = true; });
  const carried = read_('items').filter(i => i.month === m && i.prevId && yes_(i.same) && roster.some(r => r.familyId === i.familyId)).length;
  const waiting = rooms.filter(id => roster.some(r => r.roomId === id && !has[r.familyId + '|' + m] && open[r.familyId])).length;
  // 최근 7일 오류
  const errs = read_('errors').filter(e => Date.parse(e.at) > Date.now() - 7 * 864e5), kinds = {};
  errs.forEach(e => { const k = e.action + ' · ' + e.kind; kinds[k] = (kinds[k] || 0) + 1; });
  // 관리자 수: 우리 부서(지금 편성·교역자) 가정 중 관리자
  const mine = {}; roster.forEach(r => { mine[r.familyId] = true; }); activeStaff_(d).forEach(s => { mine[s.familyId] = true; });
  // 운영 관리자도 함께 센다(부서 관리자 1명 + 운영 관리자 1명이면 둘)
  const admins = read_('families').filter(f => mine[f.id] && yes_(f.admin)).length + opsList_(c).live.length;
  return {
    version: VERSION,
    month: { month: m, opened: p['OPENED_' + m] || '', carried, waiting },
    errors: { n: errs.length, last: errs.length ? errs[errs.length - 1].at : '', kinds: Object.keys(kinds).map(k => ({ kind: k, n: kinds[k] })).sort((a, b) => b.n - a.n).slice(0, 8) },
    admins, handover: p['HANDOVER_' + d] || '',
    privacy: privacy_(c),
    invites: invites_(c),
    feedback: feedbackList_(c),
    opsList: opsList_(c)
  };
}

// 아직 아무도 열지 않은 소그룹까지 이번 달로 넘긴다(앱을 처음 열 때 저절로 되는 일을 지금 한꺼번에)
function openMonth_(body) {
  const c = adminOf_(body), m = month_();
  activeRooms_(c.deptId).forEach(r => ensureMonth_(r.id, m));
  logChange_(c, '새 달 열기', m);
  return opsView_(c);
}
// 인수인계 체크리스트를 확인한 날
function handover_(body) {
  const c = adminOf_(body);
  PropertiesService.getScriptProperties().setProperty('HANDOVER_' + c.deptId, today_());
  logChange_(c, '인수인계 확인', c.dept.name);
  return opsView_(c);
}

// 떠난 가정과 지우기 요청. 떠난 달은 그 가정이 마지막으로 있던 편성 다음 편성이 시작한 달(교역자는 마친 날).
//  떠난 달(또는 '1년 더 두기'를 누른 달)부터 12개월이 지나면 '지울 날이 된 가정'에 올라온다. 저절로 지우지 않는다
function privacy_(c) {
  const d = c.deptId, m = month_(), fams = read_('families'), roster = read_('roster'), ids = roomIdsOfDept_(d), terms = terms_(d);
  const active = {}; roster.filter(activeRow_).forEach(r => { active[r.familyId] = true; }); activeStaff_().forEach(s => { active[s.familyId] = true; });
  const reqs = read_('requests'), kept = {};
  reqs.filter(q => q.kind === '더 두기').forEach(q => { const k = String(q.at).slice(0, 7); if (!kept[q.familyId] || k > kept[q.familyId]) kept[q.familyId] = k; });
  const due = []; let later = 0;
  const closed = deptById_(d).status === '닫음' ? String(deptById_(d).closedAt).slice(0, 7) : '';
  if (closed) {
    roster.filter(r => ids.indexOf(r.roomId) >= 0).forEach(r => { active[r.familyId] = false; });
    activeStaff_(d).forEach(s2 => { active[s2.familyId] = false; });
  }
  fams.filter(f => !active[f.id] && ['지움', '승인 대기', '거절', '합침', '취소'].indexOf(f.status) < 0).forEach(f => {
    let since = '';
    if (closed && (roster.some(r => r.familyId === f.id && ids.indexOf(r.roomId) >= 0) || read_('staff').some(x => x.familyId === f.id && x.deptId === d))) since = closed;
    else {
    const st = read_('staff').filter(s => s.familyId === f.id && s.deptId === d).pop();
    if (st) { if (st.status === '종료') since = String(st.endedAt).slice(0, 7); }
    else {
      const rows = roster.filter(r => r.familyId === f.id && ids.indexOf(r.roomId) >= 0);
      if (!rows.length) return;
      const last = Math.max.apply(null, rows.map(r => Number(r.year))), next = terms.find(t => Number(t.year) > last);
      since = next ? next.start : '';
    }
    }
    if (!/^\d{4}-\d{2}$/.test(since)) return;
    const from = kept[f.id] && kept[f.id] > since ? kept[f.id] : since;
    if (monAdd_(from, 12) <= m) due.push({ id: f.id, name: f.name, since, kept: !!kept[f.id], old: oldOf_(f.id).length });
    else later++;
  });
  const requests = reqs.filter(q => q.kind === '기록 지우기' && q.status === '요청' && q.deptId === d)
    .map(q => ({ id: q.familyId, name: (fams.find(f => f.id === q.familyId) || {}).name || '', at: fmtDay_(q.at), old: oldOf_(q.familyId).length })).filter(q => q.name);
  return { due, requests, later };
}

// 기록 지우기(관리자): 지울 날이 된 가정이나 지워 달라고 한 가정만. 기도제목 내용·대상, 가정 이름·자녀, 연결·로그인을 지우고
//  기도제목 개수와 '기도했어요' 횟수만 남긴다. 되돌릴 수 없어서 화면에서 가정 이름을 한 번 더 확인해 보낸다
function eraseFamily_(body) {
  const c = adminOf_(body), id = String(body.familyId || '');
  if (id === c.familyId) throw fail_('bad', '우리 가정 기록은 여기서 지울 수 없어요. 다른 관리자에게 부탁해 주세요.');
  return withLock_(() => {
    const P = privacy_(c);
    if (!P.due.some(x => x.id === id) && !P.requests.some(x => x.id === id)) throw fail_('bad', '지울 수 있는 가정이 아니에요.');
    const fam = read_('families').find(f => f.id === id);
    if (!fam || fam.name !== String(body.name || '')) throw fail_('bad', '가정 이름이 맞지 않아요. 다시 골라 주세요.');
    eraseFam_(c, fam);
    return opsView_(c);
  });
}
// 한 가정(사람)의 기록 지우기: 기도제목 내용·대상, 이름·자녀, 연결·로그인·카톡 공유, 의견의 이름, 모임 자리와 모임 기도제목. 개수는 남는다
function eraseFam_(c, fam) {
    // 결혼해서 새 가정으로 합쳐진 옛 가정들(같은 사람들의 기록)도 함께 지운다
    let extra = 0;
    oldOf_(fam.id).forEach(o => { extra += eraseFam_(c, o); });
    const id = fam.id, name = fam.name, items = read_('items').filter(i => i.familyId === id);
    items.forEach(i => { i.text = ''; i.target = ''; i.editedBy = ''; update_('items', i); });
    const kakao = read_('links').filter(l => l.familyId === id).map(l => String(l.kakaoId));
    read_('links').filter(l => l.familyId === id).sort((a, b) => b._row - a._row).forEach(l => remove_('links', l));
    read_('sessions').filter(s => kakao.indexOf(String(s.kakaoId)) >= 0).sort((a, b) => b._row - a._row).forEach(s => remove_('sessions', s));
    read_('posts').filter(x => x.familyId === id).sort((a, b) => b._row - a._row).forEach(x => remove_('posts', x));
    read_('feedback').filter(x => x.familyId === id).forEach(x => { x.familyId = ''; x.person = ''; update_('feedback', x); });
    // 자율 모임: 그 가정 사람의 모임 자리와 모임 기도제목도 지운다(개수는 남는다)
    read_('gmembers').filter(m => kakao.indexOf(String(m.kakaoId)) >= 0).forEach(m => {
      read_('items').filter(i => i.familyId === m.id).forEach(i => { i.text = ''; i.target = ''; i.editedBy = ''; update_('items', i); });
      const lead = m.role === '모임장' && m.status === '함께';
      Object.assign(m, { kakaoId: '', person: '(지운 기록)', status: '나감' }); update_('gmembers', m);
      if (lead) passGroup_(m.groupId);
    });
    Object.assign(fam, { name: '(지운 기록)', kids: '', status: '지움', admin: '' }); update_('families', fam);
    read_('requests').filter(q => q.familyId === id && q.kind === '기록 지우기' && q.status === '요청')
      .forEach(q => { Object.assign(q, { status: '처리', doneAt: today_(), doneBy: c.person }); update_('requests', q); });
    logChange_(c, '기록 지움', name, '기도제목 ' + items.length + '개');
    return items.length + extra;
}
// 떠난 가정을 1년 더 두기(돌아올 수도 있을 때)
function keepFamily_(body) {
  const c = adminOf_(body), id = String(body.familyId || '');
  return withLock_(() => {
    const f = privacy_(c).due.find(x => x.id === id);
    if (!f) throw fail_('bad', '가정을 찾지 못했어요.');
    append_('requests', { familyId: id, deptId: c.deptId, kind: '더 두기', at: today_(), status: '처리', doneAt: today_(), doneBy: c.person });
    logChange_(c, '떠난 가정 1년 더 두기', f.name);
    return opsView_(c);
  });
}

// 우리 가정이 기록 지우기를 요청했는지
function eraseAsked_(familyId) { return read_('requests').some(q => q.familyId === familyId && q.kind === '기록 지우기' && q.status === '요청'); }
// 가정: 기록 지우기 요청 / 요청 거두기. 관리자 운영 화면의 '개인정보 요청'에 올라간다
function eraseRequest_(c, on) {
  return withLock_(() => {
    const open = read_('requests').filter(q => q.familyId === c.familyId && q.kind === '기록 지우기' && q.status === '요청');
    if (on && !open.length) append_('requests', { familyId: c.familyId, deptId: c.deptId, kind: '기록 지우기', at: today_(), status: '요청', doneAt: '', doneBy: '' });
    if (!on) open.forEach(q => { Object.assign(q, { status: '거둠', doneAt: today_(), doneBy: c.person }); update_('requests', q); });
    return { eraseReq: on };
  });
}
// 우리 가정 기록 내려받기: 달마다 우리 가정이 쓴 기도제목 전부("우리 가정만" 포함). 화면이 엑셀로 만든다
function myExport_(c) {
  const items = read_('items').filter(i => i.familyId === c.familyId && i.text !== ''), months = {};
  items.forEach(i => { (months[i.month] = months[i.month] || []).push(i); });
  return { name: c.family.name, months: Object.keys(months).sort().map(mm => ({ month: mm,
    items: months[mm].sort((a, b) => a.order - b.order).map(i => ({ target: i.target, text: i.text, scope: i.scope, ended: i.state === '마침' })) })),
    before: beforeMarriage_(c).before };
}

// ── 초대 링크 · QR (설계서 S7 › ⑤) ─────────────────────────
// 부서 링크 하나와 지금 쓰는 사랑방마다 링크 하나. 없으면 만든다. 개편으로 쓰지 않게 된 사랑방의 링크는 열어도 막힌 것으로 본다
//  (새 편성의 새 사랑방은 처음 볼 때 새 링크가 생긴다). 링크는 들어오는 길만 줄이고, 연결 승인은 지금처럼 리더가 한다
const newToken_ = () => Utilities.getUuid().replace(/-/g, '').slice(0, 12);
function invites_(c) {
  const d = c.deptId, rooms = activeRooms_(d).sort((a, b) => a.order - b.order);
  const live = () => read_('invites').filter(x => x.deptId === d && x.status === '쓰는 중');
  const need = [''].concat(rooms.map(r => r.id)).filter(id => !live().some(x => x.roomId === id));
  if (need.length) appendMany_('invites', need.map(id => ({ token: newToken_(), deptId: d, roomId: id, at: new Date(), status: '쓰는 중' })));
  const tok = id => (live().filter(x => x.roomId === id).pop() || {}).token;
  return { dept: tok(''), rooms: rooms.map(r => ({ id: r.id, name: r.name, token: tok(r.id) })) };
}
// 링크 값으로 부서·사랑방을 찾는다. 막혔거나, 사랑방이 지금 쓰지 않는 사랑방이면 null
function inviteOf_(token) {
  const x = read_('invites').filter(i => i.token === token && i.status === '쓰는 중').pop();
  if (!x) return null;
  if (x.roomId && !activeRooms_(x.deptId).some(r => r.id === x.roomId)) return null;
  return { deptId: x.deptId, roomId: x.roomId };
}
// 링크 새로 만들기(관리자): 예전 링크는 막힌다(링크가 엉뚱한 곳에 퍼졌을 때)
function inviteRenew_(body) {
  const c = adminOf_(body), id = String(body.roomId || '');
  if (id && !activeRooms_(c.deptId).some(r => r.id === id)) throw fail_('bad', '우리 부서 소그룹이 아니에요.');
  return withLock_(() => {
    read_('invites').filter(x => x.deptId === c.deptId && x.roomId === id && x.status === '쓰는 중').forEach(x => { x.status = '막힘'; update_('invites', x); });
    append_('invites', { token: newToken_(), deptId: c.deptId, roomId: id, at: new Date(), status: '쓰는 중' });
    logChange_(c, '초대 링크 새로 만들기', id ? (read_('rooms').find(r => r.id === id) || {}).name : c.dept.name + ' 전체');
    return opsView_(c);
  });
}

// ── 의견함 (설계서 S7 › ⑥) ───────────────────────────────
const FEEDBACK_KINDS = ['불편해요', '이랬으면', '고마워요'];
// 로그인한 누구나 의견을 보낸다(교회에 연결되지 않은 기도 노트 사용자도: 부서ID가 비고 전체 관리자만 본다).
//  이름을 밝히면 연결된 사람은 가정ID와 사람을, 연결되지 않은 사람은 카카오 닉네임을 남긴다. 한 사람이 하루 10번까지
function sendFeedback_(body) {
  const w = who_(body), text = String(body.text || '').trim().slice(0, 500);
  if (!text) throw fail_('bad', '내용을 적어 주세요.');
  const kind = FEEDBACK_KINDS.indexOf(body.kind) >= 0 ? body.kind : FEEDBACK_KINDS[1];
  let c = null;
  try { c = memberFrom_(w); } catch (e) { if (!(e && e.code === 'notLinked')) throw e; }
  const cache = CacheService.getScriptCache(), key = 'fb:' + w.kakaoId + ':' + today_(), n = Number(cache.get(key) || 0);
  if (n >= 10) throw fail_('busy', '오늘은 충분히 보내 주셨어요. 내일 다시 보내 주세요.');
  cache.put(key, String(n + 1), 86400);
  const named = body.named === true;
  append_('feedback', { at: new Date(), deptId: c ? c.deptId : '', kind, text, familyId: named && c ? c.familyId : '', person: named ? (c ? c.person : w.nick) : '',
    ver: String(body.ver || '').slice(0, 20), width: ['phone', 'tablet', 'pc'].indexOf(body.width) >= 0 ? body.width : '', read: '' });
  return { ok: true };
}

// ── 시범 설문 (3·7·14일째 카드, app/survey.js) ─────────────────────────
// 정해 둔 키와 값만 받는다(글은 text). 문항을 바꾸면 app/survey.js의 ROUNDS와 키를 맞춘다. amount는 기도 노트에서만, easy는 공동체에서만
const SURVEY_ = {
  3: { mood: ['bad', 'soso', 'good', 'great'], stuck: 'text' },
  7: { amount: ['few', 'fit', 'many'], easy: ['yes', 'soso', 'hard'], liked: { multi: ['cord', 'art', 'answer', 'pray', 'share'] }, wish: 'text' },
  // ueq: UEQ-S 8문항(공식 한국어판, app/survey.js 맨 위 설명). 문항 번호 1~8마다 1~7의 값만 받는다
  14: { ueq: { ueq: 8 }, keep: ['yes', 'maybe', 'no'], recommend: ['yes', 'maybe', 'no'], want: 'text' }
};
const SURVEY_ONLY_ = { amount: 'note', easy: 'community' };
const SURVEY_NUMS_ = ['days', 'items', 'thanks', 'app', 'vault'];
// 시범 '해 볼 일' 띠(app/pilot.js)의 항목 키. 같은 키로 맞춘다. '숫자도 함께 보내기'를 켠 사람만 해 본 키 목록이 오고(이름·날짜·기도 내용 없음), 아는 키만 받는다
const SURVEY_PILOT_ = ['c-edit', 'c-pray', 'c-cord', 'c-ps', 'c-style', 'n-two', 'n-today', 'n-ps', 'n-answer', 'n-thanks', 'n-sync', 'a-home', 'a-feedback'];
// 로그인한 누구나(부서가 없어도). 한 사람이 하루 6번까지. 누가 보냈는지는 시트에 남기지 않는다
function sendSurvey_(body) {
  const w = who_(body), where = body.where === 'community' ? 'community' : body.where === 'note' ? 'note' : '', day = Number(body.day), spec = SURVEY_[day];
  if (!where || !spec) throw fail_('bad', '알 수 없는 설문이에요.');
  const cache = CacheService.getScriptCache(), key = 'sv:' + w.kakaoId + ':' + today_(), n = Number(cache.get(key) || 0);
  if (n >= 6) throw fail_('busy', '오늘은 충분히 보내 주셨어요. 내일 다시 보내 주세요.');
  const src = body.answers && typeof body.answers === 'object' ? body.answers : {}, ans = {};
  Object.keys(spec).forEach(k => {
    if (SURVEY_ONLY_[k] && SURVEY_ONLY_[k] !== where) return;
    const rule = spec[k], v = src[k];
    if (rule === 'text') { const t = typeof v === 'string' ? v.trim().slice(0, 200) : ''; if (t) ans[k] = t; }
    else if (Array.isArray(rule)) { if (rule.indexOf(v) >= 0) ans[k] = v; }
    else if (rule.multi) { if (Array.isArray(v)) { const l = rule.multi.filter(x => v.indexOf(x) >= 0); if (l.length) ans[k] = l; } }
    else if (rule.ueq) {
      const u = {};
      if (v && typeof v === 'object') for (let i = 1; i <= rule.ueq; i++) { const x = v[i]; if (typeof x === 'number' && x === Math.floor(x) && x >= 1 && x <= 7) u[i] = x; }
      if (Object.keys(u).length) ans[k] = u;
    }
  });
  if (!Object.keys(ans).length) throw fail_('bad', '답을 하나라도 골라 주세요.');
  // 숫자: 사용자가 켰을 때만 오고, 정해 둔 다섯 가지만. 기도 내용은 받는 칸이 없다
  let nums = '';
  if (body.nums && typeof body.nums === 'object') {
    const o = {};
    SURVEY_NUMS_.forEach(k => {
      const v = body.nums[k];
      if (k === 'app' || k === 'vault') { if (typeof v === 'boolean') o[k] = v; }
      else if (typeof v === 'number' && isFinite(v)) o[k] = Math.max(0, Math.min(99999, Math.round(v)));
    });
    if (Object.keys(o).length) nums = JSON.stringify(o);
  }
  // 해 본 일: 정해 둔 키만, 한 번씩. 켠 사람만 오므로 없으면 빈칸
  let pilot = '';
  if (Array.isArray(body.pilot)) { const l = SURVEY_PILOT_.filter(k => body.pilot.indexOf(k) >= 0); if (l.length) pilot = JSON.stringify(l); }
  let deptId = '';
  try { deptId = memberFrom_(w).deptId || ''; } catch (e) { /* 연결되지 않은 사람은 부서 없이 */ }
  cache.put(key, String(n + 1), 86400);
  append_('survey', { at: new Date(), where, day, answers: JSON.stringify(ans), nums, pilot, deptId, width: ['phone', 'tablet', 'pc'].indexOf(body.width) >= 0 ? body.width : '', ver: String(body.ver || '').slice(0, 20) });
  return { ok: true };
}
// 교회 전체 › 의견과 설문(전체 관리자): 몇째 날별 답 개수(합계만, 사람별 보기 없음)와 시범 해 본 일 항목별 사람 수, 글 답, 부서 없는 것까지 모든 의견, 표로 내려받을 줄들
function surveyAdmin_(body) {
  allAdmin_(body);
  const depts = read_('depts'), deptName = id => id ? ((depts.find(d => d.id === id) || {}).name || id) : '기도 노트(부서 없음)';
  const parse = t => { try { return JSON.parse(t || '{}') || {}; } catch (e) { return {}; } };
  const pilotKeys = t => { try { const l = JSON.parse(t || 'null'); return Array.isArray(l) ? l.filter(k => SURVEY_PILOT_.indexOf(k) >= 0) : null; } catch (e) { return null; } };
  const rows = read_('survey').slice().sort((a, b) => a.at < b.at ? 1 : -1).slice(0, 2000)
    .map(r => ({ at: fmtDate_(r.at), where: r.where, day: Number(r.day), a: parse(r.answers), nums: r.nums ? parse(r.nums) : null, pilot: pilotKeys(r.pilot), dept: deptName(r.deptId), width: r.width, ver: r.ver }));
  const byDay = {};
  [3, 7, 14].forEach(d => { byDay[d] = { n: 0, note: 0, community: 0, withNums: 0, q: {}, texts: [], pilot: { n: 0, items: {} } }; });
  rows.forEach(r => {
    const b = byDay[r.day]; if (!b) return;
    b.n++; b[r.where]++; if (r.nums) b.withNums++;
    // 시범 해 본 일: 켠 사람이 보낸 키 목록을 항목마다 센다(설문에는 보낸 사람 표시가 없어서 같은 사람이 3·7·14일째에 또 보내면 각 날의 숫자에 한 번씩 든다. 몇째 날별로 따로 센다)
    if (r.pilot) { b.pilot.n++; r.pilot.forEach(k => { b.pilot.items[k] = (b.pilot.items[k] || 0) + 1; }); }
    Object.keys(r.a).forEach(k => {
      const v = r.a[k];
      if (k === 'ueq') return; // UEQ-S는 아래에서 따로 계산
      if (typeof v === 'string' && SURVEY_[r.day][k] === 'text') b.texts.push({ at: r.at, where: r.where, k, text: v });
      else (Array.isArray(v) ? v : [v]).forEach(x => { const q = b.q[k] || (b.q[k] = {}); q[x] = (q[x] || 0) + 1; });
    });
  });
  // UEQ-S(공식 계산): 8문항을 모두 답한 사람만 센다. 답(1~7)에서 4를 빼 −3~+3으로 바꾸고, 실용성(1~4번)·감성(5~8번)·전체(8문항) 평균. 합계만, 사람별 값은 내보내지 않는다
  const full = rows.filter(r => r.day === 14 && r.a.ueq && Object.keys(r.a.ueq).length === 8), mean = (list, f) => list.length ? Math.round(list.reduce((a, r) => a + f(r), 0) / list.length * 100) / 100 : null;
  const item = i => mean(full, r => r.a.ueq[i] - 4), part = (from, to) => mean(full, r => { let t = 0; for (let i = from; i <= to; i++) t += r.a.ueq[i] - 4; return t / (to - from + 1); });
  byDay[14].ueq = { n: full.length, partial: rows.filter(r => r.day === 14 && r.a.ueq).length - full.length, pragmatic: part(1, 4), hedonic: part(5, 8), overall: part(1, 8), items: [1, 2, 3, 4, 5, 6, 7, 8].map(item) };
  const fams = read_('families');
  const feedback = read_('feedback').slice().sort((a, b) => a.at < b.at ? 1 : -1).slice(0, 2000).map(x => ({
    at: fmtDate_(x.at), kind: x.kind, text: x.text, dept: deptName(x.deptId), width: x.width, ver: x.ver,
    who: x.familyId ? whoOf_(fams.find(f => f.id === x.familyId), x.person) : x.person || '' }));
  return { total: rows.length, byDay, rows, feedback };
}

// 관리자: 우리 부서 의견, 새것부터 100개. 이름을 밝힌 의견에만 보낸 사람
function feedbackList_(c) {
  const fams = read_('families');
  return read_('feedback').filter(x => x.deptId === c.deptId).sort((a, b) => a.at < b.at ? 1 : -1).slice(0, 100).map(x => ({
    id: x.at, at: x.at, kind: x.kind, text: x.text, read: yes_(x.read),
    who: x.familyId ? whoOf_(fams.find(f => f.id === x.familyId), x.person) : '' }));
}
// 보낸 사람: 가정 이름에 그 사람 이름이 있으면 사람만, 아니면 사람 · 가정(가정을 지웠으면 사람만)
function whoOf_(f, person) {
  if (!f || f.status === '지움') return person || '';
  return String(f.name).split(' · ').indexOf(person) >= 0 ? person : (person ? person + ' · ' : '') + f.name;
}
function feedbackRead_(body) {
  const c = adminOf_(body);
  return withLock_(() => {
    const x = read_('feedback').find(f => f.deptId === c.deptId && f.at === String(body.id || ''));
    if (!x) throw fail_('bad', '의견을 찾지 못했어요.');
    x.read = body.read === false ? '' : '예'; update_('feedback', x);
    return opsView_(c);
  });
}

// ── 운영 관리자 (설계서 13장) ─────────────────────────────────
// 운영 관리자의 요청에는 기도제목 내용을 담지 않는다(화면에서 숨기는 것이 아니라 보내지 않는다). 쓰는 요청은 OPS_ACTIONS_만
function opsRows_(kakaoId) { return read_('opsAdmins').filter(o => String(o.kakaoId) === String(kakaoId) && o.status === '활동'); }
// 맡은 부서 [{ id, name }]과 교회 전체인지
function opsScope_(kakaoId) {
  const rows = opsRows_(kakaoId);
  if (!rows.length) return null;
  const all = rows.some(o => String(o.scope).trim() === '전체'), ids = {};
  rows.forEach(o => ids_(o.scope).forEach(id => { ids[id] = true; }));
  return { all, depts: depts_().filter(d => d.status !== '지움' && (all || (ids[d.id] && deptOpen_(d)))).map(d => ({ id: d.id, name: d.name, closed: !!d.status })) };
}
// 운영 관리자로 보낸 요청의 사람: body.ops가 맡은 부서여야 한다. 가정·소그룹이 없고, 관리자처럼 부서를 꾸린다
function opsOf_(body) {
  const a = auth_(body.token), sc = opsScope_(a.kakaoId), id = String(body.ops || '');
  if (!sc || !sc.depts.some(d => d.id === id)) throw fail_('forbidden', '맡은 부서가 아니에요.');
  const row = opsRows_(a.kakaoId)[0], d = deptById_(id);
  return { kakaoId: a.kakaoId, person: row.name || a.nick, familyId: '', roomId: '', deptId: d.id, dept: deptInfo_(d), role: '운영', admin: true, ops: true, all: sc.all };
}
// 운영 화면을 열 때: 부서, 소그룹 목록, 맡은 부서들. 이번 달 화면 대신 쓴다
function opsCtxView_(c) {
  const sc = opsScope_(c.kakaoId);
  return { month: month_(), term: termNow_(c.deptId), dept: c.dept, room: { id: '', name: c.dept.name }, families: [], serve: [],
    rooms: activeRooms_(c.deptId).sort((a, b) => a.order - b.order).map(r => ({ id: r.id, name: r.name })),
    me: { person: c.person, familyId: '', role: '운영', admin: true, ops: true, all: sc.all }, scope: sc.depts, opsList: opsList_(c) };
}
// 이 부서를 맡은 운영 관리자 목록(교회 전체를 맡은 사람 포함)과 아직 쓰지 않은 초대
function opsList_(c) {
  const isAll = o => String(o.scope).trim() === '전체';
  const live = read_('opsAdmins').filter(o => o.status === '활동' && (isAll(o) || ids_(o.scope).indexOf(c.deptId) >= 0));
  const wait = read_('opsAdmins').filter(o => o.status === '초대' && isAll(o) && Date.parse(o.at) > Date.now() - 7 * 864e5);
  return { live: live.map(o => ({ id: String(o.kakaoId), name: o.name, all: isAll(o), me: String(o.kakaoId) === c.kakaoId })),
    wait: wait.map(o => ({ token: o.token, at: fmtDay_(o.at) })) };
}
// 전체 관리자 초대(전체 관리자만): 일회용 링크, 7일 안에 한 번. 한 사람이 빠져도 멈추지 않게 둘 이상 두려고
function opsInvite_(body) {
  const c = allAdmin_(body);
  return withLock_(() => {
    const token = newToken_() + newToken_().slice(0, 4);
    append_('opsAdmins', { kakaoId: '', name: '', scope: '전체', status: '초대', token, at: new Date(), by: c.person });
    logChange_(c, '전체 관리자 초대', '');
    return { token, list: opsList_(c) };
  });
}
// 초대 링크로 들어온 사람: 로그인한 카카오 계정에 역할을 붙인다
function opsJoin_(body) {
  const w = who_(body), t = String(body.invite || '');
  return withLock_(() => {
    const row = read_('opsAdmins').find(o => o.token === t && o.status === '초대');
    if (!row || !(Date.parse(row.at) > Date.now() - 7 * 864e5)) throw fail_('bad', '쓸 수 없는 초대 링크예요. 새 링크를 받아 주세요.');
    const has = opsRows_(w.kakaoId).find(o => ids_(o.scope).indexOf(row.scope) >= 0 || String(o.scope).trim() === '전체');
    if (has) { row.status = '쓴 초대'; update_('opsAdmins', row); }
    else { Object.assign(row, { kakaoId: w.kakaoId, name: (w.link && w.link.person) || w.nick, status: '활동', token: '' }); update_('opsAdmins', row); }
    return meInfo_(who_(body));
  });
}
// 전체 관리자 빼기·초대 취소(전체 관리자만, 나는 뺄 수 없다)
function opsRemove_(body) {
  const c = allAdmin_(body);
  return withLock_(() => {
    const rows = read_('opsAdmins');
    const row = body.invite ? rows.find(o => o.token === String(body.invite) && o.status === '초대')
      : rows.find(o => String(o.kakaoId) === String(body.kakaoId) && o.status === '활동' && String(o.kakaoId) !== c.kakaoId);
    if (!row) throw fail_('bad', '뺄 수 있는 사람이 아니에요.');
    row.status = '마침'; update_('opsAdmins', row);
    logChange_(c, body.invite ? '전체 관리자 초대 취소' : '전체 관리자 뺌', body.invite ? '' : row.name);
    return opsList_(c);
  });
}
// 교회 전체(전체 관리자의 첫 화면): 부서마다 요약과 할 일 수, 앱 상태, 교회 안 모임, 전체 관리자. 기도제목은 없다
function churchView_(body) {
  const c = allAdmin_(body), m = month_(), p = props_();
  const fams = read_('families'), links = read_('links'), fb = read_('feedback');
  const list = read_('depts').filter(d => d.status !== '지움').sort((a, b) => a.order - b.order).map(d => {
    const cx = Object.assign({}, c, { deptId: d.id, dept: deptInfo_(d) }), rooms = activeRooms_(d.id).map(r => r.id);
    const ids = {}; read_('roster').filter(r => activeRow_(r) && rooms.indexOf(r.roomId) >= 0).forEach(r => { ids[r.familyId] = true; });
    activeStaff_(d.id).forEach(x => { ids[x.familyId] = true; });
    const people = fams.filter(f => ids[f.id] && (f.status === '활동' || f.status === '교역자'));
    const P = privacy_(cx);
    return { id: d.id, name: d.name, group: d.group || '사랑방', unit: d.unit === '개인' ? '개인' : '가정', closed: !!d.status, closedAt: d.closedAt ? String(d.closedAt).slice(0, 10) : '',
      rooms: rooms.length, n: people.length, linked: people.filter(f => links.some(l => l.familyId === f.id && l.status === '연결')).length,
      asks: links.filter(l => l.status === '요청' && ids[l.familyId]).length, privacy: P.due.length + P.requests.length,
      feedback: fb.filter(x => x.deptId === d.id && !yes_(x.read)).length, admins: people.filter(f => yes_(f.admin)).length };
  });
  trimLogs_();
  const errs = read_('errors').filter(e => Date.parse(e.at) > Date.now() - 7 * 864e5);
  return { depts: list, version: VERSION, month: { month: m, opened: p['OPENED_' + m] || '' }, errors: { n: errs.length, last: errs.length ? errs[errs.length - 1].at : '' },
    opsList: opsList_(c), handover: p['HANDOVER_church'] || '', inbox: { survey: read_('survey').length, feedback: fb.length, feedbackNoDept: fb.filter(x => !x.deptId).length } };
}
// 부서 만들기·고치기(교회 전체를 맡은 운영 관리자): 이름, 소그룹 이름, 단위(가정/개인)
function deptSave_(body) {
  const c = adminOf_(body);
  if (!c.ops || !c.all) throw fail_('forbidden', '전체 관리자만 부서를 만들어요.');
  const name = String(body.name || '').trim().slice(0, 12), group = String(body.group || '').trim(), unit = body.unit === '개인' ? '개인' : '가정';
  if (!name) throw fail_('bad', '부서 이름을 적어 주세요.');
  if (!/^[가-힣A-Za-z0-9]{1,6}$/.test(group)) throw fail_('bad', '소그룹 이름은 띄어쓰기 없이 6글자까지 써 주세요.');
  return withLock_(() => {
    const all = read_('depts');
    if (all.some(d => d.name === name)) throw fail_('bad', '같은 이름의 부서가 있어요.');
    let n = all.length + 1; while (all.some(d => d.id === 'D' + n)) n++;
    append_('depts', { id: 'D' + n, name, group, unit, order: all.reduce((a, d) => Math.max(a, Number(d.order) || 0), 0) + 1 });
    logChange_(c, '부서 만들기', name, group + ' · ' + unit);
    return { id: 'D' + n, me: meInfo_(who_(body)) };
  });
}

// ── 전체 관리자(범위 '전체'인 운영 지원): 부서 닫기·다시 열기·기록 모두 지우기 ─────────────
// 닫기: 첫 접속 목록에서 빠지고 그 부서 사람은 들어오지 못한다. 기록은 남아서 다시 열 수 있다.
//  닫은 부서 사람들은 닫은 달부터 1년이 지나면 개인정보 요청에 올라온다. 바로 지워야 하면 '기록 모두 지우기'(부서 이름을 그대로 써야 한다)
function allAdmin_(body) {
  const c = adminOf_(body);
  if (!c.ops || !c.all) throw fail_('forbidden', '전체 관리자만 할 수 있어요.');
  return c;
}
function deptState_(body, status) {
  const c = allAdmin_(body), id = String(body.deptId || '');
  return withLock_(() => {
    setup(); // 부서 탭 첫 줄에 늘어난 칸(상태, 닫은 날) 이름을 더한다
    const d = read_('depts').find(x => x.id === id && x.status !== '지움');
    if (!d) throw fail_('bad', '부서를 찾지 못했어요.');
    if (status && depts_().filter(x => x.id !== id && deptOpen_(x)).length === 0) throw fail_('bad', '하나뿐인 부서는 닫을 수 없어요.');
    d.status = status; d.closedAt = status ? today_() : ''; update_('depts', d);
    logChange_(Object.assign({}, c, { deptId: id }), status ? '부서 닫기' : '부서 다시 열기', d.name);
    return { me: meInfo_(who_(body)) };
  });
}
function deptErase_(body) {
  const c = allAdmin_(body), id = String(body.deptId || '');
  return withLock_(() => {
    const d = read_('depts').find(x => x.id === id);
    if (!d || d.status !== '닫음') throw fail_('bad', '닫은 부서만 기록을 지울 수 있어요.');
    if (String(body.name || '').trim() !== d.name) throw fail_('bad', '부서 이름이 맞지 않아요.');
    const ids = roomIdsOfDept_(id), cx = Object.assign({}, c, { deptId: id });
    const famIds = {};
    read_('roster').forEach(r => { if (ids.indexOf(r.roomId) >= 0) famIds[r.familyId] = true; });
    // 다른 부서로 옮겨 가서 지금 그 부서에 있는 가정은 지우지 않는다
    read_('roster').forEach(r => { if (activeRow_(r) && ids.indexOf(r.roomId) < 0) delete famIds[r.familyId]; });
    read_('staff').forEach(x => { if (x.deptId === id) famIds[x.familyId] = true; });
    let n = 0, items = 0;
    read_('families').filter(f => famIds[f.id] && f.status !== '지움').forEach(f => { items += eraseFam_(cx, f); n++; });
    d.status = '지움'; update_('depts', d);
    logChange_(cx, '부서 기록 모두 지움', d.name, n + '곳 · 기도제목 ' + items + '개');
    return { me: meInfo_(who_(body)), n };
  });
}

// 교회 전체 분석(전체 관리자): 부서를 합친 숫자와 부서 × 달 손봄·확인 비율(부서는 정해 둔 순서, 순위 없음), 기도하는 때, 기도 주제 흐름(숫자만),
//  앱 개선(교회 전체 사용기록). 이름·가정별 숫자·기도제목 내용은 없다. 닫은 부서는 빼고 센다
function churchAnalysis_(body) {
  const c = allAdmin_(body), m = month_(), months = [m];
  while (months.length < 6) months.unshift(prevMonth_(months[0]));
  const depts = depts_().filter(deptOpen_);
  const fams = read_('families'), live = id => (fams.find(f => f.id === id) || {}).status === '활동';
  const seen = {}, st = {}, mark = (f, mm) => { seen[f + '|' + mm] = true; };
  read_('visits').forEach(v => mark(v.familyId, v.month));
  read_('monthly').forEach(x => { st[x.familyId + '|' + x.month] = x.status; if (x.status !== 'same') mark(x.familyId, x.month); });
  read_('prayers').forEach(p => mark(p.by, fmtMonth_(p.at)));
  const done = (f, mm) => st[f + '|' + mm] === 'edited' || st[f + '|' + mm] === 'confirmed';
  const pct = (k, n) => n ? Math.round(k / n * 100) : null;
  const roster = read_('roster'), allRooms = [];
  // 부서마다 그달 편성의 활동 가정
  const per = depts.map(d => {
    const rooms = roomIdsOfDept_(d.id); allRooms.push.apply(allRooms, rooms);
    const rows = roster.filter(r => rooms.indexOf(r.roomId) >= 0 && live(r.familyId));
    const at = mm => rows.filter(r => rowIn_(r, mm)).map(r => r.familyId);
    return { d, at };
  });
  const famsAt = mm => per.reduce((a, x) => a.concat(x.at(mm)), []);
  const trend = months.map(mm => { const ids = famsAt(mm); return { month: mm, n: ids.length, visit: pct(ids.filter(f => seen[f + '|' + mm]).length, ids.length), edit: pct(ids.filter(f => done(f, mm)).length, ids.length) }; });
  const now = famsAt(m), inChurch = {}; per.forEach(x => x.at(m).forEach(f => { inChurch[f] = true; }));
  const prayers = read_('prayers');
  const day = 864e5, start = Date.parse(weekStart_() + 'T00:00:00Z') - 7 * 7 * day;
  const weeks = Array.from({ length: 8 }, (_, i) => { const dd = new Date(start + i * 7 * day); return { label: (dd.getUTCMonth() + 1) + '/' + dd.getUTCDate(), n: 0 }; });
  prayers.forEach(p => { const i = Math.floor((Date.parse(fmtDate_(p.at) + 'T00:00:00Z') - start) / (7 * day)); if (i >= 0 && i < 8) weeks[i].n++; });
  const since = Date.now() - 28 * day, time = Array.from({ length: 7 }, () => [0, 0, 0, 0, 0]);
  prayers.forEach(p => {
    const t = new Date(p.at).getTime(); if (!(t > since)) return;
    const k = new Date(t + 9 * 3600e3), h = k.getUTCHours();
    time[(k.getUTCDay() + 6) % 7][h >= 5 && h < 9 ? 0 : h >= 9 && h < 12 ? 1 : h >= 12 && h < 18 ? 2 : h >= 18 && h < 22 ? 3 : 4]++;
  });
  return {
    month: m, months, trend,
    now: { n: now.length, visit: now.filter(f => seen[f + '|' + m]).length, edit: now.filter(f => done(f, m)).length, day: Number(today_().slice(8)) },
    weeks, time,
    depts: per.map(x => ({ name: x.d.name, vals: months.map(mm => { const ids = x.at(mm); return pct(ids.filter(f => done(f, mm)).length, ids.length); }) })),
    topics: topicFlow_(c, allRooms),
    app: appStats_(m, seen)
  };
}

// ── 함께 기도해요(부서 기도제목) ─────────────────────────────────
// 교역자·부서 관리자·전체 관리자가 쓰는 부서의 이번 달 기도제목(수련회, 선교사님, 새가족, 아픈 성도 등). 회원의 이번 달 화면 '함께 기도해요'와
//  기도하기 › 하나님 나라 › 우리 교회 장에 나온다. 기도제목 시트에 가정ID 대신 'DEPT-부서ID'로 쌓고, 다음 달로 그대로 이어진다(마치기 전까지)
const togetherKey_ = deptId => 'DEPT-' + deptId;
function togetherItems_(deptId, withEnded) {
  if (!deptId) return [];
  const m = month_(), key = togetherKey_(deptId);
  ensureFamilies_([key], m, () => '');
  const all = read_('items').filter(i => i.month === m && i.familyId === key).sort((a, b) => a.order - b.order);
  const show = i => ({ id: i.id, target: i.target, text: i.text, isNew: !i.prevId && !yes_(i.same), by: i.editedBy, at: fmtDay_(i.editedAt) });
  return withEnded ? { list: all.filter(i => i.state !== '마침').map(show), ended: all.filter(i => i.state === '마침').map(show) } : all.filter(i => i.state !== '마침').map(show);
}
function togetherOf_(body) {
  if (body.ops) return opsOf_(body);
  const c = member_(body);
  if (!c.staff && !c.admin) throw fail_('forbidden', '교역자와 부서 관리자만 쓸 수 있어요.');
  return c;
}
// 쓰기·고치기: id가 있으면 고치기. 대상(선택, 10자)과 내용
function togetherSave_(body) {
  const c = togetherOf_(body), m = month_(), key = togetherKey_(c.deptId);
  const text = String(body.text || '').trim().slice(0, 300), target = String(body.target || '함께').trim().slice(0, 10) || '함께';
  if (!text) throw fail_('bad', '내용을 적어 주세요.');
  return withLock_(() => {
    togetherItems_(c.deptId);
    if (body.id) {
      const i = read_('items').find(x => x.id === body.id && x.familyId === key && x.month === m);
      if (!i) throw fail_('bad', '고칠 기도제목을 찾지 못했어요.');
      Object.assign(i, { text, target, same: '아니오', editedAt: new Date(), editedBy: c.person }); update_('items', i);
    } else {
      const order = read_('items').filter(x => x.familyId === key && x.month === m).reduce((a, x) => Math.max(a, Number(x.order) || 0), 0) + 1;
      append_('items', { id: newId_(), month: m, familyId: key, roomId: '', target, text, scope: 'dept', state: '이어짐', prevId: '', same: '아니오', order, editedAt: new Date(), editedBy: c.person });
      logChange_(c, '함께 기도해요 더하기', target);
    }
    return togetherItems_(c.deptId, true);
  });
}
// 마치기(end)·다시 이어가기(reopen)·지우기(delete)
function togetherState_(body) {
  const c = togetherOf_(body), m = month_(), key = togetherKey_(c.deptId);
  return withLock_(() => {
    const i = read_('items').find(x => x.id === body.id && x.familyId === key && x.month === m);
    if (!i) throw fail_('bad', '기도제목을 찾지 못했어요.');
    if (body.op === 'delete') remove_('items', i);
    else { i.state = body.op === 'reopen' ? '이어짐' : '마침'; i.editedAt = new Date(); i.editedBy = c.person; update_('items', i); }
    return togetherItems_(c.deptId, true);
  });
}

// ── 소그룹과 사람 (관리자·운영 관리자) ───────────────────────────
// 지금 편성의 소그룹마다 사람(가정)과 역할, 부서 관리자 여부, 연결된 사람 수. 기도제목은 없다
function rosterView_(c) {
  const fams = read_('families'), links = read_('links'), y = termNow_(c.deptId);
  const roster = read_('roster').filter(activeRow_);
  const ROLE = { 리더: 0, 코리더: 1, 회원: 2 };
  // 옮길 곳을 고르도록 쓰는 부서와 사랑방 이름(기도제목은 없다)
  const depts = depts_().filter(deptOpen_).map(d => ({ id: d.id, name: d.name, group: d.group || '사랑방', unit: d.unit === '개인' ? '개인' : '가정',
    rooms: activeRooms_(d.id).sort((a, b) => a.order - b.order).map(r => ({ id: r.id, name: r.name })) }));
  return { term: y, unit: c.dept.unit, depts, rooms: activeRooms_(c.deptId).sort((a, b) => a.order - b.order).map(r => ({ id: r.id, name: r.name, pilot: yes_(r.pilot),
    people: roster.filter(x => x.roomId === r.id).map(x => ({ x, f: fams.find(f => f.id === x.familyId) })).filter(o => o.f && o.f.status === '활동')
      .sort((a, b) => ROLE[a.x.role] - ROLE[b.x.role]).map(o => ({ id: o.f.id, name: o.f.name, role: o.x.role, admin: yes_(o.f.admin),
        linked: links.filter(l => l.familyId === o.f.id && l.status === '연결').length,
        links: links.filter(l => l.familyId === o.f.id && l.status === '연결').map(l => ({ kakaoId: String(l.kakaoId), person: l.person, nick: l.nick, since: fmtDay_(l.requestedAt), me: String(l.kakaoId) === c.kakaoId })) })) })) };
}
// 바꾸기: addRoom / renameRoom / pilotRoom(시범 중 켜기·끄기) / dropRoom(빈 소그룹만) / addPerson / move / role / admin / leave
function rosterSave_(body) {
  const c = adminOf_(body), d = c.deptId, op = String(body.op || '');
  return withLock_(() => {
    const y = termNow_(d), rooms = activeRooms_(d), roomOf = id => rooms.find(r => r.id === id);
    const rowOf = id => read_('roster').find(r => activeRow_(r) && r.familyId === id && roomOf(r.roomId));
    const famOf = id => read_('families').find(f => f.id === id);
    const clean = (v, n) => String(v || '').trim().replace(/\s+/g, ' ').slice(0, n);
    if (op === 'addRoom' || op === 'renameRoom') {
      const name = clean(body.name, 20);
      if (!name) throw fail_('bad', '이름을 적어 주세요.');
      if (rooms.some(r => r.name === name && r.id !== body.roomId)) throw fail_('bad', '같은 이름이 있어요.');
      if (op === 'addRoom') {
        const all = read_('rooms');
        append_('rooms', { id: 'R' + Date.now().toString(36), name, order: all.reduce((a, r) => Math.max(a, r.order), 0) + 1, deptId: d });
        logChange_(c, c.dept.group + ' 만들기', name);
      } else {
        const r = read_('rooms').find(x => x.id === body.roomId && roomOf(x.id));
        if (!r) throw fail_('bad', '찾지 못했어요.');
        logChange_(c, c.dept.group + ' 이름 바꾸기', r.name + ' → ' + name);
        r.name = name; update_('rooms', r);
      }
    } else if (op === 'pilotRoom') {
      // 시범 중: 켜면 이 사랑방 사람들에게 시범 "해 볼 일" 띠가 보인다(자기 부서 사랑방만)
      const r = read_('rooms').find(x => x.id === body.roomId && roomOf(x.id));
      if (!r) throw fail_('bad', '찾지 못했어요.');
      r.pilot = body.on ? '예' : ''; update_('rooms', r);
      logChange_(c, body.on ? '시범 중 켜기' : '시범 중 끄기', r.name);
    } else if (op === 'dropRoom') {
      const r = read_('rooms').find(x => x.id === body.roomId && roomOf(x.id));
      if (!r) throw fail_('bad', '찾지 못했어요.');
      if (read_('roster').some(x => x.roomId === r.id)) throw fail_('bad', '사람이 있었던 ' + c.dept.group + '은 지울 수 없어요. 사람을 모두 옮기면 다음 개편 때 빠져요.');
      remove_('rooms', r); logChange_(c, c.dept.group + ' 지우기', r.name);
    } else if (op === 'addPerson') {
      const r = roomOf(body.roomId), a = clean(body.a, 10), b = c.dept.unit === '개인' ? '' : clean(body.b, 10);
      if (!r || !a) throw fail_('bad', '이름과 ' + c.dept.group + '을 확인해 주세요.');
      const name = b ? a + ' · ' + b : a;
      const same = read_('roster').filter(x => activeRow_(x) && roomOf(x.roomId)).some(x => (famOf(x.familyId) || {}).name === name);
      if (same && !body.force) throw fail_('same', '같은 이름이 이미 있어요. 그래도 더할까요?');
      const id = 'F' + Date.now().toString(36);
      append_('families', { id, name, kids: '', status: '활동', admin: '' });
      append_('roster', { year: y, roomId: r.id, familyId: id, role: '회원' });
      logChange_(c, '사람 더하기', name, r.name);
    } else {
      const row = rowOf(String(body.familyId || '')), f = row && famOf(row.familyId);
      if (!row || !f) throw fail_('bad', '지금 편성에서 찾지 못했어요.');
      if (op === 'move') {
        const to = roomOf(body.roomId);
        if (!to) throw fail_('bad', c.dept.group + '을 골라 주세요.');
        logChange_(c, '옮기기', f.name, roomOf(row.roomId).name + ' → ' + to.name);
        row.roomId = to.id; update_('roster', row);
      } else if (op === 'role') {
        const role = ['리더', '코리더', '회원'].indexOf(body.role) >= 0 ? body.role : '회원';
        row.role = role; update_('roster', row); logChange_(c, '역할 지정', f.name, role);
      } else if (op === 'admin') {
        if (!body.on && f.id === c.familyId) throw fail_('bad', '내 관리자 표시는 여기서 뺄 수 없어요.');
        f.admin = body.on ? '예' : ''; update_('families', f); logChange_(c, body.on ? '부서 관리자 지정' : '부서 관리자 해제', f.name);
      } else if (op === 'unlink') {
        const l = read_('links').find(x => String(x.kakaoId) === String(body.kakaoId) && x.familyId === f.id && x.status === '연결');
        if (!l) throw fail_('bad', '연결을 찾지 못했어요.');
        if (String(l.kakaoId) === c.kakaoId) throw fail_('bad', '내 연결은 여기서 해제할 수 없어요.');
        l.status = '해제'; l.approvedBy = c.person; update_('links', l);
        logChange_(c, '연결 해제', f.name + ' · ' + l.person);
      } else if (op === 'leave') {
        if (f.id === c.familyId) throw fail_('bad', '우리 가정은 여기서 뺄 수 없어요.');
        remove_('roster', row); logChange_(c, '떠남', f.name, roomOf(row.roomId).name);
      } else throw fail_('bad', '모르는 일이에요.');
    }
    return rosterView_(c);
  });
}

// ── 결혼해서 가정 합치기 · 다른 부서로 옮기기 (설계서 6장, 2026-10-20) ─────────────────
// 관리자가 두 분(또는 옮길 가정)께 직접 확인하고 처리한다. 합친 달·옮긴 달부터 바로 새 자리로 쓰고, 지난 달 기록은 옛 자리에 그대로 남는다.
//  편성 줄의 들어온 달(from)·나간 달(to)이 그 경계다. 옛 가정은 상태 '합침'으로 남고(합친 가정ID·합친 달), 되돌리기는 그달 안에서만 된다.
//  다른 부서의 사람은 이 일에서만 이름·연결 닉네임을 보고 기도제목 내용은 보지 않는다(deptFind)
// 이 가정으로 합쳐진 옛 가정들(합침)
function oldOf_(familyId) { return read_('families').filter(f => f.mergedInto === familyId && f.status === '합침'); }
// 내 카카오 번호로 '합침'이 된 연결이 가리키는 옛 가정ID들(결혼 전 내가 주인이었던 가정)
function beforeIds_(kakaoId) {
  const ids = {};
  read_('links').filter(l => String(l.kakaoId) === String(kakaoId) && l.status === '합침').forEach(l => { ids[l.familyId] = true; });
  return Object.keys(ids);
}
// 결혼 전 기록: 내가 주인이었던 옛 가정의 달마다 기도제목(읽기만). 배우자의 옛 가정은 내 연결에 없으니 주지 않는다
function beforeMarriage_(c) {
  const fams = read_('families'), items = read_('items');
  return { before: beforeIds_(c.kakaoId).map(id => {
    const f = fams.find(x => x.id === id); if (!f || f.status === '지움') return null;
    const by = {};
    items.filter(i => i.familyId === id && i.text !== '').forEach(i => { (by[i.month] = by[i.month] || []).push(i); });
    return { name: f.name, months: Object.keys(by).sort().reverse().map(mm => ({ month: mm,
      items: by[mm].sort((a, b) => a.order - b.order).map(i => ({ target: i.target, text: i.text, scope: i.scope, ended: i.state === '마침' })) })) };
  }).filter(Boolean) };
}
// 새 가정(합친 달이 이번 달이거나 지난 14일 안)과 옮겨 온 가정(옮긴 달이 이번 달이거나 지난 14일 안)에게 처음 한 번 보여 줄 안내
function newsOfFamily_(familyId) {
  const m = month_(), recent = x => !!x && (x === m || (x === prevMonth_(m) && Number(today_().slice(8)) <= 14));
  const out = {}, rows = read_('roster').filter(r => r.familyId === familyId);
  const merged = read_('families').filter(f => f.mergedInto === familyId && recent(f.mergedAt))[0];
  if (merged) out.married = { at: merged.mergedAt };
  const now = rows.find(r => r.from && recent(r.from) && activeRow_(r));
  const gone = now && rows.find(r => r.to === now.from && deptOfRoom_(r.roomId).id !== deptOfRoom_(now.roomId).id);
  if (gone) out.moved = { at: now.from, dept: deptOfRoom_(gone.roomId).name };
  return out.married || out.moved ? out : undefined;
}
// 받는 부서의 관리자이거나 전체 관리자만
function canReceive_(c, deptId) { return c.deptId === deptId || !!(c.ops && c.all); }
// 변경 기록 줄의 [되돌리기]: '' / 'marry' / 'move'. 그달 안에서, 받는 부서 관리자와 전체 관리자에게만
function undoable_(c, x) {
  if (!x.ref || fmtMonth_(x.at) !== month_() || (x.kind !== '결혼 처리' && x.kind !== '부서 옮김')) return '';
  if (!(c.ops && c.all) && c.deptId !== x.deptId) return '';
  const m = month_();
  if (x.kind === '결혼 처리') {
    const nf = read_('families').find(f => f.id === x.ref), row = read_('roster').find(r => r.familyId === x.ref && activeRow_(r));
    return nf && nf.status === '활동' && row && deptOfRoom_(row.roomId).id === x.deptId && oldOf_(x.ref).some(o => o.mergedAt === m) ? 'marry' : '';
  }
  const rows = read_('roster').filter(r => r.familyId === x.ref);
  const now = rows.find(r => activeRow_(r) && r.from === m), gone = rows.find(r => r.to === m);
  return now && gone && deptOfRoom_(now.roomId).id === x.deptId ? 'move' : '';
}

// 이름으로 사람 찾기(다른 부서 포함). 이름·부서·소그룹·연결 닉네임만, 기도제목은 없다
function deptFind_(body) {
  adminOf_(body);
  const q = String(body.q || '').replace(/\s+/g, '');
  if (!q) return { list: [] };
  const fams = read_('families'), links = read_('links'), rooms = read_('rooms'), open = depts_().filter(deptOpen_);
  const list = [];
  read_('roster').filter(activeRow_).forEach(r => {
    const f = fams.find(x => x.id === r.familyId);
    if (!f || f.status !== '활동' || !String(f.name).split(' · ').some(n => n.replace(/\s+/g, '').indexOf(q) >= 0)) return;
    const d = deptOfRoom_(r.roomId), room = rooms.find(x => x.id === r.roomId) || {};
    if (!open.some(x => x.id === d.id)) return;
    list.push({ id: f.id, name: f.name, deptId: d.id, dept: d.name, unit: d.unit === '개인' ? '개인' : '가정', group: d.group || '사랑방', roomId: room.id, room: room.name || '', role: r.role,
      links: links.filter(l => l.familyId === f.id && l.status === '연결').map(l => ({ kakaoId: String(l.kakaoId), nick: l.nick, person: l.person })) });
  });
  return { list: list.slice(0, 20) };
}

// 합치기에 쓸 옛 가정 하나: 가정과 지금 편성 줄(합침·떠남·지움·승인 대기는 고를 수 없다)
function marryOld_(id) {
  const f = read_('families').find(x => x.id === id), row = f && read_('roster').find(r => activeRow_(r) && r.familyId === id);
  if (!f || f.status !== '활동' || !row) throw fail_('bad', '합칠 수 없는 가정이 있어요. 이미 합쳤거나 떠난 가정, 승인을 기다리는 가정은 고를 수 없어요.');
  return { f, row };
}

// 되돌리기 전에 지워지는 기도제목 개수를 알려 준다
function marryPreview_(body) {
  adminOf_(body);
  const id = String(body.familyId || ''), nf = read_('families').find(f => f.id === id);
  if (!nf || nf.status !== '활동' || !oldOf_(id).length) throw fail_('bad', '되돌릴 수 있는 결혼 처리가 아니에요.');
  return { name: nf.name, items: read_('items').filter(i => i.familyId === id && i.text !== '').length };
}

// 합치기. body: { famIds: [첫째, 둘째] 또는 [첫째] + newPerson(앱에 없는 배우자 이름), name(새 가정 이름), roomId(새 가정이 들어갈 사랑방),
//  confirmed(두 분께 직접 확인), inherit(리더·코리더·관리자 이어받기), carry(이번 달 기도제목 이어받기), links: [{ kakaoId, to(새 가정의 어느 이름, 비우면 해제) }] }
function marrySave_(body) {
  const c = adminOf_(body), clean = (v, n) => String(v || '').trim().replace(/\s+/g, ' ').slice(0, n);
  const ids = (Array.isArray(body.famIds) ? body.famIds : []).map(String).filter(Boolean), newPerson = clean(body.newPerson, 10), name = clean(body.name, 40);
  if (!body.confirmed) throw fail_('bad', '두 분께 직접 확인했다고 눌러야 합칠 수 있어요.');
  if (!name) throw fail_('bad', '새 가정 이름을 적어 주세요.');
  if (ids.length !== (newPerson ? 1 : 2) || (ids.length === 2 && ids[0] === ids[1])) throw fail_('bad', '합칠 두 사람을 다시 골라 주세요.');
  return withLock_(() => {
    const m = month_(), room = read_('rooms').find(r => r.id === body.roomId), dept = room && deptOfRoom_(room.id);
    if (!room || !deptOpen_(dept) || !activeRooms_(dept.id).some(r => r.id === room.id)) throw fail_('bad', '새 가정이 들어갈 사랑방을 골라 주세요.');
    if (dept.unit === '개인') throw fail_('bad', '합친 가정은 가정 단위 부서(청장년부 등)에 들어가요.');
    if (!canReceive_(c, dept.id)) throw fail_('forbidden', '새 가정이 들어가는 부서의 관리자가 합칠 수 있어요.');
    const olds = ids.map(marryOld_), names = name.split(' · ').map(x => x.trim());
    const ownIn = ids.indexOf(c.familyId) >= 0;
    // 연결: 새 가정의 이름으로 옮기거나(합침) 옮기지 않고 해제. 요청 중인 것은 해제한다
    const links = read_('links').filter(l => ids.indexOf(l.familyId) >= 0 && (l.status === '연결' || l.status === '요청'));
    const plan = links.map(l => {
      const pick = (body.links || []).find(x => String(x.kakaoId) === String(l.kakaoId)), to = clean(pick ? pick.to : l.person, 10);
      return { l, was: l.status, to: l.status === '연결' && names.indexOf(to) >= 0 ? to : '' };
    });
    if (ownIn && !plan.some(p => p.to && String(p.l.kakaoId) === c.kakaoId)) throw fail_('bad', '내 연결은 새 가정으로 옮겨야 해요. 새 가정 이름에 내 이름이 있는지 확인해 주세요.');
    const rank = { 리더: 2, 코리더: 1, 회원: 0 };
    const sameRoom = olds.filter(o => o.row.roomId === room.id);
    const role = body.inherit === false ? '회원' : sameRoom.reduce((a, o) => rank[o.row.role] > rank[a] ? o.row.role : a, '회원');
    const admin = olds.some(o => yes_(o.f.admin)) && (body.inherit !== false || ownIn);
    const id = 'F' + Date.now().toString(36);
    // 새 가정과 새 가정의 편성 줄(합친 달부터)
    append_('families', { id, name, kids: '', status: '활동', admin: admin ? '예' : '' });
    append_('roster', { year: termNow_(dept.id), roomId: room.id, familyId: id, role, from: m });
    // 옛 가정 '합침', 옛 편성 줄은 합친 달부터 빠진다(지난 달은 그대로)
    olds.forEach(o => {
      Object.assign(o.f, { status: '합침', mergedInto: id, mergedAt: m }); update_('families', o.f);
      o.row.to = m; update_('roster', o.row);
    });
    // 연결 옮김
    let moved = 0, dropped = 0;
    plan.forEach(p => {
      if (p.to) {
        append_('links', { kakaoId: p.l.kakaoId, nick: p.l.nick, familyId: id, person: p.to, status: '연결', requestedAt: today_(), approvedBy: '결혼 처리 · ' + c.person, lastSeen: p.l.lastSeen });
        p.l.status = '합침'; update_('links', p.l); moved++;
      } else {
        p.l.status = '해제'; p.l.approvedBy = c.person; update_('links', p.l);
        if (p.was === '연결') { dropped++; logChange_(c, '연결 해제', olds.map(o => o.f.name).join(' + '), p.l.person); }
      }
    });
    // 다음 편성 예약이 있으면 옛 가정 줄을 새 가정 한 줄로
    const futures = [];
    olds.forEach(o => read_('roster').filter(r => r.familyId === o.f.id && Number(r.year) > Number(termNow_(deptOfRoom_(r.roomId).id))).forEach(r => futures.push(r)));
    let planFixed = false;
    if (futures.length) {
      const inNew = futures.filter(r => deptOfRoom_(r.roomId).id === dept.id), pick = inNew.find(r => r.roomId === room.id) || inNew[0];
      futures.sort((a, b) => b._row - a._row).forEach(r => remove_('roster', r));
      if (pick) append_('roster', { year: pick.year, roomId: pick.roomId, familyId: id, role: body.inherit === false ? '회원' : pick.role });
      planFixed = true;
    }
    // 이번 달 기도제목 이어받기: 마치지 않은 '사랑방 공개'·'리더·목사님' 항목만. '우리 가정만'은 복사하지 않는다.
    //  이번 달 항목이 아직 없으면(아직 지난달에서 넘어오지 않았으면) 지난달 마치지 않은 항목을 본다
    let carried = 0;
    if (body.carry !== false) {
      const all = read_('items'), now = new Date();
      olds.forEach(o => {
        const mine = all.filter(i => i.familyId === o.f.id), cur = mine.filter(i => i.month === m);
        (cur.length ? cur : mine.filter(i => i.month === prevMonth_(m))).filter(i => i.state !== '마침' && (i.scope === 'room' || i.scope === 'leader') && i.text !== '')
          .sort((a, b) => a.order - b.order).forEach(i => {
            append_('items', { id: newId_(), month: m, familyId: id, roomId: room.id, target: i.target, text: i.text, scope: i.scope, state: '이어짐', prevId: '', same: '아니오', order: ++carried, editedAt: now, editedBy: i.editedBy });
          });
      });
    }
    // 변경 기록: 새 가정이 들어가는 부서와, 옛 가정이 있던 다른 부서에 남긴다
    const extra = room.name + ' · 연결 ' + moved + '명 옮김' + (dropped ? ' · 연결 ' + dropped + '명 해제' : '') + ' · 이번 달 기도제목 ' + carried + '개 이어받음' + (planFixed ? ' · 다음 편성 예약 고침' : '');
    const target = olds.map(o => o.f.name).join(' + ') + ' → ' + name;
    const seen = {};
    [dept.id, c.deptId].concat(olds.map(o => deptOfRoom_(o.row.roomId).id)).forEach(d => {
      if (seen[d]) return; seen[d] = true;
      logChange_(c, '결혼 처리', target, extra, id, d);
    });
    return rosterView_(c);
  });
}

// 합치기 되돌리기(합친 달 안에서만): 옛 가정은 '활동', 옛 연결은 '연결', 새 연결은 '해제', 새 가정의 편성 줄과 기도제목은 지우고 새 가정은 '취소'
function marryUndo_(body) {
  const c = adminOf_(body), id = String(body.familyId || '');
  return withLock_(() => {
    const m = month_(), nf = read_('families').find(f => f.id === id), olds = oldOf_(id).filter(o => o.mergedAt === m);
    const row = read_('roster').find(r => r.familyId === id && activeRow_(r));
    if (!nf || nf.status !== '활동' || !row || !olds.length) throw fail_('bad', '되돌릴 수 없어요. 합친 달이 지났거나 이미 되돌렸어요.');
    const dept = deptOfRoom_(row.roomId);
    if (!canReceive_(c, dept.id)) throw fail_('forbidden', '새 가정이 들어간 부서의 관리자가 되돌릴 수 있어요.');
    const oldIds = olds.map(o => o.id);
    olds.forEach(o => { Object.assign(o, { status: '활동', mergedInto: '', mergedAt: '' }); update_('families', o); });
    read_('roster').filter(r => oldIds.indexOf(r.familyId) >= 0 && r.to === m).forEach(r => { r.to = ''; update_('roster', r); });
    read_('links').filter(l => oldIds.indexOf(l.familyId) >= 0 && l.status === '합침').forEach(l => { l.status = '연결'; update_('links', l); });
    read_('links').filter(l => l.familyId === id && l.status !== '해제').forEach(l => { l.status = '해제'; update_('links', l); });
    const gone = read_('items').filter(i => i.familyId === id);
    const n = gone.filter(i => i.text !== '').length;
    gone.sort((a, b) => b._row - a._row).forEach(i => remove_('items', i));
    read_('monthly').filter(x => x.familyId === id).sort((a, b) => b._row - a._row).forEach(x => remove_('monthly', x));
    read_('roster').filter(r => r.familyId === id).sort((a, b) => b._row - a._row).forEach(r => remove_('roster', r));
    nf.status = '취소'; nf.admin = ''; update_('families', nf);
    const seen = {};
    [dept.id, c.deptId].forEach(d => { if (!seen[d]) { seen[d] = true; logChange_(c, '결혼 처리 되돌림', nf.name, '지운 기도제목 ' + n + '개', '', d); } });
    return rosterView_(c);
  });
}

// 다른 부서의 사랑방으로 옮기기(결혼과 상관없이). body: { familyId, roomId(받는 사랑방), confirmed }
//  가정ID와 카카오 연결은 그대로, 옛 부서의 지난 달 기록은 옛 사랑방에 그대로 남고, 옮긴 달부터 새 사랑방이다(이번 달 기도제목도 새 사랑방에서 보인다).
//  옛 부서의 리더·관리자 역할은 끝난다. 개인 단위 부서 → 가정 단위 부서면 1인 가정(이름은 본인 이름, 자녀 칸 비움)
function moveDept_(body) {
  const c = adminOf_(body), id = String(body.familyId || '');
  if (!body.confirmed) throw fail_('bad', '직접 확인했다고 눌러야 옮길 수 있어요.');
  return withLock_(() => {
    const m = month_(), f = read_('families').find(x => x.id === id), row = f && read_('roster').find(r => activeRow_(r) && r.familyId === id);
    if (!f || f.status !== '활동' || !row) throw fail_('bad', '옮길 수 없는 가정이에요.');
    const room = read_('rooms').find(r => r.id === body.roomId), to = room && deptOfRoom_(room.id), from = deptOfRoom_(row.roomId);
    if (!room || !deptOpen_(to) || !activeRooms_(to.id).some(r => r.id === room.id)) throw fail_('bad', '받는 사랑방을 골라 주세요.');
    if (to.id === from.id) throw fail_('bad', '같은 부서 안에서는 사랑방 옮기기를 써 주세요.');
    if (!canReceive_(c, to.id)) throw fail_('forbidden', '받는 부서의 관리자가 옮길 수 있어요.');
    if (f.id === c.familyId) throw fail_('bad', '내 가정은 여기서 다른 부서로 옮길 수 없어요. 다른 관리자에게 부탁해 주세요.');
    if (from.unit !== '개인' && to.unit === '개인') throw fail_('bad', '가정 단위 부서에서 개인 단위 부서로는 옮길 수 없어요.');
    // 옛 줄은 옮긴 달부터 빠지고, 새 줄은 옮긴 달부터. 옛 부서의 리더·관리자 역할은 끝난다
    row.to = m; update_('roster', row);
    append_('roster', { year: termNow_(to.id), roomId: room.id, familyId: id, role: '회원', from: m });
    if (yes_(f.admin)) { f.admin = ''; update_('families', f); }
    read_('items').filter(i => i.familyId === id && i.month === m).forEach(i => { i.roomId = room.id; update_('items', i); });
    // 옛 부서의 다음 편성 예약에 든 줄은 뺀다(받는 부서의 예약에는 개편 마법사에서 넣는다)
    const next = read_('roster').filter(r => r.familyId === id && Number(r.year) > Number(termNow_(from.id)) && deptOfRoom_(r.roomId).id === from.id);
    next.sort((a, b) => b._row - a._row).forEach(r => remove_('roster', r));
    const fromRoom = (read_('rooms').find(r => r.id === row.roomId) || {}).name || '';
    const seen = {};
    [to.id, from.id, c.deptId].forEach(d => {
      if (seen[d]) return; seen[d] = true;
      logChange_(c, '부서 옮김', f.name, from.name + ' ' + fromRoom + ' → ' + to.name + ' ' + room.name + (next.length ? ' · 옛 부서 다음 편성 예약에서 뺌' : ''), id, d);
    });
    return rosterView_(c);
  });
}

// 부서 옮기기 되돌리기(옮긴 달 안에서만): 새 줄을 지우고 옛 줄을 되살린다. 옛 부서의 다음 편성 예약에서 뺀 줄은 다시 넣어 주지 않는다
function moveUndo_(body) {
  const c = adminOf_(body), id = String(body.familyId || '');
  return withLock_(() => {
    const m = month_(), rows = read_('roster').filter(r => r.familyId === id), now = rows.find(r => activeRow_(r) && r.from === m), gone = rows.find(r => r.to === m);
    const f = read_('families').find(x => x.id === id);
    if (!f || !now || !gone || deptOfRoom_(now.roomId).id === deptOfRoom_(gone.roomId).id) throw fail_('bad', '되돌릴 수 없어요. 옮긴 달이 지났거나 이미 되돌렸어요.');
    if (!canReceive_(c, deptOfRoom_(now.roomId).id)) throw fail_('forbidden', '받는 부서의 관리자가 되돌릴 수 있어요.');
    gone.to = ''; update_('roster', gone);
    remove_('roster', now);
    read_('items').filter(i => i.familyId === id && i.month === m).forEach(i => { i.roomId = gone.roomId; update_('items', i); });
    logChange_(c, '부서 옮김 되돌림', f.name, deptOfRoom_(gone.roomId).name + '으로 돌아감');
    return rosterView_(c);
  });
}

// ── 자율 모임 (설계서 13장, 2026-10-23) ─────────────────────────
// 카카오로 로그인한 누구나 만든다(2026-10-21, 기도 노트의 '내 모임'으로 옮기며). 모임장의 초대 링크로 들어오고 모임장이 승인한다.
//  교회에 연결되지 않은 사람은 모임에서 쓸 이름을 적는다. 관리 화면에는 나오지 않고, 전체 관리자는 문제가 있을 때 초대 링크로 그 모임 하나만 닫는다.
//  모임은 끝나는 날(endsAt, 최대 1년)이 있고, 지나면 모임과 기록을 모두 지운다. 늘리기는 없다. 남기고 싶은 기도제목은 그동안 내 기도 노트로 옮긴다(groupExport)
//  모임은 개인 단위라 사람마다 모임 사람ID가 있고, 이번 달·내 기도·기도하기는 사랑방과 같은 화면을 모임 것으로 쓴다
const GROUP_SCOPES = ['room', 'family'];
const GROUP_MAX = 12, PLACES_MAX = 3, GROUP_MONTHS = [1, 3, 6, 12], GROUP_WARN_DAYS = [30, 7], GROUP_ERASE_MAX = 20;
const GROUP_DEPT = { id: '', name: '모임', group: '모임', unit: '개인' };
function groupPeople_(gid, all) { return read_('gmembers').filter(m => m.groupId === gid && (all ? m.status !== '나감' : m.status === '함께')); }
// 끝나는 날(yyyy-MM-dd). k개월 뒤, 그 달에 같은 날이 없으면 그 달 마지막 날
function addMonths_(day, k) {
  const [y, m, d] = day.split('-').map(Number), t = y * 12 + m - 1 + k, yy = Math.floor(t / 12), mm = t % 12 + 1;
  const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  return yy + '-' + String(mm).padStart(2, '0') + '-' + String(Math.min(d, last)).padStart(2, '0');
}
const dayNum_ = day => Math.round(Date.parse(day + 'T00:00:00Z') / 864e5);
// 남은 날: 끝나는 날 당일은 0(그날까지 쓰고, 다음 날 지워진다)
const daysLeft_ = g => g.endsAt ? dayNum_(g.endsAt) - dayNum_(today_()) : null;
// 쓸 수 있는 모임: 활동 중이고 끝나는 날이 지나지 않았다(아직 끝나는 날이 없는 예전 모임은 다음 정리에서 채워질 때까지 쓴다)
const groupLive_ = g => g.status === '활동' && (!g.endsAt || daysLeft_(g) >= 0);
// 내가 속한(또는 신청한) 모임
function myGroups_(kakaoId) {
  const gs = read_('groups').filter(groupLive_);
  return read_('gmembers').filter(m => String(m.kakaoId) === String(kakaoId) && (m.status === '함께' || m.status === '요청')).map(m => {
    const g = gs.find(x => x.id === m.groupId); if (!g) return null;
    return { id: g.id, name: g.name, role: m.role, wait: m.status === '요청', n: groupPeople_(g.id).length, endsAt: g.endsAt || '', left: daysLeft_(g),
      asks: m.role === '모임장' ? groupPeople_(g.id, true).filter(x => x.status === '요청').length : 0 };
  }).filter(Boolean);
}
// 속한 곳 수: 원래 소그룹(연결돼 있으면 1) + 모임(함께·요청)
function placesOf_(w) { return (w.link && w.link.status === '연결' ? 1 : 0) + myGroups_(w.kakaoId).length; }
// 모임으로 보낸 요청의 사람: 그 모임에 '함께'인 사람
function groupMember_(body) {
  const w = who_(body), gid = String(body.grp || '');
  const g = read_('groups').find(x => x.id === gid && groupLive_(x));
  const m = g && read_('gmembers').find(x => x.groupId === gid && String(x.kakaoId) === w.kakaoId && x.status === '함께');
  if (!m) throw fail_('forbidden', '이 모임에 함께하고 있지 않아요.');
  return { kakaoId: w.kakaoId, person: m.person, familyId: m.id, family: { id: m.id, name: m.person, kids: '' }, roomId: g.id, deptId: '',
    dept: Object.assign({}, GROUP_DEPT, { name: g.name }), role: m.role, admin: false, grp: g.id, group: g };
}
// 모임의 이번 달: 사랑방의 이번 달과 같은 모양(모임 사람이 한 사람씩 카드)
function groupMonthView_(c) {
  const m = month_(), people = groupPeople_(c.grp);
  ensureFamilies_(people.map(p => p.id), m, () => c.grp);
  const items = read_('items').filter(i => i.month === m && i.roomId === c.grp && i.state !== '마침');
  const monthly = read_('monthly').filter(x => x.month === m);
  const mineAll = read_('prayers').filter(p => p.kakaoId === c.kakaoId), prayed = mineAll.filter(p => fmtMonth_(p.at) === m);
  const wk = weekStart_(), weekP = mineAll.filter(p => fmtDate_(p.at) >= wk);
  const families = people.map(p => {
    const own = p.id === c.familyId, st = monthly.find(x => x.familyId === p.id);
    return { id: p.id, name: p.person, kids: [], own, status: st ? st.status : 'same', role: p.role,
      prayed: prayed.filter(x => x.familyId === p.id).length, today: prayed.filter(x => x.familyId === p.id && fmtDate_(x.at) === today_()).length,
      week: weekP.filter(x => x.familyId === p.id).length,
      items: items.filter(i => i.familyId === p.id && (own || i.scope === 'room')).sort((a, b) => a.order - b.order)
        .map(i => ({ id: i.id, target: i.target, text: i.text, scope: i.scope, same: yes_(i.same), isNew: !i.prevId && !yes_(i.same), editedBy: own ? i.editedBy : '', editedAt: own ? fmtDay_(i.editedAt) : '' })),
      ended: own ? read_('items').filter(i => i.month === m && i.familyId === p.id && i.state === '마침').map(i => ({ id: i.id, target: i.target, text: i.text, scope: i.scope })) : [] };
  }).sort((a, b) => b.own - a.own);
  const by = {}; read_('prayers').forEach(p => { if (p.familyId === c.familyId && p.kakaoId !== c.kakaoId && fmtMonth_(p.at) === m) by[p.kakaoId || p.by] = true; });
  return { month: m, term: m.slice(0, 4), dept: c.dept, room: { id: c.grp, name: c.group.name }, group: groupInfo_(c),
    me: { person: c.person, familyId: c.familyId, role: c.role, admin: false, grp: c.grp }, families, received: { n: Object.keys(by).length, of: Math.max(0, families.length - 1) }, serve: [],
    art: artNums_(c, [m])[0], weave: weave_(c) };
}
// 함께 짜는 그물(모임 화면): 모임 사람끼리 서로를 위해 기도한 기록을 모임 만든 날부터 세어, 사람 쌍마다 실 한 가닥(방향 없이)으로 돌려준다.
//  말뚝(사람)은 이름도 사람ID도 없이 번호(0~n-1)만 준다. 내 말뚝이 몇 번인지도 주지 않는다. 번호는 들어온 순서로 줄 세운 뒤 모임 id로 섞어서, 모임마다 늘 같다.
//  밝기 1~3: 둘 사이 기도가 1~2번이면 1, 3~5번이면 2, 6번 이상이면 3. fresh: 오늘 처음 생긴 실. 나간 사람의 말뚝은 남고(기도로 이어졌던 사람만) 실은 더 걸리지 않는다.
const WEAVE_MAX = 20;
function weaveShuffle_(list, seed) {
  let h = 2166136261; for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  const a = list.slice(); let x = h >>> 0;
  for (let i = a.length - 1; i > 0; i--) { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; const j = x % (i + 1); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}
function weave_(c) {
  const g = c.group, since = g.at ? fmtDate_(g.at) : '', today = today_();
  const mem = read_('gmembers').filter(m => m.groupId === g.id && (m.status === '함께' || m.status === '나감')), ids = {};
  mem.forEach(m => { ids[m.id] = true; });
  const pair = {};   // 'a|b' → { id들, 횟수, 처음 날 }
  read_('prayers').forEach(p => {
    if (!ids[p.by] || !ids[p.familyId] || p.by === p.familyId) return;
    const d = fmtDate_(p.at); if (since && d < since) return;
    const k = p.by < p.familyId ? p.by + '|' + p.familyId : p.familyId + '|' + p.by, o = pair[k] || (pair[k] = { a: p.by < p.familyId ? p.by : p.familyId, b: p.by < p.familyId ? p.familyId : p.by, n: 0, first: d });
    o.n++; if (d < o.first) o.first = d;
  });
  const linked = {}; Object.keys(pair).forEach(k => { linked[pair[k].a] = true; linked[pair[k].b] = true; });
  // 함께하는 사람은 모두, 나간 사람은 기도로 이어졌던 경우에만 말뚝으로 둔다(많으면 이어진 실이 적은 나간 사람부터 뺀다)
  let keep = mem.filter(m => m.status === '함께' || linked[m.id]).sort((x, y) => (+new Date(x.at) - +new Date(y.at)) || (x.id < y.id ? -1 : 1));
  if (keep.length > WEAVE_MAX) { const gone = keep.filter(m => m.status !== '함께'); keep = keep.filter(m => m.status === '함께').concat(gone).slice(0, WEAVE_MAX).sort((x, y) => (+new Date(x.at) - +new Date(y.at)) || (x.id < y.id ? -1 : 1)); }
  const order = weaveShuffle_(keep.map(m => m.id), g.id), at = {}; order.forEach((id, i) => { at[id] = i; });
  const pairs = [], fresh = [];
  Object.keys(pair).forEach(k => {
    const o = pair[k]; if (at[o.a] == null || at[o.b] == null) return;
    pairs.push([at[o.a], at[o.b], o.n >= 6 ? 3 : o.n >= 3 ? 2 : 1]); if (o.first === today) fresh.push([at[o.a], at[o.b]]);
  });
  pairs.sort((x, y) => (x[0] - y[0]) || (x[1] - y[1]));
  return { id: g.id, name: g.name, from: since, to: g.endsAt || '', n: order.length, pairs, fresh };
}
// 모임의 지난 기록: 그 모임에 쓰인 달들, 모임 공개 항목과 내 것
function groupHistory_(c, want) {
  const items = read_('items').filter(i => i.roomId === c.grp), months = Object.keys(items.reduce((a, i) => { a[i.month] = 1; return a; }, {})).sort().reverse();
  const m = months.indexOf(want) >= 0 ? want : (months.find(x => x < month_()) || months[0] || month_());
  const show = i => ({ target: i.target, text: i.text, scope: i.scope, ended: i.state === '마침' });
  const people = groupPeople_(c.grp, true).filter(p => p.status === '함께' || items.some(i => i.familyId === p.id));
  const families = people.map(p => ({ id: p.id, name: p.person, own: p.id === c.familyId,
    items: items.filter(i => i.month === m && i.familyId === p.id && (p.id === c.familyId || i.scope === 'room')).sort((a, b) => a.order - b.order).map(show) })).sort((a, b) => b.own - a.own);
  const mine = items.filter(i => i.familyId === c.familyId);
  return { months, month: m, now: month_(), room: c.group.name, families,
    mine: months.map(mm => ({ month: mm, items: mine.filter(i => i.month === mm).sort((a, b) => a.order - b.order).map(show) })).filter(x => x.items.length), threads: threads_(mine) };
}
// 모임 정보(모임 사람 누구나): 사람, 모임장에게는 신청과 초대 값
function groupInfo_(c) {
  const g = c.group, all = groupPeople_(g.id, true), lead = c.role === '모임장';
  return { id: g.id, name: g.name, lead, max: GROUP_MAX, at: fmtDay_(g.at), endsAt: g.endsAt || '', left: daysLeft_(g), warn: GROUP_WARN_DAYS,
    people: all.filter(m => m.status === '함께').map(m => ({ id: m.id, person: m.person, role: m.role, me: m.id === c.familyId })),
    asks: lead ? all.filter(m => m.status === '요청').map(m => ({ id: m.id, person: m.person, at: fmtDay_(m.at) })) : [], token: lead ? g.token : '' };
}
// 모임 안에서 쓰는 이름: 교회에 연결된 사람은 명단 이름, 아니면 들어올 때 적은 이름
function groupPerson_(w, body) {
  if (w.link && w.link.status === '연결') return w.link.person;
  const n = String(body.person || '').trim().replace(/\s+/g, ' ').slice(0, 10);
  if (!n) throw fail_('bad', '모임에서 쓸 이름을 적어 주세요.');
  return n;
}
// 모임 만들기: 카카오로 로그인한 누구나, 모임장은 한 사람당 한 모임, 속한 곳은 세 곳까지. 기간(months)은 1·3·6·12개월만, 끝나는 날은 오늘부터 센다
function groupCreate_(body) {
  const w = who_(body), name = String(body.name || '').trim().replace(/\s+/g, ' ').slice(0, 16);
  if (!name) throw fail_('bad', '모임 이름을 적어 주세요.');
  const person = groupPerson_(w, body), months = Number(body.months);
  if (GROUP_MONTHS.indexOf(months) < 0) throw fail_('bad', '모임 기간은 ' + GROUP_MONTHS.join('·') + '개월 중에서 골라 주세요.');
  return withLock_(() => {
    const mine = myGroups_(w.kakaoId);
    if (mine.some(g => g.role === '모임장')) throw fail_('bad', '모임장은 한 모임만 맡을 수 있어요.');
    if (placesOf_(w) >= PLACES_MAX) throw fail_('bad', '모임은 교회 소그룹을 포함해 세 곳까지 함께할 수 있어요.');
    const id = 'G' + Date.now().toString(36);
    append_('groups', { id, name, owner: w.kakaoId, token: newToken_(), status: '활동', at: new Date(), endsAt: addMonths_(today_(), months) });
    append_('gmembers', { groupId: id, id: 'M' + Date.now().toString(36), kakaoId: w.kakaoId, person, role: '모임장', status: '함께', at: new Date() });
    return { id, me: meInfo_(who_(body)) };
  });
}
// 초대 링크로 들어온 사람에게 보여 줄 모임: 이름, 모임장, 사람 수(기도제목은 없다)
function groupPeek_(body) {
  const w = who_(body), t = String(body.invite || '');
  const g = read_('groups').find(x => x.token === t && groupLive_(x));
  if (!g) throw fail_('bad', '쓸 수 없는 모임 초대 링크예요. 모임장에게 새 링크를 받아 주세요.');
  const ps = groupPeople_(g.id), had = read_('gmembers').find(m => m.groupId === g.id && String(m.kakaoId) === w.kakaoId && m.status !== '나감');
  return { name: g.name, endsAt: g.endsAt || '', left: daysLeft_(g), lead: (ps.find(m => m.role === '모임장') || {}).person || '', n: ps.length, max: GROUP_MAX, places: placesOf_(w), placesMax: PLACES_MAX,
    linked: !!(w.link && w.link.status === '연결'), had: had ? had.status : '' };
}
// 초대 링크로 함께하기 신청: 카카오로 로그인한 누구나. 모임장이 승인하면 함께한다
function groupJoin_(body) {
  const w = who_(body), t = String(body.invite || '');
  return withLock_(() => {
    const g = read_('groups').find(x => x.token === t && groupLive_(x));
    if (!g) throw fail_('bad', '쓸 수 없는 모임 초대 링크예요. 모임장에게 새 링크를 받아 주세요.');
    const had = read_('gmembers').find(m => m.groupId === g.id && String(m.kakaoId) === w.kakaoId && m.status !== '나감');
    if (had) return { group: g.name, wait: had.status === '요청', me: meInfo_(w) };
    if (placesOf_(w) >= PLACES_MAX) throw fail_('bad', '모임은 교회 소그룹을 포함해 세 곳까지 함께할 수 있어요. 다른 모임에서 나온 뒤 신청해 주세요.');
    if (groupPeople_(g.id).length >= GROUP_MAX) throw fail_('bad', '이 모임은 ' + GROUP_MAX + '명이 다 찼어요.');
    append_('gmembers', { groupId: g.id, id: 'M' + Date.now().toString(36), kakaoId: w.kakaoId, person: groupPerson_(w, body), role: '회원', status: '요청', at: new Date() });
    return { group: g.name, wait: true, me: meInfo_(who_(body)) };
  });
}
// 모임장: 신청 승인·거절
function groupDecide_(body) {
  const c = groupMember_(body);
  if (c.role !== '모임장') throw fail_('forbidden', '모임장만 할 수 있어요.');
  return withLock_(() => {
    const m = read_('gmembers').find(x => x.groupId === c.grp && x.id === body.id && x.status === '요청');
    if (!m) throw fail_('bad', '신청을 찾지 못했어요.');
    if (body.ok && groupPeople_(c.grp).length >= GROUP_MAX) throw fail_('bad', GROUP_MAX + '명이 다 찼어요.');
    m.status = body.ok ? '함께' : '나감'; m.at = new Date(); update_('gmembers', m);
    return groupMonthView_(groupMember_(body));
  });
}
// 모임장: 사람 내보내기
function groupRemove_(body) {
  const c = groupMember_(body);
  if (c.role !== '모임장') throw fail_('forbidden', '모임장만 할 수 있어요.');
  return withLock_(() => {
    const m = read_('gmembers').find(x => x.groupId === c.grp && x.id === body.id && x.status === '함께' && x.role !== '모임장');
    if (!m) throw fail_('bad', '찾지 못했어요.');
    m.status = '나감'; update_('gmembers', m);
    return groupMonthView_(groupMember_(body));
  });
}
// 나가기: 모임장이 나가면 가장 먼저 들어온 사람이 모임장이 되고, 아무도 없으면 모임을 지운다(기록도 함께)
function groupLeave_(body) {
  const c = groupMember_(body);
  return withLock_(() => {
    const me = read_('gmembers').find(x => x.groupId === c.grp && x.id === c.familyId);
    me.status = '나감'; update_('gmembers', me);
    if (c.role === '모임장') passGroup_(c.grp);
    return { me: meInfo_(who_(body)) };
  });
}
// 모임장이 빠지면 가장 먼저 들어온 사람이 모임장이 되고, 아무도 없으면 모임을 지운다(잠금 안에서 부른다)
function passGroup_(gid) {
  const next = groupPeople_(gid).sort((a, b) => a.at < b.at ? -1 : 1)[0], g = read_('groups').find(x => x.id === gid);
  if (!g) return;
  if (next) { next.role = '모임장'; update_('gmembers', next); g.owner = next.kakaoId; update_('groups', g); }
  else eraseGroup_(g, null);
}
function groupRename_(body) {
  const c = groupMember_(body), name = String(body.name || '').trim().replace(/\s+/g, ' ').slice(0, 16);
  if (c.role !== '모임장') throw fail_('forbidden', '모임장만 할 수 있어요.');
  if (!name) throw fail_('bad', '모임 이름을 적어 주세요.');
  return withLock_(() => { const g = read_('groups').find(x => x.id === c.grp); g.name = name; update_('groups', g); return groupMonthView_(groupMember_(body)); });
}
// 초대 링크 새로 만들기(예전 링크는 막힌다)
function groupRenew_(body) {
  const c = groupMember_(body);
  if (c.role !== '모임장') throw fail_('forbidden', '모임장만 할 수 있어요.');
  return withLock_(() => { const g = read_('groups').find(x => x.id === c.grp); g.token = newToken_(); update_('groups', g); return groupMonthView_(groupMember_(body)); });
}
// 전체 관리자: 문제가 있는 자율 모임 하나를 초대 링크(또는 초대 값)로 지운다(기록도 함께). 모임 목록은 보여 주지 않고, 기도제목도 보지 않는다
function groupAdmin_(body) {
  const c = allAdmin_(body), t = String(body.invite || '').trim().replace(/^.*[?&]gjoin=/, '').replace(/[&#].*$/, '');
  if (!t) throw fail_('bad', '모임 초대 링크를 넣어 주세요.');
  return withLock_(() => {
    const g = read_('groups').find(x => x.token === t && groupLive_(x));
    if (!g) throw fail_('bad', '이 링크의 모임을 찾지 못했어요. 이미 끝났거나 모임장이 링크를 새로 만들었을 수 있어요.');
    if (body.op !== 'close') return { name: g.name, n: groupPeople_(g.id).length };
    const n = eraseGroup_(g, c);
    return { closed: g.name, items: n };
  });
}
// 모임 하나 지우기(잠금 안에서): 그 모임의 기도제목(roomId가 모임ID이고 모임 사람ID인 줄만), 기도 기록, 월별 상태, 사람, 모임 줄.
//  교회 사랑방 줄은 가정ID·사랑방ID가 달라 건드리지 않는다. 개수만 변경기록에 남는다. 지운 기도제목 수를 돌려준다
function eraseGroup_(g, c) {
  const ids = read_('gmembers').filter(m => m.groupId === g.id).map(m => m.id), has = id => ids.indexOf(id) >= 0;
  const del = (key, hit) => read_(key).filter(hit).sort((a, b) => b._row - a._row).forEach(o => remove_(key, o));
  const n = read_('items').filter(i => i.roomId === g.id && has(i.familyId)).length;
  del('items', i => i.roomId === g.id && has(i.familyId));
  del('prayers', p => has(p.familyId));
  del('monthly', x => has(x.familyId));
  del('gmembers', m => m.groupId === g.id);
  del('groups', x => x.id === g.id);
  logChange_(c || { deptId: '', person: '자동', role: '' }, '모임 끝남', g.name, '기도제목 ' + n + '개');
  return n;
}
// 끝난 모임 지우기: 끝나는 날이 지난 모임을 한 번에 GROUP_ERASE_MAX개까지 지운다(나머지는 다음 정리에서).
//  먼저 끝나는 날이 아직 없는 예전 모임에 채운다: 이 정리가 처음 도는 날부터 6개월 뒤, 단 만든 날부터 1년을 넘지 않게(최소 30일은 남긴다)
function tidyGroups_() {
  const today = today_(), floor = fmtDate_(new Date(Date.now() + 30 * 864e5));
  read_('groups').filter(g => g.status === '활동' && !g.endsAt).forEach(g => {
    const cap = addMonths_(g.at ? fmtDate_(g.at) : today, 12), want = addMonths_(today, 6), end = want < cap ? want : cap;
    g.endsAt = end < floor ? floor : end; update_('groups', g);
  });
  // 예전에 닫힌 모임('닫음')도 이제는 남기지 않는다
  read_('groups').filter(g => g.status !== '활동' || (g.endsAt && g.endsAt < today)).slice(0, GROUP_ERASE_MAX).forEach(g => eraseGroup_(g, null));
}
// 하루에 한 번만(앱을 여는 첫 사람이 정리한다). 시간 트리거로 dailyTidy를 걸어 두면 더 정확하다(docs/setup.md)
function groupsDaily_() {
  const pr = PropertiesService.getScriptProperties(), t = today_();
  if (pr.getProperty('GROUPS_TIDY') === t) return;
  try { withLock_(() => { tidyGroups_(); pr.setProperty('GROUPS_TIDY', t); }); } catch (e) { /* 바쁘면 다음에 */ }
}
function dailyTidy() { groupsDaily_(); }

// 노트로 옮기기용 읽기: 이 모임에서 내가 볼 수 있는 기도제목(내 것 전부 + 다른 사람이 모임에 공개한 것)을 글·대상·쓴 달로. 같은 글은 한 번만.
//  서버는 노트에 아무것도 쓰지 않는다. 화면이 받아서 그 휴대폰의 노트에 더한다
function groupExport_(body) {
  const c = groupMember_(body), people = groupPeople_(c.grp, true), seen = {};
  const name = id => (people.find(p => p.id === id) || {}).person || '';
  const list = [];
  read_('items').filter(i => i.roomId === c.grp && i.text && (i.familyId === c.familyId || i.scope === 'room'))
    .sort((a, b) => a.month < b.month ? 1 : a.month > b.month ? -1 : a.order - b.order)
    .forEach(i => {
      const own = i.familyId === c.familyId, k = i.familyId + '|' + i.target + '|' + i.text;
      if (seen[k]) return; seen[k] = 1;
      list.push({ own, who: own ? c.person : name(i.familyId), target: i.target, text: i.text, month: i.month, ended: i.state === '마침' });
    });
  return { name: c.group.name, endsAt: c.group.endsAt || '', left: daysLeft_(c.group), me: c.person, items: list };
}

// 변경 기록 보기: 부서 관리자는 우리 부서, 전체 관리자는 교회 전체(all). 최근 것부터 300줄
function changesView_(body) {
  const c = adminOf_(body), all = !!body.all;
  if (all && !(c.ops && c.all)) throw fail_('forbidden', '전체 관리자만 볼 수 있어요.');
  const names = {}; read_('depts').forEach(d => { names[d.id] = d.name; });
  return read_('changes').filter(x => all || x.deptId === c.deptId).sort((a, b) => a.at < b.at ? 1 : -1).slice(0, 300)
    .map(x => ({ at: x.at, who: x.who, role: x.role, kind: x.kind, target: x.target, extra: x.extra, dept: names[x.deptId] || '', ref: x.ref || '', undo: undoable_(c, x) }));
}

// ── 처음 한 번: 시트 만들기와 예시 데이터 ─────────────────────

// Apps Script 편집기에서 setup을 한 번 실행하면 시트(탭)와 첫 줄이 만들어진다. 이미 있으면 건드리지 않는다
function setup() {
  const ss = ss_();
  Object.keys(SCHEMA).forEach(k => {
    const [name, cols] = SCHEMA[k];
    renameLegacy_(ss, k);
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
  // 이달의 그림 예시: 박민재 가정(F2)은 이번 달 어제까지 날마다(많아야 20일) 기도해서 양이 넉넉하다
  const thisMonth = month_(), dayNow = Number(today_().slice(8)), r1 = ['F1', 'F3', 'F4', 'F5'];
  for (let d = 1; d < dayNow && d <= 20; d++) plist.push({ at: new Date(thisMonth + '-' + String(d).padStart(2, '0') + 'T07:' + String(10 + d).padStart(2, '0') + ':00+09:00'), by: 'F2', familyId: r1[d % 4], kakaoId: '' });
  appendMany_('prayers', plist);
  // 분석 ② 예시: 지어낸 기기 24대의 사용기록(기기ID가 sample로 시작해서 clearSampleData가 지운다). 첫 접속 단계는 몇 대가 중간에 멈추게
  const ulist = [], ev = (at, device, event, d) => ulist.push({ at, device, deptId: d1, event, data: JSON.stringify(d) });
  for (let n = 0; n < 24; n++) {
    const device = 'sample' + String(n).padStart(4, '0'), d0 = 10 + Math.floor(rnd() * 70), w = rnd();
    const envD = { role: '회원', width: w < .8 ? 'phone' : w < .88 ? 'tablet' : 'pc', style: 'basic', group: '사랑방', big: rnd() < .1, mode: rnd() < .2 ? 'dark' : 'auto', app: rnd() < .4 };
    // 첫날의 쓰기는 연결(at(d0, 0)) 뒤에 한 것으로 3.5시간 늦춘다
    const at = (d, hh) => new Date(Date.now() - d * 864e5 - (hh || 0) * 36e5), t = (d, hh) => at(d, d === d0 ? hh - 3.5 : hh);
    let reach = 0; while (reach < 6 && rnd() < .93) reach++;
    ['login', 'room', 'family', 'consent', 'wait'].slice(0, reach).forEach((step, i) => ev(at(d0, 5 - i), device, '첫접속 단계', { step, done: false }));
    if (reach < 6) continue;
    ev(at(d0, 0), device, '첫접속 단계', { step: 'app', done: true });
    const saver = rnd() < .8;
    for (let d = d0; d >= 1; d--) {
      if (d < d0 && rnd() > .25) continue;
      ev(t(d, 3), device, '열기', envD);
      if (saver && (d === d0 || rnd() < .08)) ev(t(d, 2.5), device, '기도제목 저장', { items: 1 + Math.floor(rnd() * 3), split: rnd() < .3 });
      if (rnd() < .5) { const cards = 4 + Math.floor(rnd() * 4), seenN = rnd() < .8 ? cards : 1 + Math.floor(rnd() * (cards - 1)), music = rnd() < .35;
        ev(t(d, 2), device, '기도하기 시작', { kinds: 'room', cards, secs: 60, music, flow: rnd() < .3 });
        ev(t(d, 1.9), device, '기도하기 마침', { kinds: 'room', cards, seen: seenN, mins: Math.round((2 + rnd() * 8) * 10) / 10, music, early: seenN < cards }); }
      if (rnd() < .15) ev(t(d, 1.5), device, '화면 보기', { screen: '표' });
      if (rnd() < .1) ev(t(d, 1.4), device, '화면 보기', { screen: '지난 기록' });
      if (rnd() < .04) ev(t(d, 1.3), device, '모임 모드 시작', { cards: 6 });
      if (rnd() < .02) ev(t(d, 1.2), device, '내려받기', { range: 'this' });
    }
  }
  appendMany_('usage', ulist);
  // 관리 › 운영 예시: 재작년 편성에만 있던 떠난 가정(지울 날이 됨. 작년 편성이 있어야 떠난 달이 정해진다)과 기록 지우기 요청 하나
  append_('families', { id: 'F12', name: '강민호 · 신유진', kids: '', status: '활동', admin: '' });
  append_('roster', { year: String(Number(y) - 2), roomId: 'R1', familyId: 'F12', role: '회원' });
  append_('roster', { year: String(Number(y) - 1), roomId: 'R1', familyId: 'F1', role: '리더' });
  append_('requests', { familyId: 'F7', deptId: d1, kind: '기록 지우기', at: today_(), status: '요청', doneAt: '', doneBy: '' });
  // 전체 관리자 예시: 가정 없이 교회 전체를 맡은 최운영(데모 로그인)
  append_('opsAdmins', { kakaoId: 'd-최운영', name: '최운영', scope: '전체', status: '활동', token: '', at: new Date(), by: '예시' });
  // 함께 기도해요 예시(청장년부)
  append_('items', { id: newId_(), month: prev, familyId: 'DEPT-' + d1, roomId: '', target: '수련회', text: '11월 가을 수련회를 잘 준비하고, 모든 가정이 함께하도록', scope: 'dept', state: '이어짐', prevId: '', same: '아니오', order: 1, editedAt: new Date(), editedBy: '한기쁨' });
  append_('items', { id: newId_(), month: prev, familyId: 'DEPT-' + d1, roomId: '', target: '선교', text: '캄보디아 김선교 선교사님 가정의 건강과 사역을 위해', scope: 'dept', state: '이어짐', prevId: '', same: '아니오', order: 2, editedAt: new Date(), editedBy: '한기쁨' });
  // 자율 모임 예시: 박민재가 모임장인 '직장인 기도 모임'(김도윤·정우진 함께, 서준호 신청)
  append_('groups', { id: 'G1', name: '직장인 기도 모임', owner: 'd-박민재', token: 'samplegroup1', status: '활동', at: new Date(Date.now() - 20 * 864e5), endsAt: addMonths_(today_(), 3) });
  [['M1', 'd-박민재', '박민재', '모임장', '함께'], ['M2', 'd-김도윤', '김도윤', '회원', '함께'], ['M3', 'd-정우진', '정우진', '회원', '함께'], ['M4', 'd-서준호', '서준호', '회원', '요청']]
    .forEach(([id, k, n, role, st], i) => append_('gmembers', { groupId: 'G1', id, kakaoId: k, person: n, role, status: st, at: new Date(Date.now() - (20 - i) * 864e5) }));
  it('M1', 'G1', '나', '프로젝트 마감까지 지혜와 체력을 주시도록', 'room', 1, '박민재');
  it('M2', 'G1', '나', '팀원들과 좋은 관계를 이어 가도록', 'room', 1, '김도윤');
  it('M2', 'G1', '아내', '새 직장에 잘 적응하도록', 'family', 2, '김도윤');
  // 끝나는 날이 가까운 모임(D-5): 정우진이 모임장인 '단기선교 준비팀'(김도윤·박민재 함께)
  append_('groups', { id: 'G2', name: '단기선교 준비팀', owner: 'd-정우진', token: 'samplegroup2', status: '활동', at: new Date(Date.now() - 55 * 864e5), endsAt: fmtDate_(new Date(Date.now() + 5 * 864e5)) });
  [['M5', 'd-정우진', '정우진', '모임장', '함께'], ['M6', 'd-김도윤', '김도윤', '회원', '함께'], ['M7', 'd-박민재', '박민재', '회원', '함께']]
    .forEach(([id, k, n, role, st], i) => append_('gmembers', { groupId: 'G2', id, kakaoId: k, person: n, role, status: st, at: new Date(Date.now() - (55 - i) * 864e5) }));
  it('M5', 'G2', '선교지', '비자와 항공편이 막힘없이 준비되도록', 'room', 1, '정우진');
  it('M5', 'G2', '나', '현지 아이들에게 전할 말씀을 잘 준비하도록', 'room', 2, '정우진');
  it('M6', 'G2', '팀', '팀원 모두 건강하게 다녀오도록', 'room', 1, '김도윤');
  it('M7', 'G2', '나', '맡은 찬양 시간을 겸손히 섬기도록', 'room', 1, '박민재');
  // 함께 짜는 그물 예시: 직장인 기도 모임은 일곱 명(실이 여러 가닥, 오늘 새로 이어진 실 둘), 단기선교 준비팀은 세 명
  [['M8', 'd-이서연', '이서연'], ['M9', 'd-최하윤', '최하윤'], ['M10', 'd-오지훈', '오지훈'], ['M11', 'd-강민아', '강민아']]
    .forEach(([id, k, n], i) => append_('gmembers', { groupId: 'G1', id, kakaoId: k, person: n, role: '회원', status: '함께', at: new Date(Date.now() - (16 - i) * 864e5) }));
  const gk = { M1: 'd-박민재', M2: 'd-김도윤', M3: 'd-정우진', M8: 'd-이서연', M9: 'd-최하윤', M10: 'd-오지훈', M11: 'd-강민아', M5: 'd-정우진', M6: 'd-김도윤', M7: 'd-박민재' };
  const gp = [], gpray = (by, to, ago, times) => { for (let t = 0; t < times; t++) gp.push({ at: new Date(Date.now() - (ago + t * 2) * 864e5), by, familyId: to, kakaoId: gk[by] }); };
  [['M1', 'M2', 3, 7], ['M2', 'M1', 4, 2], ['M1', 'M3', 5, 3], ['M3', 'M8', 6, 1], ['M8', 'M9', 6, 4], ['M9', 'M10', 7, 2], ['M10', 'M11', 8, 1], ['M11', 'M1', 9, 2], ['M2', 'M10', 9, 1], ['M3', 'M9', 10, 5], ['M8', 'M1', 11, 1], ['M9', 'M2', 12, 3], ['M10', 'M3', 13, 2], ['M2', 'M11', 14, 6]]
    .forEach(([a, b, ago, n]) => gpray(a, b, ago, n));
  [['M5', 'M6', 5, 4], ['M6', 'M7', 8, 2], ['M7', 'M5', 10, 1], ['M5', 'M7', 12, 3]].forEach(([a, b, ago, n]) => gpray(a, b, ago, n));
  gp.push({ at: new Date(), by: 'M3', familyId: 'M10', kakaoId: 'd-정우진' }, { at: new Date(), by: 'M9', familyId: 'M11', kakaoId: 'd-최하윤' });
  appendMany_('prayers', gp);
  // 의견함 예시: 이름 없는 것과 이름을 밝힌 것
  append_('feedback', { at: new Date(Date.now() - 2 * 864e5), deptId: d1, kind: '이랬으면', text: '기도하기에서 음악 소리를 조금 더 작게 시작하면 좋겠어요.', familyId: '', person: '', ver: '2026-10-22', width: 'phone', read: '' });
  append_('feedback', { at: new Date(Date.now() - 5 * 864e5), deptId: d1, kind: '고마워요', text: '매달 기도제목을 따로 모으지 않아도 돼서 편해요.', familyId: 'F3', person: '한지민', ver: '2026-10-22', width: 'phone', read: '예' });
  // 교회에 연결되지 않은 기도 노트 사용자의 의견(부서 없음)과 시범 설문 예시. ver를 'sample'로 두어 예시 지우기 때 함께 지운다
  append_('feedback', { at: new Date(Date.now() - 1 * 864e5), deptId: '', kind: '이랬으면', text: '하루 3개 말고 오늘 꼭 기도할 것을 제가 고를 수 있으면 좋겠어요.', familyId: '', person: '', ver: 'sample', width: 'phone', read: '' });
  append_('feedback', { at: new Date(Date.now() - 3 * 864e5), deptId: '', kind: '고마워요', text: '응답받은 기도를 모아 볼 수 있어서 힘이 돼요.', familyId: '', person: '민아', ver: 'sample', width: 'phone', read: '' });
  [[10, 'note', 3, { mood: 'good', stuck: '이어 두기 화면에서 비밀 문구가 무슨 뜻인지 헷갈렸어요.' }, ''], [9, 'note', 3, { mood: 'great' }, ''], [9, 'community', 3, { mood: 'good' }, ''], [8, 'community', 3, { mood: 'soso', stuck: '이번 달 화면에서 우리 가정 기도를 어디서 쓰는지 몰랐어요.' }, ''],
    [6, 'note', 7, { amount: 'fit', liked: ['cord', 'answer'], wish: '아침 시간에 알려 주면 좋겠어요.' }, '{"days":5,"items":6,"thanks":2,"app":true,"vault":false}', ['n-two', 'n-today', 'n-thanks', 'a-feedback']],
    [5, 'note', 7, { amount: 'many', liked: ['pray'] }, ''], [5, 'community', 7, { easy: 'yes', liked: ['art', 'share'] }, ''], [4, 'community', 7, { easy: 'hard', liked: ['share'], wish: '기도제목 쓰는 칸이 더 크면 좋겠어요.' }, ''],
    [2, 'note', 14, { ueq: { 1: 6, 2: 6, 3: 5, 4: 6, 5: 5, 6: 6, 7: 4, 8: 3 }, keep: 'yes', recommend: 'yes', want: '달마다 응답 기록을 한눈에 보는 화면이요.' }, '{"days":11,"items":8,"thanks":4,"app":true,"vault":true}', ['n-two', 'n-today', 'n-ps', 'n-answer', 'n-thanks', 'n-sync', 'a-home', 'a-feedback']],
    [1, 'community', 14, { ueq: { 1: 5, 2: 5, 3: 6, 4: 4, 5: 4, 6: 5, 7: 5, 8: 4 }, keep: 'maybe', recommend: 'yes' }, ''], [1, 'note', 14, { ueq: { 1: 4, 2: 5, 3: 4, 4: 5, 5: 3, 6: 4, 7: 4, 8: 3 }, keep: 'maybe', recommend: 'maybe' }, '']]
    .forEach(([ago, where, day, a, nums, pilot]) => append_('survey', { at: new Date(Date.now() - ago * 864e5), where, day, answers: JSON.stringify(a), nums, pilot: pilot ? JSON.stringify(pilot) : '', deptId: where === 'community' ? d1 : '', width: 'phone', ver: 'sample' }));
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
  ['F8', '윤하람'], ['F9', '장서진'], ['F10', '문태오'], ['F11', '배유나'], ['F12', '강민호 · 신유진'], ['S1', '한기쁨 · 서평안'], ['S2', '조믿음']];
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
    del('staff', mine); del('requests', mine);
    del('opsAdmins', o => o.by === '예시');
    const gmIds = read_('gmembers').filter(m => m.groupId === 'G1' || m.groupId === 'G2').map(m => m.id); del('prayers', p => gmIds.indexOf(p.by) >= 0);
    del('gmembers', m => m.groupId === 'G1' || m.groupId === 'G2'); del('groups', g => g.id === 'G1' || g.id === 'G2'); del('items', i => i.roomId === 'G1' || i.roomId === 'G2');
    del('usage', u => /^sample\d{4}$/.test(String(u.device)));
    del('survey', x => x.ver === 'sample'); del('feedback', x => x.ver === 'sample');
    del('families', f => ids.indexOf(f.id) >= 0);
    del('rooms', r => ['R1', 'R2', 'R3', 'R4'].indexOf(r.id) >= 0 && !read_('roster').some(x => x.roomId === r.id));
    if (admins.length) PropertiesService.getScriptProperties().setProperty('NEXT_ADMIN', admins.join(','));
    return '예시 가정 ' + ids.length + '곳을 지웠어요.' + (admins.length ? ' 앱을 다시 열어 실제 우리 가정을 고르면 바로 연결되고 관리자가 돼요.' : '');
  });
}

// ── 부서 ────────────────────────────────────────────────

const deptOpen_ = d => !d.status;
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
function activeRow_(r) { return rowIn_(r, month_()); }
// 편성 줄이 그 달(yyyy-MM)에 적용 중인지: 그 달의 편성 연도이고, 한 해 중간에 들어오거나 나간 줄이면 그 달 안쪽일 때
//  (결혼해서 새 가정이 된 달, 다른 부서로 옮긴 달부터는 옛 줄이 빠지고 새 줄이 쓰인다. 지난 달은 옛 줄 그대로다)
function rowIn_(r, mm) { return String(r.year) === termAt_(deptOfRoom_(r.roomId).id, mm) && (!r.from || r.from <= mm) && (!r.to || mm < r.to); }
// 지금 쓰는 사랑방: 지금 편성에 가정이 있거나, 아직 어느 편성에도 쓰이지 않은 새 사랑방. 지난 편성에만 있던 사랑방은 지난 기록에만 남는다
function activeRooms_(deptId) {
  const roster = read_('roster');
  return read_('rooms').filter(r => (!deptId || deptOfRoom_(r.id).id === deptId)
    && (roster.some(x => x.roomId === r.id && activeRow_(x)) || !roster.some(x => x.roomId === r.id)));
}
// 관리자: 우리 부서의 소그룹 이름(사랑방, 셀, 목장, 순, 구역, 조 …)을 바꾼다. 앱 곳곳의 말이 이 이름을 따른다.
//  rename이면 이름 끝에 예전 소그룹 이름이 붙은 소그룹(2-20 사랑방)도 새 이름(2-20 셀)으로 바꾼다
function saveGroup_(body) {
  const c = adminOf_(body), name = String(body.group || '').trim();
  if (!/^[가-힣A-Za-z0-9]{1,6}$/.test(name)) throw fail_('bad', '소그룹 이름은 띄어쓰기 없이 6글자까지 써 주세요.');
  return withLock_(() => {
    const d = read_('depts').find(x => x.id === c.deptId);
    if (!d) throw fail_('bad', '부서를 찾지 못했어요.');
    const old = d.group || '사랑방';
    if (old !== name) { d.group = name; update_('depts', d); logChange_(c, '소그룹 이름', old + ' → ' + name); }
    let renamed = 0;
    if (body.rename && old !== name) {
      const re = new RegExp('\\s*' + old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');
      read_('rooms').filter(r => r.deptId === c.deptId && re.test(r.name)).forEach(r => { r.name = r.name.replace(re, ' ' + name).trim(); update_('rooms', r); renamed++; });
    }
    return { group: name, renamed, month: c.ops ? opsCtxView_(opsOf_(body)) : monthView_(member_(body)) };
  });
}

// 화면에 주는 부서: 소그룹 이름과 단위로 화면의 말이 바뀐다
function deptInfo_(d) { return { id: d.id, name: d.name, group: d.group || '사랑방', unit: d.unit === '개인' ? '개인' : '가정', closed: !!d.status }; }
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
  const c = adminOf_(body);
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
      logChange_(c, '교역자 고침', label);
    } else {
      const id = 'S' + Date.now().toString(36);
      append_('families', { id, name: b ? a + ' · ' + b : a, kids: '', status: '교역자', admin: '' });
      append_('staff', { familyId: id, deptId: c.deptId, label, title, serve: body.serve ? '예' : '', status: '활동', endedAt: '' });
      logChange_(c, '교역자 추가', label);
    }
    return pendingView_(c);
  });
}
// 교역자가 부서를 떠나면 '종료'로 두고 연결도 푼다. 기도제목 기록은 남는다
function endStaff_(body) {
  const c = adminOf_(body);
  return withLock_(() => {
    const s = activeStaff_(c.deptId).find(x => x.familyId === body.familyId);
    if (!s) throw fail_('bad', '교역자를 찾지 못했어요.');
    if (s.familyId === c.familyId) throw fail_('bad', '내 자리는 여기서 마칠 수 없어요.');
    Object.assign(s, { status: '종료', endedAt: today_() }); update_('staff', s);
    logChange_(c, '교역자 마침', s.label);
    read_('links').filter(l => l.familyId === s.familyId && l.status !== '해제').forEach(l => { l.status = '해제'; l.approvedBy = c.person; update_('links', l); });
    return pendingView_(c);
  });
}

// ── 시트 읽고 쓰기 ────────────────────────────────────────

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function SCHEMA_NAMES_() { return Object.keys(SCHEMA).map(k => SCHEMA[k][0]); }
// 이름을 바꾼 시트(탭): 예전 이름의 탭이 있으면 새 이름으로 바꿔 이어 쓴다
const LEGACY_SHEETS_ = { opsAdmins: ['운영 관리자', '운영 지원'] };
function renameLegacy_(ss, key) {
  if (!LEGACY_SHEETS_[key] || ss.getSheetByName(SCHEMA[key][0])) return;
  const old = LEGACY_SHEETS_[key].map(n => ss.getSheetByName(n)).filter(Boolean)[0];
  if (old) old.setName(SCHEMA[key][0]);
}
// ── 입장 코드 ─────────────────────────────────────────────────────────
const CODE_ABC_ = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', CODE_DAYS_ = 7;
const codeNorm_ = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
function codeMake_(c, body) {
  const familyId = String(body.familyId || ''), person = String(body.person || '').trim();
  if (!canManage_(c, familyId)) throw fail_('forbidden', '우리 소그룹 사람에게만 만들 수 있어요.');
  const fam = read_('families').find(f => f.id === familyId);
  if (!fam || fam.status !== '활동') throw fail_('bad', '활동 중인 가정이 아니에요.');
  if (String(fam.name).split(' · ').indexOf(person) < 0) throw fail_('bad', '그 가정에 없는 이름이에요.');
  read_('codes').filter(x => x.familyId === familyId && x.person === person && x.status === '대기').forEach(x => { x.status = '막힘'; update_('codes', x); });
  const raw = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  let code = '';
  for (let i = 0; i < 8; i++) code += CODE_ABC_[parseInt(raw.substr(i * 4, 4), 16) % CODE_ABC_.length];
  const expires = new Date(Date.now() + CODE_DAYS_ * 864e5);
  append_('codes', { hash: hash_('code:' + code), familyId, person, by: c.person, at: new Date(), expires, status: '대기' });
  logChange_(c, '입장 코드 만듦', fam.name + ' · ' + person);
  return { code: code.slice(0, 4) + '-' + code.slice(4), person, family: fam.name, until: fmtDay_(expires) };
}
function codeLogin_(body) {
  // 아무나 맞혀 보지 못하게 10분에 30번까지만 받는다(앱 전체)
  const cache = CacheService.getScriptCache(), n = Number(cache.get('codeTry') || 0);
  if (n >= 30) throw fail_('busy', '잠시 뒤에 다시 넣어 주세요.');
  cache.put('codeTry', String(n + 1), 600);
  const code = codeNorm_(body.code), wrong = () => fail_('bad', '코드가 맞지 않거나 기한이 지났어요. 리더에게 새 코드를 받아 주세요.');
  if (code.length !== 8) throw wrong();
  const row = read_('codes').find(x => x.hash === hash_('code:' + code));
  if (!row || row.status !== '대기' || new Date(row.expires) < new Date()) throw wrong();
  row.status = '씀'; update_('codes', row);
  // 카카오 회원번호 대신 이 연결만의 무작위 값. 해제는 다른 연결처럼 리더가 한다
  const kakaoId = 'code-' + Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  append_('links', { kakaoId, nick: '코드로 들어옴', familyId: row.familyId, person: row.person, status: '연결', requestedAt: new Date(), approvedBy: row.by });
  const token = Utilities.getUuid() + Utilities.getUuid();
  append_('sessions', { hash: hash_(token), kakaoId, nick: row.person, expires: new Date(Date.now() + SESSION_DAYS * 864e5) });
  return { token, nick: row.person, uid: noteUid_(kakaoId) };
}

// 한 주제의 문장을 통째로 바꾼다. 빈 목록이면 그 주제는 기본 문장으로 돌아간다
function prayTextSave_(c, body) {
  const topic = String(body.topic || '');
  if (!/^(season:)?[a-z]{2,20}$/.test(topic)) throw fail_('bad', '주제를 알 수 없어요.');
  const rows = Array.isArray(body.rows) ? body.rows.slice(0, 40) : [];
  const clean = rows.map((r, i) => ({ topic, kind: ['a', 'b', 'next'].indexOf(r.kind) >= 0 ? r.kind : 'a', order: i, text: String(r.text || '').trim().slice(0, 300), ref: String(r.ref || '').trim().slice(0, 30), status: r.status === '뺌' ? '뺌' : '', by: c.person, at: new Date() })).filter(r => r.text);
  read_('prayText').filter(r => r.topic === topic).sort((x, y) => y._row - x._row).forEach(r => remove_('prayText', r));
  clean.forEach(r => append_('prayText', r));
  logChange_(c, clean.length ? '기도 문장 고침' : '기도 문장 기본으로', String(body.name || topic));
  return ACTIONS.prayText(body);
}
// ── 나 · 기도 노트 이어 두기 ────────────────────────────────────────────
const NOTE_PART_ = 40000, NOTE_MAX_ = 2000000;
function noteRows_(kakaoId) { return read_('vault').filter(r => String(r.kakaoId) === kakaoId).sort((a, b) => Number(a.part) - Number(b.part)); }
// 기기에 둔 기도 노트의 주인 표시: 한 기기를 여럿이 써도 다른 카카오 계정의 노트가 보이지 않게, 화면이 계정마다 노트를 따로 둔다.
//  카카오ID를 그대로 기기에 두지 않으려고 바꾼 값(해시)의 앞부분만 준다
function noteUid_(kakaoId) { return hash_('note-owner:' + kakaoId).slice(0, 20); }
function noteGet_(a) {
  const rows = noteRows_(a.kakaoId);
  if (!rows.length) return { none: true };
  return { data: rows.map(r => String(r.data)).join(''), salt: String(rows[0].salt), rev: Number(rows[0].rev) || 0, at: rows[0].at, wrap: String(rows[0].wrap || ''), rsalt: String(rows[0].rsalt || ''), rwrap: String(rows[0].rwrap || '') };
}
// 다른 기기가 먼저 맡겼으면(판이 다르면) 저장하지 않고 알린다. 화면이 받아서 합친 뒤 다시 맡긴다
function notePut_(a, body) {
  const data = String(body.data || ''), salt = String(body.salt || '');
  if (!data || !salt) throw fail_('bad', '맡길 내용이 없어요.');
  if (data.length > NOTE_MAX_) throw fail_('bad', '기도 노트가 너무 커서 맡길 수 없어요.');
  const rows = noteRows_(a.kakaoId), rev = rows.length ? Number(rows[0].rev) || 0 : 0;
  if (rows.length && rev !== Number(body.baseRev || 0)) return { stale: true, rev };
  // 열쇠 관련 값(소금·잠긴 열쇠·복구 소금·복구로 잠긴 열쇠)은 줄이 이미 있으면 있던 값을 지킨다. 옛 화면이 예전 소금을 다시 보내 열쇠를 망가뜨리지 않게.
  //  처음 맡길 때만 받은 값을 쓴다. 바꾸는 것은 noteKeys로만
  const keep = rows.length ? rows[0] : null;
  const keys = keep ? { salt: String(keep.salt), wrap: String(keep.wrap || ''), rsalt: String(keep.rsalt || ''), rwrap: String(keep.rwrap || '') }
    : { salt, wrap: String(body.wrap || ''), rsalt: String(body.rsalt || ''), rwrap: String(body.rwrap || '') };
  rows.slice().sort((x, y) => y._row - x._row).forEach(r => remove_('vault', r));
  const at = new Date(), next = rev + 1;
  for (let i = 0, k = 0; i < data.length; i += NOTE_PART_, k++) append_('vault', Object.assign({ kakaoId: a.kakaoId, part: k, data: data.slice(i, i + NOTE_PART_), at, rev: next }, keys));
  return { rev: next, at };
}
// 열쇠만 바꾼다(노트 내용과 판은 그대로): 비밀 문구를 새로 정할 때(소금+잠긴 열쇠), 복구용 문구를 새로 만들 때(복구 소금+복구로 잠긴 열쇠).
//  보낸 것만 바꾸고, 짝(소금과 잠긴 열쇠)은 함께 와야 한다. 맡긴 노트가 없으면 바꿀 곳이 없다
function noteKeys_(a, body) {
  const rows = noteRows_(a.kakaoId);
  if (!rows.length) throw fail_('bad', '맡긴 노트가 없어요.');
  const set = {};
  if (body.salt !== undefined || body.wrap !== undefined) {
    if (!body.salt || !body.wrap) throw fail_('bad', '바꿀 열쇠가 모자라요.');
    set.salt = String(body.salt); set.wrap = String(body.wrap);
  }
  if (body.rsalt !== undefined || body.rwrap !== undefined) {
    if (!body.rsalt || !body.rwrap) throw fail_('bad', '바꿀 열쇠가 모자라요.');
    set.rsalt = String(body.rsalt); set.rwrap = String(body.rwrap);
  }
  if (!Object.keys(set).length) throw fail_('bad', '바꿀 열쇠가 없어요.');
  rows.forEach(r => update_('vault', Object.assign({}, r, set)));
  return { ok: true };
}
function noteDel_(a) {
  noteRows_(a.kakaoId).sort((x, y) => y._row - x._row).forEach(r => remove_('vault', r));
  return { ok: true };
}

function sheet_(key) {
  renameLegacy_(ss_(), key);
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
  if (body.ops) return opsOf_(body);
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
    logChange_(c, old ? '편성 예약 고침' : '편성 예약', next + '년 편성', start + '부터 · ' + list.length + '줄');
    return reorgView_(c);
  });
}

function reorgCancel_(c) {
  return withLock_(() => { const now = termNow_(c.deptId), next = String(Number(now) + 1); dropPlan_(c.deptId, next); logChange_(c, '편성 예약 취소', next + '년 편성'); return reorgView_(c); });
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
// 이번 주 주일(yyyy-MM-dd). 날짜 글자끼리 크기를 견줘 이번 주 기록을 고른다
function weekStart_() { const d = new Date(today_() + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.toISOString().slice(0, 10); }
function fmtMonth_(d) { return fmt_(d, 'yyyy-MM'); }
function fmtDay_(d) { return d ? fmt_(d, 'M월 d일') : ''; }
function prevMonth_(m) { const [y, mo] = m.split('-').map(Number); return mo === 1 ? (y - 1) + '-12' : y + '-' + String(mo - 1).padStart(2, '0'); }
