/*
 * 동기화 켜기 창들의 글과 "처음 들어올 때" 규칙(코이데 노트·디다코 노트 공용). 원본은 gbs `shared/family-ui/family-vault.js` 한 곳이고
 * sync.sh가 두 노트(디다코 note/, 코이데 app/)에 복사한다. 복사본은 직접 고치지 않는다.
 *  - FamilyVault.T: 창 제목·안내·단추 이름·오류·알림 글. 두 앱이 이 글을 그대로 쓰므로 한 곳만 고치면 둘이 같이 바뀐다.
 *  - FamilyVault.askedKey(앞머리, 계정해시): "문으로 들어와 처음 로그인했을 때 비밀번호 창을 한 번만 연다"의 기억 열쇠.
 * 창의 모양(HTML·CSS)은 앱마다 쓰는 창이 달라서 각자 그린다. 글과 순서(동의 → 비밀번호)만 여기서 정한다. docs/ux-common.md 76번.
 */
(() => {
  const T = {
    // 첫 화면(로그인 전) 안내 한 줄
    startHint: '기록은 이 휴대폰에 있고, 동기화를 켜면 암호화된 채로만 서버에 가요.',
    cancel: '취소',
    // ① 동의 창(처음 맡기기 직전. 이 기기에 한 번 동의하면 다시 묻지 않는다)
    agreeTitle: '동기화 켜기',
    agreeBody: '기록은 이 휴대폰에서 암호화해서 동기화해요. 운영자도 읽을 수 없어요.',
    agreeCheck: '신앙 정보(민감정보) 처리에 동의해요 (필수)',
    agreePrivacy: '개인정보 처리방침 전체 보기',
    agreeGo: '동의하고 켜기',
    // ② 비밀번호 정하기(맡긴 노트가 없을 때)
    createTitle: '비밀번호 정하기',
    createBody: '이 비밀번호로 노트를 암호화하여 보관해요. 다른 기기에서 열 때도 같은 비밀번호를 넣어요.',
    createNoticeB: '운영하는 사람도 열 수 없어요.',
    createNotice: ' 다음 화면의 복구용 낱말 6개를 꼭 보관해 두세요.',
    createGo: '정하고 동기화하기',
    busy: '잠그는 중…',
    pw: '비밀번호 (6글자 넘게)',
    pwAgain: '한 번 더',
    // ② 비밀번호 넣기(이미 맡긴 노트가 있을 때)
    unlockTitle: '비밀번호 넣기',
    unlockBody: '다른 기기에서 정한 비밀번호를 넣으면, 보관한 노트를 이 기기의 노트와 합쳐요.',
    unlockMoveBody: '새 보관함에 이미 보관한 노트가 있어요. 그 노트의 비밀번호를 넣으면, 이 기기의 노트와 합쳐서 새 보관함에 이어 붙어요. 예전 보관함의 기록은 남아요.',
    unlockGo: '열기',
    forgotLink: '비밀번호를 잊었어요 › 복구용 낱말로 열기',
    forgotNone: '비밀번호를 잊었어요 › 복구용 낱말을 만들지 않았다면 되살릴 수 없어요.',
    // 복구용 낱말로 열기
    recoverTitle: '복구용 낱말로 열기',
    recoverBody: '복구용 낱말 6개를 넣고, 이 노트의 새 비밀번호를 정해요. 복구용 낱말은 그대로 두고 또 쓸 수 있어요.',
    recoverWords: '낱말 6개 (붙여 넣어도 돼요)',
    recoverPw: '새 비밀번호 (6글자 넘게)',
    recoverGo: '열고 정하기',
    recoverBack: '‹ 비밀번호로 열기',
    // 복구용 낱말 보여 주기
    wordsTitle: '복구용 낱말',
    wordsBody: '비밀번호를 잊었을 때 이 낱말로 노트를 열어요. 사진으로 찍거나 카톡 나에게 보내 두세요. 운영하는 사람도 다시 알려 드릴 수 없어요.',
    wordsShare: '보내기',
    wordsCopy: '복사하기',
    wordsDone: '보관했어요',
    // 오류·알림
    errShort: '6글자 넘게 써 주세요.',
    errMismatch: '두 번 쓴 비밀번호가 달라요.',
    errMismatchNew: '두 번 쓴 새 비밀번호가 달라요.',
    errWrong: '비밀번호가 달라요.',
    errWords: '복구용 낱말이 맞지 않아요. 낱말을 다시 봐 주세요.',
    errFail: '잠그지 못했어요. 다시 해 주세요.',
    toastMerged: '동기화한 노트를 합쳤어요',
    toastRecovered: '새 비밀번호로 바꾸고 노트를 합쳤어요'
  };
  // 문으로 들어와 처음 로그인했을 때 비밀번호 창을 연 적이 있는지 기억하는 열쇠(계정마다, 이 기기에만)
  const askedKey = (prefix, hash) => prefix + '-asked-' + hash;
  window.FamilyVault = { T, askedKey };
})();
