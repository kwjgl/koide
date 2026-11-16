/*
 * 제목 옆 ⓘ 안내 말풍선(공동체 앱 · 기도 노트 · 코이데 공동체가 함께 쓴다). 스타일은 design-styles.css의 "ⓘ 안내" 구역.
 *  KoideTip.btn(글, 제목) → ⓘ 단추 HTML. 글은 그냥 글로 넘기면 여기서 막아 준다(링크·단추는 못 넣는다). 제목은 접근성 이름("제목 설명 보기")에 쓴다.
 *  누르면 열고 다시 누르면 닫는다(마우스 올리기는 쓰지 않는다: 휴대폰에는 없어서). 말풍선은 body에 하나뿐이라 다른 ⓘ를 누르면 옮겨 간다.
 *  바깥을 누르거나 Esc, 스크롤·화면 회전·크기 바뀜, 다른 곳으로 포커스가 가면 닫는다. 화면을 다시 그릴 때는 부르는 쪽이 KoideTip.close()를 먼저 부른다.
 */
(() => {
  const SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10.2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="7.5" r="1.3" fill="currentColor"/><path d="M12 11v6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const GAP = 8, EDGE = 16;   // 단추와의 간격 · 화면 가장자리에서 안쪽 여백
  let tip = null, cur = null, seq = 0;

  function btn(text, label) {
    return '<button type="button" class="info-i" aria-expanded="false" aria-label="' + esc((label ? label + ' ' : '') + '설명 보기') + '" data-info="' + esc(text) + '">' + SVG + '</button>';
  }

  // 위 막대와 아래 탭 막대를 뺀, 말풍선이 앉을 수 있는 세로 범위
  function bounds() {
    let top = 0, bot = innerHeight;
    const bar = document.querySelector('.topbar, header.top, .top-bar');
    if (bar) { const r = bar.getBoundingClientRect(); if (r.height && r.top <= 1 && r.bottom < innerHeight / 2) top = r.bottom; }
    const tabs = document.querySelector('.tabs');
    if (tabs) { const r = tabs.getBoundingClientRect(); if (r.height && r.top > innerHeight / 2 && r.top < bot) bot = r.top; }
    return [top + 4, bot - 4];
  }

  function place() {
    if (!tip || !cur) return;
    const b = cur.getBoundingClientRect(), w = Math.min(280, innerWidth - EDGE * 2);
    tip.style.width = w + 'px'; tip.style.maxHeight = ''; tip.classList.remove('scroll'); tip.style.left = '0px'; tip.style.top = '0px';
    const h = tip.offsetHeight, [lo, hi] = bounds(), below = hi - b.bottom - GAP, above = b.top - lo - GAP;
    let up = below < h && above > below;                       // 아래가 모자라고 위가 더 넓으면 뒤집는다
    const room = up ? above : below;
    if (h > room) { tip.style.maxHeight = Math.max(80, room) + 'px'; tip.classList.add('scroll'); }   // 둘 다 모자라면 더 넓은 쪽에 두고 안을 스크롤
    const hh = tip.offsetHeight, cx = b.left + b.width / 2;
    const left = Math.min(Math.max(cx - w / 2, EDGE), innerWidth - EDGE - w);
    tip.style.left = Math.round(left) + 'px';
    tip.style.top = Math.round(up ? b.top - GAP - hh : b.bottom + GAP) + 'px';
    tip.dataset.side = up ? 'up' : 'down';
    tip.style.setProperty('--tip-x', Math.round(Math.min(Math.max(cx - left, 16), w - 16)) + 'px');   // 꼬리는 ⓘ 가운데를 가리킨다
  }

  function close(back) {
    if (cur) { cur.setAttribute('aria-expanded', 'false'); cur.removeAttribute('aria-describedby'); if (back && cur.isConnected) cur.focus(); }
    cur = null;
    if (tip) tip.hidden = true;
  }

  function open(b) {
    if (!tip) {
      tip = document.createElement('div'); tip.className = 'info-tip'; tip.setAttribute('role', 'tooltip'); tip.hidden = true;
      document.body.appendChild(tip);
    }
    if (cur && cur !== b) { cur.setAttribute('aria-expanded', 'false'); cur.removeAttribute('aria-describedby'); }
    cur = b; tip.id = 'info-tip-' + (++seq); tip.textContent = b.getAttribute('data-info') || '';
    b.setAttribute('aria-expanded', 'true'); b.setAttribute('aria-describedby', tip.id);
    tip.hidden = false; tip.classList.remove('on'); place();
    requestAnimationFrame(() => tip && tip.classList.add('on'));
  }

  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('.info-i');
    if (b) { e.preventDefault(); e.stopPropagation(); return cur === b ? close() : open(b); }
    if (cur && !(tip && tip.contains(e.target))) close();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && cur) { e.stopPropagation(); close(true); } }, true);
  document.addEventListener('focusin', e => { if (cur && e.target !== cur && !(tip && tip.contains(e.target))) close(); });
  // 말풍선 안을 스크롤하는 것은 닫지 않는다(말풍선이 길어 안을 스크롤할 때)
  addEventListener('scroll', e => { if (cur && !(tip && e.target instanceof Node && tip.contains(e.target))) close(); }, { capture: true, passive: true });
  addEventListener('resize', () => close());
  addEventListener('orientationchange', () => close());

  window.KoideTip = { btn, close: () => close() };
})();
