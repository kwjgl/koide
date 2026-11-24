/* 교회 설문 공용 화면(디다코·코이데가 같이 쓴다). 원본은 디다코 저장소 shared/family-ui/church-survey.js 한 곳이고,
   sync.sh로 두 앱 app/ 폴더에 복사한다(복사본은 고치지 않는다). 화면과 글은 시안 prototype/survey.html과 같다.
   앱마다 다른 것은 설문 틀 목록과 이름(APPS), 결과 뒤의 다음 걸음뿐이다.
   서버(Supabase)는 supabase/026_church_survey.sql 이 만든 survey_* 함수만 부른다. 답은 이름 없이 서버에 가고, 결과는 설문을 닫은 뒤 합계로만 읽는다. */
(() => {
'use strict';
const SV = window.ChurchSurvey = {};
const OWN_SRC = (document.currentScript && document.currentScript.src) || '';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ic = (n, c) => `<svg class="ic ${c || ''}" aria-hidden="true"><use href="#sv-i-${n}"/></svg>`;
const ls = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }, del(k) { try { localStorage.removeItem(k); } catch (e) {} } };
const lsj = (k, d) => { try { return JSON.parse(ls.get(k) || 'null') || d; } catch (e) { return d; } };
const tip = (t, l) => { const T = window.DidakoTip || window.KoideTip; return T ? T.btn(t, l) : ''; };
const tipClose = () => { const T = window.DidakoTip || window.KoideTip; T && T.close && T.close(); };

// ── 날짜 ──
const NOW = () => new Date();
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const p2 = n => String(n).padStart(2, '0');
const isoOf = t => `${t.getFullYear()}-${p2(t.getMonth() + 1)}-${p2(t.getDate())}T${p2(t.getHours())}:${p2(t.getMinutes())}`;
const toLocal = v => v ? isoOf(new Date(v)) : null;                 // 서버의 시각 → 이 기기의 날짜·시각(초 없이)
const toSrvTime = v => v ? new Date(v).toISOString() : null;          // 이 기기의 날짜·시각 → 서버
function fmt(d) {   // 11월 29일(일) 오후 2시
  if (!d) return '';
  const t = new Date(d), h = t.getHours(), m = t.getMinutes();
  const y = t.getFullYear() !== NOW().getFullYear() ? `${t.getFullYear()}년 ` : '';
  return `${y}${t.getMonth() + 1}월 ${t.getDate()}일(${DOW[t.getDay()]}) ${h < 12 ? '오전' : '오후'} ${h % 12 || 12}시${m ? ` ${m}분` : ''}`;
}
const fmtDay = d => { const t = new Date(d); return `${t.getFullYear() !== NOW().getFullYear() ? t.getFullYear() + '년 ' : ''}${t.getMonth() + 1}월 ${t.getDate()}일`; };
function leftText(end) {
  const h = (new Date(end) - NOW()) / 36e5;
  if (h <= 0) return '닫는 때가 지났어요';
  return h < 24 ? '오늘 닫혀요' : `${Math.floor(h / 24)}일 남았어요`;
}
const hasBatchim = w => { const c = String(w).trim().slice(-1).charCodeAt(0); return c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 !== 0; };
const iga = w => hasBatchim(w) ? '이' : '가';
const eulreul = w => hasBatchim(w) ? '을' : '를';
const eunneun = w => hasBatchim(w) ? '은' : '는';
// 주일 기준으로 닫는 때를 고른다(교회는 주일 모임에서 설문을 돌리는 일이 많다). n=0 이번 주일, 1 다음 주일
const sundayAfter = (n, h = 14) => { const t = NOW(); t.setDate(t.getDate() + ((7 - t.getDay()) % 7 || 7) + n * 7); t.setHours(h, 0, 0, 0); return isoOf(t); };

// ── 답 유형 ──
const TYPES = { one: '하나만', multi: '여러 개', rank: '순위', range: '구간', text: '직접 쓰기', quiz: '정답 있음' };
const EDIT_TYPES = ['one', 'multi', 'rank', 'range', 'text'];
const MASK = 5;   // 5명 미만 칸은 가린다(서버가 가려서 보낸다)

// ── 디다코: 교육 기초 조사 틀(초안) 8문항 + 성경 이해도 스스로 점검(선택 묶음) ──
const DID_Q = [
  { id: 'd1', g: '경험', t: '성경공부(모임·강좌·혼자 공부 포함)를 해 본 적이 있나요?', type: 'one', o: ['지금이 처음이에요', '한두 번 해 봤어요', '가끔 해요', '꾸준히 하고 있어요'] },
  { id: 'd2', g: '읽기', t: '성경을 읽는 빈도는 어느 정도인가요?', type: 'one', o: ['거의 매일', '주 몇 번', '가끔', '거의 안 읽어요'] },
  { id: 'd3', g: '주제', t: '배우고 싶은 주제를 3가지까지 골라 주세요.', type: 'multi', max: 3, o: ['성경 개관', '복음', '기도', '관계·진로', '교리', '인물', '기타'] },
  { id: 'd4', g: '수준', t: '성경공부는 어느 정도 익숙한가요?', type: 'one', o: ['처음이에요', '조금 익숙해요', '익숙해요', '가르쳐 본 적 있어요'] },
  { id: 'd6', g: '방식', t: '어떤 방식으로 배우고 싶나요? (여러 개 골라도 돼요)', type: 'multi', max: 4, o: ['혼자', '소모임', '강의·설교', '온라인'] },
  { id: 'd7', g: '시간', t: '한 번 공부에 낼 수 있는 시간은 얼마나 되나요?', type: 'range', o: ['30분 이하', '30~60분', '60분 넘게'] },
  { id: 'd8', g: '어려움', t: '성경을 배울 때 무엇이 가장 어려운가요? 어려운 순서대로 3개까지 골라 주세요.', type: 'rank', o: ['시간이 없어요', '내용이 어려워요', '꾸준히 하기 힘들어요', '모임에서 말하기가 부담돼요', '기타'] },
  { id: 'd9', g: '바라는 점', t: '공부 방식이나 교재에 바라는 점이 있다면 적어 주세요.', type: 'text', opt: true }
];
// 성경 이해도 문항 모음: 쉬움·중간·어려움 10개씩, 사실을 묻는 것만(교역자 검수 전 초안). 해마다 같으면 외워서 맞히니 바꿔 고를 수 있게 한다
const DID_BANK = [
  { id: 'c1', g: '스스로 점검', lv: '쉬움', t: '성경은 크게 어느 두 부분으로 나뉘나요?', type: 'quiz', o: ['구약과 신약', '율법과 예언', '복음서와 서신서'], a: 0, why: '구약과 신약이에요.' },
  { id: 'c2', g: '스스로 점검', lv: '쉬움', t: '이스라엘 백성을 이집트에서 이끌어 낸 사람은 누구인가요?', type: 'quiz', o: ['여호수아', '다윗', '모세'], a: 2, why: '모세예요.' },
  { id: 'e3', g: '스스로 점검', lv: '쉬움', t: '성경의 맨 첫 책은 무엇인가요?', type: 'quiz', o: ['요한계시록', '창세기', '출애굽기'], a: 1, why: '창세기예요.' },
  { id: 'e4', g: '스스로 점검', lv: '쉬움', t: '큰 홍수 전에 방주를 만든 사람은 누구인가요?', type: 'quiz', o: ['노아', '아브라함', '요셉'], a: 0, why: '노아예요.' },
  { id: 'e5', g: '스스로 점검', lv: '쉬움', t: '소년 때 골리앗과 싸운 사람은 누구인가요?', type: 'quiz', o: ['사무엘', '솔로몬', '다윗'], a: 2, why: '다윗이에요.' },
  { id: 'e6', g: '스스로 점검', lv: '쉬움', t: '예수님이 태어나신 마을은 어디인가요?', type: 'quiz', o: ['예루살렘', '베들레헴', '나사렛'], a: 1, why: '베들레헴이에요.' },
  { id: 'e7', g: '스스로 점검', lv: '쉬움', t: '신약의 맨 첫 책은 무엇인가요?', type: 'quiz', o: ['마태복음', '마가복음', '사도행전'], a: 0, why: '마태복음이에요.' },
  { id: 'e8', g: '스스로 점검', lv: '쉬움', t: '큰 물고기 뱃속에 사흘 동안 있었던 예언자는 누구인가요?', type: 'quiz', o: ['엘리야', '다니엘', '요나'], a: 2, why: '요나예요.' },
  { id: 'e9', g: '스스로 점검', lv: '쉬움', t: '예수님이 세례를 받으신 강은 어디인가요?', type: 'quiz', o: ['유프라테스강', '요단강', '나일강'], a: 1, why: '요단강이에요.' },
  { id: 'e10', g: '스스로 점검', lv: '쉬움', t: '열두 제자 가운데 예수님을 넘겨준 사람은 누구인가요?', type: 'quiz', o: ['가룟 유다', '베드로', '도마'], a: 0, why: '가룟 유다예요.' },
  { id: 'c3', g: '스스로 점검', lv: '중간', t: '다음 중 십계명에 들어 있지 않은 것은 무엇인가요?', type: 'quiz', o: ['살인하지 말라', '남에게 대접받고자 하는 대로 남을 대접하라', '안식일을 기억하라'], a: 1, why: '두 번째가 십계명이 아니라 황금률이라 부르는 가르침이에요.' },
  { id: 'c4', g: '스스로 점검', lv: '중간', t: '산상수훈을 가르치신 분은 누구인가요?', type: 'quiz', o: ['베드로', '예수님', '바울'], a: 1, why: '예수님이에요.' },
  { id: 'm3', g: '스스로 점검', lv: '중간', t: '사자 굴에 던져졌다가 살아난 사람은 누구인가요?', type: 'quiz', o: ['다니엘', '요셉', '예레미야'], a: 0, why: '다니엘이에요.' },
  { id: 'm4', g: '스스로 점검', lv: '중간', t: '바울이 부활하신 예수님을 만난 것은 어디로 가던 길이었나요?', type: 'quiz', o: ['예루살렘', '로마', '다메섹'], a: 2, why: '다메섹으로 가던 길이에요.' },
  { id: 'm5', g: '스스로 점검', lv: '중간', t: '구약에서 시편 바로 다음에 오는 책은 무엇인가요?', type: 'quiz', o: ['욥기', '잠언', '전도서'], a: 1, why: '잠언이에요.' },
  { id: 'm6', g: '스스로 점검', lv: '중간', t: '아브라함의 아내는 누구인가요?', type: 'quiz', o: ['사라', '리브가', '라헬'], a: 0, why: '사라예요.' },
  { id: 'm7', g: '스스로 점검', lv: '중간', t: '오순절에 성령이 내리신 일이 기록된 책은 무엇인가요?', type: 'quiz', o: ['요한복음', '로마서', '사도행전'], a: 2, why: '사도행전이에요.' },
  { id: 'm8', g: '스스로 점검', lv: '중간', t: '예수님이 물로 포도주를 만드신 혼인 잔치는 어느 마을에서 있었나요?', type: 'quiz', o: ['베다니', '가나', '가버나움'], a: 1, why: '가나예요.' },
  { id: 'm9', g: '스스로 점검', lv: '중간', t: '이스라엘 열두 지파의 조상이 된 열두 아들의 아버지는 누구인가요?', type: 'quiz', o: ['야곱', '이삭', '아브라함'], a: 0, why: '야곱이에요.' },
  { id: 'm10', g: '스스로 점검', lv: '중간', t: '광야에서 하나님이 이스라엘 백성에게 날마다 내려 주신 양식은 무엇인가요?', type: 'quiz', o: ['보리떡', '무교병', '만나'], a: 2, why: '만나예요.' },
  { id: 'c5', g: '스스로 점검', lv: '어려움', t: '이스라엘의 첫 번째 왕은 누구인가요?', type: 'quiz', o: ['솔로몬', '사울', '다윗'], a: 1, why: '사울이에요.' },
  { id: 'c6', g: '스스로 점검', lv: '어려움', t: '네 복음서 중 앞의 세 권(공관복음)이 아닌 것은 무엇인가요?', type: 'quiz', o: ['마가복음', '누가복음', '요한복음'], a: 2, why: '요한복음이에요.' },
  { id: 'h3', g: '스스로 점검', lv: '어려움', t: '남유다를 무너뜨리고 백성을 포로로 끌고 간 나라는 어디인가요?', type: 'quiz', o: ['앗수르', '페르시아', '바벨론'], a: 2, why: '바벨론이에요.' },
  { id: 'h4', g: '스스로 점검', lv: '어려움', t: '북이스라엘을 무너뜨린 나라는 어디인가요?', type: 'quiz', o: ['애굽', '앗수르', '바벨론'], a: 1, why: '앗수르예요.' },
  { id: 'h5', g: '스스로 점검', lv: '어려움', t: '예루살렘에 첫 성전을 지은 왕은 누구인가요?', type: 'quiz', o: ['솔로몬', '다윗', '히스기야'], a: 0, why: '솔로몬이에요.' },
  { id: 'h6', g: '스스로 점검', lv: '어려움', t: '다음 중 바울이 쓴 편지가 아닌 것은 무엇인가요?', type: 'quiz', o: ['갈라디아서', '빌립보서', '야고보서'], a: 2, why: '야고보서예요.' },
  { id: 'h7', g: '스스로 점검', lv: '어려움', t: '우리 성경 순서로 구약의 마지막 책은 무엇인가요?', type: 'quiz', o: ['학개', '말라기', '스가랴'], a: 1, why: '말라기예요.' },
  { id: 'h8', g: '스스로 점검', lv: '어려움', t: '삼백 명으로 미디안 군대를 이긴 사사는 누구인가요?', type: 'quiz', o: ['기드온', '삼손', '입다'], a: 0, why: '기드온이에요.' },
  { id: 'h9', g: '스스로 점검', lv: '어려움', t: '포로에서 돌아온 뒤 예루살렘 성벽을 다시 쌓는 일을 이끈 사람은 누구인가요?', type: 'quiz', o: ['에스라', '스룹바벨', '느헤미야'], a: 2, why: '느헤미야예요.' },
  { id: 'h10', g: '스스로 점검', lv: '어려움', t: '요한이 요한계시록을 받은 섬은 어디인가요?', type: 'quiz', o: ['구브로', '밧모', '그레데'], a: 1, why: '밧모 섬이에요.' }
];
const QUIZ_LV = ['쉬움', '중간', '어려움'], QUIZ_PER = 2;   // 난이도마다 2문항씩, 늘 6문항. 바꿀 때도 같은 난이도 안에서 고른다
const DID_QUIZ_IDS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'];
const bankQ = id => DID_BANK.find(q => q.id === id);

// ── 코이데: 신앙 점검 틀 16문항(모든 연령·부서용). 5-2는 5번의 이어 묻기라 문항 수에 세지 않는다 ──
const KOI_Q = [
  { id: 'k1', g: '기본', t: '소속이 어떻게 되나요?', type: 'one', o: ['청장년부', '청소년부', '장년부', '기타'], dept: true },   // 소속 문항은 고정(고칠 수 없음). 보기는 교회 부서 목록
  { id: 'k2', g: '기본', t: '신앙생활을 시작한 때는 언제인가요?', type: 'one', o: ['모태·어릴 때', '10대', '20~30대', '40대 이후', '탐색 중이에요'] },
  { id: 'k3', g: '정체성', t: '나는 스스로를 그리스도인이라고 생각하나요?', type: 'one', o: ['그렇다', '잘 모르겠다', '아니다'] },
  { id: 'k4', g: '신념', t: '신앙은 내 삶에서 얼마나 중요한가요?', type: 'range', o: ['전혀', '별로', '보통', '중요한 편', '매우'] },
  { id: 'k5', g: '신념', t: '나는 구원받은 하나님의 백성이라고 확신하나요?', type: 'one', o: ['그렇다', '잘 모르겠다', '아니다'] },
  { id: 'k5b', g: '신념', t: '그렇게 생각하는 이유는 무엇인가요?', type: 'text', opt: true, sub: true },
  { id: 'k6', g: '신념', t: '신앙생활을 하는 가장 큰 이유는 무엇인가요?', type: 'one', o: ['마음의 평안', '구원과 영생', '복음을 전하려고', '가족·관계', '의무감·습관', '기타'] },
  { id: 'k7', g: '신앙 활동', t: '공예배에 얼마나 참석하나요?', type: 'one', o: ['매주', '한 달 2~3번', '한 달 1번', '그보다 적게'] },
  { id: 'k8', g: '신앙 활동', t: '성경을 읽는 빈도는 어느 정도인가요?', type: 'one', o: ['거의 매일', '주 몇 번', '가끔·필요할 때', '거의 안 읽어요'] },
  { id: 'k9', g: '신앙 활동', t: '혼자 기도하는 빈도는 어느 정도인가요?', type: 'one', o: ['거의 매일', '주 몇 번', '가끔·필요할 때', '거의 안 해요'] },
  { id: 'k10', g: '신앙 활동', t: '예배 외에 참여하는 활동을 골라 주세요.', type: 'multi', max: 5, opt: true, o: ['소그룹', '봉사', '찬양', '교육·훈련', '없어요'] },
  { id: 'k11', g: '경험', t: '공예배에서 하나님의 은혜를 경험한 적이 있나요?', type: 'one', o: ['자주', '종종', '가끔', '전혀'] },
  { id: 'k12', g: '경험', t: '일상에서 하나님이 함께하신다고 느끼나요?', type: 'range', opt: true, o: ['전혀', '별로', '보통', '그런 편', '매우'] },
  { id: 'k13', g: '공동체', t: '이 모임·부서에서 편안함을 느끼나요?', type: 'one', o: ['그렇다', '보통이다', '아니다'] },
  { id: 'k14', g: '삶', t: '요즘 삶에서 가장 큰 어려움을 1~3순위로 골라 주세요.', type: 'rank', o: ['건강', '가족', '관계', '일·학업', '진로·진학', '경제', '신앙', '기타'] },
  { id: 'k15', g: '바라는 점', t: '이 모임·교회에 바라는 점이나 하고 싶은 활동이 있다면 적어 주세요.', type: 'text', opt: true },
  { id: 'k16', g: '한마디', t: '교역자·교사(리더)에게 한마디!', type: 'text', opt: true }
];

// ── 디다코: 모임 방식 선호 조사 틀 9문항(2026-11-24). 사람을 학습 유형으로 나누지 않고, 모임을 어떻게 꾸릴지 정하는 데만 쓴다. 교재 추천이 아니라 모임 꾸리기를 다음 걸음으로 삼는다 ──
const MEET_Q = [
  { id: 'w1', g: '방식', t: '성경공부 모임에서 가장 마음이 편한 방식은 무엇인가요?', type: 'one', o: ['이야기를 나누는 토론', '강의·설명 듣기', '혼자 조용히 묵상', '함께 하는 활동·실습', '기타'] },
  { id: 'w2', g: '준비', t: '모임 전에 미리 준비하는 분량은 어느 정도가 알맞나요?', type: 'range', o: ['준비 없이 와요', '본문만 읽고 와요', '읽고 질문에 답을 적어 와요'] },
  { id: 'w3', g: '인원', t: '함께 모이는 사람 수는 몇 명쯤이 편한가요?', type: 'range', o: ['둘에서 셋', '네다섯 명', '예닐곱 명', '열 명 넘게'] },
  { id: 'w4', g: '시간', t: '한 번 모일 때 시간은 어느 정도가 알맞나요?', type: 'range', o: ['30분 이하', '30~60분', '60~90분', '90분 넘게'] },
  { id: 'w5', g: '때', t: '모일 수 있는 때를 모두 골라 주세요.', type: 'multi', max: 5, o: ['주일 예배 직후', '주중 아침', '주중 저녁', '주말 낮', '온라인이면 아무 때나'] },
  { id: 'w6', g: '곳', t: '어디서 모이는 것이 편한가요?', type: 'one', o: ['교회', '집이나 카페', '온라인', '번갈아 가며'] },
  { id: 'w7', g: '말하기', t: '모임에서 내 생각을 말하는 것은 어떤가요?', type: 'one', o: ['편하게 말해요', '질문을 받으면 말해요', '듣는 편이 더 편해요', '말하기가 부담돼요'] },
  { id: 'w8', g: '어려움', t: '모임에 참여하기 어렵게 하는 것을 3가지까지 골라 주세요.', type: 'multi', max: 3, o: ['시간이 맞지 않아요', '거리가 멀어요', '아이 돌봄이 어려워요', '말하기나 준비가 부담돼요', '모임 방식이 맞지 않아요', '기타'] },
  { id: 'w9', g: '바라는 점', t: '이런 모임이면 좋겠다 싶은 모습이 있다면 적어 주세요.', type: 'text', opt: true }
];

// ── 코이데: 기도 생활 돌아보기 틀 12문항(2026-11-24). 신앙 점검처럼 영역별로 묻되, 기도의 양이나 깊이를 견주지 않고 어떤 도움이 필요한지 알아보는 데 쓴다 ──
const PRAY_Q = [
  { id: 'p1', g: '기본', t: '소속이 어떻게 되나요?', type: 'one', o: ['청장년부', '청소년부', '장년부', '기타'], dept: true },   // 소속 문항은 고정(고칠 수 없음). 보기는 교회 부서 목록
  { id: 'p2', g: '때와 곳', t: '혼자 기도하는 빈도는 어느 정도인가요?', type: 'one', o: ['거의 매일', '주 몇 번', '가끔·필요할 때', '거의 안 해요'] },
  { id: 'p3', g: '때와 곳', t: '주로 기도하는 때는 언제인가요? 3개까지 골라 주세요.', type: 'multi', max: 3, o: ['아침 일찍', '낮 시간', '저녁', '잠들기 전', '틈틈이 짧게', '정해진 때가 없어요'] },
  { id: 'p4', g: '때와 곳', t: '주로 기도하는 곳은 어디인가요? 3개까지 골라 주세요.', type: 'multi', max: 3, o: ['집', '교회(예배당)', '차 안·길 위', '일터·학교', '자연 속', '기타'] },
  { id: 'p5', g: '때와 곳', t: '한 번 기도하는 시간은 어느 정도인가요?', type: 'range', o: ['5분 이하', '5~15분', '15~30분', '30분 넘게'] },
  { id: 'p6', g: '방식', t: '어떤 방식으로 기도할 때 마음이 편한가요? 3개까지 골라 주세요.', type: 'multi', max: 3, o: ['혼자 조용히', '누군가와 함께', '글로 적으며', '소리 내어', '노래·찬양으로', '걸으며', '기타'] },
  { id: 'p7', g: '방식', t: '여럿이 함께 기도하는 자리는 어떤가요?', type: 'one', o: ['편하게 소리 내어 기도해요', '함께하지만 마음속으로 해요', '어색해서 피하게 돼요', '그런 자리가 없어요'] },
  { id: 'p8', g: '경험', t: '기도할 때 하나님과 가까워지는 느낌이 있나요?', type: 'one', o: ['자주', '종종', '가끔', '거의 없어요'] },
  { id: 'p9', g: '어려움', t: '기도할 때 어려운 것을 어려운 순서대로 3개까지 골라 주세요.', type: 'rank', o: ['시간 내기', '집중하기', '무엇을 기도할지 모르겠어요', '응답이 없는 것 같아요', '꾸준히 하기', '소리 내어 하기', '기타'] },
  { id: 'p10', g: '도움', t: '교회가 어떤 도움을 주면 좋겠나요? 3개까지 골라 주세요.', type: 'multi', max: 3, o: ['함께 기도하는 모임', '기도 짝', '기도하는 법을 배우는 시간', '기도 제목을 나누는 자리', '조용히 기도할 공간', '기도 안내 자료', '기타'] },
  { id: 'p11', g: '나눔', t: '기도 제목을 다른 사람과 나누는 것은 어떤가요?', type: 'one', o: ['편하게 나눠요', '가까운 사람과만 나눠요', '나누기가 조심스러워요', '나누고 싶지 않아요'] },
  { id: 'p12', g: '바라는 점', t: '기도 생활이나 기도 모임에 바라는 점이 있다면 적어 주세요.', type: 'text', opt: true }
];

// ── 앱마다 다른 것: 설문 틀 목록과 이름, 보고서 뒤의 다음 걸음 ──
// tpls: 기본 틀 목록(앞의 것이 '추천'). 맨 위의 nm·questions·mins는 첫째 틀을 가리킨다. lead·heads는 두 틀의 문항 번호를 함께 적어 두면 문항이 있는 쪽만 쓰인다
const APPS = {
  didako: {
    name: '디다코', mark: 'didako', nm: '교육 기초 조사', questions: DID_Q, quiz: true,
    tpls: [
      { nm: '교육 기초 조사', questions: DID_Q, quiz: true, mins: 4, icon: 'spark', short: '지금 어디에 있고 무엇을 배우고 싶은지 물어요.' },
      { nm: '모임 방식 선호 조사', questions: MEET_Q, quiz: false, mins: 4, icon: 'users', short: '어떤 모임이 편한지 물어요. 사람을 유형으로 나누지 않아요.' }
    ],
    tplDesc: '지금 어디에 있고 무엇을 배우고 싶은지 묻는 기초 조사예요. 경험·읽는 빈도·주제·방식·시간·어려움을 물어요.',
    mins: 4, quizMins: 3, next: '교재 추천', dflt: '교육 기초 조사',
    lead: { d2: '성경을 읽는 빈도는', d3: '배우고 싶은 주제는', d4: '성경공부에 익숙한 정도는', d8: '가장 어려운 것 1순위는',
      w1: '가장 마음이 편한 모임 방식은', w3: '편한 모임 인원은', w4: '알맞은 모임 시간은', w5: '모일 수 있는 때는', w6: '모이기 편한 곳은', w8: '모임에 참여하기 어렵게 하는 것은' },
    heads: ['d3', 'd8', 'd4', 'd2', 'w1', 'w4', 'w5']
  },
  koide: {
    name: '코이데', mark: 'cord', nm: '신앙 점검', questions: KOI_Q, quiz: false,
    tpls: [
      { nm: '신앙 점검', questions: KOI_Q, quiz: false, mins: 7, icon: 'spark', short: '신앙을 정체성·신념·신앙 활동·경험·공동체 영역으로 나눠 물어요.' },
      { nm: '기도 생활 돌아보기', questions: PRAY_Q, quiz: false, mins: 5, icon: 'pray', short: '기도하는 때와 방식, 어려움, 바라는 도움을 물어요. 기도의 양을 견주지 않아요.' }
    ],
    tplDesc: '신앙을 정체성·신념·신앙 활동·경험·공동체 영역으로 나눠 묻는 점검이에요. 문구는 교회에 맞게 고칠 수 있어요.',
    mins: 7, quizMins: 0, next: '함께 기도할 제목', dflt: '신앙 점검',
    lead: { k5: '구원의 확신은', k6: '신앙생활을 하는 가장 큰 이유는', k14: '요즘 가장 큰 어려움 1순위는', k7: '공예배 참석은', k11: '공예배에서 은혜를 경험한 정도는',
      p2: '혼자 기도하는 빈도는', p3: '주로 기도하는 때는', p6: '마음이 편한 기도 방식은', p9: '기도할 때 가장 어려운 것 1순위는', p10: '교회에 바라는 도움은' },
    heads: ['k5', 'k6', 'k14', 'p6', 'p9', 'p10']
  }
};
const DEF_CLOSED = '응답을 마감했어요. 감사합니다.';
const DEPT_Q = { id: 'dept', g: '기본', t: '소속이 어떻게 되나요?', type: 'one', o: ['기타'], dept: true };   // 교회 전체 링크에서 앞에 붙는 소속 문항(고정)

// ══ 상태 ═══════════════════════════════════════════════════════════════════
let C = { app: 'didako', demo: false, rpc: null };
const A = () => APPS[C.app];
const ST = { items: null, scope: { all: false, depts: [] }, error: '', loading: false, sub: '', open: null, openAt: 0, rep: {}, repTab: 'glance', openQ: null, keepQ: false, undo: null, newDept: '', saveState: 'saved', qrReady: false };
let OPEN = null;     // 열기 창 상태
let RS = null;       // 답하는 화면 상태
let adapter = null;
const byId = id => (ST.items || []).find(x => x.id === id);

// ── 서버의 설문 줄 ↔ 이 화면의 설문 ──
function fromSrv(j) {
  return { id: j.id, title: j.title || '', deptId: j.dept_id || null, dept: j.dept_name || '', linkMode: j.link_mode === 'multi' ? 'multi' : 'dept', status: j.status,
    start: toLocal(j.start), end: toLocal(j.end), limit: j.limit || null, gate: j.gate || 'open', code: j.code || '', closedText: j.closed_text || DEF_CLOSED,
    showAns: !!j.show_ans, check: !!j.check, quizIds: Array.isArray(j.quiz_ids) ? j.quiz_ids : null, qs: Array.isArray(j.qs) ? j.qs : [], from: j.from || 'tpl', fromTitle: j.from_title || '',
    prev: j.prev || null, token: j.token || '', memo: j.memo || '', resp: j.resp || 0, oneN: j.once_n || 0, oneUsed: j.once_used || 0 };
}
const toSrv = s => ({ title: s.title, dept_id: s.linkMode === 'dept' ? s.deptId : null, questions: s.qs, check: !!s.check, quiz_ids: s.check ? quizOf(s).map(q => q.id) : null,
  from: s.from || 'tpl', from_title: s.fromTitle || '', prev: s.prev || null });
// 앱의 문항 모음 정답표: 서버가 결과를 셀 때 쓴다(비밀이 아니다)
const quizKey = () => C.app === 'didako' ? Object.fromEntries(DID_BANK.map(q => [q.id, { a: q.a, lv: q.lv }])) : {};

// ── 문항 ──
const cloneQ = q => ({ ...q, o: q.o ? [...q.o] : undefined });
const qsAll = s => s.qs || [];
const quizOf = s => !s.check || !A().quiz ? [] : (s.quizIds && s.quizIds.length ? s.quizIds : DID_QUIZ_IDS).map(bankQ).filter(Boolean);
const usedBefore = s => { const p = s.prev && byId(s.prev); return p ? quizOf({ ...p, check: true }).map(q => q.id) : []; };   // 복사해 온 지난 설문에서 쓴 문항
const countQ = list => list.filter(q => !q.sub).length;
const deptNames = () => ST.scope.depts.map(d => d.name);
// 교회 전체 링크면 맨 앞에 소속 문항이 있어야 한다(없으면 붙이고, 보기는 교회 부서 목록으로 맞춘다)
function normDept(s) {
  if (s.linkMode !== 'multi') return;
  let q = s.qs.find(x => x.dept);
  if (!q) { q = cloneQ(DEPT_Q); s.qs.unshift(q); }
  q.o = [...deptNames(), '기타'];
}
// 답하는 화면에 나오는 문항: 부서별 링크면 소속 문항은 링크가 채운다
const respQs = s => qsAll(s).filter(q => !(q.dept && s.linkMode === 'dept'));
const minsOf = s => Math.max(2, Math.round(countQ(respQs(s)) * .45 + (quizOf(s).length ? A().quizMins : 0)));
const qCountText = s => `문항 ${countQ(respQs(s))}개${quizOf(s).length ? ` + 스스로 점검 ${quizOf(s).length}개` : ''}`;
const isOther = o => /^기타/.test(String(o || '').trim());   // '기타' 보기를 고르면 직접 쓸 칸이 열린다
// 어디서 시작했는지(기본 틀은 원본을 고치지 않고 사본을 고친다)
// 설문이 어느 틀에서 왔는지: 기본 틀로 만든 것은 서버에 적힌 틀 이름(from_title)으로, 복사한 것은 같은 문항 번호가 가장 많은 틀로 찾는다. 알 수 없으면 첫째 틀이다
function tplOf(s) {
  const T = A().tpls, byName = s && s.from === 'tpl' && T.find(t => t.nm === s.fromTitle);
  if (byName) return byName;
  const ids = new Set(((s && s.qs) || []).map(q => q.id)); let best = T[0], most = -1;
  T.forEach(t => { const c = t.questions.filter(q => ids.has(q.id)).length; if (c > most) { best = t; most = c; } });
  return best;
}
const originText = (s, raw) => { const e = raw ? (x => String(x)) : esc; return s.from === 'blank' ? '빈 설문에서 직접 만들었어요.' : s.from === 'copy' ? `우리 교회 설문 "${e(s.fromTitle)}"을 복사했어요.` : `${e(A().name)} 기본 틀(${e(tplOf(s).nm)})을 가져왔어요. 원본은 그대로예요.`; };
const markEdited = q => { if (!q.custom) q.edited = true; };
const newQ = () => ({ id: 'q' + Date.now().toString(36) + Math.floor(Math.random() * 99), t: '', type: 'one', o: ['', ''], custom: true });

// ── 앱이 아닌 곳에 띄우는 것들 ──
let toastT = 0;
function toast(msg) {
  if (C.toast) return C.toast(msg);
  let t = $('#svToast'); if (!t) { t = document.createElement('div'); t.id = 'svToast'; t.className = 'sv-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2600);
}
function ensureLayers() {
  if (!$('#svSprite')) { const d = document.createElement('div'); d.id = 'svSprite'; d.setAttribute('aria-hidden', 'true'); d.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden'; d.innerHTML = `<svg width="0" height="0"><defs>${SPRITE}</defs></svg>`; document.body.insertBefore(d, document.body.firstChild); }
  if (!$('#svPop')) { const d = document.createElement('div'); d.id = 'svPop'; d.className = 'pop sv sv-pop'; d.hidden = true; d.innerHTML = '<div class="pop-scrim" data-sv="pop-close"></div><div class="pop-sheet card" id="svPopSheet" role="dialog" aria-modal="true"></div>'; document.body.appendChild(d); }
}
let popOk = null;
function pop(html, ok) { ensureLayers(); popOk = ok || null; const t = $('#svToast'); if (t) t.hidden = true; $('#svPopSheet').innerHTML = html; if ($('#svPop').hidden) { $('#svPop').hidden = false; document.body.classList.add('pop-open'); const f = $('#svPopSheet [autofocus]'); f && f.focus(); } }
function popClose() { const p = $('#svPop'); if (p) p.hidden = true; document.body.classList.remove('pop-open'); popOk = null; OPEN = null; }
function ask({ title, body, ok, danger, onOk }) {
  pop(`<h2 class="sheet-h">${esc(title)}</h2><p class="sheet-sub">${body}</p>
    <div class="sheet-acts"><button class="btn ghost" type="button" data-sv="pop-close">취소</button><button class="btn${danger ? ' danger' : ''}" type="button" data-sv="pop-ok">${esc(ok)}</button></div>`, onOk);
}
const markSvg = () => A().mark === 'cord'
  ? '<svg class="ic" aria-hidden="true" style="width:1.1em;height:1.1em;color:var(--on-accent)"><use href="#sv-i-cord"/></svg>'
  : '<svg class="mk" aria-hidden="true" style="width:1.5em;height:1.5em;--s1:var(--on-accent);--s2:color-mix(in srgb,var(--on-accent) 72%,var(--accent));--s3:color-mix(in srgb,var(--on-accent) 48%,var(--accent));--cord-bg:var(--accent)"><use href="#sv-i-didako"/></svg>';

// ── QR(오픈소스 qrcode-generator, church-survey-qr.js를 처음 필요할 때 불러온다) ──
function loadQr() {
  if (window.qrcode) return Promise.resolve(true);
  if (ST.qrP) return ST.qrP;
  ST.qrP = new Promise(res => {
    const s = document.createElement('script'); s.src = (OWN_SRC ? OWN_SRC.replace(/church-survey\.js(\?.*)?$/, '') : '') + 'church-survey-qr.js';
    s.onload = () => res(!!window.qrcode); s.onerror = () => { ST.qrP = null; res(false); }; document.head.appendChild(s);
  });
  return ST.qrP;
}
function qrSvg(text) {
  if (!window.qrcode) return '';
  const q = window.qrcode(0, 'M'); q.addData(text); q.make();
  const n = q.getModuleCount(), m = 2; let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) d += `M${x + m} ${y + m}h1v1h-1z`;
  return `<svg viewBox="0 0 ${n + m * 2} ${n + m * 2}" shape-rendering="crispEdges" fill="#1B2523" role="img" aria-label="설문 링크 QR 그림"><rect width="100%" height="100%" fill="#fff"/><path d="${d}"/></svg>`;
}
// 답하는 쪽 주소: 앱과 같은 폴더의 church-survey.html (앱이 설치된 휴대폰·붙여 넣은 링크에서도 같다)
const respUrl = s => C.respondentUrl ? C.respondentUrl(s.token) : new URL('church-survey.html?s=' + encodeURIComponent(s.token), location.href.split('#')[0]).href;
const SPRITE = '<symbol id="sv-i-lock" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3"/></symbol><symbol id="sv-i-check" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></symbol><symbol id="sv-i-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.2"/><circle cx="12" cy="7.9" r=".5"/></symbol><symbol id="sv-i-chev" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5"/></symbol><symbol id="sv-i-back" viewBox="0 0 24 24"><path d="M14.5 6l-6 6 6 6"/></symbol><symbol id="sv-i-x" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></symbol><symbol id="sv-i-copy" viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M5 15V7a2 2 0 0 1 2-2h8"/></symbol><symbol id="sv-i-trash" viewBox="0 0 24 24"><path d="M4.5 7h15M9.5 7V5h5v2M6.5 7l1 12h9l1-12M10.5 11v5M13.5 11v5"/></symbol><symbol id="sv-i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol><symbol id="sv-i-edit" viewBox="0 0 24 24"><path d="M5 19l1-4 10-10 3 3-10 10z"/><path d="M14.5 6.5l3 3"/></symbol><symbol id="sv-i-eye" viewBox="0 0 24 24"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/></symbol><symbol id="sv-i-link" viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></symbol><symbol id="sv-i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></symbol><symbol id="sv-i-up" viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></symbol><symbol id="sv-i-down" viewBox="0 0 24 24"><path d="M12 5v14M6 13l6 6 6-6"/></symbol><symbol id="sv-i-print" viewBox="0 0 24 24"><path d="M7 9V4h10v5M7 17H5a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 5 9h14a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 19 17h-2"/><rect x="7" y="14" width="10" height="6" rx="1"/></symbol><symbol id="sv-i-cord" viewBox="0 0 16 12"><path d="M.5 8.5h3.8c1.2 0 1.7-1.5 1.7-2.8C6 3.7 7.3 2.5 9 2.5s3 1.2 3 3.1-1.8 3.1-4 3.3"/><path d="M5.6 10.1C7.6 9 9.6 8.5 15.5 8.5"/></symbol><symbol id="sv-i-didako" viewBox="0 0 16 16"><g fill="none"><circle cx="8" cy="2.6" r="1.5" stroke="var(--s1, var(--accent))" stroke-width="1.4"/><path d="M8 4.2V5.8" stroke="var(--s1, var(--accent))" stroke-width="1.2"/><clipPath id="sv-didako-clip"><path d="M4.2 5.6H11.8V14.8L8 11.8L4.2 14.8Z"/></clipPath><g clip-path="url(#sv-didako-clip)" stroke="none"><rect x="4.2" y="4.6" width="2.53" height="12" fill="var(--s1, var(--accent))"/><rect x="6.73" y="4.6" width="2.54" height="12" fill="var(--s2, var(--accent-mid))"/><rect x="9.27" y="4.6" width="2.53" height="12" fill="var(--s3, var(--ink-2))"/><path d="M6.73 4.6V15M9.27 4.6V15" stroke="var(--cord-bg, var(--page))" stroke-width=".5"/></g></g></symbol><symbol id="sv-i-send" viewBox="0 0 24 24"><path d="M4 12l16-7-6 15-3-6z"/><path d="M11 14l9-9"/></symbol><symbol id="sv-i-qr" viewBox="0 0 24 24"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2"/></symbol><symbol id="sv-i-key" viewBox="0 0 24 24"><circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l2 2M14 9l2 2"/></symbol><symbol id="sv-i-ticket" viewBox="0 0 24 24"><path d="M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4z"/><path d="M14 7v10" stroke-dasharray="2 2"/></symbol><symbol id="sv-i-users" viewBox="0 0 24 24"><circle cx="9" cy="9" r="3.4"/><path d="M3.5 19c.5-3.2 2.7-5 5.5-5s5 1.8 5.5 5"/><circle cx="17" cy="8" r="2.6"/><path d="M16.5 13.5c2.4 0 4 1.6 4.4 4.3"/></symbol><symbol id="sv-i-cal" viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/></symbol><symbol id="sv-i-file" viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/></symbol><symbol id="sv-i-spark" viewBox="0 0 24 24"><path d="M12 4l1.8 4.6L18.5 10l-4.7 1.6L12 16l-1.8-4.4L5.5 10l4.7-1.4z"/><path d="M18 16l.7 1.6 1.6.7-1.6.7L18 20.6l-.7-1.6-1.6-.7 1.6-.7z"/></symbol><symbol id="sv-i-book" viewBox="0 0 24 24"><path d="M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5V19c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5z"/><path d="M12 6v13.5"/></symbol><symbol id="sv-i-pray" viewBox="0 0 24 24"><path d="M12 4c-1 2-3 5-3 8v4l-3 4h6M12 4c1 2 3 5 3 8v4l3 4h-6M12 4v16"/></symbol><symbol id="sv-i-refresh" viewBox="0 0 24 24"><path d="M19 8a7.5 7.5 0 1 0 1 5"/><path d="M19.5 3.5V8.5H14.5"/></symbol><symbol id="sv-i-stop" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><rect x="9" y="9" width="6" height="6" rx="1"/></symbol><symbol id="sv-i-hourglass" viewBox="0 0 24 24"><path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9"/></symbol>';

// ══ 서버 어댑터: 실제 서버(live)와 서버 없이 이 브라우저에서 도는 데모(demo) ═══════════════
// 둘은 같은 모양으로 답한다. 화면 코드는 어느 쪽인지 모른다.
const rpcErr = e => { const m = (e && e.message) || ''; return m || '서버가 답하지 않아요. 잠시 뒤 다시 해 주세요.'; };
const live = {
  async list() { const r = await C.rpc('survey_list', { p_app: C.app }); return { scope: r.scope || { all: false, depts: [] }, items: (r.items || []).map(fromSrv) }; },
  async save(s) { const r = await C.rpc('survey_save', { p_app: C.app, p_id: s.id || null, p: toSrv(s) }); return fromSrv(r); },
  async del(id) { await C.rpc('survey_delete', { p_app: C.app, p_id: id }); },
  async open(id, o) { return fromSrv(await C.rpc('survey_open', { p_app: C.app, p_id: id, p: { start: toSrvTime(o.start), end: toSrvTime(o.end), gate: o.gate, once_n: o.once_n, limit: o.limit, closed_text: o.closed_text, show_ans: o.show_ans } })); },
  async state(id, action, o) { return fromSrv(await C.rpc('survey_state', { p_app: C.app, p_id: id, p_action: action, p: o && o.end ? { end: toSrvTime(o.end) } : {} })); },
  async codes(id) { return await C.rpc('survey_codes', { p_app: C.app, p_id: id }); },
  async memo(id, text) { await C.rpc('survey_memo', { p_app: C.app, p_id: id, p_text: text }); },
  async report(id) { return await C.rpc('survey_report', { p_app: C.app, p_id: id, p_key: quizKey() }); },
  async openList() { return await C.rpc('survey_open_list', { p_app: C.app }); }
};

// ── 데모: 지어낸 설문 다섯 개와 지어낸 결과. 이 브라우저에만 남는다 ──
const DEMO_DEPTS = [['dm1', '청장년부'], ['dm2', '청소년부'], ['dm3', '장년부']];
const demoKey = () => 'sv-demo-v2-' + C.app;
const dayIso = (n, h = 14) => { const t = NOW(); t.setDate(t.getDate() + n); t.setHours(h, 0, 0, 0); return isoOf(t); };
function demoSeed() {
  const nm = A().nm, quiz = C.app === 'didako', t2 = A().tpls[1];
  const base = { deptId: 'dm1', dept: '청장년부', linkMode: 'dept', limit: null, gate: 'open', code: '', oneN: 0, oneUsed: 0, closedText: DEF_CLOSED, check: quiz, quizIds: null, showAns: false, qs: A().questions.map(cloneQ), prev: null, from: 'tpl', fromTitle: '', memo: '' };
  const y = NOW().getFullYear();
  return [
    { ...base, id: 's1', title: `${y} 가을 ${nm}`, status: 'open', start: dayIso(-7, 9), end: dayIso(6), resp: 31, gate: 'code', code: '4827', token: 'demo-s1' },
    { ...base, id: 's2', title: `청소년부 겨울 ${nm}`, deptId: 'dm2', dept: '청소년부', status: 'sched', start: dayIso(14, 9), end: dayIso(28), resp: 0, limit: 120, gate: 'once', oneN: 40, token: 'demo-s2' },
    { ...base, id: 's5', title: `장년부 ${nm}`, deptId: 'dm3', dept: '장년부', status: 'draft', start: null, end: null, resp: 0, token: 'demo-s5' },
    { ...base, id: 's3', title: `${y} 봄 ${nm}`, status: 'closed', start: dayIso(-190, 9), end: dayIso(-176), resp: 55, prev: 's4', fromTitle: `${y - 1} 봄 ${nm}`, from: 'copy', token: 'demo-s3' },
    { ...base, id: 's4', title: `${y - 1} 봄 ${nm}`, status: 'closed', start: dayIso(-555, 9), end: dayIso(-541), resp: 52, token: 'demo-s4' },
    ...(t2 ? [{ ...base, id: 's6', title: `${y} 여름 ${t2.nm}`, status: 'closed', start: dayIso(-100, 9), end: dayIso(-86), resp: 38, check: false, qs: t2.questions.map(cloneQ), fromTitle: t2.nm, token: 'demo-s6' }] : [])
  ];
}
// 결과에 쓰는 지어낸 숫자(보기 순서대로). 맞는 문항이 없으면 문항 번호로 정해진 값을 만든다
const DEMO_N = {
  didako: { d1: [6, 14, 21, 14], d2: [9, 17, 21, 8], d3: [31, 24, 27, 18, 12, 20, 4], d4: [7, 22, 20, 6], d6: [15, 38, 22, 17], d7: [14, 31, 10], d8: [21, 14, 11, 6, 3],
    w1: [14, 8, 9, 6, 1], w2: [9, 17, 12], w3: [8, 16, 10, 4], w4: [5, 17, 12, 4], w5: [12, 3, 22, 10, 9], w6: [20, 6, 8, 4], w7: [14, 13, 8, 3], w8: [21, 9, 10, 12, 6, 3] },
  koide: { k2: [20, 12, 14, 5, 4], k3: [48, 5, 2], k4: [1, 3, 14, 24, 13], k5: [37, 14, 4], k6: [18, 15, 5, 9, 7, 1], k7: [33, 14, 6, 2], k8: [11, 15, 22, 7], k9: [10, 18, 20, 7], k11: [10, 20, 16, 9], k13: [41, 11, 3], k14: [6, 8, 9, 14, 10, 7, 1, 0],
    p2: [10, 12, 11, 5], p3: [9, 3, 8, 21, 12, 6], p4: [29, 14, 9, 3, 4, 1], p5: [9, 17, 9, 3], p6: [28, 11, 9, 14, 8, 6, 1], p7: [12, 10, 11, 5], p8: [7, 15, 12, 4], p9: [8, 11, 6, 4, 6, 2, 1],
    p10: [17, 6, 15, 13, 18, 7, 1], p11: [14, 13, 8, 3] }
};
const DEMO_TEXT = {
  d9: ['한 번에 읽는 분량이 너무 많지 않았으면 좋겠어요.', '처음 하는 사람도 따라갈 수 있는 설명이 있으면 좋겠어요.', '퇴근하고 늦게라도 할 수 있게 온라인으로도 하고 싶어요.', '질문이 어렵지 않고 나눌 거리가 있으면 좋아요.', '성경 인물 이야기를 하나씩 배우고 싶어요.', '기도하는 법을 배우고 싶어요. 기도가 늘 막막해요.', '소모임은 좋은데 말하는 게 조금 부담돼요.', '교재에 그림이나 지도가 있으면 좋겠어요.', '한 시간 안에 끝나면 좋겠어요.', '로마서 같은 깊은 책도 천천히 같이 읽고 싶어요.', '이해가 안 될 때 물어볼 사람이 있으면 좋겠어요.', '혼자서도 이어 갈 수 있는 짧은 교재가 있으면 해요.'],
  w9: ['처음 오는 사람도 부담 없이 앉을 수 있으면 좋겠어요.', '말씀을 읽고 각자 생각을 적은 뒤에 나누면 좋겠어요.', '퇴근하고 온라인으로 짧게 모일 수 있으면 해요.', '아이를 데리고 와도 괜찮은 모임이면 좋겠어요.', '한 시간 안에 끝나고 간식이 있으면 좋겠어요.', '정답을 말해야 하는 분위기가 아니었으면 해요.', '가끔은 밖에 나가서 걸으며 나누고 싶어요.'],
  p12: ['함께 기도하는 시간이 한 달에 한 번이라도 있으면 좋겠어요.', '기도하는 법을 차근차근 알려 주는 시간이 있었으면 해요.', '조용히 기도할 수 있는 예배당이 평일에도 열려 있으면 좋겠어요.', '기도 짝이 있으면 꾸준히 할 수 있을 것 같아요.', '기도 제목을 편하게 나눌 수 있는 분위기였으면 해요.', '짧게라도 날마다 따라 할 수 있는 안내가 있으면 좋겠어요.'],
  k15: ['함께 기도하는 시간이 조금 더 있으면 좋겠어요.', '예배 끝나고 이야기 나누는 자리가 있으면 좋겠어요.', '말씀이 삶에 어떻게 이어지는지 더 듣고 싶어요.', '봉사에 참여해 보고 싶은데 어디서 시작하는지 몰랐어요.', '공부하는 모임이 평일 저녁에도 있으면 좋겠어요.', '기도 제목을 편하게 나눌 수 있는 분위기였으면 해요.'],
  k16: ['리더님, 늘 먼저 안부 물어 주셔서 감사해요.', '선생님, 힘들 때 기도해 주셔서 큰 힘이 됐어요.', '새로 온 사람을 챙겨 주는 분들이 계셔서 고마웠어요.', '찬양 시간이 조금 더 길어도 좋겠어요.', '늘 고맙습니다.', '응원합니다.']
};
const DEMO_OTHER = { didako: { d3: ['찬양과 예배', '성경 원어 맛보기', '선교 이야기', '교회 역사'], d8: ['아이를 돌봐야 해서 모임에 오기 어려워요', '어디서부터 읽어야 할지 모르겠어요', '혼자 하면 금방 잊어요'], w1: ['걸으면서 이야기 나누기'], w8: ['몸이 불편해서 이동이 어려워요'] }, koide: { k6: ['그냥 교회가 좋아서요'], p4: ['버스 안'], p6: ['걸으면서 마음속으로'], p10: ['기도하는 사람의 이야기를 듣는 시간'] } };
const hash32 = str => { let h = 2166136261; for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const rnd32 = seed => { let h = seed; return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
const demoMask = c => c.map(x => x < MASK ? null : x);
function demoCounts(s, q, n, real) {
  const k = (q.o || []).length, key = DEMO_N[C.app][q.id];
  if (real && key && key.length === k) return key.slice();
  const r = rnd32(hash32(s.id + q.id)), w = (q.o || []).map(() => .15 + r() * r() * 1.4), tot = w.reduce((a, b) => a + b, 0);
  if (q.type === 'multi') return w.map(x => Math.round(n * Math.min(.9, x / tot * 1.6)));
  const c = w.map(x => Math.floor(n * x / tot)); c[0] += n - c.reduce((a, b) => a + b, 0); return c;
}
function demoReport(s) {
  const n = s.resp, head = { n, title: s.title, dept_name: s.dept, start: s.start, end: s.end, gate: s.gate, memo: s.memo || '' };
  if (n < MASK) return { ...head, few: true };
  const real = s.id === 's3' || s.id === 's4' || s.id === 's6';   // 시안의 숫자를 그대로 쓰는 설문
  const qs = respQs(s).map(q => {
    if (q.type === 'text') return { id: q.id, t: q.t, type: 'text', n: 12, items: (DEMO_TEXT[q.id] || ['고맙습니다.', '좋았어요.', '다음에도 했으면 해요.', '함께해서 좋았어요.', '응원합니다.']).slice(), sub: !!q.sub };
    const cnt = demoCounts(s, q, n, real), nq = q.type === 'multi' ? Math.round(n * .98) : n, hidden = false;
    const mc = demoMask(cnt), oi = (q.o || []).findIndex(isOther), oth = real && oi >= 0 && DEMO_OTHER[C.app][q.id] || null;
    return { id: q.id, t: q.t, type: q.type, multi: q.type === 'multi', rank: q.type === 'rank', n: nq, rows: (q.o || []).map((o, i) => [o, mc[i]]), hidden, others: oth, sub: !!q.sub, max: q.max };
  });
  let quiz = null, pairs = [], yoy = null;
  const qz = quizOf(s);
  if (qz.length) {
    const nQ = Math.round(n * .89), ok = { c1: 46, c2: 41, c3: 24, c4: 28, c5: 19, c6: 14 };
    const rows = qz.map(q => ({ id: q.id, lv: q.lv, ok: real && ok[q.id] != null ? ok[q.id] : Math.round(nQ * ({ 쉬움: .85, 중간: .55, 어려움: .35 }[q.lv])) }));
    const lvls = QUIZ_LV.map(lv => { const rr = rows.filter(x => x.lv === lv); return [lv, rr.reduce((a, b) => a + b.ok, 0), rr.length * nQ]; });
    quiz = { n: nQ, rows, lvls };
    if (s.id === 's3') {
      quiz.prev_lvls = [['쉬움', 76, 92], ['중간', 41, 92], ['어려움', 29, 92]]; quiz.prev_n = 46;
      if (C.app === 'didako') pairs = [
        { id: 'd4quiz', title: '스스로 느끼는 수준과 성경 이해도 점검', n: 49, cols: ['많이 맞힘', '보통', '적게 맞힘'], rows: [['처음·조금 익숙', [null, 10, 11], 24], ['익숙·가르쳐 봄', [13, 9, null], 25]], kind: 'sig', stat: { name: 'chi', chi2: 10.9, df: 2, p: .004, v: .47, n: 49 }, small: 0 },
        { id: 'd2quiz', title: '성경 읽는 빈도와 성경 이해도 점검', n: 49, cols: ['많이 맞힘', '보통', '적게 맞힘'], rows: [['거의 매일', [5, null, null], 8], ['주 몇 번', [6, 6, null], 15], ['가끔', [null, 8, 6], 18], ['거의 안 읽어요', [null, null, 5], 8]], kind: 'sig', stat: { name: 'rho', rho: .44, p: .001, n: 49 }, small: 0 }];
    }
  }
  if (s.id === 's3') yoy = C.app === 'didako'
    ? { id: 'd2', q: '성경을 읽는 빈도는 어느 정도인가요?', label: "'거의 매일·주 몇 번' 읽어요", prev: [21, 52], cur: [26, 55], kind: 'weak', z: .72, p: .47, ci: [-12, 26] }
    : { id: 'k5', q: '나는 구원받은 하나님의 백성이라고 확신하나요?', label: "'그렇다'", prev: [30, 52], cur: [37, 55], kind: 'weak', z: 1.02, p: .31, ci: [-9, 28] };
  return { ...head, qs, quiz, pairs, yoy };
}
const demo = {
  load() { let d = lsj(demoKey(), null); if (!d || !Array.isArray(d.items)) { d = { items: demoSeed() }; ls.set(demoKey(), JSON.stringify(d)); } return d; },
  put(d) { ls.set(demoKey(), JSON.stringify(d)); },
  async list() {
    const d = this.load(), all = C.demoAll !== false, depts = DEMO_DEPTS.map(([id, name]) => ({ id, name }));
    const items = d.items.filter(x => all || x.deptId === 'dm1').map(x => JSON.parse(JSON.stringify(x)));
    items.forEach(x => { if (x.status === 'open' && x.end && new Date(x.end) <= NOW()) x.status = 'closed'; });
    return { scope: { all, depts: all ? depts : depts.slice(0, 1) }, items };
  },
  async save(s) {
    const d = this.load(); let x = s.id && d.items.find(y => y.id === s.id);
    const dn = (DEMO_DEPTS.find(([id]) => id === s.deptId) || [])[1];
    const row = { ...JSON.parse(JSON.stringify(s)), dept: s.linkMode === 'multi' ? '교회 전체' : (dn || s.dept) };
    if (!x) { row.id = 'n' + Date.now().toString(36); row.token = 'demo-' + row.id; row.status = 'draft'; row.resp = 0; d.items.unshift(row); x = row; }
    else Object.assign(x, { ...row, id: x.id, token: x.token, status: x.status, resp: x.resp });
    this.put(d); return JSON.parse(JSON.stringify(x));
  },
  async del(id) { const d = this.load(); d.items = d.items.filter(x => x.id !== id); this.put(d); },
  async open(id, o) {
    const d = this.load(), x = d.items.find(y => y.id === id), re = x.status === 'closed', st = re || !o.start ? isoOf(NOW()) : toLocal(o.start);
    Object.assign(x, { status: new Date(st) <= NOW() ? 'open' : 'sched', start: st, end: toLocal(o.end), limit: o.limit || null, closedText: o.closed_text || DEF_CLOSED, showAns: !!o.show_ans && x.check });
    if (!re) { x.gate = o.gate; x.code = o.gate === 'code' ? String(1000 + Math.floor(Math.random() * 9000)) : ''; x.oneN = o.gate === 'once' ? Math.max(5, o.once_n || 40) : 0; x.oneUsed = 0; }
    this.put(d); return JSON.parse(JSON.stringify(x));
  },
  async state(id, action, o) {
    const d = this.load(), x = d.items.find(y => y.id === id);
    if (action === 'open_now') { x.status = 'open'; x.start = isoOf(NOW()); }
    else if (action === 'unsched') { x.status = 'draft'; x.start = x.end = null; }
    else if (action === 'end') x.end = toLocal(o.end);
    else if (action === 'close') { x.status = 'closed'; x.end = isoOf(NOW()); }
    this.put(d); return JSON.parse(JSON.stringify(x));
  },
  async codes(id) { const x = this.load().items.find(y => y.id === id); return Array.from({ length: x.oneN || 0 }, (_, i) => 'DEMO' + p2(i + 1)); },
  async memo(id, text) { const d = this.load(); d.items.find(y => y.id === id).memo = text; this.put(d); },
  async report(id) { return demoReport(this.load().items.find(y => y.id === id)); },
  async openList() { return this.load().items.filter(x => x.status === 'open' && new Date(x.end) > NOW()).map(x => ({ id: x.id, token: x.token, title: x.title, dept_name: x.dept, end: toSrvTime(x.end), gate: x.gate })); }
};

// ══ 관리 화면: 주소 · 머리 · 목록 ═══════════════════════════════════════════
// 주소는 앱의 위치 주소를 쓴다: #survey (목록), #survey-s-설문번호 (한 설문), #survey-try-설문번호 (답하는 화면 미리보기)
const hashOf = sub => '#survey' + (sub ? '-' + sub : '');
const splitSub = sub => { const m = /^(s|try)-(.+)$/.exec(sub || ''); return m ? [m[1], m[2]] : ['', '']; };
const nav = sub => { location.hash = hashOf(sub); };
const headHtml = () => C.head ? C.head() : '';
const back2list = s => `<a class="back-link" href="${hashOf('')}">${ic('back')}<span>설문</span></a><p class="eyebrow top-eyebrow">${esc(s.dept)}</p><h1>${esc(s.title)}</h1>`;
const notReady = e => /could not find|schema cache|does not exist|PGRST20|404/i.test((e && (e.message || '') + ' ' + (e.code || '')) || '');
function errorView(sub) {
  const e = ST.error, ready = notReady(e);
  return `${sub ? '' : headHtml()}<section class="card empty"><h2>${ready ? '설문 기능을 준비하고 있어요' : '설문을 불러오지 못했어요'}</h2>
    <p>${ready ? '서버 준비가 끝나면 열려요. 조금만 기다려 주세요.' : esc(e.message || '잠시 뒤에 다시 해 주세요.')}</p><button class="btn ghost" type="button" data-sv="retry">${ic('refresh')}다시 해 보기</button></section>`;
}

// ── 설문 목록 ──
function svCard(s) {
  const dot = { open: '', sched: 'sched', draft: 'ring', closed: 'off' }[s.status];
  const sub = `${ST.scope.all ? esc(s.dept) + ', ' : ''}${qCountText(s)}`;
  const chip = {
    open: `<span class="chip on">${s.resp}명 답함, ${leftText(s.end)}</span>`,
    sched: `<span class="chip sched">${fmt(s.start)}에 열려요</span>`,
    draft: `<span class="chip">아직 열지 않았어요</span>`,
    closed: `<span class="chip">${fmtDay(s.end)} 닫음, ${s.resp}명 답함</span>`
  }[s.status];
  return `<a class="card sv-card" href="${hashOf('s-' + s.id)}"><span class="t-row"><i class="ad-dot ${dot}"></i><b>${esc(s.title)}</b>${ic('chev', 'chev-r')}</span><small>${sub}</small>${chip}</a>`;
}
function viewList() {
  const L = ST.items, live = L.filter(s => s.status === 'open' || s.status === 'sched'), drafts = L.filter(s => s.status === 'draft'),
    past = L.filter(s => s.status === 'closed').sort((a, b) => new Date(b.end) - new Date(a.end));
  const sec = (h, x) => x.length ? `<p class="gl">${h}</p><div class="sv-grid">${x.map(svCard).join('')}</div>` : '';
  const tipOn = ls.get('sv-tip-v2') === '1' ? '' : `<aside class="tg-tip" role="note"><p><b>처음이세요?</b>설문을 만들어 링크나 QR로 보내면, 앱이 없는 분도 이름 없이 답해요. 결과는 설문을 닫은 뒤 합계로 봐요.</p><button class="btn small ghost" type="button" data-sv="tipok">알겠어요</button></aside>`;
  const body = L.length ? sec('진행 중', live) + sec('만드는 중', drafts) + sec('지난 설문', past)
    : `<section class="card empty"><h2>아직 설문이 없어요</h2><p>틀을 고르면 문항이 채워져서, 몇 분이면 첫 설문을 열 수 있어요.</p><button class="btn" type="button" data-sv="new">새 설문 만들기</button></section>`;
  const side = `<section class="card"><h2>설문은 이렇게 해요</h2><ol class="flow">
      <li><span><b>틀을 가져오거나 직접 만들어요</b><small>${esc(A().name)} 기본 틀(${A().tpls.map(t => esc(t.nm)).join(', ')}) 가운데 골라 가져와 고치거나, 빈 설문으로 새로 써요. 기본 틀 원본은 바뀌지 않아요.</small></span></li>
      <li><span><b>열고 링크나 QR을 보내요</b><small>앱이 없어도, 가입하지 않아도 답할 수 있어요.</small></span></li>
      <li><span><b>닫으면 결과를 봐요</b><small>합계와 쉬운 문장으로 보여 드려요.</small></span></li></ol></section>`;
  return `${headHtml()}${tipOn}
    <div class="two-col"><div class="col">
      ${L.length ? `<div class="new-row"><button class="btn" type="button" data-sv="new">새 설문 만들기</button></div>` : ''}
      <div>${body}</div>
    </div><div class="col side">${side}</div></div>
    <p class="lockline">${ic('lock')} 답한 사람의 이름은 어디에도 남지 않아요. 5명 미만인 칸은 가려요.</p>`;
}

// ── 새 설문 창: 고르면 바로 문항 고치기로 ──
function newDeptId() { return ST.newDept === 'all' && ST.scope.all ? 'all' : (ST.scope.depts.some(d => d.id === ST.newDept) ? ST.newDept : (ST.scope.depts[0] || {}).id); }
function newSheet() {
  const closed = ST.items.filter(s => s.status === 'closed');
  const pick = (act, icon, title, desc, tag, v) => `<button class="pick" type="button" data-sv="${act}"${v != null ? ` data-v="${esc(v)}"` : ''}><span class="pk-ic">${ic(icon)}</span><span class="pk-t"><b>${title}${tag ? ` <span class="chip on">${tag}</span>` : ''}</b><small>${desc}</small></span>${ic('chev', 'chev-r')}</button>`;
  const cur = newDeptId();
  const choices = [...ST.scope.depts.map(d => [d.id, d.name]), ...(ST.scope.all ? [['all', '교회 전체']] : [])];
  const depts = choices.length > 1 ? `<div class="tip-line"><span class="f-label">누구에게 물을까요?</span>${tip(cur === 'all' ? '링크 하나로 여러 부서가 답해요. 첫 문항에서 부서를 골라요.' : '이 부서만 쓰는 링크가 생겨요. 부서는 묻지 않아도 돼요.', '누구에게')}</div><div class="types" role="radiogroup" aria-label="부서">${choices.map(([id, n]) => `<button type="button" class="type-b${cur === id ? ' on' : ''}" role="radio" aria-checked="${cur === id}" data-sv="new-dept" data-v="${esc(id)}">${esc(n)}</button>`).join('')}</div>` : '';
  pop(`<h2 class="sheet-h">새 설문</h2><p class="sheet-sub">시작할 문항을 고르면 바로 고칠 수 있어요.</p>
    ${depts}<div class="tip-line"><span class="f-label">${esc(A().name)} 기본 틀</span>${tip(`가져온 사본을 고쳐요. 기본 틀 원본은 바뀌지 않아요.${A().quiz ? ' 성경 이해도 스스로 점검을 더할 수 있어요.' : ''}`, '기본 틀')}</div>
    ${A().tpls.map((t, i) => pick('new-tpl', t.icon || 'spark', esc(t.nm), `${A().tpls.length > 1 ? esc(t.short) + ' ' : ''}문항 ${countQ(t.questions)}개, 약 ${t.mins}분`, i ? '' : '추천', i)).join('')}
    <div class="tip-line"><span class="f-label">우리 교회 설문</span>${closed.length ? tip('지난 설문을 복사해 같은 문항을 그대로 두면, 결과에서 작년과 나란히 볼 수 있어요.', '우리 교회 설문') : ''}</div>
    ${closed.length ? pick('new-copy', 'copy', '지난 설문 복사해서 고치기', '문항만 가져와요') : ''}
    ${pick('new-blank', 'plus', '빈 설문에서 직접 만들기', '문항을 처음부터 직접 써요.')}
    <div class="sheet-acts"><button class="btn ghost" type="button" data-sv="pop-close">닫기</button></div>`);
}
function copySheet() {
  const closed = ST.items.filter(s => s.status === 'closed');
  pop(`<h2 class="sheet-h">어느 설문을 복사할까요?</h2><p class="sheet-sub">문항만 가져오고 응답은 가져오지 않아요.</p>
    ${closed.map(s => `<button class="pick" type="button" data-sv="new-from" data-v="${esc(s.id)}"><span class="pk-ic">${ic('file')}</span><span class="pk-t"><b>${esc(s.title)}</b><small>${esc(s.dept)}, ${qCountText(s)}, ${fmtDay(s.end)} 닫음</small></span>${ic('chev', 'chev-r')}</button>`).join('')}
    <div class="sheet-acts"><button class="btn ghost" type="button" data-sv="new">${ic('back')}뒤로</button></div>`);
}
// 만드는 동안(서버가 느릴 수 있다) 같은 단추를 또 눌러도 하나만 만든다
let creating = false;
async function createDraft(kind, src, ti) {
  if (creating) return;
  creating = true;
  const pp = document.getElementById('svPop');
  if (pp) { pp.querySelectorAll('button').forEach(b => { b.disabled = true; }); const sub = pp.querySelector('.sheet-sub'); if (sub) sub.textContent = '만드는 중이에요…'; }
  try { await createDraftRun(kind, src, ti); } finally { creating = false; if (pp) pp.querySelectorAll('button').forEach(b => { b.disabled = false; }); }
}
async function createDraftRun(kind, src, ti) {
  const tpl = A().tpls[+ti || 0] || A().tpls[0];   // 기본 틀로 만들 때 고른 틀
  let linkMode, deptId;
  if (src) { linkMode = src.linkMode; deptId = src.deptId; }
  else if (newDeptId() === 'all') { linkMode = 'multi'; deptId = null; }
  else { linkMode = 'dept'; deptId = newDeptId(); }
  const dname = linkMode === 'multi' ? '교회 전체' : ((ST.scope.depts.find(d => d.id === deptId) || {}).name || (src && src.dept) || '');
  const qs = kind === 'blank' ? [newQ()] : kind === 'copy' ? qsAll(src).map(cloneQ) : tpl.questions.map(cloneQ);
  const y = NOW().getFullYear();
  const title = kind === 'copy' ? src.title.replace(/^(\d{4}) (봄|가을)/, (m, yy, ss) => ss === '봄' ? `${yy} 가을` : `${+yy + 1} 봄`) : kind === 'blank' ? '제목 없는 설문' : `${linkMode === 'multi' ? '교회' : dname} ${tpl.nm}`;
  const s = { id: null, title, deptId, dept: dname, linkMode, status: 'draft', start: null, end: null, limit: null, gate: 'open', code: '', closedText: DEF_CLOSED, showAns: false, resp: 0, oneN: 0, oneUsed: 0, memo: '', token: '',
    check: kind === 'copy' ? !!src.check : !!tpl.quiz && kind !== 'blank', quizIds: kind === 'copy' && src.quizIds ? [...src.quizIds] : null, qs, prev: kind === 'copy' ? src.id : null, from: kind, fromTitle: src ? src.title : kind === 'tpl' ? tpl.nm : '' };
  normDept(s);
  let saved;
  try { saved = await adapter.save(s); } catch (e) { toast(rpcErr(e)); return; }
  ST.items.unshift(saved); popClose();
  ST.openQ = kind === 'blank' ? 0 : null; ST.keepQ = true;
  nav('s-' + saved.id);
  toast(kind === 'copy' ? '문항을 가져왔어요. 고칠 것만 고치세요.' : kind === 'blank' ? '첫 문항을 써 보세요.' : '틀을 채웠어요. 문항을 눌러 고칠 수 있어요.');
}

// ══ 문항 고치기(초안) ═══════════════════════════════════════════════════════
function optPreview(q) {
  if (q.type === 'text') return `<span class="qc-o"><span>글로 답해요</span></span>`;
  const o = (q.o || []).filter(Boolean), more = o.length - 5;
  return o.length ? `<span class="qc-o">${o.slice(0, 5).map(x => `<span>${esc(x)}</span>`).join('')}${more > 0 ? `<span>+${more}</span>` : ''}</span>` : '';
}
function lockCard(s, q) {   // 소속 문항: 앱이 정한 고정 문항이라 고칠 수 없다
  const why = s.linkMode === 'dept' ? '부서별 링크라 답하는 화면에서는 묻지 않아요' : '보기는 교회 부서 목록이에요';
  return `<div class="card qc lock"><div class="qc-head" aria-label="고정 문항: ${esc(q.t)}"><span class="qc-no">${ic('lock')}</span>
    <span class="qc-body"><span class="qc-t">${esc(q.t)}</span>${optPreview(q)}<span class="qc-meta">고정 문항이에요. ${why}</span></span></div></div>`;
}
function qCard(s, q, i, no) {
  if (q.dept) return lockCard(s, q);
  if (ST.openQ !== i) {
    const meta = [TYPES[q.type], q.opt ? '<span class="opt">선택</span>' : '', q.edited ? '<span class="edited">고침</span>' : q.custom ? '직접 만든 문항' : '', q.sub ? '앞 문항에 이어서' : ''].filter(Boolean).join(', ');
    return `<div class="card qc"><button class="qc-head" type="button" data-sv="q-open" data-i="${i}" aria-label="${no}번 문항 고치기"><span class="qc-no">${q.sub ? '└' : no}</span>
      <span class="qc-body"><span class="qc-t">${q.t ? esc(q.t) : '<span class="soft">(문항을 써 주세요)</span>'}</span>${optPreview(q)}<span class="qc-meta">${meta}</span></span>${ic('edit')}</button></div>`;
  }
  const tb = t => `<button type="button" class="type-b${q.type === t ? ' on' : ''}" data-sv="q-type" data-i="${i}" data-v="${t}" aria-pressed="${q.type === t}">${TYPES[t]}</button>`;
  const mk = q.type === 'multi' || q.type === 'rank' ? 'sq' : '';
  const optTip = [(q.o || []).some(isOther) ? "'기타'를 고르면 답하는 사람이 직접 적을 칸이 열려요." : '', q.type === 'multi' ? `답하는 사람은 ${q.max || 3}개까지 고를 수 있어요.` : q.type === 'rank' ? '답하는 사람이 순서대로 3개까지 눌러요.' : q.type === 'range' ? '작은 것부터 큰 것 순서로 써 주세요. 보고서에서 순서대로 보여요.' : ''].filter(Boolean).join(' ');
  const opts = q.type === 'text' ? `<p class="hint">글로 답해요(300자까지).</p>`
    : `<div class="tip-line"><span class="f-label">보기</span>${optTip ? tip(optTip, '보기') : ''}</div><div>${(q.o || []).map((x, j) => `<div class="oe"><span class="mk ${mk}"></span><input class="field" data-svin="q-o" data-i="${i}" data-j="${j}" value="${esc(x)}" placeholder="보기 ${j + 1}" maxlength="40" aria-label="보기 ${j + 1}"><button class="icon-x" type="button" data-sv="o-del" data-i="${i}" data-j="${j}" aria-label="보기 ${j + 1} 지우기"${(q.o || []).length <= 2 ? ' disabled' : ''}>${ic('x')}</button></div>`).join('')}</div>
      <div class="acts"><button class="link-btn" type="button" data-sv="o-add" data-i="${i}"${(q.o || []).length >= 12 ? ' disabled' : ''}>${ic('plus')}보기 더하기</button>${q.type !== 'range' && !(q.o || []).some(isOther) ? `<button class="link-btn" type="button" data-sv="o-other" data-i="${i}">${ic('plus')}'기타' 더하기</button>` : ''}</div>`;
  const last = qsAll(s).length - 1;
  return `<div class="card qc on" id="svqc-${i}"><div class="qc-ed">
    <div class="tip-line"><label class="f-label" for="svqt-${i}">${q.sub ? '이어 묻는 문항' : no + '번 문항'}</label>${q.custom || q.edited ? '' : tip('그대로 두면 결과에서 작년과 나란히 볼 수 있어요. 고치면 나란히 보기와 두 문항 함께 보기에서 빠져요.', '문항')}</div>
    <textarea class="field" id="svqt-${i}" data-svin="q-t" data-i="${i}" rows="2" maxlength="120" placeholder="무엇을 물을까요?">${esc(q.t)}</textarea>
    ${q.edited ? `<p class="hint">고친 문항이라 작년과 나란히 보기에서 빠져요.</p>` : ''}
    <div class="tip-line"><span class="f-label">답 유형</span>${tip("하나만: 보기 하나를 골라요. 여러 개: 몇 개를 함께 골라요. 순위: 중요한 순서대로 3개까지 골라요. 구간: 30분 이하·30~60분처럼 작은 것부터 큰 것 순서가 있는 보기예요. 직접 쓰기: 글로 답해요.", "답 유형")}</div><div class="types">${EDIT_TYPES.map(tb).join('')}</div>
    ${opts}
    <div class="qc-foot"><span class="req-sw"><button class="switch${q.opt ? '' : ' on'}" type="button" role="switch" aria-checked="${!q.opt}" data-sv="q-req" data-i="${i}" aria-label="필수 문항"><span></span></button>필수</span>
      <button class="icon-x" type="button" data-sv="q-move" data-i="${i}" data-v="-1" aria-label="위로"${i === 0 || (qsAll(s)[i - 1] || {}).dept ? ' disabled' : ''}>${ic('up')}</button>
      <button class="icon-x" type="button" data-sv="q-move" data-i="${i}" data-v="1" aria-label="아래로"${i === last ? ' disabled' : ''}>${ic('down')}</button>
      <button class="icon-x" type="button" data-sv="q-dup" data-i="${i}" aria-label="복제">${ic('copy')}</button>
      <button class="icon-x" type="button" data-sv="q-del" data-i="${i}" aria-label="지우기">${ic('trash')}</button>
      <button class="btn small" type="button" data-sv="q-done">완료</button></div>
  </div></div>`;
}
function quizPicked(s) {
  const used = usedBefore(s), qz = quizOf(s), custom = s.quizIds && s.quizIds.join() !== DID_QUIZ_IDS.join();
  return `<ul class="qz-list">${qz.map((q, k) => `<li><span class="chip sched">${q.lv}</span><span class="qz-t">${esc(q.t)}${used.includes(q.id) ? '<small class="soft">지난번에도 썼어요</small>' : ''}</span><button class="link-btn" type="button" data-sv="qz-swap" data-k="${k}">바꾸기</button></li>`).join('')}</ul>
    <div class="acts qz-acts"><button class="link-btn" type="button" data-sv="qz-fresh">${ic('refresh')}${used.length ? '지난번과 다른 문항으로 모두 바꾸기' : '다른 문항으로 모두 바꾸기'}</button>${custom ? `<button class="link-btn quiet" type="button" data-sv="qz-default">기본 6문항으로</button>` : ''}</div>`;
}
function savedHtml() {
  const k = ST.saveState;
  return k === 'fail' ? `<span class="saved" data-st="fail" style="color:var(--warn)">저장하지 못했어요 <button class="link-btn" type="button" data-sv="save-retry" style="min-height:0">다시 저장</button></span>`
    : `<span class="saved" data-st="${k}">${ic('check')}${k === 'saved' ? '저장됨' : '저장 중…'}</span>`;
}
function paintSaved() { const el = $('#svRoot .ed-meta .saved'); if (el) el.outerHTML = savedHtml(); }
function viewEdit(s) {
  let no = 0; const list = qsAll(s);
  const cards = list.map((q, i) => { if (!q.sub && !q.dept) no++; return qCard(s, q, i, no); }).join('');
  const quiz = A().quiz ? `<section class="card"><div class="set-row"><span><b>성경 이해도 스스로 점검</b>${tip(`점수는 아무도 볼 수 없고, 교회에는 합계만 남아요. 문항 모음 ${DID_BANK.length}개에서 쉬움·중간·어려움 2개씩 골라요. 바꿀 때도 같은 난이도 안에서 골라야 해마다 난이도별로 견줄 수 있어요.`, '스스로 점검')}<br><small class="soft">6문항, 약 ${A().quizMins}분</small></span>
      <button class="switch${s.check ? ' on' : ''}" type="button" role="switch" aria-checked="${!!s.check}" data-sv="quiz-on" aria-label="스스로 점검 넣기"><span></span></button></div>
      ${s.check ? quizPicked(s) : ''}</section>` : '';
  const side = `<section class="card pc-only"><h2>다 만들었으면</h2><p class="hint" style="margin:.4em 0 1em">답하는 화면을 미리 보고 여세요. 여는 창에서 닫는 날과 받는 방법을 정해요.</p>
      <div class="acts" style="flex-direction:column"><button class="btn" type="button" data-sv="open-sheet" data-id="${esc(s.id)}">${ic('send')}설문 열기</button><a class="btn ghost" href="${hashOf('try-' + s.id)}">${ic('eye')}답하는 화면 미리보기</a></div></section>
    <section class="card"><h2>누구에게</h2><p class="hint" style="margin:.4em 0 0">${s.linkMode === 'multi' ? '교회 전체에 묻는 설문이에요. 링크 하나로 여러 부서가 답하고, 첫 문항에서 소속을 골라요.' : `${esc(s.dept)}에 묻는 설문이에요. 이 부서만 쓰는 링크가 생겨요.`}</p></section>`;
  return `<a class="back-link" href="${hashOf('')}">${ic('back')}<span>설문</span></a><p class="eyebrow top-eyebrow">${esc(s.dept)}, 만드는 중</p>
    <input class="title-in" data-svin="title" value="${esc(s.title)}" maxlength="40" aria-label="설문 이름(눌러서 고치기)">
    <p class="ed-meta">${savedHtml()}${tip(`${qCountText(s)}, 약 ${minsOf(s)}분이에요. 고친 것은 저절로 저장돼요. ${originText(s, true)}`, '이 설문')}</p>
    <div class="two-col"><div class="col">${cards}<button class="add-q" type="button" data-sv="q-add">${ic('plus')}문항 더하기</button>${quiz}
      <div class="acts" style="justify-content:space-between"><button class="link-btn warn" type="button" data-sv="del-draft" data-id="${esc(s.id)}">${ic('trash')}이 설문 지우기</button></div></div>
    <div class="col side pc-side">${side}</div></div>`;
}
const stickEdit = s => `<div class="stickbar"><a class="btn ghost" href="${hashOf('try-' + s.id)}" aria-label="미리보기">${ic('eye')}미리보기</a><button class="btn" type="button" data-sv="open-sheet" data-id="${esc(s.id)}">${ic('send')}설문 열기</button></div>`;

// ── 자동 저장: 고친 뒤 잠깐 있다가 서버에 올린다. 한 번에 하나씩 ──
let saveT = 0, saveBusy = null;
function touch(s) { ST.saveState = 'dirty'; paintSaved(); clearTimeout(saveT); saveT = setTimeout(() => flush(s.id), 700); }
async function flush(id) {
  clearTimeout(saveT);
  if (saveBusy) await saveBusy;
  if (ST.saveState === 'saved') return true;
  const s = byId(id); if (!s || s.status !== 'draft') return true;
  ST.saveState = 'saving'; paintSaved();
  saveBusy = (async () => { try { await adapter.save(s); if (ST.saveState === 'saving') ST.saveState = 'saved'; } catch (e) { ST.saveState = 'fail'; toast(rpcErr(e)); } paintSaved(); })();
  await saveBusy; saveBusy = null; return ST.saveState === 'saved';
}

// ── 열기 창: 닫는 때 · 받는 방법을 한 창에서. 나머지는 "더 정하기" 안에 ──
function openSheetState(s, mode) {
  return { id: s.id, mode, startNow: true, startD: sundayAfter(0, 9).slice(0, 10), startT: '09:00', endK: 'sun1', endD: sundayAfter(1).slice(0, 10), endT: '14:00',
    gate: s.gate || 'open', onceN: s.oneN || 40, limitOn: !!s.limit, limit: s.limit || 120, closedText: s.closedText || DEF_CLOSED, showAns: !!s.showAns };
}
const openEnd = o => o.endK === 'sun0' ? sundayAfter(0) : o.endK === 'sun1' ? sundayAfter(1) : `${o.endD}T${o.endT}`;
const openStart = o => o.startNow ? isoOf(NOW()) : `${o.startD}T${o.startT}`;
function whenText(o) {
  const st = openStart(o), en = openEnd(o);
  if (new Date(en) <= new Date(st)) return `<span class="warn-text" style="color:var(--warn)">닫는 때가 여는 때보다 앞이에요. 날짜를 다시 골라 주세요.</span>`;
  return `${o.startNow ? '지금 열고' : `<b>${fmt(st)}</b>에 열리고`} <b>${fmt(en)}</b>에 저절로 닫혀요.${o.limitOn ? ` 답이 ${o.limit}개가 되면 그 전에 닫혀요.` : ''}`;
}
function renderOpenSheet() {
  const o = OPEN, s = byId(o.id), re = o.mode === 'reopen';
  const ch = (k, l) => `<button type="button" class="type-b${o.endK === k ? ' on' : ''}" data-sv="op-end" data-v="${k}" aria-pressed="${o.endK === k}">${l}</button>`;
  const radio = (k, icon, title, desc, extra = '') => `<div class="radio${o.gate === k ? ' on' : ''}" role="radio" tabindex="0" aria-checked="${o.gate === k}" data-sv="op-gate" data-v="${k}"><span class="dot"></span><span class="r-t"><b>${title}</b><small>${desc}</small>${o.gate === k ? extra : ''}</span></div>`;
  pop(`<h2 class="sheet-h">${re ? '다시 열기' : '설문 열기'}</h2><p class="sheet-sub">${re ? `지금까지 받은 ${s.resp}명의 답은 그대로 있어요. 새로 닫는 때를 정해 주세요.` : '두 가지만 정하면 돼요.'}</p>
    <span class="f-label">언제까지 받을까요?</span>
    <div class="types">${ch('sun0', `이번 주일까지`)}${ch('sun1', '다음 주일까지')}${ch('pick', '날짜 고르기')}</div>
    ${o.endK === 'pick' ? `<div class="dt-row"><input class="field" type="date" data-svin="op-endD" value="${o.endD}" aria-label="닫는 날"><input class="field" type="time" data-svin="op-endT" value="${o.endT}" aria-label="닫는 시각"></div>` : ''}
    ${re ? '' : `<span class="f-label">누가 답할 수 있나요?</span>
    ${radio('open', 'link', '링크를 받은 누구나', '한 기기에서 한 번만 답할 수 있어요. 가장 쉬워요.')}
    ${radio('code', 'key', '현장 코드를 아는 사람', '모임 때 화면에 숫자 4자리를 보여 줘요. 링크가 밖으로 퍼져도 괜찮아요.')}
    ${radio('once', 'ticket', '일회용 코드를 받은 사람', '코드 카드를 한 사람에 한 장씩 나눠 줘요. 한 장에 한 번만 답해요.', `<span class="extra"><input class="field" type="number" min="5" max="500" data-svin="op-onceN" value="${o.onceN}" aria-label="코드 수">장 만들기</span>`)}`}
    <details class="more-set"${o.moreOpen ? ' open' : ''}><summary data-sv="op-more">${ic('chev')}더 정하기 (여는 때, 답 수 제한, 닫힌 뒤 안내 글)</summary>
      <div class="set-row"><span><b style="font-weight:600">지금 바로 열기</b><small>${o.startNow ? '끄면 여는 날을 정해 예약할 수 있어요.' : '정한 때에 저절로 열려요.'}</small></span><button class="switch${o.startNow ? ' on' : ''}" type="button" role="switch" aria-checked="${o.startNow}" data-sv="op-now" aria-label="지금 바로 열기"><span></span></button></div>
      ${o.startNow ? '' : `<div class="dt-row" style="margin-bottom:.4em"><input class="field" type="date" data-svin="op-startD" value="${o.startD}" aria-label="여는 날"><input class="field" type="time" data-svin="op-startT" value="${o.startT}" aria-label="여는 시각"></div>`}
      <div class="set-row"><span><b style="font-weight:600">답 수 제한</b><small>정한 수가 차면 저절로 닫혀요.</small></span><button class="switch${o.limitOn ? ' on' : ''}" type="button" role="switch" aria-checked="${o.limitOn}" data-sv="op-limit" aria-label="답 수 제한"><span></span></button></div>
      ${o.limitOn ? `<div class="radio-free" style="display:flex;align-items:center;gap:.5em;margin-bottom:.4em"><input class="field" type="number" min="5" max="2000" data-svin="op-limitN" value="${o.limit}" style="width:7em" aria-label="최대 답 수"><span class="soft">개까지 받기</span></div>` : ''}
      ${A().quiz && s.check ? `<div class="set-row"><span><b style="font-weight:600">점검 정답 보여 주기</b><small>답한 사람의 기기에서만 보여요.</small></span><button class="switch${o.showAns ? ' on' : ''}" type="button" role="switch" aria-checked="${o.showAns}" data-sv="op-ans" aria-label="점검 정답 보여 주기"><span></span></button></div>` : ''}
      <label class="f-label" for="svOpClosed">닫힌 뒤 링크를 열면 보일 글</label><textarea class="field" id="svOpClosed" rows="2" data-svin="op-closed" maxlength="80">${esc(o.closedText)}</textarea>
    </details>
    <p class="when" id="svOpWhen">${whenText(o)}</p>
    <div class="sheet-acts"><button class="btn ghost" type="button" data-sv="pop-close">취소</button><button class="btn" type="button" data-sv="op-go">${o.startNow ? (re ? '다시 열기' : '열기') : '예약하기'}</button></div>`);
}
async function doOpen() {
  const o = OPEN, s = byId(o.id), st = openStart(o), en = openEnd(o);
  if (new Date(en) <= new Date(st)) { toast('닫는 때를 여는 때보다 뒤로 골라 주세요.'); return; }
  const re = o.mode === 'reopen', p = { start: o.startNow ? null : st, end: en, gate: o.gate, once_n: Math.max(5, +o.onceN || 40), limit: o.limitOn ? Math.max(5, +o.limit || 120) : 0, closed_text: o.closedText.trim() || DEF_CLOSED, show_ans: o.showAns };
  const btn = $('#svPopSheet [data-sv="op-go"]'); if (btn) btn.disabled = true;
  try { const r = await adapter.open(s.id, p); Object.assign(s, r); } catch (e) { if (btn) btn.disabled = false; toast(rpcErr(e)); return; }
  popClose(); delete ST.rep[s.id]; paint();
  toast(s.status === 'sched' ? `예약했어요. ${fmt(s.start)}에 열려요.` : re ? '다시 열었어요.' : '열었어요. 이제 링크나 QR을 보내 주세요.');
}
function endSheet(s) { OPEN = { ...openSheetState(s, 'end'), endK: 'pick', endD: s.end.slice(0, 10), endT: s.end.slice(11, 16) }; renderEndSheet(); }
function renderEndSheet() {
  const o = OPEN, ch = (k, l) => `<button type="button" class="type-b${o.endK === k ? ' on' : ''}" data-sv="op-end" data-v="${k}" aria-pressed="${o.endK === k}">${l}</button>`;
  pop(`<h2 class="sheet-h">닫는 때 바꾸기</h2><p class="sheet-sub">받은 답은 그대로 있어요.</p>
    <div class="types">${ch('sun0', '이번 주일까지')}${ch('sun1', '다음 주일까지')}${ch('pick', '날짜 고르기')}</div>
    ${o.endK === 'pick' ? `<div class="dt-row"><input class="field" type="date" data-svin="op-endD" value="${o.endD}" aria-label="닫는 날"><input class="field" type="time" data-svin="op-endT" value="${o.endT}" aria-label="닫는 시각"></div>` : ''}
    <p class="when" id="svOpWhen"><b>${fmt(openEnd(o))}</b>에 저절로 닫혀요.</p>
    <div class="sheet-acts"><button class="btn ghost" type="button" data-sv="pop-close">취소</button><button class="btn" type="button" data-sv="end-go">바꾸기</button></div>`);
}

// ══ 열린 설문 · 예약된 설문: 맨 위에 지금 상태와 보내기 ═══════════════════════
function viewLive(s) {
  if (!window.qrcode) loadQr().then(ok => { if (ok && $('#svRoot .share')) paint(); });   // QR 만드는 파일은 처음 필요할 때 받는다
  const open = s.status === 'open', url = respUrl(s);
  const hero = open ? `<section class="card hero"><span class="chip on" style="align-self:flex-start">● 받는 중</span>
      ${s.resp ? `<span class="big">${s.resp}<small>명이 답했어요</small></span>` : '<span class="big" style="font-size:1.6em">아직 답이 없어요</span>'}
      <p>${fmt(s.end)}에 저절로 닫혀요(${leftText(s.end)}).${s.limit ? ` ${s.limit}개까지 받아요.` : ''}</p>
      <p class="note">${ic('lock')}<span>결과는 닫은 뒤에 볼 수 있어요.${tip('받는 동안 합계가 바뀌는 걸 보면 누가 어떻게 답했는지 짐작할 수 있어서 닫은 뒤에만 보여 드려요.', '결과')}</span></p></section>`
    : `<section class="card hero"><span class="chip sched" style="align-self:flex-start">${ic('clock')}예약됨</span>
      <span class="big" style="font-size:1.45em">${fmt(s.start)}에 열려요</span><p>${fmt(s.end)}에 저절로 닫혀요.</p>
      <div class="acts" style="margin-top:.6em"><button class="btn small" type="button" data-sv="open-now" data-id="${esc(s.id)}">지금 바로 열기</button></div></section>`;
  const share = `<section class="card"><h2>링크·QR 보내기${tip(open ? '앱이 없어도 이 링크나 QR로 답할 수 있어요. 단톡방에 올리거나 주보나 화면에 띄우세요.' : '미리 보내 둬도 돼요. 열리기 전에 들어오면 "아직 열리지 않았어요"가 보여요.', '링크와 QR')}</h2>
      <div class="share" style="margin-top:.8em"><div class="qr">${qrSvg(url)}</div><div class="share-r"><span class="url">${esc(url)}</span>
        <div class="acts"><button class="btn" type="button" data-sv="copy-link" data-id="${esc(s.id)}">${ic('copy')}링크 복사</button><button class="btn ghost" type="button" data-sv="share-link" data-id="${esc(s.id)}">${ic('send')}보내기</button></div>
        <div class="acts"><button class="btn small ghost" type="button" data-sv="qr-big" data-id="${esc(s.id)}">${ic('qr')}QR 크게 띄우기</button><button class="btn small ghost" type="button" data-sv="print-sheet" data-id="${esc(s.id)}">${ic('print')}안내지 인쇄</button></div></div></div></section>`;
  const gate = s.gate === 'code' ? `<section class="card"><h2>현장 코드${tip('링크를 받은 사람도 이 숫자를 알아야 답할 수 있어요. 모임 때 보여 주세요.', '현장 코드')}</h2><div class="code-line" style="margin-top:.3em"><span class="code-big">${esc(s.code)}</span><button class="btn small ghost" type="button" data-sv="code-big" data-id="${esc(s.id)}">화면에 크게 띄우기</button></div></section>`
    : s.gate === 'once' ? `<section class="card"><h2>일회용 코드${tip('한 장에 한 번만 답할 수 있어요. 어떤 코드로 누가 답했는지는 남지 않아요.', '일회용 코드')}</h2><p style="margin:.4em 0 .2em"><b>${s.oneN}장</b> 중 ${s.oneUsed}장 썼어요</p><div class="acts" style="margin-top:.7em"><button class="btn small ghost" type="button" data-sv="print-codes" data-id="${esc(s.id)}">${ic('print')}코드 카드 인쇄</button></div></section>` : '';
  const row = (act, icon, t, sub, cls = '', href) => href ? `<a class="ad-mrow ${cls}" href="${href}">${ic(icon, 'lead')}<span class="ad-t"><b>${t}</b>${sub ? `<small>${sub}</small>` : ''}</span>${ic('chev', 'chev-r')}</a>`
    : `<button class="ad-mrow ${cls}" type="button" data-sv="${act}" data-id="${esc(s.id)}">${ic(icon, 'lead')}<span class="ad-t"><b>${t}</b>${sub ? `<small>${sub}</small>` : ''}</span>${ic('chev', 'chev-r')}</button>`;
  const manage = `<section class="card ad-rows">
      ${row('', 'eye', '답하는 화면 미리보기', '', '', hashOf('try-' + s.id))}
      ${row('end-change', 'clock', '닫는 때 바꾸기', '')}
      ${open ? row('q-view', 'file', '문항 보기', '') : row('unsched', 'edit', '문항 고치기', '')}
      ${row('dup', 'copy', '복사해서 새 설문', '')}
      ${open ? row('close-now', 'stop', '지금 닫기', '', 'warn') : row('unsched', 'x', '예약 취소', '', 'warn')}</section>`;
  return `${back2list(s)}<div class="two-col"><div class="col">${hero}${share}${gate}</div><div class="col side">${manage}</div></div>`;
}

// ── 큰 화면(QR·현장 코드를 모임 화면에 띄운다) ──
function board(html) { ensureLayers(); let b = $('#svBoard'); if (!b) { b = document.createElement('div'); b.id = 'svBoard'; b.className = 'sv board'; document.body.appendChild(b); } b.innerHTML = `<button class="icon-btn board-x" type="button" data-sv="board-x" aria-label="닫기">${ic('x')}</button>${html}`; b.hidden = false; }
// ── 인쇄: 안내지(QR), 일회용 코드 카드 ──
function printHtml(html) {
  let p = $('#svPrint'); if (!p) { p = document.createElement('div'); p.id = 'svPrint'; document.body.appendChild(p); }
  p.className = 'sv'; p.innerHTML = html; document.body.classList.add('sv-printing');
  const done = () => { document.body.classList.remove('sv-printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done); setTimeout(() => window.print(), 60); setTimeout(done, 60000);
}
const churchName = () => (C.church && C.church()) || '';
function printSheet(s) {
  const url = respUrl(s);
  printHtml(`<div class="sv-sheet"><p>${esc(churchName())} ${esc(s.linkMode === 'multi' ? '' : s.dept)}</p><h1>${esc(s.title)}</h1><p>휴대폰 카메라로 비춰 이름 없이 답해 주세요.</p>
    <div class="qr">${qrSvg(url)}</div><p class="url">${esc(url)}</p>${s.gate === 'code' ? `<p>현장 코드</p><p class="code-big">${esc(s.code)}</p>` : ''}<p>${fmt(s.end)}까지 받아요.</p></div>`);
}
async function printCodes(s) {
  let codes; try { codes = await adapter.codes(s.id); } catch (e) { toast(rpcErr(e)); return; }
  if (!codes.length) { toast('코드가 없어요.'); return; }
  printHtml(`<div class="sv-sheet" style="padding-bottom:0"><h1>${esc(s.title)} 코드 카드</h1><p>한 장에 한 번만 답할 수 있어요. 한 사람에 한 장씩 나눠 주세요.</p></div>
    <div class="sv-cards">${codes.map(c => `<div class="sv-cardp"><small>${esc(churchName())} ${esc(s.title)}</small><b>${esc(c)}</b><small>링크나 QR로 들어와 이 코드를 넣어 주세요. ${fmt(s.end)}까지 받아요.</small></div>`).join('')}</div>`);
}

// ══ 닫힌 설문: 결과(보고서) ═════════════════════════════════════════════════
// 서버가 5명 미만 칸을 가려서(null) 보낸다. 화면은 합계와 비율을 그리고, 쉬운 문장은 규칙으로 만든다(해석은 쓰지 않는다).
function wilson(k, n, z = 1.96) { const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), a = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [(c - a) / d, (c + a) / d]; }
const pc = (k, n) => Math.round(k / n * 100);
const pTxt = p => p < .001 ? '< .001' : '= ' + p.toFixed(3).replace(/^0/, '');
const sgn = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v);
const cut = (t, n) => { t = String(t); return t.length > n ? t.slice(0, n) + '…' : t; };
const strength = v => { v = Math.abs(v); return v < .1 ? '거의 없음' : v < .3 ? '약함' : v < .5 ? '중간' : '강함'; };
const visRows = q => (q.rows || []).filter(r => r[1] != null);
function bars(rows, n) {
  const vis = rows.filter(r => r[1] != null), mx = vis.length ? Math.max(...vis.map(r => r[1])) : 0;
  return `<div class="sv-rows">${rows.map(([lab, k]) => { const hide = k == null, p = hide ? 0 : pc(k, n);
    return `<div class="sv-row${hide ? ' hide' : k === mx ? ' top' : ''}"><div class="row"><span>${esc(lab)}</span><b>${hide ? '5명 미만이라 가렸어요' : `${p}% <small>${k}명</small>`}</b></div><span class="sv-track" role="img" aria-label="${esc(lab)} ${hide ? '5명 미만, 가림' : k + '명, ' + p + '%'}"><span class="sv-fill" style="width:${hide ? 6 : Math.max(2, k / n * 100)}%"></span></span></div>`; }).join('')}</div>`;
}
function easySentence(g) {   // 가장 많이 고른 것 + 대략 범위
  const v = visRows(g); if (!v.length) return '';
  const [lab, k] = v.reduce((a, b) => (b[1] > a[1] ? b : a)), [lo, hi] = wilson(k, g.n);
  return `${g.rank ? '1순위로는 ' : ''}'${esc(lab)}'${g.rank ? eulreul(lab) : iga(lab)} 가장 많${g.rank ? '이 골랐' : '았'}어요(<b>${pc(k, g.n)}%</b>, ${k}명).<small>${g.n}명이 답해서, 모두에게 물었다면 대략 ${Math.floor(lo * 100)}~${Math.ceil(hi * 100)}% 사이였을 거예요.</small>`;
}
// 판정은 두 가지 말로만: 뚜렷해요 / 응답이 적어 판단하기 어려워요
const verdict = kind => kind === 'sig' ? `<span class="verdict sig">${ic('check')}차이가 뚜렷해요</span>` : `<span class="verdict weak">${ic('info')}응답이 적어 판단하기 어려워요</span>`;
const fold = d => `<details class="fold-d"><summary>${ic('chev')}자세히</summary><div class="fd-body">${d}</div></details>`;
function crossTable(c) {
  return `<div class="sv-table-wrap"><table class="sv-table"><thead><tr><th></th>${c.cols.map(x => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${c.rows.map(([lab, v, tot]) =>
    `<tr><td>${esc(lab)}<small>${tot == null ? '5명 미만' : tot + '명'}</small></td>${v.map(x => x == null || tot == null ? `<td class="hid">5명 미만</td>` : `<td>${pc(x, tot)}%<small>${x}명</small></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
// 짝 설명은 서버가 준 칸 숫자에서 규칙으로 만든다
function pairPlain(c) {
  if (c.id === 'd4quiz') {
    const [lo, hi] = c.rows, a = hi && hi[1][0] != null && hi[2] ? pc(hi[1][0], hi[2]) : null, b = lo && lo[1][0] != null && lo[2] ? 100 - pc(lo[1][0], lo[2]) : null;
    return a != null && b != null ? `스스로 '익숙하다'고 한 사람은 ${a}%가 점검을 많이 맞혔어요. '처음·조금'이라고 한 사람은 ${b}%가 보통이거나 적게 맞혔어요.` : `스스로 느끼는 수준에 따라 점검 결과가 달라지는지 봤어요.`;
  }
  if (c.id === 'd2quiz') return c.kind === 'sig' && c.stat && c.stat.rho > 0 ? '성경을 자주 읽는 사람일수록 점검을 많이 맞힌 쪽에 모여 있어요.' : '성경을 읽는 빈도와 점검 결과 사이에 뚜렷한 관계는 보이지 않아요.';
  return '';
}
function pairApa(c) { const t = c.stat; if (!t) return ''; return t.name === 'chi' ? `χ²(${t.df}, <i>N</i> = ${t.n}) = ${t.chi2}, <i>p</i> ${pTxt(t.p)}, Cramér의 <i>V</i> = ${String(t.v).replace(/^0/, '')}` : `Spearman <i>ρ</i>(${t.n - 2}) = ${String(t.rho).replace(/^(-?)0/, '$1')}, <i>p</i> ${pTxt(t.p)}`; }
function pairDetail(c) {
  const t = c.stat; if (!t) return '';
  return (t.name === 'chi' ? `카이제곱 검정: 카이제곱 ${t.chi2}, 자유도 ${t.df}, p ${pTxt(t.p)}, 크래메르 V = ${t.v}(${strength(t.v)}).` : `스피어만 순위상관 ρ = ${t.rho}(${strength(t.rho)}), n = ${t.n}, p ${pTxt(t.p)}.`)
    + ' 표에서 5명 미만 칸은 가렸지만 계산에는 실제 값을 썼어요.' + (c.small ? ' 기대 인원이 5명보다 적은 칸이 있어 참고로만 보세요.' : '');
}
function pairCards(R, s) {   // 틀이 미리 정해 둔 짝만(교회가 짝을 고르지 않는다)
  if (!R.pairs.length) return C.app === 'didako' && R.quiz && !R.quiz.hidden ? `<p class="gl">두 문항 함께 보기</p><p class="hint" style="margin:0 0 4px">짝이 되는 기본 틀 문항을 고쳤거나 직접 만든 설문이라 보여 드리지 않아요. 비율과 대략 범위는 그대로 나와요.</p>` : '';
  return `<p class="gl">두 문항 함께 보기</p><p class="hint" style="margin:0 0 4px">${esc(A().name)} 틀이 미리 정해 둔 짝만 보여 드려요. 함께 움직인다는 뜻이지, 원인이라는 뜻은 아니에요.</p>
    ${R.pairs.map(c => `<section class="card rq">${verdict(c.kind)}<h3>${esc(c.title)}</h3><p class="sent" style="margin-top:.3em">${pairPlain(c)}</p>${crossTable(c)}${fold(pairDetail(c))}</section>`).join('')}`;
}
const yoyDetail = y => `두 비율 차이 검정: z = ${y.z}, p ${pTxt(y.p)}. 차이의 대략 범위 ${sgn(y.ci[0])}%p ~ ${sgn(y.ci[1])}%p.`;
function yoyCard(R) {   // 작년 같은 설문과 나란히
  const y = R.yoy; if (!y) return '';
  const yp = pc(...y.prev), yc = pc(...y.cur);
  return `<p class="gl">작년과 나란히</p><section class="card rq">${verdict(y.kind)}<h3>${esc(y.q)}</h3><p class="rq-sub">${esc(y.label)}라고 답한 비율</p>
      <div class="yoy"><span class="lab">작년</span><span class="sv-track prev"><span class="sv-fill" style="width:${yp}%"></span></span><span class="val">${yp}%</span>
        <span class="lab">올해</span><span class="sv-track"><span class="sv-fill" style="width:${yc}%;background:var(--accent)"></span></span><span class="val">${yc}%</span></div>
      <p class="sent">작년 ${y.prev[1]}명 중 ${y.prev[0]}명(${yp}%), 올해 ${y.cur[1]}명 중 ${y.cur[0]}명(${yc}%)이에요.<small>${y.kind === 'sig' ? '' : '이만큼은 우연으로도 생길 수 있어서 늘었다고 말하기는 일러요. '}이름 없이 받아서 같은 사람의 변화가 아니에요.</small></p>${fold(yoyDetail(y))}</section>`;
}
function qItem(g) {
  if (g.hidden) return `<section class="card rq"><h3>${esc(g.t)}</h3><p class="rq-sub">답한 사람이 5명 미만이라 보여 드리지 않아요.</p></section>`;
  const sub = g.multi ? '여러 개 고를 수 있어서 모두 더하면 100%를 넘어요' : g.rank ? '1순위로 고른 것만 셌어요' : `${g.n}명이 답했어요`;
  const othBtn = g.others && g.others.length ? `<button class="link-btn go" type="button" data-sv="rep-tab" data-v="text">'기타'에 적은 의견 ${g.others.length}개 보기 ${ic('chev', 'chev-r')}</button>` : '';
  return `<section class="card rq"><h3>${esc(g.t)}</h3><p class="rq-sub">${sub}</p>${bars(g.rows, g.n)}<p class="sent">${easySentence(g)}</p>${othBtn}</section>`;
}
// 점검: 작년과 문항이 달라도 같은 난이도 묶음끼리 정답률을 나란히 본다
const lvPc = x => x[1] == null ? '가림' : pc(x[1], x[2]) + '%';
function quizLvTable(Q) {
  return `<h3 style="margin-top:1.2em">작년과 난이도별로 견주기</h3><table class="sv-table"><thead><tr><th>난이도</th><th>작년</th><th>올해</th></tr></thead><tbody>
    ${Q.lvls.map((x, k) => `<tr><td>${esc(x[0])}</td><td>${Q.prev_lvls[k] ? lvPc(Q.prev_lvls[k]) : ''}</td><td>${lvPc(x)}</td></tr>`).join('')}</tbody></table>
    <p class="hint">해마다 문항을 바꿔 쓰니, 문항 하나하나가 아니라 같은 난이도 묶음끼리만 견줘요. 문항이 바뀌면 묶음의 어려움도 조금 달라질 수 있어 참고로만 보세요.</p>`;
}
function quizCard(R, s) {
  const Q = R.quiz; if (!Q) return '';
  if (Q.hidden) return `<p class="gl">스스로 점검</p><section class="card rq"><p class="rq-sub" style="margin:0">끝까지 한 사람이 5명 미만이라 보여 드리지 않아요.</p></section>`;
  const sent = Q.lvls.filter(x => x[1] != null).map(x => `${x[0] === '쉬움' ? '쉬운 문항' : x[0] === '중간' ? '중간 문항' : '어려운 문항'}은 ${pc(x[1], x[2])}%`).join(', ');
  return `<p class="gl">스스로 점검(${Q.n}명이 끝까지 했어요)</p><section class="card rq"><h3>문항별로 맞힌 비율</h3><p class="rq-sub">사람별 점수와 순위는 어디에도 없어요.</p>
    ${Q.rows.map(r => { const q = bankQ(r.id); return `<div class="qz-row"><span class="qt"><span class="chip sched">${esc(r.lv)}</span>${esc(q ? q.t : r.id)}</span><span class="pct">${r.ok == null ? '가림' : pc(r.ok, Q.n) + '%'}</span><span class="sv-track"><span class="sv-fill" style="width:${r.ok == null ? 6 : pc(r.ok, Q.n)}%"></span></span></div>`; }).join('')}
    ${sent ? `<p class="sent">${sent}가 맞혔어요. 이 결과는 교재 난이도를 고를 때만 써요.</p>` : ''}${s.prev && Q.prev_lvls ? quizLvTable(Q) : ''}</section>`;
}
const nonText = R => R.qs.filter(q => q.type !== 'text');
const textQs = R => R.qs.filter(q => q.type === 'text');
function repItems(R, s) {
  const all = nonText(R), tq = textQs(R), tn = tq.reduce((a, q) => a + (q.items ? q.items.length : 0), 0);
  return `<p class="gl">문항 ${all.length}개, 많이 고른 보기는 진하게 표시했어요</p>${all.map(qItem).join('')}${quizCard(R, s)}${pairCards(R, s)}${yoyCard(R)}
    ${tq.length ? `<section class="card"><div class="set-row"><span><b style="font-weight:600">받은 의견 ${tn}개</b><br><small class="soft">${esc(tq.map(q => q.t).join(' / '))}</small></span><button class="btn small ghost" type="button" data-sv="rep-tab" data-v="text">읽기</button></div></section>` : ''}`;
}

// ── 한눈에: "눈에 띄는 것"을 합계에서 규칙으로 뽑는다 ──
function findsOf(R, s) {
  const out = [], qs = nonText(R).filter(q => !q.hidden && q.n >= MASK && !q.dept && visRows(q).length), lead = A().lead, used = new Set();
  const edited = id => { const x = qsAll(s).find(q => q.id === id); return !x || x.edited; };
  const sortV = q => visRows(q).slice().sort((a, b) => b[1] - a[1]);
  const mk = q => {
    const v = sortV(q), [l, k] = v[0], p = pc(k, q.n), ld = !edited(q.id) && lead[q.id];
    const pre = ld ? `${ld} ` : `'${esc(cut(q.t, 22))}' 문항에서는 `;
    const body = q.type === 'multi' ? `<b>${esc(l)}</b>${eulreul(l)} 가장 많이 골랐어요(${p}%).` : q.rank ? `<b>${esc(l)}</b>${hasBatchim(l) ? '이에요' : '예요'}(${p}%, ${k}명).` : `<b>${esc(l)}</b>${iga(l)} 가장 많았어요(${p}%).`;
    const nx = v.slice(1, 3).map(([l2, k2]) => `${esc(l2)}(${pc(k2, q.n)}%)`);
    const lastL = v[Math.min(2, v.length - 1)][0];
    const s2 = [nx.length ? `다음은 ${nx.join(', ')}${hasBatchim(lastL) ? '이에요' : '예요'}.` : '', q.type === 'multi' ? `한 사람이 ${q.max || 3}개까지 골랐어요.` : ''].filter(Boolean).join(' ');
    return { p: pre + body, s: s2, bar: v.slice(0, 3).map(x => pc(x[1], q.n)) };
  };
  const heads = A().heads.map(id => qs.find(q => q.id === id)).filter(Boolean);
  heads.forEach(q => {
    if (C.app === 'didako' && q.id === 'd4' && !edited('d4') && q.rows.slice(0, 2).every(r => r[1] != null)) {   // 처음·조금 익숙
      const k = q.rows[0][1] + q.rows[1][1], [lo, hi] = wilson(k, q.n);
      out.push({ p: `성경공부가 <b>처음이거나 조금 익숙한 분이 ${pc(k, q.n)}%</b>(${k}명)예요.`, s: `모두에게 물었다면 대략 ${Math.floor(lo * 100)}~${Math.ceil(hi * 100)}% 사이였을 거예요.`, bar: [pc(k, q.n)] });
    } else out.push(mk(q));
    used.add(q.id);
  });
  qs.filter(q => !used.has(q.id) && q.type !== 'range').slice(0, Math.max(0, 3 - out.length)).forEach(q => out.push(mk(q)));
  const pr = R.pairs.find(c => c.kind === 'sig');
  if (pr) out.push({ p: `${pairPlain(pr)} <b>차이가 뚜렷해요.</b>`, s: '함께 움직인다는 뜻이지 원인이라는 뜻은 아니에요.' });
  const y = R.yoy;
  if (y) { const a = pc(...y.prev), b = pc(...y.cur), dir = b > a ? '늘었다고' : b < a ? '줄었다고' : '달라졌다고'; out.push({ p: `${esc(y.label)}라고 답한 비율은 작년 <b>${a}%</b>에서 올해 <b>${b}%</b>예요.`, s: y.kind === 'sig' ? '우연으로 보기 어려운 차이예요.' : `응답이 적어 ${dir} 판단하기는 어려워요.` }); }
  return out;
}
// 다음 걸음(디다코): 교재 난이도를 수준 응답에 맞춰 고른다. 사람별 추천은 없고 부서 합계로만 고른다
function bookRec(R) {
  const books = ((C.books && C.books()) || []).filter(b => b.level);
  if (!books.length) return `<p class="hint" style="margin:0">난이도를 정한 교재가 아직 없어요. 교재 관리에서 난이도를 정하면 여기에 추천이 붙어요.</p>`;
  const d4 = R.qs.find(q => q.id === 'd4' && !q.hidden), v = d4 ? visRows(d4) : [], tot = v.reduce((a, r) => a + r[1], 0);
  const mean = tot ? v.reduce((a, r) => a + r[1] * (d4.rows.indexOf(r)), 0) / tot : 1, target = Math.max(1, Math.min(5, Math.round(1 + mean * 4 / 3)));
  const d3 = R.qs.find(q => q.id === 'd3' && !q.hidden), tops = d3 ? sortRows(d3).slice(0, 3).map(r => r[0]) : [];
  const pick = books.map(b => ({ b, d: Math.abs(b.level - target) })).sort((x, y) => x.d - y.d).slice(0, 3);
  const stars = n => '★'.repeat(n) + '☆'.repeat(5 - n);
  return `<p class="hint" style="margin:0 0 .5em">${d4 ? `수준 응답(평균으로 난이도 ${stars(target)})` : '난이도'}${tops.length ? `와 많이 고른 주제(${tops.map(esc).join(', ')})` : ''}에 맞춘 교재예요.</p>
    ${pick.map(({ b }) => { const hit = tops.find(t => (b.title + ' ' + (b.note || '')).includes(t.replace(/[·]/g, ''))); return `<div class="rec"><span class="t">${ic('book')}${esc(b.title)} <span class="chip sched">난이도 ${stars(b.level)}</span></span><small>${b.level === target ? '수준 응답에 알맞은 난이도예요.' : b.level < target ? '조금 쉬운 쪽이라 부담 없이 시작해요.' : '조금 도전해 볼 만한 난이도예요.'}${hit ? ` '${esc(hit)}' 주제와 맞닿아요.` : ''}${b.note ? ' ' + esc(b.note) : ''}</small></div>`; }).join('')}
    <p class="hint">사람별 추천은 없고, 부서 합계로만 골라요.</p>`;
}
const sortRows = q => visRows(q).slice().sort((a, b) => b[1] - a[1]);
// 다음 걸음(코이데): 합계에서 뽑은 기도 제목 초안. 꼭 고친 뒤에 올리게 한다
function prayerDraft(R, s) {
  const get = id => R.qs.find(q => q.id === id && !q.hidden), lines = [];
  const k5 = get('k5'), k14 = get('k14'), k11 = get('k11'), k13 = get('k13'), p8 = get('p8'), p9 = get('p9'), p11 = get('p11');
  if (k5) lines.push('구원의 확신을 더 깊이 누리는 한 해가 되도록');
  if (k11) lines.push('예배 가운데 은혜를 경험하는 지체가 늘어나도록');
  if (k13) lines.push('이 모임이 마음 놓고 쉴 수 있는 자리가 되도록');
  if (k14) { const t = sortRows(k14).filter(r => !isOther(r[0]) && r[0] !== '신앙').slice(0, 2).map(r => r[0]); if (t.length) lines.push(`${t.join('과 ')} 문제로 마음이 무거운 지체들을 위해`); }
  // 기도 생활 돌아보기 틀
  if (p8) lines.push('기도 가운데 하나님과 가까워지는 기쁨을 누리도록');
  if (p11) lines.push('기도 제목을 마음 놓고 나눌 수 있는 모임이 되도록');
  if (p9) { const t = sortRows(p9).filter(r => !isOther(r[0])).slice(0, 2).map(r => r[0]); if (t.length) lines.push(`기도하는 데 어려움(${t.join(', ')})을 겪는 지체들을 위해`); }
  if (!lines.length) lines.push('이 모임을 위해 함께 기도해요');
  return lines.map(l => '- ' + l).join('\n');
}
// 다음 걸음(디다코, 모임 방식 선호 조사): 합계에서 뽑은 모임 꾸리기 참고. 사람별 유형은 없다
function meetNext(R) {
  const top = id => { const q = R.qs.find(x => x.id === id && !x.hidden && x.n >= MASK); const v = q ? sortRows(q).filter(r => !isOther(r[0])) : []; return v.length ? { raw: v[0][0], l: esc(v[0][0]), p: pc(v[0][1], q.n) } : null; };
  const f = (id, fn) => { const t = top(id); return t ? `<p class="sent" style="margin:.3em 0">${fn(t)}</p>` : ''; };
  const body = [
    f('w1', t => `가장 마음이 편하다고 한 방식은 <b>${t.l}</b>${hasBatchim(t.raw) ? '이에요' : '예요'}(${t.p}%).`),
    f('w3', t => `편한 모임 인원은 <b>${t.l}</b>${iga(t.raw)} 가장 많았어요(${t.p}%).`),
    f('w4', t => `알맞은 모임 시간은 <b>${t.l}</b>${iga(t.raw)} 가장 많았어요(${t.p}%).`),
    f('w5', t => `모일 수 있는 때는 <b>${t.l}</b>${eulreul(t.raw)} 가장 많이 골랐어요.`),
    f('w6', t => `모이기 편한 곳은 <b>${t.l}</b>${iga(t.raw)} 가장 많았어요(${t.p}%).`)
  ].join('');
  return `<p class="hint" style="margin:0 0 .5em">합계에서 뽑은 참고예요. 모임을 꾸릴 때 이야기 거리로 써 주세요. 사람별 유형은 나누지 않아요.</p>${body || '<p class="hint" style="margin:0">답이 더 모이면 참고할 내용이 여기에 나와요.</p>'}`;
}
function endCard(R, s) {
  return C.app === 'didako' ? (R.qs.some(q => /^w\d/.test(q.id)) ? `<p class="gl">다음 걸음: 모임 꾸리기</p><section class="card">${meetNext(R)}</section>` : `<p class="gl">다음 걸음: 교재 추천</p><section class="card">${bookRec(R)}</section>`)
    : `<p class="gl">다음 걸음: 함께 기도할 제목</p><section class="card"><p class="hint" style="margin:0 0 .5em">합계에서 뽑은 초안이에요. 꼭 고친 뒤에 올려 주세요.</p>
      <textarea class="field" rows="4" id="svPray">${esc(prayerDraft(R, s))}</textarea>
      <div class="acts" style="margin-top:.6em"><button class="btn small" type="button" data-sv="pray-go">${ic('pray')}기도 제목으로 옮기기</button></div></section>`;
}
function repGlance(s, R) {
  const gateTxt = s.gate === 'code' ? '현장 코드를 아는 사람만 답했어요.' : s.gate === 'once' ? '일회용 코드로 한 사람이 한 번씩 답했어요.' : '한 기기에서 한 번만 받았지만, 다른 기기로 또 답했을 수는 있어요.';
  const F = findsOf(R, s);
  const finds = F.length ? F.map((f, i) => `<div class="find"><span class="n">${i + 1}</span><div class="b"><p>${f.p}</p>${f.s ? `<small>${f.s}</small>` : ''}
      ${f.bar ? `<div class="mini-bar" role="img" aria-label="${f.bar.join('%, ')}%">${f.bar.map(v => `<span style="width:${v}%"></span>`).join('')}</div>` : ''}
      <button class="link-btn go" type="button" data-sv="rep-tab" data-v="items">문항별로 자세히 ${ic('chev', 'chev-r')}</button></div></div>`).join('') : '<p class="hint" style="margin:0">눈에 띄는 것을 뽑을 만큼 답이 모이지 않았어요. 문항별로 봐 주세요.</p>';
  return `<section class="card"><div class="trust">${ic('info')}<p>이름 없이 받은 <b>${R.n}명</b>의 답이에요. ${gateTxt} 5명 미만인 칸은 가렸어요.</p></div></section>
    <p class="gl">눈에 띄는 것</p><section class="card">${finds}</section>${endCard(R, s)}
    <p class="gl">메모</p><section class="card"><textarea class="field" data-svin="memo" rows="3" maxlength="1500" placeholder="읽고 느낀 점, 다음에 할 일을 적어 두세요. 보고서와 함께 저장돼요.">${esc(R.memo || '')}</textarea></section>`;
}
// ── 보고서 쪽(인쇄·PDF용, 논문 형식): 표·그림 번호, 통계량은 APA 비슷한 형식, 쉬운 해설은 맨 아래 ──
function repPaper(R, s) {
  const tplPairs = C.app === 'didako' && !!R.quiz;   // 짝은 성경 이해도 점검이 있을 때만 본다
  const se = (k, n) => (Math.sqrt(k / n * (1 - k / n) / n) * 100).toFixed(1);
  const all = nonText(R).filter(q => !q.hidden), ci = (k, n) => { const [lo, hi] = wilson(k, n); return `[${Math.floor(lo * 100)}, ${Math.ceil(hi * 100)}]`; };
  let tn = 0, fn = 0; const T = () => `표 ${++tn}`, F = () => `그림 ${++fn}`;
  const gate = s.gate === 'code' ? '현장 코드' : s.gate === 'once' ? '일회용 코드' : '링크(기기 표시·속도 제한)';
  const dist = `<figure class="pp-fig"><figcaption><b>${T()}</b><br><i>문항별 응답 분포 (N = ${R.n})</i></figcaption><table class="pp-t"><thead><tr><th>문항과 보기</th><th>n</th><th>%</th><th>SE</th><th>95% CI</th></tr></thead><tbody>
    ${all.map(g => `<tr class="pp-q"><td colspan="5">${esc(g.t)}${g.multi ? ' (복수 응답)' : g.rank && !/1순위/.test(g.t) ? ' (1순위)' : ''}</td></tr>${g.rows.map(([lab, k]) => k == null ? `<tr><td class="pp-o">${esc(lab)}</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>` : `<tr><td class="pp-o">${esc(lab)}</td><td>${k}</td><td>${pc(k, g.n)}</td><td>${se(k, g.n)}</td><td>${ci(k, g.n)}</td></tr>`).join('')}`).join('')}
    </tbody></table><p class="pp-note"><i>주.</i> SE = 비율의 표준오차 √(<i>p</i>(1−<i>p</i>)/<i>n</i>), %p 단위. CI = 윌슨 점수 95% 신뢰구간(비율과 응답 수로 계산하며, 응답이 적거나 비율이 0·100%에 가까워도 0~100% 밖으로 나가지 않는다). 5명 미만 칸은 —로 가렸다. 복수 응답 문항은 비율의 합이 100%를 넘는다.</p></figure>`;
  const Q = R.quiz && !R.quiz.hidden ? R.quiz : null;
  const quiz = Q ? `<figure class="pp-fig"><figcaption><b>${T()}</b><br><i>성경 이해도 스스로 점검 문항별 정답률 (n = ${Q.n})</i></figcaption><table class="pp-t"><thead><tr><th>문항(난이도)</th><th>정답 %</th><th>95% CI</th></tr></thead><tbody>
    ${Q.rows.map(r => { const q = bankQ(r.id); return `<tr><td>${esc(q ? q.t : r.id)} <span class="pp-lv">(${esc(r.lv)})</span></td><td>${r.ok == null ? '—' : pc(r.ok, Q.n)}</td><td>${r.ok == null ? '—' : ci(r.ok, Q.n)}</td></tr>`; }).join('')}</tbody></table><p class="pp-note"><i>주.</i> 사람별 점수는 저장하지 않으며, 문항별 합계만 썼다.</p></figure>${s.prev && Q.prev_lvls ? `<figure class="pp-fig"><figcaption><b>${T()}</b><br><i>난이도별 정답률: 작년(n = ${Q.prev_n})과 올해(n = ${Q.n})</i></figcaption><table class="pp-t"><thead><tr><th>난이도</th><th>작년 %</th><th>올해 %</th></tr></thead><tbody>
    ${Q.lvls.map((x, k) => `<tr><td>${esc(x[0])}</td><td>${Q.prev_lvls[k] && Q.prev_lvls[k][1] != null ? pc(Q.prev_lvls[k][1], Q.prev_lvls[k][2]) : '—'}</td><td>${x[1] != null ? pc(x[1], x[2]) : '—'}</td></tr>`).join('')}</tbody></table><p class="pp-note"><i>주.</i> 문항 모음에서 해마다 난이도별로 2문항씩 골라 쓰므로 문항 단위가 아니라 난이도 묶음 단위로 비교했다. 문항이 달라 묶음 난이도가 같다고 보장할 수 없어 검정은 하지 않았다.</p></figure>` : ''}` : '';
  const pairs = R.pairs.map(c => { const tl = T(), fl = F();
    return `<figure class="pp-fig"><figcaption><b>${tl}</b><br><i>${esc(c.title)} 교차표 (n = ${c.n})</i></figcaption><table class="pp-t"><thead><tr><th></th>${c.cols.map(x => `<th>${esc(x)}</th>`).join('')}<th>계</th></tr></thead><tbody>
      ${c.rows.map(([lab, v, tot]) => `<tr><td class="pp-o" style="padding-left:0">${esc(lab)}</td>${v.map(x => x == null || tot == null ? '<td>—</td>' : `<td>${x} (${pc(x, tot)}%)</td>`).join('')}<td>${tot == null ? '—' : tot}</td></tr>`).join('')}</tbody></table>
      <p class="pp-note"><i>주.</i> ${pairApa(c)}. 5명 미만 칸은 가렸으나 검정에는 실제 값을 썼다.</p></figure>
      <figure class="pp-fig"><figcaption><b>${fl}</b><br><i>${esc(c.title)}: 행별 비율</i></figcaption><div class="pp-stack">${c.rows.map(([lab, v, tot]) => `<div class="pp-sr"><span class="lab">${esc(lab)}</span><span class="bar">${v.map((x, i) => `<span class="${x == null || tot == null ? 'm' : 's' + i}" style="width:${tot ? (x == null ? 100 / 3 : x / tot * 100) : 100 / 3}%"></span>`).join('')}</span></div>`).join('')}</div>
      <p class="pp-leg">${c.cols.map((x, i) => `<span><i class="s${i}"></i>${esc(x)}</span>`).join('')}${c.rows.some(([, v]) => v.some(x => x == null)) ? '<span><i class="m"></i>5명 미만(가림)</span>' : ''}</p></figure>`; }).join('');
  const y = R.yoy, yoy = y ? `<figure class="pp-fig"><figcaption><b>${T()}</b><br><i>작년 같은 설문과 비교: ${esc(y.q)}</i></figcaption><table class="pp-t"><thead><tr><th></th><th>작년</th><th>올해</th></tr></thead><tbody>
      <tr><td class="pp-o" style="padding-left:0">${esc(y.label)}</td><td>${y.prev[0]}/${y.prev[1]} (${pc(...y.prev)}%)</td><td>${y.cur[0]}/${y.cur[1]} (${pc(...y.cur)}%)</td></tr></tbody></table>
      <p class="pp-note"><i>주.</i> 두 비율 차이 <i>z</i> = ${y.z}, <i>p</i> ${pTxt(y.p)}, 차이의 95% CI [${sgn(y.ci[0])}, ${sgn(y.ci[1])}]%p. 익명 응답이라 같은 사람의 변화가 아닌 독립 표본으로 비교했다.</p></figure>` : '';
  const easy = [
    ...R.pairs.map(c => `<li><b>${esc(c.title)}</b>: ${pairPlain(c)} ${c.kind === 'sig' ? '이 정도 차이는 우연으로 보기 어려워요.' : '응답이 적어 판단하기 어려워요.'}</li>`),
    y ? `<li><b>작년과 비교</b>: ${pc(...y.prev)}%에서 ${pc(...y.cur)}%로 ${pc(...y.cur) >= pc(...y.prev) ? '높아' : '낮아'} 보이지만, ${y.kind === 'sig' ? '우연으로 보기 어려운 차이예요.' : '이만큼은 우연으로도 생길 수 있어서 달라졌다고 말하기는 일러요.'}</li>` : '',
    `<li><b>SE(표준오차)</b>: 이 비율이 응답한 사람에 따라 얼마나 흔들릴 수 있는지예요. 응답이 많을수록 작아져요.</li>`,
    `<li><b>95% CI(신뢰구간)</b>: ${R.n}명만 답했기 때문에, 모두에게 물었다면 비율이 대략 이 범위 안에 있었을 거라는 뜻이에요.</li>`,
    R.pairs.length || y ? `<li><b>p</b>: 차이가 우연히 생겼을 가능성이에요. 보통 .05보다 작으면 "우연으로 보기 어렵다"고 해요.</li>` : '',
    R.pairs.length ? `<li><b>V, ρ</b>: 두 문항이 얼마나 함께 움직이는지예요. .1은 약하고 .3은 중간, .5 넘으면 강한 편이에요.</li>` : ''].filter(Boolean).join('');
  return `<article class="pp">
    <header class="pp-head"><h2>${esc(s.title)} 결과 보고서</h2><p>${esc(churchName())} ${esc(s.dept)}, ${fmtDay(s.start)} ~ ${fmtDay(s.end)}, <i>N</i> = ${R.n}</p></header>
    <h3>1. 방법</h3><p>${esc(s.dept)}에 ${gate}로 익명 설문을 받았다(문항 틀: ${esc(tplOf(s).nm)}). 이름과 연락처는 받지 않았고, 응답 수는 기기 단위로 셌다. 문항별 빈도와 비율, 윌슨 95% 신뢰구간을 구했다.${tplPairs ? ' 두 문항의 관련은 문항 틀이 미리 정해 둔 짝만 보았다(카이제곱 검정 또는 스피어만 순위상관).' : ''}${y ? ' 작년 비교는 두 비율 차이 검정을 썼다.' : ''} 5명 미만 칸은 가렸다.${tplPairs && Q && !R.pairs.length ? ' 짝이 되는 문항을 고쳤거나 직접 만든 설문이라 두 문항의 관련은 보지 않았다.' : ''}${s.prev && !R.yoy ? ' 작년과 같은 문항을 고쳤거나 비교할 응답이 모자라 작년 비교는 하지 않았다.' : ''}</p>
    <h3>2. 결과</h3>${dist}${quiz}${pairs}${yoy}
    <h3>3. 해설</h3><ul class="pp-easy">${easy}</ul>
    <p class="pp-caution"><b>읽을 때 조심할 것.</b> ${R.pairs.length ? '함께 움직인다고 해서 한쪽이 다른 쪽의 원인이라는 뜻은 아니에요. ' : ''}답한 사람이 스스로 고른 사람들이라 부서 전체와 다를 수 있어요. 한 사람이 다른 기기로 두 번 답했을 수도 있어요. 해석과 결론은 읽는 분이 써 주세요.</p>
  </article>`;
}
function repText(R) {
  const tq = textQs(R), all = nonText(R);
  const lists = tq.map((q, i) => `<section class="card rq"><h3>${esc(q.t)}</h3>${q.items ? `<p class="rq-sub">의견 ${q.items.length}개를 이름 없이 섞어서 보여요.</p><ul class="texts" data-kwlist="${i}"></ul>` : `<p class="rq-sub">쓴 사람이 5명 미만이라 보여 드리지 않아요.</p>`}</section>`).join('');
  const oth = all.filter(g => g.others && g.others.length).map(g => `<section class="card rq"><h3>'기타'에 직접 적은 것</h3><p class="rq-sub">${esc(g.t)} (${g.others.length}개)</p><ul class="texts">${g.others.map(t => `<li>${esc(t)}</li>`).join('')}</ul></section>`).join('');
  if (!tq.length && !oth) return `<section class="card rq"><h3>받은 의견</h3><p class="rq-sub">이 설문에는 글로 답하는 문항이 없어요.</p></section>`;
  return `<section class="card rq"><h3>의견 읽기</h3><p class="rq-sub">의견에 이름이 적혀 있을 수 있으니 조심해서 다뤄 주세요.</p>
    <div class="kw"><input class="field" id="svKw" data-svin="kw" value="${esc(ST.kw || '')}" aria-label="찾아볼 낱말" maxlength="10" placeholder="찾아볼 낱말"><span class="kw-out" id="svKwOut"></span></div></section>${lists}${oth}`;
}
function paintKw() {
  const inp = $('#svKw'); if (!inp) return; const w = inp.value.trim(), R = ST.rep[(splitSub(ST.sub))[1]]; if (!R) return;
  const tq = textQs(R), items = tq.flatMap(q => q.items || []);
  const k = w ? items.reduce((n, t) => n + (t.split(w).length - 1), 0) : 0, docs = w ? items.filter(t => t.includes(w)).length : 0;
  $('#svKwOut').innerHTML = w ? `'${esc(w)}'${iga(w)} 의견 ${docs}개에 <b>${k}번</b> 나와요` : '낱말을 쓰면 몇 번 나오는지 세어 드려요';
  $$('[data-kwlist]').forEach(ul => { const q = tq[+ul.dataset.kwlist]; ul.innerHTML = (q.items || []).map(t => `<li>${w ? esc(t).split(esc(w)).join(`<mark>${esc(w)}</mark>`) : esc(t)}</li>`).join(''); });
}
function viewReport(s) {
  const R = ST.rep[s.id];
  if (!R) return `${back2list(s)}<p class="hint">${ST.repErr ? esc(ST.repErr) : '결과를 불러오는 중이에요…'}</p>${ST.repErr ? `<button class="btn ghost" type="button" data-sv="retry">${ic('refresh')}다시 해 보기</button>` : ''}`;
  const meta = `${fmtDay(s.start)}부터 ${fmtDay(s.end)}까지 ${R.n}명이 답했어요. 지금은 닫혔어요.`;
  const tools = `<div class="rep-tools"><button class="btn small ghost" type="button" data-sv="print-paper">${ic('print')}인쇄·PDF</button><button class="btn small ghost" type="button" data-sv="dup" data-id="${esc(s.id)}">${ic('copy')}복사해서 새 설문</button><button class="btn small ghost" type="button" data-sv="reopen" data-id="${esc(s.id)}">${ic('refresh')}다시 열기</button><button class="btn small ghost" type="button" data-sv="del-closed" data-id="${esc(s.id)}">${ic('trash')}지우기</button></div>`;
  if (R.few) return `${back2list(s)}<p class="rep-meta">${meta}</p>${tools}<section class="card empty"><h2>아직 결과를 보여 드릴 수 없어요</h2><p>답이 5명보다 적으면 누가 어떻게 답했는지 짐작할 수 있어서 결과를 보여 드리지 않아요. 더 받으려면 다시 열어 보세요.</p></section>
    <p class="lockline">${ic('lock')} 사람별 답과 점수, 사람·부서 사이 순위는 어디에도 없어요.</p>`;
  const tabs = [['glance', '한눈에'], ['items', '문항별'], ['text', '의견'], ['paper', '보고서']];
  const body = ST.repTab === 'items' ? repItems(R, s) : ST.repTab === 'paper' ? repPaper(R, s) : ST.repTab === 'text' ? repText(R) : repGlance(s, R);
  return `${back2list(s)}<p class="rep-meta">${meta}</p>${tools}
    <div class="seg2 rep-tabs" role="tablist" aria-label="결과 보기">${tabs.map(([k, l]) => `<button type="button" role="tab" class="${ST.repTab === k ? 'on' : ''}" aria-selected="${ST.repTab === k}" data-sv="rep-tab" data-v="${k}">${l}</button>`).join('')}</div>
    <div class="rep-col" style="max-width:760px;margin-top:12px">${body}</div>
    <p class="lockline">${ic('lock')} 사람별 답과 점수, 사람·부서 사이 순위는 어디에도 없어요.</p>`;
}

// ══ 답하는 화면(휴대폰): 한 화면에 한 문항 ═══════════════════════════════════
// 앱 안 미리보기(관리자)와 따로 연 답하는 쪽(church-survey.html)이 같은 코드를 쓴다. 로그인 없이 이름 없이 답한다.
const RS_STATES = [['start', '처음부터'], ['answered', '이미 답한 기기'], ['closed', '닫힌 설문'], ['notyet', '아직 안 열림'], ['busy', '답이 몰릴 때']];
function buildItems(s) {
  const items = respQs(s).map(q => ({ q }));
  const qz = quizOf(s); if (qz.length) { items.push({ intro: true }); qz.forEach(q => items.push({ q, quiz: true })); }
  return items;
}
function rsReset(s, o = {}) {
  RS = { s, mode: o.mode || 'preview', state: o.state || 'start', step: 'welcome', ans: {}, other: {}, dir: 1, code: '', err: '', items: buildItems(s), church: o.church || churchName(), token: o.token || s.token || '', back: !!o.back, sending: false };
}
function rsCenter(icCls, icon, h, p, foot = '') {
  return `<div class="rs-body center"><span class="rs-ic ${icCls}">${ic(icon)}</span><h1 class="rs-h" style="margin:0">${h}</h1><p>${p}</p></div>${foot ? `<div class="rs-foot">${foot}</div>` : ''}`;
}
const rsBackBtn = () => RS.back ? `<a class="btn ghost wide" href="./">앱으로 돌아가기</a>` : '';
const qIdx = () => RS.items.filter((it, i) => !it.intro && i <= RS.step).length;
const qTotal = () => RS.items.filter(it => !it.intro).length;
function rsCanNext(it) {
  const q = it.q, a = RS.ans[q.id];
  if (q.opt) return true;
  if (q.type === 'text') return !!(a && a.trim());
  if (q.type === 'multi' || q.type === 'rank') return (a || []).length > 0;
  return a !== undefined;
}
function rsInner() {
  const s = RS.s;
  const who = `<div class="rs-who"><span class="brand-mark">${markSvg()}</span><span><b>${esc(RS.church)}</b> ${esc(s.linkMode === 'multi' ? '교회 전체' : s.dept)}</span></div>`;
  if (RS.state === 'answered') return who + rsCenter('done', 'check', '이미 이 기기에서 답했어요', '고마워요. 한 기기에서 한 번만 답할 수 있어요.', rsBackBtn());
  if (RS.state === 'closed') return who + rsCenter('warn', 'lock', '닫힌 설문이에요', esc(s.closedText || DEF_CLOSED), rsBackBtn());
  if (RS.state === 'notyet') return who + rsCenter('', 'clock', '아직 열리지 않았어요', `${fmt(s.start || sundayAfter(0, 9))}에 열려요. 그때 이 링크로 다시 들어와 주세요.`, rsBackBtn());
  if (RS.state === 'none') return rsCenter('warn', 'link', '설문을 찾지 못했어요', '링크가 맞는지 확인해 주세요. 보낸 사람에게 다시 물어봐도 좋아요.', rsBackBtn());
  if (RS.state === 'net') return rsCenter('warn', 'hourglass', '불러오지 못했어요', esc(RS.err || '인터넷을 확인한 뒤 다시 해 주세요.'), `<button class="btn wide" type="button" data-sv="rs-reload">다시 불러오기</button>`);
  const st = RS.step;
  if (st === 'welcome') {
    const quizN = quizOf(s).length;
    return `${who}<div class="rs-body"><h1 class="rs-h">${esc(s.title)}</h1>
      <p>${esc(RS.church)} ${esc(s.linkMode === 'multi' ? '' : s.dept + '가 ')}마음을 모으려고 묻는 설문이에요. ${quizN ? '' : '정답은 없어요. '}생각나는 대로 답해 주세요.</p>
      <ul class="rs-facts"><li>${ic('clock')}약 ${minsOf(s)}분, ${qCountText(s)}</li><li>${ic('lock')}이름이나 연락처는 묻지 않아요</li><li>${ic('users')}답은 합계로만 쓰여요</li></ul></div>
      <div class="rs-foot"><button class="btn wide" type="button" data-sv="rs-start" autofocus>시작하기</button></div>`;
  }
  if (st === 'code') {
    const once = s.gate === 'once', n = once ? 6 : 4;
    return `<div class="rs-top"><button class="rs-back" type="button" data-sv="rs-back" aria-label="뒤로">${ic('back')}</button></div>
      <div class="rs-body"><h1 class="rs-h">${once ? '받은 코드를 넣어 주세요' : '현장 코드를 넣어 주세요'}</h1><p>${once ? '나눠 받은 카드에 적힌 6자리예요.' : '모임에서 보여 준 숫자 4자리예요.'}</p>
      <input class="field rs-code" id="svRsCode" data-svin="rs-code" ${once ? 'autocapitalize="characters"' : 'inputmode="numeric" pattern="[0-9]*"'} maxlength="${n}" autocomplete="off" value="${esc(RS.code)}" aria-label="${once ? '일회용 코드' : '현장 코드'}" placeholder="${'•'.repeat(n)}"><p class="rs-err" id="svRsErr" role="alert">${esc(RS.err)}</p></div>
      <div class="rs-foot"><button class="btn wide" type="button" data-sv="rs-code-go" id="svRsCodeGo"${RS.code.length < n ? ' disabled' : ''}>확인</button></div>`;
  }
  if (st === 'done') {
    const qz = quizOf(s), showAns = s.showAns && qz.length && qz.some(q => RS.ans[q.id] !== undefined);
    return `<div class="rs-body center"><span class="rs-ic done">${ic('check')}</span><h1 class="rs-h" style="margin:0">보냈어요. 고마워요!</h1><p>답은 이름 없이 합계로만 쓰여요.<br>이 기기에서는 다시 답할 수 없어요.</p>
      ${showAns ? `<div class="rs-ans"><p class="soft" style="margin:.4em 0 0;font-size:.86em">스스로 점검 정답 (이 기기에서만 보여요)</p>${qz.map(q => { const a = RS.ans[q.id]; return `<div class="a"><b>${esc(q.t)}</b>정답: <em>${esc(q.o[q.a])}</em>${a === q.a ? ' (맞혔어요)' : ''}<br><small class="soft">${esc(q.why)}</small></div>`; }).join('')}</div>` : ''}</div>${RS.back ? `<div class="rs-foot">${rsBackBtn()}</div>` : ''}`;
  }
  if (st === 'busy') return rsCenter('warn', 'hourglass', '잠시 뒤에 다시 보내 주세요', '지금 한꺼번에 많은 답이 들어오고 있어요. 쓴 답은 그대로 있어요.', `<button class="btn wide" type="button" data-sv="rs-resend">다시 보내기</button>`);
  const it = RS.items[st], last = st === RS.items.length - 1;
  const top = `<div class="rs-top"><button class="rs-back" type="button" data-sv="rs-back" aria-label="이전 문항">${ic('back')}</button><span class="bar"><span style="width:${Math.round((it.intro ? qIdx() : qIdx() - 1) / qTotal() * 100)}%"></span></span><span class="cnt">${it.intro ? '' : `${qIdx()} / ${qTotal()}`}</span></div>`;
  if (it.intro) return `${top}<div class="rs-body center"><span class="rs-ic">${ic('book')}</span><h1 class="rs-h" style="margin:0">이제 성경 이해도를<br>스스로 점검해 봐요</h1>
      <p>${quizOf(s).length}문항, 약 ${A().quizMins}분이에요. 점수는 아무도 볼 수 없고 교회에는 합계만 가요. 모르면 '잘 모르겠어요'를 눌러도 돼요.</p></div>
      <div class="rs-foot"><button class="btn wide" type="button" data-sv="rs-next">점검 시작</button><button class="link-btn quiet" type="button" data-sv="rs-skipquiz">건너뛰고 보내기</button></div>`;
  const q = it.q, a = RS.ans[q.id], single = ['one', 'range', 'quiz'].includes(q.type);
  let opts = '';
  if (q.type === 'text') opts = `<textarea class="field rs-text" data-svin="rs-text" maxlength="300" placeholder="여기에 써 주세요" aria-label="답">${esc(a || '')}</textarea><p class="rs-count"><span id="svRsCnt">${(a || '').length}</span> / 300</p>`;
  else {
    const list = q.type === 'quiz' ? [...q.o, '잘 모르겠어요'] : q.o;
    opts = `<div class="rs-opts" role="${single ? 'radiogroup' : 'group'}">${list.map((o, j) => {
      const dk = q.type === 'quiz' && j === q.o.length, val = dk ? -1 : j;
      const on = single ? a === val : (a || []).includes(j), rank = q.type === 'rank' && on ? (a.indexOf(j) + 1) : 0;
      return `<button type="button" class="rs-opt${on ? ' on' : ''}${dk ? ' dk' : ''}" data-sv="rs-pick" data-v="${val}" role="${single ? 'radio' : 'checkbox'}" aria-checked="${on}"><span class="key">${rank || (j < 9 ? j + 1 : '·')}</span><span>${esc(o)}</span>${on && !rank ? ic('check', 'sv-chk') : ''}</button>`; }).join('')}</div>`;
    const oj = q.type === 'quiz' ? -1 : q.o.findIndex(isOther), othOn = oj >= 0 && (single ? a === oj : (a || []).includes(oj));
    if (othOn) opts += `<input class="field rs-other" id="svRsOther" data-svin="rs-other" maxlength="40" value="${esc((RS.other || {})[q.id] || '')}" placeholder="어떤 건지 짧게 적어 주세요 (안 써도 돼요)" aria-label="기타 내용">`;
  }
  const hint = q.type === 'multi' ? `${q.max || 3}개까지 골라요${(a || []).length ? `. 지금 ${(a || []).length}개 골랐어요` : ''}` : q.type === 'rank' ? '순서대로 3개까지 눌러요. 다시 누르면 빠져요.' : q.opt ? '건너뛰어도 돼요' : '';
  const next = last ? '보내기' : '다음';
  return `${top}<div class="rs-body ${RS.dir < 0 ? 'vt-q-back' : 'vt-q'}">${it.quiz ? '<span class="chip sched" style="align-self:flex-start;margin-top:.6em">스스로 점검</span>' : ''}<h1 class="rs-q">${esc(q.t)}</h1>${hint ? `<p class="rs-hint">${hint}</p>` : ''}${opts}</div>
    <div class="rs-foot"><button class="btn wide" type="button" data-sv="rs-next"${rsCanNext(it) && !RS.sending ? '' : ' disabled'}>${RS.sending ? '보내는 중…' : q.opt && !rsCanNext({ q: { ...q, opt: false } }) ? (last ? '건너뛰고 보내기' : '건너뛰기') : next}</button><p class="kbd">숫자 키로 고르고 Enter로 넘어가요</p></div>`;
}
function morph(el, html, depth = 0) {   // 새 HTML과 비교해 달라진 조각만 바꾼다(스크롤·포커스·자리 유지)
  const t = document.createElement('div'); t.innerHTML = html;
  const a = [...el.children], b = [...t.children];
  if (a.length !== b.length || depth > 4) { el.innerHTML = html; return; }
  a.forEach((x, k) => { const y = b[k]; if (x.outerHTML === y.outerHTML) return;
    const same = x.tagName === y.tagName && x.children.length && y.children.length && [...x.attributes].length === [...y.attributes].length && [...y.attributes].every(at => x.getAttribute(at.name) === at.value);
    if (same) morph(x, y.innerHTML, depth + 1); else x.replaceWith(y); });
}
function rsPaint(keep) {   // keep: 같은 문항에서 고를 때. 스크롤과 자리를 그대로 둔다(다시 그려도 흔들리지 않게)
  const el = $('#svRs'); if (!el || !RS) return;
  if (keep) { const st = el.scrollTop; morph(el, rsInner()); el.scrollTop = st; return; }
  el.innerHTML = rsInner();
  el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter');   // 새 문항은 제자리에서 살짝 나타난다(움직이지 않음)
  el.scrollTop = 0;
  const f = $('#svRsCode'); f && f.focus({ preventScroll: true });
}
function rsGo(d) {
  const s = RS.s; RS.dir = d;
  if (RS.step === 'welcome') { RS.step = s.gate !== 'open' ? 'code' : 0; }
  else if (RS.step === 'code') RS.step = d > 0 ? 0 : 'welcome';
  else if (typeof RS.step === 'number') {
    const n = RS.step + d;
    if (n < 0) RS.step = s.gate !== 'open' ? 'code' : 'welcome';
    else if (n >= RS.items.length) { rsFinish(); return; }
    else RS.step = n;
  }
  rsPaint();
}
let rsTimer = 0;
function rsPick(v) {
  const it = RS.items[RS.step], q = it.q; v = +v;
  if (['one', 'range', 'quiz'].includes(q.type)) {
    RS.ans[q.id] = v; rsPaint(true); clearTimeout(rsTimer);
    if (q.o && isOther(q.o[v])) { const f = $('#svRsOther'); f && f.focus(); return; }   // '기타'는 적을 수 있게 저절로 넘기지 않는다
    const at = RS.step; rsTimer = setTimeout(() => { if (RS && RS.step === at) rsGo(1); }, 320);   // 고르면 잠깐 보여 주고 다음으로
    return;
  }
  const a = RS.ans[q.id] || [], max = q.type === 'rank' ? 3 : (q.max || 3), k = a.indexOf(v);
  if (k >= 0) a.splice(k, 1); else if (a.length < max) a.push(v); else { toast(`${max}개까지 고를 수 있어요.`); return; }
  RS.ans[q.id] = a; rsPaint(true);
  if (k < 0 && q.o && isOther(q.o[v])) { const f = $('#svRsOther'); f && f.focus(); }
}
// ── 보내기 ──
function rsPayload() {
  const ans = {}, other = {}, quiz = {};
  RS.items.forEach(it => { if (!it.q) return; const id = it.q.id, v = RS.ans[id]; if (v === undefined) return; if (it.quiz) quiz[id] = v; else ans[id] = v; });
  Object.entries(RS.other || {}).forEach(([k, v]) => { if (String(v).trim()) other[k] = String(v).trim(); });
  return { ans, other, quiz: Object.keys(quiz).length ? quiz : null };
}
const deviceId = () => { let d = ls.get('sv-dev'); if (!d || !/^[A-Za-z0-9_-]{16,64}$/.test(d)) { const a = new Uint8Array(18); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach((_, i) => { a[i] = Math.floor(Math.random() * 256); }); d = [...a].map(x => 'abcdefghijklmnopqrstuvwxyz0123456789'[x % 36]).join(''); ls.set('sv-dev', d); } return d; };
async function rsFinish() {
  if (RS.mode !== 'page') { RS.step = RS.state === 'busy' ? 'busy' : 'done'; rsPaint(); return; }   // 미리보기·데모는 보내지 않는다
  if (RS.sending) return;
  RS.sending = true; rsPaint(true);
  const p = rsPayload(); let r;
  try { r = await RS.api.submit(RS.token, deviceId(), RS.code, p.ans, p.other, p.quiz); }
  catch (e) { RS.sending = false; toast(rpcErr(e)); RS.step = RS.items.length - 1; rsPaint(); return; }
  RS.sending = false;
  if (r && r.ok) { ls.set('sv-done-' + RS.token, '1'); RS.step = 'done'; }
  else {
    const c = r && r.code;
    if (c === 'answered') { ls.set('sv-done-' + RS.token, '1'); RS.state = 'answered'; }
    else if (c === 'closed') RS.state = 'closed';
    else if (c === 'notyet') RS.state = 'notyet';
    else if (c === 'busy') RS.step = 'busy';
    else if (c === 'badcode') { RS.step = 'code'; RS.err = '코드가 맞지 않아요. 다시 확인해 주세요.'; }
    else if (c === 'none') RS.state = 'none';
    else { toast('보내지 못했어요. 잠시 뒤 다시 해 주세요.'); RS.step = RS.items.length - 1; }
  }
  rsPaint();
}
async function rsCodeGo() {
  const s = RS.s, n = s.gate === 'once' ? 6 : 4;
  if (RS.code.length !== n) return;
  if (RS.mode === 'page') {
    let ok = false; try { ok = (await RS.api.codeCheck(RS.token, RS.code)).ok; } catch (e) { RS.err = rpcErr(e); rsPaint(); return; }
    if (!ok) { RS.err = '코드가 맞지 않아요. 다시 확인해 주세요.'; rsPaint(); return; }
  } else if (RS.mode === 'demo' || RS.mode === 'preview') {
    const ok = s.gate === 'once' ? true : RS.code === s.code;
    if (!ok) { RS.err = '코드가 맞지 않아요. 다시 확인해 주세요.'; rsPaint(); return; }
  }
  RS.err = ''; rsGo(1);
}

// ── 앱 안의 미리보기·데모 화면(맨 위에 겹쳐 뜬다) ──
function openRsOverlay(s, o = {}) {
  ensureLayers(); closeRs();
  rsReset(s, o);
  const pin = o.mode === 'demo' ? '데모' : s.gate === 'code' ? `미리보기, 코드 <b>${esc(s.code)}</b>` : s.gate === 'once' ? '미리보기, 코드는 아무 6자리' : '미리보기';
  const d = document.createElement('div'); d.id = 'svRsOv'; d.className = 'sv sv-rsov'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-label', '답하는 화면 미리보기');
  d.innerHTML = `<div class="rs-proto"><button class="link-btn" type="button" data-sv="rs-close">${ic('back')}${o.mode === 'demo' ? '닫기' : '관리 화면'}</button><span><b>${pin}</b>${o.mode === 'demo' ? '' : ', 보내지 않아요'}</span>
    <select data-svin="rs-state" aria-label="답하는 화면 상태 바꾸기">${RS_STATES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
    <div class="rs-stage"><div><div class="rs" id="svRs"></div></div></div>`;
  document.body.appendChild(d); document.body.classList.add('pop-open'); rsPaint();
  setTimeout(() => { const b = $('#svRs [autofocus]'); b && b.focus({ preventScroll: true }); }, 0);
}
function closeRs() { const d = $('#svRsOv'); if (d) d.remove(); if (!$('#svPop') || $('#svPop').hidden) document.body.classList.remove('pop-open'); if (RS && RS.mode !== 'page') RS = null; clearTimeout(rsTimer); }

// ── 따로 연 답하는 쪽(church-survey.html): 로그인 없이 서버의 누구나 쓸 수 있는 함수만 부른다 ──
function makeRespApi(cfg) {
  const base = String(cfg.SUPABASE_URL || '').replace(/\/+$/, '');
  async function call(name, args) {
    if (!base || !cfg.SUPABASE_KEY) { const e = new Error('설정이 없어요.'); throw e; }
    const ctl = new AbortController(), stop = setTimeout(() => ctl.abort(), 30000); let res, body;
    try { res = await fetch(base + '/rest/v1/rpc/' + name, { method: 'POST', signal: ctl.signal, headers: { apikey: cfg.SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(args) }); }
    catch (e) { const x = new Error('서버가 답하지 않아요. 인터넷을 확인한 뒤 다시 해 주세요.'); x.net = true; throw x; }
    finally { clearTimeout(stop); }
    try { const t = await res.text(); body = t ? JSON.parse(t) : null; } catch (e) { body = null; }
    const m = body && typeof body.message === 'string' && /^(bad|busy): ([\s\S]*)$/.exec(body.message);
    if (m) throw new Error(m[2]);
    if (!res.ok) { const x = new Error('서버가 받지 못했어요. 잠시 뒤 다시 해 주세요.'); x.status = res.status; throw x; }
    return body;
  }
  return {
    pub: token => call('survey_public', { p_token: token }),
    codeCheck: (token, code) => call('survey_code_check', { p_token: token, p_code: code }),
    submit: (token, device, code, ans, other, quiz) => call('survey_submit', { p_token: token, p_device: device, p_code: code || '', p_ans: ans, p_other: other, p_quiz: quiz })
  };
}
function applyStoredDisplay() {
  try {
    const p = JSON.parse(ls.get('koide-pref') || ls.get('didako-note-display') || '{}'), d = document.documentElement;
    if (p.mode === 'light' || p.mode === 'dark') d.dataset.mode = p.mode;
    if (p.accent && p.accent !== 'green') d.dataset.accent = p.accent;
    if (['neu', 'skeu', 'glass'].includes(p.style)) d.dataset.style = p.style;
    if (p.big) d.dataset.big = p.big === 2 ? '2' : '';
  } catch (e) { /* 설정을 못 읽어도 기본 화면으로 돌아간다 */ }
}
SV.respondPage = async function (box) {
  const cfg = window.DIDAKO_CONFIG || window.KOIDE_CONFIG || {}, q = new URLSearchParams(location.search), token = (q.get('s') || '').replace(/[^A-Za-z0-9_-]/g, '');
  applyStoredDisplay(); ensureLayers(); bind();
  box.innerHTML = '<div class="rs-stage"><div><div class="rs" id="svRs"></div></div></div>';
  const api = makeRespApi(cfg), back = q.get('app') === '1';
  const empty = { title: '', dept: '', linkMode: 'dept', gate: 'open', qs: [], check: false, quizIds: null, showAns: false, closedText: DEF_CLOSED };
  const boot = async () => {
    RS = null; rsReset({ ...empty }, { mode: 'page', church: '', back }); RS.api = api; RS.state = 'start'; RS.step = 'busy-load';
    $('#svRs').innerHTML = `<div class="rs-body center"><span class="rs-ic">${ic('clock')}</span><p>불러오는 중이에요…</p></div>`;
    if (!token) { RS.state = 'none'; rsPaint(); return; }
    let pub;
    try { pub = await api.pub(token); } catch (e) { RS.state = 'net'; RS.err = e.message; rsPaint(); return; }
    if (pub.app === 'didako' || pub.app === 'koide') C.app = pub.app;
    if (!pub || pub.state === 'none') { RS.state = 'none'; rsPaint(); return; }
    const s = { title: pub.title || '', dept: pub.dept_name || '', linkMode: pub.link_mode === 'multi' ? 'multi' : 'dept', gate: pub.gate || 'open', qs: pub.qs || [], check: !!pub.check, quizIds: pub.quiz_ids || null, showAns: !!pub.show_ans, closedText: pub.closed_text || DEF_CLOSED, start: toLocal(pub.start), end: toLocal(pub.end), token };
    document.title = (s.title || '설문') + ' ' + (pub.church || '');
    rsReset(s, { mode: 'page', church: pub.church || '', token, back }); RS.api = api;
    RS.state = pub.state === 'notyet' ? 'notyet' : pub.state === 'closed' ? 'closed' : ls.get('sv-done-' + token) ? 'answered' : 'start';
    rsPaint();
  };
  SV.reloadPage = boot;
  await boot();
};

// ══ 화면 그리기 · 눌렀을 때 ═════════════════════════════════════════════════
const curId = () => splitSub(ST.sub)[1];
const curS = () => byId(curId());
let lastKey = '';
function paint() {
  const root = $('#svRoot'); if (!root) return;
  const [k, a] = splitSub(ST.sub); let html = '', stick = '';
  if (ST.error && !ST.items) html = errorView(k);
  else if (!ST.items) html = `${headHtml()}<p class="hint">불러오는 중이에요…</p>`;
  else if (k === 's' || k === 'try') {
    const s = byId(a);
    if (!s) { nav(''); return; }
    if (s.status === 'draft') { html = viewEdit(s); stick = ST.openQ === null ? stickEdit(s) : ''; }
    else if (s.status === 'closed') html = viewReport(s);
    else html = viewLive(s);
  } else html = viewList();
  root.innerHTML = html + stick; root.classList.toggle('has-stick', !!stick);
  paintKw();
}
async function refresh() {
  if (ST.loading) return ST.loading;
  ST.loading = (async () => {
    try { const r = await adapter.list(); ST.items = r.items; ST.scope = r.scope || ST.scope; ST.error = ''; }
    catch (e) { ST.error = e; if (!ST.items) ST.error = e; }
    ST.loading = null;
  })();
  return ST.loading;
}
async function loadRep(s) {
  ST.repErr = '';
  try { ST.rep[s.id] = await adapter.report(s.id); } catch (e) { ST.repErr = rpcErr(e); }
}
// 앱의 위치 주소가 바뀌면 앱이 이 함수를 부른다. sub: '' | 's-설문번호' | 'try-설문번호'
SV.mount = async function (sub) {
  ensureLayers(); tipClose();
  const prevEdit = ST.editId; ST.sub = sub || '';
  const [k, a] = splitSub(ST.sub), key = k + '/' + a;
  if (prevEdit && prevEdit !== a) { flush(prevEdit); ST.editId = null; }
  if (k !== 'try') closeRs();
  if (lastKey !== key) { if (!ST.keepQ) ST.openQ = null; ST.repTab = 'glance'; ST.kw = ''; }
  ST.keepQ = false; lastKey = key;
  const root = $('#svRoot'); if (!root) return;
  const have = ST.items && (k === '' || byId(a));
  const skip = k !== '' && have && byId(a).status === 'draft';   // 고치는 중인 초안은 서버에서 다시 받지 않는다
  if (have) paint(); else { root.innerHTML = `${headHtml()}<p class="hint">불러오는 중이에요…</p>`; }
  if (!skip) { await refresh(); if (ST.sub !== (sub || '')) return; }
  if (ST.error && !ST.items) { paint(); return; }
  if (k === 's' || k === 'try') {
    const s = byId(a); if (!s) { paint(); return; }
    if (s.status === 'closed' && !ST.rep[s.id]) { paint(); await loadRep(s); if (ST.sub !== (sub || '')) return; }
    if (s.status === 'open' || s.status === 'sched') await loadQr();
    if (s.status === 'draft') ST.editId = s.id;
    if (k === 'try') { paint(); openRsOverlay(s, { mode: 'preview' }); return; }
  }
  paint();
};
SV.page = () => '<div class="sv" id="svRoot"></div>';
SV.hashOf = hashOf; SV.splitSub = splitSub;
// 앱이 화면을 통째로 다시 그린 뒤(서버에 다시 묻지 않고) 같은 내용을 다시 칠한다
SV.repaint = () => { if ($('#svRoot')) paint(); };
SV.reset = () => { ST.items = null; ST.rep = {}; ST.open = null; };

async function run(f) { try { return await f(); } catch (e) { toast(rpcErr(e)); return null; } }
const doc = document;
const ACTS = {
  noop() {},
  tipok() { ls.set('sv-tip-v2', '1'); paint(); },
  retry() { ST.error = ''; const [k, a] = splitSub(ST.sub); SV.mount(ST.sub); },
  'pop-close'() { popClose(); }, 'pop-ok'() { const f = popOk; popClose(); f && f(); },
  // 새 설문
  new() { newSheet(); },
  'new-dept'(e, el) { ST.newDept = el.dataset.v; newSheet(); },
  'new-tpl'(e, el) { createDraft('tpl', null, el.dataset.v); }, 'new-blank'() { createDraft('blank'); }, 'new-copy'() { copySheet(); },
  'new-from'(e, el) { createDraft('copy', byId(el.dataset.v)); },
  dup(e, el) { createDraft('copy', byId(el.dataset.id)); },
  // 문항 고치기
  'q-open'(e, el) { ST.openQ = +el.dataset.i; paint(); const c = $('#svqc-' + ST.openQ); if (c) { c.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); const t = $('#svqt-' + ST.openQ); t && t.focus({ preventScroll: true }); } },
  'q-done'() { ST.openQ = null; paint(); },
  'q-type'(e, el) { const s = curS(), q = s.qs[+el.dataset.i], t = el.dataset.v; markEdited(q); q.type = t; if (t !== 'text' && (!q.o || q.o.length < 2)) q.o = ['', '']; if (t === 'multi' && !q.max) q.max = 3; touch(s); paint(); },
  'q-req'(e, el) { const s = curS(), q = s.qs[+el.dataset.i]; q.opt = !q.opt; touch(s); paint(); },
  'q-move'(e, el) { const s = curS(), qs = s.qs, i = +el.dataset.i, j = i + +el.dataset.v; if (j < 0 || j >= qs.length || qs[j].dept) return; [qs[i], qs[j]] = [qs[j], qs[i]]; ST.openQ = j; touch(s); paint(); const c = $('#svqc-' + j); c && c.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); },
  'q-dup'(e, el) { const s = curS(), qs = s.qs, i = +el.dataset.i; if (qs.length >= 40) { toast('문항은 40개까지 넣을 수 있어요.'); return; } qs.splice(i + 1, 0, { ...cloneQ(qs[i]), id: newQ().id, custom: true, dept: false, edited: false }); ST.openQ = i + 1; touch(s); paint(); toast('문항을 복제했어요.'); },
  'q-del'(e, el) { const s = curS(), i = +el.dataset.i, gone = s.qs.splice(i, 1)[0]; ST.openQ = null; touch(s); paint(); ST.undo = { id: s.id, i, q: gone }; toastUndo(); },
  'q-add'() { const s = curS(), qs = s.qs; if (qs.length >= 40) { toast('문항은 40개까지 넣을 수 있어요.'); return; } qs.push(newQ()); ST.openQ = qs.length - 1; touch(s); paint(); const c = $('#svqc-' + ST.openQ); if (c) { c.scrollIntoView({ block: 'center', behavior: 'smooth' }); $('#svqt-' + ST.openQ).focus({ preventScroll: true }); } },
  'o-add'(e, el) { const s = curS(), q = s.qs[+el.dataset.i]; if ((q.o || []).length >= 12) return; markEdited(q); q.o = [...(q.o || []), '']; touch(s); paint(); const ins = $$(`[data-svin="q-o"][data-i="${el.dataset.i}"]`); ins.length && ins[ins.length - 1].focus(); },
  'o-other'(e, el) { const s = curS(), q = s.qs[+el.dataset.i]; markEdited(q); q.o = [...(q.o || []).filter(x => x.trim()), '기타']; while (q.o.length < 2) q.o.unshift(''); touch(s); paint(); },
  'o-del'(e, el) { const s = curS(), q = s.qs[+el.dataset.i]; if ((q.o || []).length <= 2) return; markEdited(q); q.o.splice(+el.dataset.j, 1); touch(s); paint(); },
  'qz-swap'(e, el) { const s = curS(), k = +el.dataset.k, cur = quizOf(s), q = cur[k], used = usedBefore(s);
    const alts = DID_BANK.filter(x => x.lv === q.lv && !cur.some(c => c.id === x.id));
    pop(`<h2 class="sheet-h">${esc(q.lv)} 문항 바꾸기</h2><p class="sheet-sub">같은 난이도에서 골라요. 지금 문항: ${esc(q.t)}</p>
      ${alts.map(x => `<button class="pick" type="button" data-sv="qz-pick" data-k="${k}" data-v="${x.id}"><span class="pk-t"><b>${esc(x.t)}</b><small>${x.o.map(esc).join(', ')}${used.includes(x.id) ? ' (지난번에도 썼어요)' : ''}</small></span>${ic('chev', 'chev-r')}</button>`).join('')}
      <div class="sheet-acts"><button class="btn ghost" type="button" data-sv="pop-close">닫기</button></div>`); },
  'qz-pick'(e, el) { const s = curS(), ids = quizOf(s).map(q => q.id); ids[+el.dataset.k] = el.dataset.v; s.quizIds = ids; touch(s); popClose(); paint(); toast('문항을 바꿨어요.'); },
  'qz-fresh'() { const s = curS(), cur = quizOf(s).map(q => q.id), avoid = new Set([...cur, ...usedBefore(s)]);
    const ids = QUIZ_LV.flatMap(lv => { const pool = DID_BANK.filter(x => x.lv === lv), fresh = pool.filter(x => !avoid.has(x.id)), pick = (fresh.length >= QUIZ_PER ? fresh : pool).slice().sort(() => Math.random() - .5); return pick.slice(0, QUIZ_PER).map(x => x.id); });
    s.quizIds = ids; touch(s); paint(); toast('난이도마다 2개씩 새로 골랐어요.'); },
  'qz-default'() { const s = curS(); s.quizIds = null; touch(s); paint(); toast('기본 6문항으로 돌렸어요.'); },
  'quiz-on'() { const s = curS(); s.check = !s.check; touch(s); paint(); },
  // 닫은 설문 지우기(2026-11-24): 받은 답도 함께 지워지니 한 번 더 묻는다. 이 설문을 복사해 만든 설문은 작년 비교만 빠진다
  'del-closed'(e, el) {
    const s = byId(el.dataset.id); if (!s || s.status !== 'closed') return;
    const kids = ST.items.filter(x => x.prev === s.id).length;
    ask({ title: '이 설문을 지울까요?', body: `"${esc(s.title)}"${hasBatchim(s.title) ? '과' : '와'} 받은 답 ${s.resp}명분을 모두 지워요. 지우면 되돌릴 수 없으니 결과가 필요하면 먼저 인쇄·PDF로 저장해 두세요.${kids ? ' 이 설문을 복사해 만든 설문은 작년과 나란히 보기만 빠져요.' : ''}`, ok: '지우기', danger: true,
      onOk: async () => { const r = await run(() => adapter.del(s.id)); if (r === null && ST.error) return; ST.items = ST.items.filter(x => x !== s); ST.items.forEach(x => { if (x.prev === s.id) x.prev = null; }); delete ST.rep[s.id]; nav(''); toast('지웠어요.'); } });
  },
  'del-draft'(e, el) { const s = byId(el.dataset.id); ask({ title: '이 설문을 지울까요?', body: `"${esc(s.title)}"을 지워요. 아직 열지 않은 설문이라 받은 답은 없어요.`, ok: '지우기', danger: true, onOk: async () => { const r = await run(() => adapter.del(s.id)); if (r === null && ST.error) return; ST.items = ST.items.filter(x => x !== s); ST.editId = null; nav(''); toast('지웠어요.'); } }); },
  undo() { const u = ST.undo; if (!u) return; const s = byId(u.id); s.qs.splice(u.i, 0, u.q); ST.undo = null; touch(s); paint(); toast('되돌렸어요.'); },
  'save-retry'() { const s = curS(); ST.saveState = 'dirty'; s && flush(s.id); },
  // 열기
  async 'open-sheet'(e, el) {
    const s = byId(el.dataset.id), empty = qsAll(s).filter(q => !q.t.trim() || (q.type !== 'text' && (q.o || []).filter(x => x.trim()).length < 2));
    if (!qsAll(s).filter(q => !q.dept).length) { toast('문항을 하나 이상 넣어 주세요.'); return; }
    if (empty.length) { const i = qsAll(s).indexOf(empty[0]); ST.openQ = i; paint(); toast('비어 있는 문항이나 보기가 있어요. 채워 주세요.'); const c = $('#svqc-' + i); c && c.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    if (!(await flush(s.id))) return;
    ST.openQ = null; OPEN = openSheetState(s, 'open'); renderOpenSheet(); },
  reopen(e, el) { OPEN = openSheetState(byId(el.dataset.id), 'reopen'); renderOpenSheet(); },
  'op-end'(e, el) { OPEN.endK = el.dataset.v; OPEN.mode === 'end' ? renderEndSheet() : renderOpenSheet(); },
  'op-gate'(e, el) { if (e.target.closest('input')) return; OPEN.gate = el.dataset.v; renderOpenSheet(); },
  'op-now'() { OPEN.startNow = !OPEN.startNow; OPEN.moreOpen = true; renderOpenSheet(); },
  'op-limit'() { OPEN.limitOn = !OPEN.limitOn; OPEN.moreOpen = true; renderOpenSheet(); },
  'op-ans'() { OPEN.showAns = !OPEN.showAns; OPEN.moreOpen = true; renderOpenSheet(); },
  'op-more'(e) { e.preventDefault(); OPEN.moreOpen = !OPEN.moreOpen; renderOpenSheet(); },
  'op-go'() { doOpen(); },
  async 'open-now'(e, el) { const s = byId(el.dataset.id), r = await run(() => adapter.state(s.id, 'open_now')); if (r) { Object.assign(s, r); paint(); toast('열었어요. 이제 링크나 QR을 보내 주세요.'); } },
  'end-change'(e, el) { endSheet(byId(el.dataset.id)); },
  async 'end-go'() { const s = byId(OPEN.id), en = openEnd(OPEN); if (new Date(en) <= NOW()) { toast('지금보다 뒤로 골라 주세요.'); return; } const r = await run(() => adapter.state(s.id, 'end', { end: en })); if (r) { Object.assign(s, r); popClose(); paint(); toast(`${fmt(en)}에 닫히게 바꿨어요.`); } },
  'q-view'(e, el) { const s = byId(el.dataset.id); let no = 0; pop(`<h2 class="sheet-h">문항 보기</h2><p class="sheet-sub">받는 동안은 문항을 고칠 수 없어요. 바꾸려면 복사해서 새 설문으로 만들어요.</p><ol style="margin:0;padding-left:1.3em;line-height:1.6;font-size:.94em">${respQs(s).map(q => `<li style="margin:.4em 0"${q.sub ? ' value="' + no + '"' : ''}>${esc(q.t)} <span class="soft" style="font-size:.85em">${TYPES[q.type]}</span></li>`).join('')}</ol><div class="sheet-acts"><button class="btn" type="button" data-sv="pop-close">닫기</button></div>`); },
  unsched(e, el) { const s = byId(el.dataset.id); ask({ title: '예약을 풀까요?', body: '만드는 중으로 돌아가 문항을 고칠 수 있어요. 보낸 링크는 다시 열 때까지 "아직 열리지 않았어요"가 보여요.', ok: '예약 풀기', onOk: async () => { const r = await run(() => adapter.state(s.id, 'unsched')); if (r) { Object.assign(s, r); paint(); toast('만드는 중으로 돌아왔어요.'); } } }); },
  'close-now'(e, el) { const s = byId(el.dataset.id); ask({ title: '지금 닫을까요?', body: `${s.resp}명의 답이 있어요. 닫으면 더 받지 않고, 바로 결과를 볼 수 있어요. 필요하면 다시 열 수 있어요.`, ok: '닫고 결과 보기', danger: true, onOk: async () => { const r = await run(() => adapter.state(s.id, 'close')); if (r) { Object.assign(s, r); delete ST.rep[s.id]; ST.repTab = 'glance'; SV.mount(ST.sub); toast('닫았어요.'); } } }); },
  'qr-big'(e, el) { const s = byId(el.dataset.id); board(`<p class="board-t">${esc(s.title)}</p><div class="qr">${qrSvg(respUrl(s))}</div><p>휴대폰 카메라로 비춰 답해 주세요</p>`); },
  'code-big'(e, el) { const s = byId(el.dataset.id); board(`<p class="board-t">현장 코드</p><p class="code-big">${esc(s.code)}</p><p>${esc(s.title)}</p><p>QR이나 링크로 들어와 이 숫자를 넣어 주세요</p>`); },
  'board-x'() { const b = $('#svBoard'); if (b) b.hidden = true; },
  async 'copy-link'(e, el) { const url = respUrl(byId(el.dataset.id)); try { await navigator.clipboard.writeText(url); toast('링크를 복사했어요. 단톡방에 붙여 넣으세요.'); } catch (x) { toast('복사하지 못했어요. 링크를 길게 눌러 복사해 주세요.'); } },
  async 'share-link'(e, el) { const s = byId(el.dataset.id), url = respUrl(s); if (navigator.share) { try { await navigator.share({ title: s.title, text: `${s.title} 설문에 이름 없이 답해 주세요.`, url }); } catch (x) { /* 닫았다 */ } } else ACTS['copy-link'](e, el); },
  'print-sheet'(e, el) { printSheet(byId(el.dataset.id)); },
  'print-codes'(e, el) { printCodes(byId(el.dataset.id)); },
  // 결과
  'rep-tab'(e, el) { ST.repTab = el.dataset.v; paint(); const t = $('.rep-tabs'); if (t && t.getBoundingClientRect().top < 0) window.scrollTo({ top: window.scrollY + t.getBoundingClientRect().top - 70 }); else if (window.scrollY > 400) window.scrollTo(0, 0); },
  'print-paper'() { const s = curS(), R = ST.rep[s.id]; if (!R || R.few) return; const old = document.title; document.title = `${s.title} 결과 보고서`; printHtml(repPaper(R, s)); setTimeout(() => { document.title = old; }, 1500); },
  async 'pray-go'() { const t = ($('#svPray') || {}).value || ''; if (C.prayer) { C.prayer(t); return; } try { await navigator.clipboard.writeText(t); toast('복사했어요. 기도 제목에 붙여 넣어 주세요.'); } catch (x) { toast('복사하지 못했어요. 글을 길게 눌러 복사해 주세요.'); } },
  // 답하는 화면
  'rs-start'() { rsGo(1); }, 'rs-next'() { const it = RS.items[RS.step]; if (it && !it.intro && !rsCanNext(it)) return; clearTimeout(rsTimer); rsGo(1); }, 'rs-back'() { clearTimeout(rsTimer); rsGo(-1); },
  'rs-pick'(e, el) { rsPick(el.dataset.v); },
  'rs-skipquiz'() { rsFinish(); },
  'rs-code-go'() { rsCodeGo(); },
  'rs-resend'() { RS.step = RS.items.length - 1; rsFinish(); },
  'rs-reload'() { SV.reloadPage && SV.reloadPage(); },
  'rs-close'() { const [k, a] = splitSub(ST.sub); closeRs(); if (k === 'try') nav('s-' + a); },
  // 앱 위쪽의 회원 카드
  'mcard-go'(e, el) { goSurvey(el.dataset.id); }, 'mcard-later'(e, el) { ls.set('sv-m-' + el.dataset.id, 'later:' + Date.now()); SV.fillCards(); },
  'mcard-stop'(e, el) { ls.set('sv-m-' + el.dataset.id, 'stop'); SV.fillCards(); toast('이 설문은 더 묻지 않을게요.'); },
  pick() { SV.pickOpen(); },
  'pick-go'(e, el) { popClose(); goSurvey(el.dataset.id); }
};
function toastUndo() {
  let t = $('#svToast'); if (!t) { t = document.createElement('div'); t.id = 'svToast'; t.className = 'sv-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.innerHTML = '문항을 지웠어요. <button type="button" data-sv="undo">되돌리기</button>'; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 5000);
}

// ── 회원 쪽: 앱 위 카드와 더보기 줄 ──
SV.loadOpen = async function (force) {
  if (!force && ST.open && Date.now() - ST.openAt < 180000) return ST.open;
  try { ST.open = (await adapter.openList()) || []; } catch (e) { ST.open = []; }
  ST.openAt = Date.now(); return ST.open;
};
const mPending = () => (ST.open || []).filter(x => {
  if (ls.get('sv-done-' + x.token)) return false;
  const m = ls.get('sv-m-' + x.id) || '';
  if (m === 'stop') return false;
  if (m.startsWith('later:') && Date.now() - +m.slice(6) < 864e5) return false;
  return true;
});
function cardHtml() {
  const x = mPending()[0]; if (!x) return '';
  return `<div class="sv"><section class="card svm-card" aria-label="교회 설문"><h2>${ic('file')}교회에서 설문을 열었어요</h2>
    <p><b>${esc(x.title)}</b><br>이름은 묻지 않고, 답은 합계로만 써요. ${leftText(toLocal(x.end))}.</p>
    <div class="acts"><button class="btn small" type="button" data-sv="mcard-go" data-id="${esc(x.id)}">지금 하기</button><button class="btn small ghost" type="button" data-sv="mcard-later" data-id="${esc(x.id)}">나중에</button><button class="link-btn quiet" type="button" data-sv="mcard-stop" data-id="${esc(x.id)}">그만 묻기</button></div></section></div>`;
}
SV.cardHtml = cardHtml;
// 카드와 더보기 줄이 들어갈 자리(앱이 [data-sv-card], [data-sv-row] 표시를 둔다)를 채운다
SV.fillCards = async function () {
  await SV.loadOpen();
  $$('[data-sv-card]').forEach(el => { el.innerHTML = cardHtml(); });
  const n = (ST.open || []).filter(x => !ls.get('sv-done-' + x.token)).length;
  $$('[data-sv-row]').forEach(el => { el.hidden = !n; const t = $('.sv-row-sub', el); if (t) t.textContent = n ? `${n}개 열려 있어요` : ''; });
};
function goSurvey(id) {
  const x = (ST.open || []).find(o => o.id === id); if (!x) return;
  if (C.demo || !C.rpc) { const s = (demo.load().items || []).find(o => o.id === id); if (s) openRsOverlay(s, { mode: 'demo', church: churchName() }); return; }
  location.href = respUrl({ token: x.token }) + '&app=1';
}
SV.pickOpen = async function () {
  await SV.loadOpen(true); const L = (ST.open || []).filter(x => !ls.get('sv-done-' + x.token));
  if (!L.length) { toast('지금 열려 있는 설문이 없어요.'); return; }
  if (L.length === 1) { goSurvey(L[0].id); return; }
  ensureLayers();
  pop(`<h2 class="sheet-h">교회 설문</h2><p class="sheet-sub">이름 없이 답해요. 하나를 골라 주세요.</p>${L.map(x => `<button class="pick" type="button" data-sv="pick-go" data-id="${esc(x.id)}"><span class="pk-ic">${ic('file')}</span><span class="pk-t"><b>${esc(x.title)}</b><small>${esc(x.dept_name || '')}, ${leftText(toLocal(x.end))}</small></span>${ic('chev', 'chev-r')}</button>`).join('')}<div class="sheet-acts"><button class="btn ghost" type="button" data-sv="pop-close">닫기</button></div>`);
};

// ══ 이벤트(문서에 한 번만 건다) ═════════════════════════════════════════════
let bound = false;
function bind() {
  if (bound) return; bound = true;
  doc.addEventListener('click', e => {
    const el = e.target.closest('[data-sv]'); if (!el) return;
    const f = ACTS[el.dataset.sv]; if (!f || el.disabled) return;
    if (el.tagName === 'SUMMARY') e.preventDefault();
    f(e, el);
  });
  doc.addEventListener('input', e => {
    const el = e.target.closest('[data-svin]'); if (!el) return; const k = el.dataset.svin, v = el.value;
    if (k === 'kw') { ST.kw = v; return paintKw(); }
    if (k === 'memo') { const s = curS(); if (!s) return; s.memo = v; if (ST.rep[s.id]) ST.rep[s.id].memo = v; clearTimeout(ST.memoT); ST.memoT = setTimeout(() => { adapter.memo(s.id, v).catch(x => toast(rpcErr(x))); }, 800); return; }
    if (k === 'rs-state') { const s = RS.s, o = { mode: RS.mode, church: RS.church, back: RS.back }; rsReset(s, { ...o, state: v }); RS.state = v; RS.step = 'welcome'; if (v === 'busy') RS.state = 'start'; rsPaint(); if (v === 'busy') { RS.items = []; RS.step = 'busy'; rsPaint(); } return; }
    if (k === 'rs-code') { const s = RS.s, n = s.gate === 'once' ? 6 : 4; RS.code = s.gate === 'once' ? v.toUpperCase().replace(/[^A-Z0-9]/g, '') : v.replace(/\D/g, ''); el.value = RS.code; RS.err = ''; $('#svRsErr').textContent = ''; $('#svRsCodeGo').disabled = RS.code.length < n; if (RS.code.length === n) rsCodeGo(); return; }
    if (k === 'rs-other') { const q = RS.items[RS.step].q; (RS.other = RS.other || {})[q.id] = v; return; }
    if (k === 'rs-text') { const q = RS.items[RS.step].q; RS.ans[q.id] = v; $('#svRsCnt').textContent = v.length; const b = $('#svRs .rs-foot .btn'); if (b) b.disabled = !rsCanNext(RS.items[RS.step]); return; }
    if (k.startsWith('op-')) {
      const map = { 'op-endD': 'endD', 'op-endT': 'endT', 'op-startD': 'startD', 'op-startT': 'startT', 'op-onceN': 'onceN', 'op-limitN': 'limit', 'op-closed': 'closedText' };
      if (OPEN && map[k]) { OPEN[map[k]] = v; const w = $('#svOpWhen'); if (w) w.innerHTML = OPEN.mode === 'end' ? `<b>${fmt(openEnd(OPEN))}</b>에 저절로 닫혀요.` : whenText(OPEN); }
      return;
    }
    const s = curS(); if (!s || s.status !== 'draft') return;
    if (k === 'title') { s.title = v; touch(s); return; }
    const q = s.qs[+el.dataset.i]; if (!q) return;
    if (k === 'q-t') { q.t = v; markEdited(q); }
    if (k === 'q-o') { q.o[+el.dataset.j] = v; markEdited(q); }
    touch(s);
  });
  doc.addEventListener('change', e => { if (e.target.closest('[data-svin="title"]')) { const s = curS(); if (s && !s.title.trim()) { s.title = '제목 없는 설문'; touch(s); paint(); } } });
  doc.addEventListener('keydown', e => {
    if (e.key === 'Escape') { const b = $('#svBoard'); if (b && !b.hidden) { b.hidden = true; return; } if ($('#svPop') && !$('#svPop').hidden) { popClose(); return; } if ($('#svRsOv')) { ACTS['rs-close'](); return; } return; }
    const r = e.target.closest('.radio[data-sv]'); if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); r.click(); return; }
    if (e.key === 'Enter' && e.target.id === 'svRsOther') { e.preventDefault(); const b = $('#svRs .rs-foot .btn'); b && !b.disabled && b.click(); return; }
    if (!RS || !$('#svRs') || typeof RS.step !== 'number' || e.target.closest('textarea, input, select')) return;
    const it = RS.items[RS.step]; if (!it) return;
    if (/^[1-9]$/.test(e.key) && it.q) { const b = $$('#svRs .rs-opt')[+e.key - 1]; b && b.click(); }
    else if (e.key === 'Enter') { const b = $('#svRs .rs-foot .btn'); b && !b.disabled && b.click(); }
  });
  window.addEventListener('pagehide', () => { if (ST.editId && ST.saveState !== 'saved') flush(ST.editId); });
}

// ══ 앱이 처음 한 번 부르는 설정 ═════════════════════════════════════════════
// cfg: app('didako'|'koide'), rpc(이름, 값) 로그인한 서버 부르기(없으면 데모), demo(true면 데모), head() 관리 화면 위쪽 HTML,
//      church() 교회 이름, toast(글), books() 교재 목록(디다코), prayer(글) 기도 제목으로 옮기기(코이데), demoAll(데모에서 교회 관리자인가)
SV.init = function (cfg) {
  C = { ...C, ...cfg };
  adapter = (C.demo || !C.rpc) ? demo : live;
  if (cfg.app && cfg.app !== ST.app) { ST.items = null; ST.rep = {}; ST.open = null; ST.app = cfg.app; }
  ensureLayers(); bind();
};
})();
