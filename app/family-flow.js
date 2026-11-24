/*
 * 한 단계씩 넘기는 화면의 공용 부품(2026-11-24, 사용자: 묵상하기의 PC 길잡이와 새 넘김 효과를 비슷한 활동에도). 원본은 gbs shared/family-ui/ 한 곳.
 *  FamilyFlow.swap(el, dir, apply)  나가는 단계는 옆으로 밀리며 흐려지고(apply로 새 단계를 그린 뒤), 새 단계는 옆에서 밀려 들어오며
 *                                   덩어리가 0.055초씩 차례로 떠오른다. dir은 앞으로 1, 뒤로 -1. 움직임 줄이기나 어두운 화면이면 바로 apply만 한다
 *  FamilyFlow.enter(el, dir)        들어오는 움직임만(그릴 때 이미 지운 뒤라면)
 *  FamilyFlow.rail(o)               왼쪽 길잡이 HTML: o.steps = [{ label, state: 'done'|'cur'|'todo', attrs }], o.head = 위에 얹을 HTML(시간 고리 같은 것)
 *  FamilyFlow.railFx(root, from, to) 길잡이에서 지난 선이 채워지고 점이 톡 튄다(다시 그린 뒤 부른다)
 *  FamilyFlow.railTo(root)          길이 긴 길잡이에서 지금 단계가 가운데 오게 안에서만 스크롤한다
 * 스타일은 이 파일이 스스로 넣는다(.fl-로 시작). 색은 앱의 이름표(--surface, --line, --accent, --page, --ink, --ink-2, --on-accent)를 쓴다.
 */
(() => {
  if (window.FamilyFlow) return;
  const css = `
.fl-rail { min-width: 0; }
.fl-rail-in { position: sticky; top: 64px; display: flex; flex-direction: column; gap: 18px; }
.fl-head { padding: 14px 16px; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; }
.fl-steps { list-style: none; margin: 0; padding: 0 4px 0 4px; max-height: calc(100vh - 220px); overflow-y: auto; scrollbar-width: thin; }
.fl-clock { display: flex; align-items: center; gap: 12px; }
.fl-clock .pss-timer { gap: 12px; font-size: 1.375rem; line-height: 1.1; font-variant-numeric: tabular-nums; }
.fl-clock .pss-ring { width: 46px; height: 46px; }
.fl-cl-s { font-size: .75rem; color: var(--ink-2); flex: 1; }
.fl-steps li { position: relative; }
.fl-steps button { position: relative; display: flex; align-items: center; gap: 14px; width: 100%; padding: 9px 8px 9px 0; border: 0; background: none; text-align: left; font: inherit; font-size: .9375rem; color: var(--ink-2); cursor: pointer; }
.fl-steps button:disabled { cursor: default; }
.fl-dot { flex: none; position: relative; z-index: 1; width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--line); background: var(--page, var(--bg)); display: grid; place-items: center; font-size: .6875rem; font-weight: 600; color: var(--ink-2); }
.fl-steps .done .fl-dot { background: var(--accent); border-color: var(--accent); color: var(--on-accent, #fff); }
.fl-steps .cur .fl-dot { border-color: var(--accent); color: var(--accent); transform: scale(1.18); }
.fl-steps .cur button { color: var(--ink); font-weight: 600; }
.fl-steps .done button { color: var(--ink); }
.fl-steps li:not(:last-child)::before, .fl-steps li:not(:last-child)::after { content: ""; position: absolute; left: 10px; top: 31px; bottom: -9px; width: 2px; background: var(--line); }
.fl-steps li:not(:last-child)::after { background: var(--accent); transform: scaleY(0); transform-origin: top; }
.fl-steps li.done:not(:last-child)::after { transform: scaleY(1); }
`;
  const st = document.createElement('style');
  st.setAttribute('data-family-flow', '');
  st.textContent = css;
  document.head.appendChild(st);

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const calm = () => (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) || !!document.querySelector('.dim, [data-dim]');
  let busy = false;

  function enter(el, dir) {
    if (!el || calm()) return;
    el.animate([{ transform: `translateX(${(dir || 1) * 28}px)` }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,.9,.25,1.1)' });
    const kids = el.children.length === 1 && el.children[0].children.length > 1 ? el.children[0].children : el.children;   // 덩어리가 한 겹에 싸여 있으면 그 안의 것들을 차례로
    [...kids].forEach((e, k) => e.animate([{ opacity: 0, transform: 'translateY(14px) scale(.985)' }, { opacity: 1, transform: 'none' }], { duration: 460, delay: 40 + k * 55, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }));
  }

  function swap(el, dir, apply) {
    if (busy) return;
    if (!el || calm()) { apply(); return; }
    busy = true;
    let done = false;
    const go = () => { if (done) return; done = true; busy = false; apply(); enter(document.getElementById(el.id) || el, dir); };
    el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-(dir || 1) * 18}px)` }], { duration: 160, easing: 'ease-in', fill: 'forwards' }).onfinish = go;
    setTimeout(go, 400);   // 끝남 알림이 안 오는 환경 대비
  }

  function rail(o) {
    const li = (o.steps || []).map((s, i) => `<li class="${s.state === 'done' ? 'done' : s.state === 'cur' ? 'cur' : ''}"><button type="button"${s.state === 'todo' ? ' disabled' : ''}${s.state === 'cur' ? ' aria-current="step"' : ''} ${s.attrs || ''}><span class="fl-dot">${s.state === 'done' ? '✓' : i + 1}</span>${esc(s.label)}</button></li>`).join('');
    return `<aside class="fl-rail" aria-label="${esc(o.label || '순서')}"><div class="fl-rail-in">${o.head ? `<div class="fl-head">${o.head}</div>` : ''}<ol class="fl-steps">${li}</ol></div></aside>`;
  }

  function railFx(root, from, to) {
    if (calm()) return;
    const li = [...(root || document).querySelectorAll('.fl-steps li')];
    if (li[from] && to > from) { try { li[from].animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: 500, easing: 'cubic-bezier(.2,.8,.2,1)', pseudoElement: '::after' }); } catch (e) { /* 지원하지 않으면 바로 채워진 채로 */ } }
    const dot = li[to] && li[to].querySelector('.fl-dot');
    if (dot) dot.animate([{ transform: 'scale(.7)' }, { transform: 'scale(1.3)' }, { transform: 'scale(1.18)' }], { duration: 420, easing: 'cubic-bezier(.3,1.4,.5,1)' });
  }

  // 길잡이가 길면 안에서 스크롤하고, 지금 단계가 보이게 맞춘다(페이지는 움직이지 않는다)
  function railTo(root) {
    const box = (root || document).querySelector('.fl-steps'), cur = box && box.querySelector('li.cur');
    if (box && cur) box.scrollTop = Math.max(0, cur.offsetTop - box.clientHeight / 2 + cur.offsetHeight / 2);
  }

  window.FamilyFlow = { swap, enter, rail, railFx, railTo, calm };
})();
