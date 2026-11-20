/*
 * 앱 안 확인 창(공동체 앱 · 기도 노트 · 코이데 공동체가 함께 쓴다).
 * 브라우저 기본 팝업(confirm·prompt)은 홈 화면 앱에서 모양이 어긋나고 환경에 따라 막히기도 해서, 디다코처럼 앱 안 창으로 묻는다(2026-11-20).
 *  await KoideAsk.ok(글, { ok: '지우기', cancel: '취소', danger: true }) → true/false. 글 속 줄바꿈(\n)은 그대로 보인다
 *  await KoideAsk.text(글, 처음 값) → 쓴 글(취소는 null)
 * 확인 단추 이름과 붉은 모양은 글의 끝맺음으로 정한다(지울까요 → "지우기"). 따로 넘기면 그것을 쓴다.
 * 바깥을 누르거나 Esc를 누르면 취소다. 창은 body에 하나뿐이고, 닫히면 눌렀던 단추로 포커스가 돌아간다.
 */
(() => {
  const CSS = `
.kask { position: fixed; inset: 0; z-index: 2147483000; display: flex; align-items: flex-end; justify-content: center; }
.kask-scrim { position: absolute; inset: 0; background: rgb(0 0 0 / .4); }
.kask-sheet { position: relative; width: 100%; max-width: 480px; max-height: 85vh; overflow-y: auto; border-radius: 18px 18px 0 0; background: var(--surface, #fff); color: var(--ink, #222); padding: 1.1em 1.1em max(1.1em, env(safe-area-inset-bottom)); box-shadow: 0 -6px 24px rgb(0 0 0 / .18); font-family: inherit; }
.kask-msg { margin: 0; line-height: 1.6; white-space: pre-line; word-break: keep-all; overflow-wrap: anywhere; }
.kask-in { display: block; width: 100%; margin-top: .8em; min-height: 44px; padding: .5em .75em; border-radius: 10px; border: 1px solid var(--line-strong, #aaa); background: var(--surface, #fff); color: var(--ink, #222); font: inherit; }
.kask-btns { display: flex; flex-direction: column; gap: 10px; margin-top: 1em; }
.kask-b { font: inherit; font-weight: 600; min-height: 48px; padding: .55em 1em; border-radius: 12px; border: 1.5px solid var(--accent, #2B6A62); background: var(--accent, #2B6A62); color: var(--on-accent, #fff); cursor: pointer; }
.kask-b.no { background: transparent; color: var(--accent, #2B6A62); }
.kask-b.danger { background: var(--warn, var(--warm, #9A5A14)); border-color: var(--warn, var(--warm, #9A5A14)); color: var(--on-accent, #fff); }
.kask-b:focus-visible, .kask-in:focus-visible { outline: 3px solid var(--accent, #2B6A62); outline-offset: 2px; }
@media (min-width: 640px) { .kask { align-items: center; } .kask-sheet { border-radius: 18px; } }`;
  let styled = false, open = null;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  // 글의 끝맺음으로 확인 단추 이름을 정한다
  const LABELS = [[/지울까요|지워요|지워져요/, '지우기', true], [/되돌릴까요/, '되돌리기', true], [/끝맺을까요/, '끝맺기', true], [/나갈까요/, '나가기', true], [/내보낼까요/, '내보내기', true], [/해제할까요/, '해제하기', true], [/뺄까요/, '빼기', true], [/마칠까요/, '마치기', false], [/닫을까요/, '닫기', true], [/로그아웃/, '로그아웃', false], [/취소할까요/, '취소하기', true], [/거절할까요/, '거절하기', true]];
  const labelOf = msg => { for (const [re, l, d] of LABELS) if (re.test(msg)) return { ok: l, danger: d }; return { ok: '확인', danger: false }; };
  function ask(msg, o, withInput) {
    return new Promise(resolve => {
      if (open) open(false);   // 이미 떠 있으면 앞의 것은 취소로 닫는다
      if (!styled) { styled = true; const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); }
      o = o || {};
      const lab = labelOf(String(msg)), back = document.activeElement;
      const danger = o.danger === undefined ? lab.danger : o.danger;
      const root = document.createElement('div');
      root.className = 'kask'; root.setAttribute('role', 'alertdialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'kaskMsg');
      root.innerHTML = `<div class="kask-scrim"></div><div class="kask-sheet"><p class="kask-msg" id="kaskMsg">${esc(msg)}</p>${withInput ? `<input class="kask-in" type="text" value="${esc(o.value || '')}" aria-labelledby="kaskMsg" autocomplete="off">` : ''}<div class="kask-btns"><button class="kask-b${danger ? ' danger' : ''}" type="button" data-k="ok">${esc(o.ok || lab.ok)}</button><button class="kask-b no" type="button" data-k="no">${esc(o.cancel || '취소')}</button></div></div>`;
      const input = root.querySelector('.kask-in');
      const done = ok => {
        if (open !== done) return;
        open = null; document.removeEventListener('keydown', key, true);
        const v = input ? input.value : '';
        root.remove(); try { if (back && back.focus) back.focus(); } catch (e) { /* 무시 */ }
        resolve(withInput ? (ok ? v : null) : ok);
      };
      const key = e => {
        if (e.key === 'Escape') { e.preventDefault(); done(false); }
        else if (e.key === 'Enter' && input && document.activeElement === input) { e.preventDefault(); done(true); }
      };
      root.addEventListener('click', e => {
        const k = e.target.closest('[data-k]');
        if (k) done(k.dataset.k === 'ok'); else if (e.target.classList.contains('kask-scrim')) done(false);
      });
      open = done; document.addEventListener('keydown', key, true);
      document.body.appendChild(root);
      (input || root.querySelector('[data-k="no"]')).focus();   // 처음 포커스는 안전한 쪽(취소) 또는 글칸
    });
  }
  window.KoideAsk = { ok: (msg, o) => ask(msg, o, false), text: (msg, value) => ask(msg, { value, ok: '확인' }, true) };
})();
