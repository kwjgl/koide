// '함께하는 곳' 공통 메뉴. 노트 → 교회 → 코이데 공동체 → 예전 모임 → 새 공동체 만들기 / 교회 들어가기.
(() => {
  const MAX = 3; // 코이데 공동체만 센다. 교회와 예전 모임은 따로
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // 남은 날 표시: 끝나는 날 당일은 D-day
  const dday = g => g.left == null ? '' : g.left <= 0 ? 'D-day' : 'D-' + g.left;
  // 끝나거나 닫힌 공동체는 자리를 차지하지 않는다.
  const canMake = (_linked, circles = []) => circles.filter(c => !['끝남','끝맺음','닫음'].includes(c.state)).length < MAX;
  // o.cur: 지금 보는 곳('note' | 'room' | 모임ID) · o.room: { name, group }(교회 사랑방에 연결됐을 때만) · o.groups: [{ id, name, role, wait, asks }]
  // o.circles: 코이데 공동체 · o.circleMake: 새 공동체 만들기 보일지 · o.linked: 공동체에 연결돼 있는지 · o.demo: 데모 주소인지
  // o.attr(kind, id): 누르면 하는 일. 'href="…"'로 시작하면 링크, 아니면 버튼의 속성. kind는 note | room | circle | group | circleMake
  function html(o) {
    const G = o.groups || [], C = o.circles || [], item = (kind, id, name, sub) => {
      const on = kind === 'group' || kind === 'circle' ? o.cur === id : o.cur === kind, a = o.attr(kind, id), tag = /^\s*href=/.test(a) ? 'a' : 'button';
      return on ? `<div class="mitem on" role="menuitem" aria-current="page"><span>${esc(name)}</span><small>${sub}</small></div>`
        : `<${tag} class="mitem" role="menuitem" ${a}><span>${esc(name)}</span><small>${sub}</small></${tag}>`;
    };
    const here = '지금 보는 곳';
    return `<p class="mlabel">함께하는 곳</p>
        ${item('note', '', '코이데 노트', o.cur === 'note' ? here : '나만 봐요 · 이 휴대폰에만')}
        ${o.room ? item('room', '', '코이데 교회', o.cur === 'room' ? here : esc(o.room.name)) : ''}
        ${C.map(c => c.status === '요청' ? `<div class="mitem" role="menuitem" aria-disabled="true"><span>${esc(c.name)}</span><small>승인을 기다려요</small></div>`
          : c.state === '닫음' ? `<div class="mitem" role="menuitem" aria-disabled="true"><span>${esc(c.name)}</span><small>닫힌 공동체예요</small></div>`
          : item('circle', c.id, c.name, [o.cur === c.id ? here : '공동체', ['끝남', '끝맺음'].includes(c.state) ? '끝난 공동체' : dday(c.left == null && c.endsOn ? {left:Math.round((Date.parse(c.endsOn.slice(0,10)+'T00:00:00Z')-Date.parse(new Date().toISOString().slice(0,10)+'T00:00:00Z'))/864e5)} : c), c.role === '모임장' ? '모임장' : '', c.asks ? '신청 '+c.asks : ''].filter(Boolean).join(', '))).join('')}
        ${G.map(g => g.wait ? `<div class="mitem" role="menuitem" aria-disabled="true"><span>${esc(g.name)}</span><small>승인을 기다려요</small></div>`
          : item('group', g.id, g.name, [o.cur === g.id ? here : '예전 모임', dday(g), g.role === '모임장' ? '모임장' : '', g.asks ? '신청 ' + g.asks : ''].filter(Boolean).join(' · '))).join('')}
        ${o.circleMake || !o.linked ? '<div class="mdiv"></div>' : ''}
        ${o.circleMake ? `<a class="mitem" role="menuitem" ${o.attr('circleMake', '')}><span>+ 공동체 만들기</span></a>` : ''}
        ${o.linked ? '' : `<a class="mitem" role="menuitem" href="index.html${o.demo ? '?demo&connect' : '?connect'}"><span>코이데 교회 들어가기</span><small>교회 코드가 있으면 우리 교회와 함께 기도해요</small></a>`}`;
  }
  window.koidePlaces = { MAX, canMake, html, dday };
})();
