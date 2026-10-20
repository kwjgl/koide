// '함께하는 곳' 메뉴(공동체 index.html과 기도 노트 note.html이 함께 쓴다). 위쪽 배지를 누르면 열리는 목록을 한 곳에서 그려서 어디서 열어도 같다.
//  순서: 나의 기도 노트 → 교회 사랑방 → 내 모임들 → 구분선 → + 모임 만들기 / 우리 교회 공동체에 연결하기
//  자율 모임은 기도 노트 소속(만들기·관리는 노트 › 더보기 › 내 모임)이고, 이 메뉴는 거기로 가는 길만 보여 준다. 화면마다 다른 것은 누르면 하는 일뿐이라 attr로 받는다.
(() => {
  const MAX = 3; // 한 사람이 함께할 수 있는 곳(교회 소그룹 포함)
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // 모임을 더 만들 수 있는지: 세 곳 안이고, 이미 모임장인 모임이 없을 때
  const canMake = (linked, groups) => (linked ? 1 : 0) + groups.length < MAX && !groups.some(g => g.role === '모임장');
  // o.cur: 지금 보는 곳('note' | 'room' | 모임ID) · o.room: { name, group }(교회 사랑방에 연결됐을 때만) · o.groups: [{ id, name, role, wait, asks }]
  // o.make: 모임 만들기를 보일지 · o.linked: 공동체에 연결돼 있는지 · o.demo: 데모 주소인지
  // o.attr(kind, id): 누르면 하는 일. 'href="…"'로 시작하면 링크, 아니면 버튼의 속성. kind는 note | room | group | make
  function html(o) {
    const G = o.groups || [], item = (kind, id, name, sub) => {
      const on = kind === 'group' ? o.cur === id : o.cur === kind, a = o.attr(kind, id), tag = /^\s*href=/.test(a) ? 'a' : 'button';
      return on ? `<div class="mitem on" role="menuitem" aria-current="page"><span>${esc(name)}</span><small>${sub}</small></div>`
        : `<${tag} class="mitem" role="menuitem" ${a}><span>${esc(name)}</span><small>${sub}</small></${tag}>`;
    };
    const here = '지금 보는 곳';
    return `<p class="mlabel">함께하는 곳</p>
        ${item('note', '', '나의 기도 노트', o.cur === 'note' ? here : '나만 봐요 · 이 휴대폰에만')}
        ${o.room ? item('room', '', o.room.name, o.cur === 'room' ? here : '교회 ' + esc(o.room.group || '소그룹')) : ''}
        ${G.map(g => g.wait ? `<div class="mitem" role="menuitem" aria-disabled="true"><span>${esc(g.name)}</span><small>승인을 기다려요</small></div>`
          : item('group', g.id, g.name, [o.cur === g.id ? here : '모임', g.role === '모임장' ? '모임장' : '', g.asks ? '신청 ' + g.asks : ''].filter(Boolean).join(' · '))).join('')}
        ${o.make || !o.linked ? '<div class="mdiv"></div>' : ''}
        ${o.make ? `<button class="mitem" role="menuitem" ${o.attr('make', '')}><span>+ 모임 만들기</span></button>` : ''}
        ${o.linked ? '' : `<a class="mitem" role="menuitem" href="index.html${o.demo ? '?demo&connect' : '?connect'}"><span>우리 교회 공동체에 연결하기</span><small>사랑방과 함께 기도해요</small></a>`}`;
  }
  window.koidePlaces = { MAX, canMake, html };
})();
