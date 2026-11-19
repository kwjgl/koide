// 계정 탈퇴(더보기 › 계정 탈퇴)의 서버 부르기와 문구. 화면 그리기는 index.html이 하고, 글은 모두 이 파일 한 곳에 둔다(2026-11-19).
//  서버 함수는 supabase/029(account_delete_check·account_delete)와 033(요약의 will.churchMode)이다. 노트 화면(note.html)도 같은 파일을 쓴다.
//  rpc는 KoideSb.rpc 모양(rpc(이름, 인자) → 값, 실패하면 {code, message}를 던진다)을 넘겨 받는다.
window.KoideAcctDel = (() => {
  // 탈퇴가 끝나면 index.html이 localStorage에 이 이름의 표시({uid, h} 글자. 계정을 모르면 '1')를 남긴다. 노트 화면(note.html)이 다음에 열릴 때 이 기기에 남은 그 계정의 노트만 지운다.
  const wipeHint = 'koide-wipe-note';
  // 지워지기 전 요약. 막힘이 있으면 {ok:false, blockers:[{code,msg}]}, 없으면 {ok:true, will, lines}
  async function check(rpc) {
    const r = await rpc('account_delete_check');
    if (!r || r.ok === false) return { ok: false, blockers: (r && r.blockers) || [] };
    return { ok: true, will: r.will || {}, lines: lines(r.will || {}) };
  }
  // 지워지는 것 목록(글만. 화면에서 esc를 거친다). 서버가 알려 준 칸만 쓴다: churchMode가 없는 옛 서버(029만)여도 돈다
  function lines(will) {
    const w = will || {}, out = [];
    if (w.noteVault) out.push('서버에 맡긴 코이데 노트 보관함');
    if (w.communities > 0) out.push('코이데 공동체 ' + w.communities + '곳에서 나가요' + (w.leaderOf > 0 ? ' (그중 ' + w.leaderOf + '곳은 모임장이에요)' : ''));
    if (w.church) {
      const m = w.churchMode;
      if (m === 'erase') out.push(w.church + ' 가정 기록(우리 가정의 기도제목 포함)');
      else if (m === 'name') out.push(w.church + ' 가정에서 내 이름만 빠져요(가정 기도제목은 남아요)');
      else if (m === 'request') out.push(w.church + ' 가정 연결 요청이 취소돼요');
      else if (!('churchMode' in w)) out.push(w.church + ' 교회의 가정 기록(배우자 계정이 있으면 내 이름만 빠져요)');
      else out.push(w.church + ' 교회 소속');
    }
    if (w.didako) out.push('디다코 기록도 함께 지워져요');
    out.push('이 휴대폰에 저장된 이 계정의 코이데 노트');
    return out;
  }
  // 막힘 이유(서버 글) 아래에 보여 줄 할 일. 코드는 029 account_blockers의 code 값
  function todo(code) {
    return {
      church_admin: '다른 교회 관리자에게 관리자에서 빼 달라고 부탁해 주세요.',
      last_admin: '교회 전체 › 교회 관리자 초대로 한 분을 더 세운 뒤 해 주세요.',
      app_admin: '코이데 운영자(koinobia.admin@gmail.com)에게 알려 주세요.'
    }[code] || '';
  }
  // 탈퇴. 확인 글은 서버도 검사한다
  const run = (rpc, text) => rpc('account_delete', { p_confirm: text });
  return { check, lines, todo, run, wipeHint };
})();
