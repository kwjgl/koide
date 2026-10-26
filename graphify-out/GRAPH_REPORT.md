# Graph Report - koide  (2026-10-24)

## Corpus Check
- 22 files · ~186,852 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 9 file(s) not represented in the graph (top: .css 6, (none) 2, .webmanifest 1)

## Summary
- 839 nodes · 2405 edges · 53 communities (48 shown, 5 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 134 edges (avg confidence: 0.85)
- Token cost: 608,799 input · 0 output

## Community Hubs (Navigation)
- 서버 기본 뼈대 (Code.js)
- 서버 통계·분석
- 서버 부서·방 관리
- 서버 인증·삭제 요청
- 3D 기도노트 장면
- 화면 지도 데모
- 사용법 안내 가이드
- 공동체앱 클릭 동작
- 설문 기능
- 서버 권한·승인
- 3D 장면 데이터 연결
- 서버 데이터 불러오기
- 기도 세션 진행
- 기도노트 동기화·백업
- 오늘의 기도와 이스터에그
- 공동체앱 화면 설정
- 자율 기도모임
- 홈 화면 카드
- 기도 반응 효과
- 이달의 그림 모음
- 서버 조직 개편
- 기도노트 화면들
- 팔복 이스터에그
- 데모용 가짜 서버
- 관리자 화면 카드
- 소개 영상
- 홈화면 추가·3D 그물
- 엑셀 내보내기·사용기록
- 서버 기도제목 저장
- 교회 분석 화면
- 기도의 끈·찬송
- 암호화·복구 단어
- 서버 연결·데모 모드
- 소개·동의 화면
- 기록·저장 도우미
- 절기별 기도문
- 튜토리얼·스플래시
- 시범운영 안내
- 앱 껍데기·설정
- 튜토리얼 붙여넣기 해석
- 해와 비 이스터에그
- 운영 관리자 모드
- 로그인·시작
- 시작 화면(스플래시)
- 그림 배치
- 기도 이력 화면
- 모임 모드·공개 범위
- 더보기·테마
- 오프라인·홈화면 추가
- 기도대상 자동 분리

## God Nodes (most connected - your core abstractions)
1. `read_()` - 129 edges
2. `fail_()` - 69 edges
3. `document click action dispatcher` - 62 edges
4. `render()` - 51 edges
5. `withLock_()` - 47 edges
6. `api() server call (demo shim or Apps Script)` - 47 edges
7. `month_()` - 46 edges
8. `update_()` - 45 edges
9. `render()` - 37 edges
10. `append_()` - 35 edges

## Surprising Connections (you probably didn't know these)
- `Query/hash passthrough (?join=)` --semantically_similar_to--> `Demo URL params (?demo&as=&at=)`  [INFERRED] [semantically similar]
  index.html → app/demo/map.html
- `koide (코이데 앱 화면)` --conceptually_related_to--> `코이데 화면 지도 (Screen Map)`  [INFERRED]
  README.md → app/demo/map.html
- `Root redirect page (코이데)` --references--> `app/index.html (community app)`  [EXTRACTED]
  index.html → app/demo/map.html
- `koide (코이데 앱 화면)` --conceptually_related_to--> `Root redirect page (코이데)`  [INFERRED]
  README.md → index.html

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Guided prayer session flow** — app_index_pslist, app_index_pshtml, app_index_pstick, app_index_psmark, app_index_psgo, app_index_prayfor, app_index_psopendone [EXTRACTED 0.95]
- **Client-side spreadsheet export pipeline** — app_index_exportxlsx, app_index_myexportxlsx, app_index_sheetof, app_index_xlsxblob, app_index_zip, app_index_crc32 [EXTRACTED 0.95]
- **Prayer text splitting / sheet import parsing** — app_index_parsetsv, app_index_readsheet, app_index_splititems, app_index_labelof, app_index_targetof, app_index_splitdraft [EXTRACTED 0.95]
- **Encrypted vault sync and key management flow** — app_note_derivekey, app_note_lockup, app_note_unlockup, app_note_lockwithwords, app_note_kcsubmit, app_note_sync, app_note_recmake, app_note_vaultstart [EXTRACTED 1.00]
- **One-card prayer session flow** — app_note_pshtml, app_note_pstick, app_note_psgo, app_note_psmark, app_note_psscroll, app_note_psopendone, app_note_psstop [EXTRACTED 1.00]
- **Prayer drawer 3D view renderers** — app_note_keepview, app_note_mount3d, app_note_mountweaves, app_note_corddata, app_note_monthrow, app_note_chestdata, app_note_gardenbig, app_note_weavebig [INFERRED 0.85]
- **Screen map lazy iframe loading pipeline** — app_demo_map_schedule, app_demo_map_refresh, app_demo_map_pump, app_demo_map_unload, app_demo_map_dist [EXTRACTED 1.00]
- **Screen map pan/zoom controls** — app_demo_map_apply, app_demo_map_zoomat, app_demo_map_fit, app_demo_map_start, app_demo_map_up [EXTRACTED 1.00]
- **Koide user journey: login, community, prayer note, roles** — app_demo_map_kakao_login, app_demo_map_community_flow, app_demo_map_prayer_note_flow, app_demo_map_role_screens [EXTRACTED 1.00]

## Communities (53 total, 5 thin omitted)

### Community 0 - "서버 기본 뼈대 (Code.js)"
Cohesion: 0.05
Nodes (58): ACTIONS, addMonths_(), append_(), codeLogin_(), codeMake_(), codeNorm_(), dailyTidy(), dayNum_() (+50 more)

### Community 1 - "서버 통계·분석"
Cohesion: 0.14
Nodes (42): analysisView_(), appStats_(), artNums_(), churchAnalysis_(), classify_(), clearSampleData(), ensureFamilies_(), ensureMonth_() (+34 more)

### Community 2 - "서버 부서·방 관리"
Cohesion: 0.14
Nodes (41): activeRooms_(), activeRow_(), adminOf_(), allAdmin_(), canReceive_(), changesView_(), churchView_(), deptById_() (+33 more)

### Community 3 - "서버 인증·삭제 요청"
Cohesion: 0.15
Nodes (40): auth_(), daysLeft_(), deptErase_(), deptSave_(), deptState_(), eraseFam_(), eraseFamily_(), eraseRequest_() (+32 more)

### Community 4 - "3D 기도노트 장면"
Cohesion: 0.10
Nodes (25): captioned(), chest(), select(), cord(), garden(), anchorFor(), apply(), board() (+17 more)

### Community 5 - "화면 지도 데모"
Cohesion: 0.08
Nodes (27): apply(), arrows() (SVG arrow renderer), ARROWS (flow arrows), 교회 공동체 flow (connect -> wait -> home/mine/pray/history/more), Demo URL params (?demo&as=&at=), Demo personas (김도윤, 한기쁨, 윤하람, 최운영, 박민재, 새사람), Kakao login start (첫 화면), openBig() (+19 more)

### Community 6 - "사용법 안내 가이드"
Cohesion: 0.20
Nodes (24): bars(), elsOf(), enterTyping(), finish(), focusStart(), go(), inertPlace(), layout() (+16 more)

### Community 7 - "공동체앱 클릭 동작"
Cohesion: 0.14
Nodes (19): addPerson(), document click dispatcher (data-a actions), go(), Move group prayer items into note (groupExport), grpReveal(), KoideIntroVideo (intro-video.js), KoidePrayOpen (pray-open.js), mvGo() (+11 more)

### Community 8 - "설문 기능"
Cohesion: 0.19
Nodes (21): adopt(), attempt(), blocked(), body(), close(), fresh(), fromWire(), init() (+13 more)

### Community 9 - "서버 권한·승인"
Cohesion: 0.21
Nodes (22): activeStaff_(), approveAll_(), beforeIds_(), beforeMarriage_(), canManage_(), careSignals_(), decide_(), endStaff_() (+14 more)

### Community 10 - "3D 장면 데이터 연결"
Cohesion: 0.15
Nodes (17): cordData(), gardenActs(), gardenBig(), gardenNav(), keepView(), KOIDE_ART scenes (art-data.js), KOIDE_NOTE3D (note-3d.js), load3d() (+9 more)

### Community 11 - "서버 데이터 불러오기"
Cohesion: 0.16
Nodes (17): api() server call (demo shim or Apps Script), loadAdmin(), loadAnalysis(), loadBefore(), loadChanges(), loadMyPrayers(), loadOps(), loadPrayText() (+9 more)

### Community 12 - "기도 세션 진행"
Cohesion: 0.18
Nodes (14): bulkParse(), document click action dispatcher, mvStart(), nameKey(), psGo(), psMark(), psOpenDone(), psRender() (+6 more)

### Community 13 - "기도노트 동기화·백업"
Cohesion: 0.14
Nodes (15): JSON backup and restore file, KoidePilot (pilot.js), KOIDE_SURVEY (survey.js), mergeBy(), mergeIn(), migrate(), Prayer note data D (items, people, prays, thanks, weaves, gone), Optimistic concurrency sync via baseRev/stale retry (+7 more)

### Community 14 - "오늘의 기도와 이스터에그"
Cohesion: 0.14
Nodes (15): cordAll(), cordHtml(), Beatitudes and Sun-and-rain easter eggs, KoideBeatitudes (beatitudes.js), KOIDE_PRAY data (pray-data.js), KoideSunrain (sunrain.js), prayDay(), Prayer cord (weekly knots per person) (+7 more)

### Community 15 - "공동체앱 화면 설정"
Cohesion: 0.14
Nodes (17): Community app index.html, Design style variants (flat/neu/skeu/glass) and accent themes, groupsCard(), groupUrl(), inCommunity(), koidePlaces (places.js), moreView(), places() (+9 more)

### Community 16 - "자율 기도모임"
Cohesion: 0.20
Nodes (14): Autonomous prayer groups (자율 모임), copy() clipboard, enterGroup(), groupMoreCard(), meet-mode keyboard handler, leaveGroupView(), meetGo(), meetOpenDone() (+6 more)

### Community 17 - "홈 화면 카드"
Cohesion: 0.17
Nodes (13): famCard(), groupEndCard(), homeView(), itemList(), mineCard(), pickToday(), prayBtn(), receivedLine() (+5 more)

### Community 18 - "기도 반응 효과"
Cohesion: 0.17
Nodes (15): a2hsDue(), beatCount(), beatGift(), calm() reduced motion, kusudama() celebration, popBurst(), prayFor(), rosterDo() (+7 more)

### Community 19 - "이달의 그림 모음"
Cohesion: 0.16
Nodes (12): albumHtml(), artBump(), artCard(), artCollection(), histCard(), Monthly art collection (이달의 그림), myPrayView(), sceneHtml() (+4 more)

### Community 20 - "서버 조직 개편"
Cohesion: 0.24
Nodes (16): cleanPlan_(), dropPlan_(), ids_(), notInTerm_(), opsCtxView_(), opsOf_(), opsRows_(), opsScope_() (+8 more)

### Community 21 - "기도노트 화면들"
Cohesion: 0.14
Nodes (4): grpHtml(), noteLi(), noteView(), render()

### Community 22 - "팔복 이스터에그"
Cohesion: 0.29
Nodes (13): close(), closeGift(), cord(), gift(), line(), next(), onKey(), open() (+5 more)

### Community 23 - "데모용 가짜 서버"
Cohesion: 0.21
Nodes (7): addTutor(), addTutorialPerson(), call(), groupsTo(), insertSheet(), ready(), sheet()

### Community 24 - "관리자 화면 카드"
Cohesion: 0.15
Nodes (7): adminView(), approveAllBar(), manageCard(), opsCard(), opsProblems(), reqCard(), rosterCard()

### Community 25 - "소개 영상"
Cohesion: 0.40
Nodes (13): arm(), btn(), close(), cord(), onKey(), open(), paintBars(), play() (+5 more)

### Community 26 - "홈화면 추가·3D 그물"
Cohesion: 0.15
Nodes (6): a2hsCard(), draw(), load3d(), mountWeave(), placeTip(), Add to home screen / PWA

### Community 27 - "엑셀 내보내기·사용기록"
Cohesion: 0.22
Nodes (12): Client-side XLSX export, exportXlsx(), myExportXlsx(), sendUsage(), surveyCsv(), track() usage logging, trackOpen(), trackView() (+4 more)

### Community 28 - "서버 기도제목 저장"
Cohesion: 0.27
Nodes (13): appendMany_(), deleteItem_(), importRoom_(), itemInput_(), member_(), newId_(), saveItem_(), saveItems_() (+5 more)

### Community 29 - "교회 분석 화면"
Cohesion: 0.18
Nodes (7): analysisView(), changesCard(), churchView(), fold(), groupCloseCard(), surveyAdminView(), topicFlowCard()

### Community 30 - "기도의 끈·찬송"
Cohesion: 0.23
Nodes (11): cordHtml(), cordView(), Music (hymn Web Audio player), Prayer cord (기도의 끈), Guided prayer session (기도하기), psHtml(), psList(), roomCordHtml() (+3 more)

### Community 31 - "암호화·복구 단어"
Cohesion: 0.38
Nodes (11): deriveKey(), kcSubmit(), KOIDE_WORDS (words-ko.js), lockUp(), lockWithWords(), PBKDF2-SHA256 (250k iterations) to AES-GCM-256, pickWords(), readWords() (+3 more)

### Community 32 - "서버 연결·데모 모드"
Cohesion: 0.22
Nodes (10): api(), Apps Script backend API (noteGet/notePut/noteKeys/me/groupExport...), Demo mode (in-browser Apps Script via gas-shim), kcOpen(), KOIDE_CONFIG (config.js), loadDemo(), loadMe(), recMake() (+2 more)

### Community 33 - "소개·동의 화면"
Cohesion: 0.22
Nodes (6): aboutCord(), aboutView(), consentList(), Department vocabulary (group name, unit, josa), groupCard(), VIEWS (screen renderers table)

### Community 34 - "기록·저장 도우미"
Cohesion: 0.36
Nodes (9): loadFamTl(), loadHist(), mvGo(), oops(), saveArt(), saveWeave(), document submit form handler, toast() (+1 more)

### Community 35 - "절기별 기도문"
Cohesion: 0.24
Nodes (7): effTopic(), Kingdom prayer pages (하나님 나라), prayTextView(), prayToday(), topicOf(), easterDay(), seasonKey()

### Community 36 - "튜토리얼·스플래시"
Cohesion: 0.27
Nodes (7): KoideGuide (guide.js), koideSplash/koideSpace (splash.js), NoteGuide, NoteGuide.drop(), NoteGuide.maybe(), NoteGuide.start(), Scene mode (?as&at) for screen map

### Community 37 - "시범운영 안내"
Cohesion: 0.36
Nodes (8): done(), html(), init(), load(), mount(), paint(), room(), save()

### Community 38 - "앱 껍데기·설정"
Cohesion: 0.25
Nodes (4): index.html (Koide community app), begin(), stop(), SHELL

### Community 39 - "튜토리얼 붙여넣기 해석"
Cohesion: 0.25
Nodes (7): labelOf(), readSheet(), splitDraft(), splitItems(), TourC (tutorial controller), tutFail(), Tutorial practice page (?tutorial)

### Community 40 - "해와 비 이스터에그"
Cohesion: 0.44
Nodes (8): close(), cord(), line(), onKey(), rise(), scene(), scene1(), showCard()

### Community 41 - "운영 관리자 모드"
Cohesion: 0.39
Nodes (8): adminDone(), adminWait(), enterChurch(), enterOps(), leaveOps(), loadChurch(), loadChurchAnalysis(), Operations admin mode (S.op)

### Community 42 - "로그인·시작"
Cohesion: 0.36
Nodes (8): backToNote(), boot(), document change handler, Demo / tutorial / scene modes, demoSwitch(), kakaoLogin(), loadDemo(), setToken()

### Community 44 - "그림 배치"
Cohesion: 0.33
Nodes (4): artPos(), endArt() drag end, paintBig(), sceneSvg()

### Community 45 - "기도 이력 화면"
Cohesion: 0.33
Nodes (6): beforeCard(), famTlCard(), histItems(), historyView(), staffRoomView(), timelineCard()

### Community 46 - "모임 모드·공개 범위"
Cohesion: 0.29
Nodes (7): editLi(), itemBody(), Meet mode (모임 모드), meetHtml(), mineView(), Prayer item visibility scopes (room / dept / leader / family), sheetOf()

### Community 47 - "더보기·테마"
Cohesion: 0.33
Nodes (3): moreView(), themeControls(), topHtml()

### Community 49 - "기도대상 자동 분리"
Cohesion: 0.40
Nodes (3): Split by target parsing (label prefix like 엄마ㅡ), noteLabel(), splitNote()

## Knowledge Gaps
- **15 isolated node(s):** `Demo mode (in-browser Apps Script via gas-shim)`, `Split by target parsing (label prefix like 엄마ㅡ)`, `Design style variants (flat/neu/skeu/glass) and accent themes`, `Share item to community via koide-share handoff`, `KOIDE_CONFIG (config.js)` (+10 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 154 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `loadDemo()` connect `로그인·시작` to `서버 기본 뼈대 (Code.js)`, `데모용 가짜 서버`?**
  _High betweenness centrality (0.286) - this node is a cross-community bridge._
- **What connects `Demo mode (in-browser Apps Script via gas-shim)`, `Split by target parsing (label prefix like 엄마ㅡ)`, `Design style variants (flat/neu/skeu/glass) and accent themes` to the rest of the system?**
  _15 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `서버 기본 뼈대 (Code.js)` be split into smaller, more focused modules?**
  _Cohesion score 0.05222734254992319 - nodes in this community are weakly interconnected._
- **Why does `boot()` connect `로그인·시작` to `자율 기도모임`, `기록·저장 도우미`, `서버 데이터 불러오기`, `튜토리얼 붙여넣기 해석`?**
  _High betweenness centrality (0.227) - this node is a cross-community bridge._
- **Should `서버 통계·분석` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._
- **Why does `render()` connect `자율 기도모임` to `기록·저장 도우미`, `튜토리얼 붙여넣기 해석`, `운영 관리자 모드`, `로그인·시작`, `서버 데이터 불러오기`, `기도 세션 진행`, `기도 반응 효과`, `홈화면 추가·3D 그물`?**
  _High betweenness centrality (0.155) - this node is a cross-community bridge._
- **Should `서버 부서·방 관리` be split into smaller, more focused modules?**
  _Cohesion score 0.1378048780487805 - nodes in this community are weakly interconnected._