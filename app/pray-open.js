// 기도를 열며(기도하기 첫 장): 공동체 기도하기, 기도 노트 기도하기, 모임 모드가 함께 쓴다. 모양은 pray-open.css, 문구는 pray-data.js
//  세 줄이 1초쯤 간격으로 하나씩 나타나고, 다 나오면 매듭이 지어진다. 아래에 날마다 바뀌는 작은 글 한 줄
//  약 6초 뒤 저절로 첫 장으로 넘어간다(움직임 줄이기는 3초). 넘어가는 일은 앱이 정한다: begin(onDone)으로 맡기면 때가 됐을 때 부른다
//  화면을 다시 그려도 움직임이 처음부터 다시 돌지 않게, 지난 시간을 재서 그만큼 앞선 자리부터 보여 준다
window.KoidePrayOpen = (() => {
  const KOIDE = () => window.KOIDE_PRAY;
  let timer = 0, t0 = 0;
  const calm = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  // 시작: 시간을 재기 시작한다. 이미 돌고 있으면 처음부터 다시
  function begin(onDone) {
    stop(); t0 = Date.now();
    timer = setTimeout(() => { timer = 0; onDone(); }, calm() ? 3000 : 6000);
  }
  // 멈춤: 끝내기·닫기·누르기·넘어감에서 꼭 부른다(닫은 뒤에 화면이 바뀌지 않게)
  function stop() { clearTimeout(timer); timer = 0; }
  // 화면 속(매듭 · 세 줄 · 작은 글). 매듭 꼴은 시작 화면(splash.js)과 같다. 누르면 넘어가는 자리는 앱이 감싼다
  function html() {
    const K = KOIDE(), note = K.openNote(), back = -(Date.now() - t0) / 1000;
    return `<div class="po" style="--po-el:${back.toFixed(2)}s">
      <span class="po-mark" aria-hidden="true"><svg viewBox="0 0 16 12"><path class="cord" d="M.5 8.5H15.5"/><path class="k1" pathLength="1" d="M.5 8.5h3.8c1.2 0 1.7-1.5 1.7-2.8C6 3.7 7.3 2.5 9 2.5s3 1.2 3 3.1-1.8 3.1-4 3.3"/><path class="k2" pathLength="1" d="M5.6 10.1C7.6 9 9.6 8.5 15.5 8.5"/></svg></span>
      <p class="eyebrow">기도를 열며</p>
      <div class="po-lines">${K.OPENING.map((x, i) => `<p style="--d:${(0.4 + i).toFixed(1)}s">${esc(x)}</p>`).join('')}</div>
      <p class="po-note">${esc(note[0])}<small>${esc(note[1])}</small></p></div>`;
  }
  return { begin, stop, html };
})();
