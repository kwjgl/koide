// 코이데 소개 영상: 앱 안에서 재생하는 1분 20초 남짓의 움직이는 소개. 영상 파일 없이 앱의 그림(매듭, 기도의 끈, 이달의 그림)으로 장면을 만든다.
//  화면 전체를 다시 그려도 끊기지 않게 body에 따로 붙인 판에서 스스로 돈다. 글자 자막이 늘 나오고 소리는 없다(예배당·모임에서도 틀 수 있게).
//  누르면 멈춤, 옆 버튼으로 장면 넘기기, 마지막 장면에서 멈춘다. 움직임 줄이기를 켠 기기에서는 장면마다 다 된 모습으로 바로 보인다
//  공동체 화면(더보기 › 코이데 소개, 로그인 전 첫 화면)과 기도 노트(더보기)가 함께 쓴다. 모양은 intro-video.css
//  장은 셋: 코이데(이름) · 함께(공동체) · 나(기도 노트). 위쪽 진행 막대를 장마다 묶고, 장 이름을 누르면 그 장으로 건너뛴다
//  open({ grp, one, mine, solo, art, start, cta, onCta, onEvent }): start: 'me'면 '나' 장부터. art가 없으면 이달의 그림 장면은 빠진다
window.KoideIntroVideo = (() => {
  let el = null, SC = [], CH = [], i = 0, left = 0, t0 = 0, timer = null, raf = 0, playing = false, opener = null, O = {};
  const $q = s => el.querySelector(s);
  const ico = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const I = { play: ico('<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>'), pause: ico('<path d="M8 5h3v14H8zM13 5h3v14h-3z" fill="currentColor"/>'),
    prev: ico('<path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
    next: ico('<path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
    x: ico('<path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>') };
  const d = s => `style="--d:${s}s"`;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const CHAPTERS = [['start', '코이데'], ['together', '함께'], ['me', '나']];
  // 매듭(묶인 모양): 이번 달 기도의 끈의 매듭과 같은 꼴. 바깥 g가 자리(transform 속성), 안쪽 g가 움직임(CSS)을 맡아 서로 덮지 않게 한다. s가 없으면 처음부터 묶여 있다
  const KNOT = (x, y, s) => `<g transform="translate(${x - 16} ${y - 16})"><g class="iv-knot${s == null ? '' : ' iv-pop'}" ${s == null ? '' : d(s)}><circle cx="16" cy="16" r="15" class="iv-kbg"/><path d="M2 16H8.5C11 16 12 13 12 10.5C12 6.5 14.5 4 18 4S24 6.5 24 10.2 21 16 16.5 16.4"/><path d="M11 19.2C15 17 19 16 30 16"/></g></g>`;
  // 끈: 처진 줄과 팽팽한 줄을 겹쳐 두고, 이웃한 두 매듭이 다 지어지면 팽팽한 줄로 바뀐다(모든 브라우저에서 되도록 모양 대신 투명도를 바꾼다)
  //  homes: 매듭 자리 위에 집(또는 사람), names: 매듭 자리 아래 이름표(기도 노트의 내가 기도하는 사람들)
  function cord({ tie = [], all = false, homes = false, nums = null, names = null } = {}) {
    const N = 6, W = 340, Y = homes ? 92 : 40, x = k => 24 + k * (W - 48) / (N - 1), at = k => all ? 0 : tie[k];
    let s = '';
    for (let k = 0; k < N - 1; k++) {
      const x1 = x(k), x2 = x(k + 1), a = at(k), b = at(k + 1), both = a != null && b != null ? Math.max(a, b) + .5 : null;
      s += `<path class="iv-seg loose${all ? ' gone' : ''}" ${both != null && !all ? `style="--d:${both}s"` : ''} d="M${x1} ${Y}Q${(x1 + x2) / 2} ${Y + 30} ${x2} ${Y}"/>`;
      if (both != null) s += `<path class="iv-seg taut${all ? ' on' : ''}" ${all ? '' : `style="--d:${both}s"`} d="M${x1} ${Y}H${x2}"/>`;
    }
    for (let k = 0; k < N; k++) {
      if (homes) s += `<g transform="translate(${x(k) - 15} ${Y - 62})"><g class="iv-home iv-in" ${d(.3 + k * .35)}>${O.solo ? '<circle cx="15" cy="10" r="7"/><path d="M3 34c0-8 5-13 12-13s12 5 12 13z"/>' : '<path d="M2 15L15 3l13 12M6 12v20h18V12"/><path d="M12 32v-8h6v8"/>'}</g></g>`;
      s += `<circle class="iv-slot${homes ? ' iv-in' : ''}" ${homes ? d(.4 + k * .35) : ''} cx="${x(k)}" cy="${Y}" r="9"/>`;
      if (at(k) != null) s += KNOT(x(k), Y, all ? null : at(k));
      if (nums && nums[k]) s += `<g class="iv-num" ${d(.4 + k * .25)}><rect x="${x(k) - 20}" y="${Y - 50}" width="40" height="24" rx="12"/><text x="${x(k)}" y="${Y - 33}" text-anchor="middle">${nums[k]}번</text></g>`;
      if (names) s += `<text class="iv-name iv-in" ${d(.2 + k * .2)} x="${x(k)}" y="${Y + 44}" text-anchor="middle">${esc(names[k])}</text>`;
    }
    return `<svg class="iv-cord" viewBox="0 0 ${W} ${Y + (names ? 56 : 44)}" aria-hidden="true">${s}</svg>`;
  }
  const PHONE = (inner, cls = '') => `<div class="iv-phone ${cls}">${inner}</div>`;
  const LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>';
  const CHECK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>';
  function scenes() {
    const g = O.grp || '사랑방', one = O.one || '가정', mine = O.mine || '우리 가정', homeName = esc(g);
    const L = [
      { ch: 'start', dur: 5000, cap: '코이데, 함께 기도하는 공동체',
        html: `<span class="iv-mark iv-pop" ${d(.1)}><svg viewBox="0 0 32 32" aria-hidden="true"><path class="iv-draw" d="M2 16H8.5C11 16 12 13 12 10.5C12 6.5 14.5 4 18 4S24 6.5 24 10.2 21 16 16.5 16.4"/><path class="iv-draw" style="animation-delay:.9s" d="M11 19.2C15 17 19 16 30 16"/></svg></span>
          <h2 class="iv-title iv-in" ${d(1.4)}>코이데</h2><p class="iv-sub iv-in" ${d(1.9)}>함께 기도하는 공동체</p>` },
      { ch: 'start', dur: 6000, cap: "'교제'와 '간구'에서 온 이름이에요. 함께 기도하고 간구해요.",
        html: `<div class="iv-words"><span class="iv-w iv-from-l" ${d(.3)}><b>코이노니아</b><i>κοινωνία</i><small>교제</small></span><em class="iv-in" ${d(1.2)}>+</em><span class="iv-w iv-from-r" ${d(.9)}><b>데에시스</b><i>δέησις</i><small>간구</small></span></div>
          <p class="iv-big iv-in" ${d(2.6)}><b>코이</b>노니아 + <b>데</b>에시스</p><p class="iv-sub iv-in" ${d(3.6)}>함께 기도하고 간구해요</p>` },
      { ch: 'together', dur: 6000, cap: `우리 ${g} ${one}마다 기도의 끈에 매듭 자리가 있어요.`,
        html: cord({ homes: true }) },
      { ch: 'together', dur: 7000, cap: `기도하면 매듭이 지어지고, 이웃한 두 ${one}을 다 기도하면 끈이 팽팽해져요.`,
        html: cord({ tie: [.5, 1.3, 3.6, 2.1, 2.9, 4.6] }) },
      { ch: 'together', dur: 6000, cap: '누가 몇 번 기도했는지는 보이지 않아요. 끈이 이어진 모습만 보여요.',
        html: cord({ all: true, nums: [3, 1, 5, 2, 4, 1] }) + `<p class="iv-chip iv-in" ${d(3.2)}>끈이 이어진 모습만</p>` },
      { ch: 'together', dur: 7000, cap: `한 장씩 넘기며 우리 ${g}, ${mine}, 섬기는 분들, 하나님 나라를 위해 기도해요.`,
        html: `<div class="iv-kinds">${[`우리 ${homeName}`, esc(mine), '섬기는 분들', '하나님 나라'].map((t, k) => `<span class="iv-card iv-pop" ${d(.3 + k * .6)}><small>${k + 1}</small>${t}</span>`).join('')}</div>
          <p class="iv-sub iv-in" ${d(4)}>주기도문의 간구를 따라, 감사와 찬양으로 끝나요</p>` }
    ];
    if (O.art && O.art.length) L.push({ ch: 'together', dur: 6000, cap: '기도한 날마다 이달의 그림이 채워져요.',
      html: `<div class="iv-art">${O.art.map((a, k) => `<div class="iv-layer${k ? ' iv-show' : ''}" ${k ? d(.6 + k * 1.2) : ''}>${a}</div>`).join('')}</div>` });
    L.push(
      { ch: 'me', dur: 7000, cap: '나만 보는 기도 노트도 있어요. 이 휴대폰에만 저장돼서 아무도 볼 수 없어요.',
        html: PHONE(`<p class="iv-ph-h">나의 기도 노트</p>${['', '', ''].map((_, k) => `<span class="iv-line iv-in" ${d(.5 + k * .35)}></span>`).join('')}<span class="iv-lock iv-pop" ${d(2.2)}>${LOCK}</span>`, 'iv-pop') +
          `<p class="iv-chip iv-in" ${d(3.2)}>이 휴대폰에만</p>` },
      { ch: 'me', dur: 7000, cap: '날마다 기도제목 세 개. 오래 기도하지 않은 것부터 나와요.',
        html: `<div class="iv-today"><p class="iv-sub iv-in" ${d(.2)}>오늘의 기도</p>${[['엄마', '건강을 회복하도록'], ['나', '새 일터에서 지혜를'], ['교회', '다음 세대를 위해']].map(([w, t], k) =>
          `<div class="iv-item iv-in" ${d(.5 + k * .4)}><span><small>${w}</small>${t}</span><b class="iv-done iv-pop" ${d(2.6 + k * 1)}>${CHECK}기도했어요</b></div>`).join('')}</div>` },
      { ch: 'me', dur: 8000, cap: '응답받으면 "응답받았어요". 기도가 감사의 기록이 돼요.',
        html: `<div class="iv-today"><div class="iv-item iv-in iv-away" ${d(.3)}><span><small>엄마</small>건강을 회복하도록</span><b class="iv-ans iv-press" ${d(1.6)}>응답받았어요</b></div>
          <div class="iv-thanks iv-in" ${d(2.9)}><p class="iv-th-h">감사와 응답</p><p class="iv-th iv-in" ${d(3.5)}><span class="iv-heart">♥</span>엄마가 다시 일어나셨어요</p></div></div>` },
      { ch: 'me', dur: 7000, cap: '내가 기도하는 사람들도 끈으로 이어져요.',
        html: cord({ tie: [.6, 1.4, 2.2, 3, 3.8, 4.6], names: ['나', '엄마', '아빠', '지우', '친구', '교회'] }) },
      { ch: 'me', dur: 6000, cap: `나누고 싶은 기도는 ${g}에 나누고, 다른 기기에서도 동기화할 수 있어요.`,
        html: `<div class="iv-flow"><span class="iv-box iv-in" ${d(.3)}>내 기도 노트</span><span class="iv-arrow iv-in" ${d(.9)}>→</span><span class="iv-box hl iv-in" ${d(1.3)}>우리 ${homeName}</span></div>
          <div class="iv-flow"><span class="iv-dev iv-in" ${d(2.4)}>휴대폰</span><span class="iv-sync iv-pop" ${d(3)}>${LOCK}</span><span class="iv-dev iv-in" ${d(2.7)}>PC</span></div>` },
      { ch: 'me', dur: 6000, end: true, cap: '우리를 잇는 끈은 성령의 교통하심(코이노니아)입니다.',
        html: cord({ all: true }) + `<p class="iv-big iv-in" ${d(.6)}>우리를 잇는 끈은<br>성령의 교통하심입니다</p><p class="iv-sub iv-in" ${d(1.4)}>고린도후서 13:13</p>
          <div class="iv-end iv-in" ${d(2.4)}><button class="btn ghost" data-iv="replay">다시 보기</button>${O.cta ? `<button class="btn" data-iv="cta">${esc(O.cta)}</button>` : ''}</div>` });
    return L;
  }
  // 진행 막대: 장마다 묶음 하나(장 이름 + 장면마다 한 칸). 막대 칸의 순서는 장면 순서와 같다
  const bars = () => el.querySelectorAll('.iv-bars b');
  function paintBars() {
    bars().forEach((b, k) => { b.style.width = k < i ? '100%' : k > i ? '0%' : b.style.width; });
    el.querySelectorAll('.iv-ch').forEach(c => { const on = c.dataset.v === SC[i].ch; c.classList.toggle('on', on); c.setAttribute('aria-current', on ? 'step' : 'false'); });
  }
  function tick() {
    cancelAnimationFrame(raf);
    if (!el) return;
    const used = SC[i].dur - left + (playing ? performance.now() - t0 : 0);
    bars()[i].style.width = Math.min(100, used / SC[i].dur * 100) + '%';
    if (playing) raf = requestAnimationFrame(tick);
  }
  function show(k) {
    i = Math.max(0, Math.min(SC.length - 1, k)); left = SC[i].dur;
    const st = $q('.iv-sc');
    st.innerHTML = SC[i].html; st.className = 'iv-sc' + (SC[i].end ? ' last' : '');
    $q('.iv-cap').textContent = SC[i].cap;
    $q('[data-iv=prev]').disabled = i === 0;
    $q('[data-iv=next]').disabled = i === SC.length - 1;
    bars()[i].style.width = '0%'; paintBars();
    el.classList.toggle('paused', !playing);
    if (playing) arm(); else tick();
  }
  function arm() { clearTimeout(timer); t0 = performance.now(); timer = setTimeout(() => { if (i < SC.length - 1) show(i + 1); else stop(true); }, left); tick(); }
  function btn() { const b = $q('[data-iv=toggle]'); b.innerHTML = playing ? I.pause : I.play; b.setAttribute('aria-label', playing ? '멈추기' : '재생'); el.classList.toggle('paused', !playing); }
  function stop(end) { if (!playing) return; playing = false; clearTimeout(timer); left = end ? 0 : Math.max(0, left - (performance.now() - t0)); tick(); btn(); }
  function play() { if (playing) return; if (i === SC.length - 1 && left <= 0) { playing = true; btn(); return show(0); } playing = true; btn(); arm(); }
  function close() {
    if (!el) return;
    clearTimeout(timer); cancelAnimationFrame(raf); playing = false;
    document.removeEventListener('keydown', onKey, true); document.removeEventListener('visibilitychange', onHide);
    el.remove(); el = null; document.documentElement.classList.remove('iv-open');
    if (O.onEvent) O.onEvent('close', i + 1, SC.length);
    if (opener && opener.isConnected) opener.focus();
  }
  function onKey(e) {
    if (!el) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === ' ' && !(e.target.closest && e.target.closest('button'))) { e.preventDefault(); playing ? stop() : play(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); show(i + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); show(i - 1); }
    else if (e.key === 'Tab') { const f = [...el.querySelectorAll('button:not([disabled])')]; if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); } }
  }
  const onHide = () => { if (document.hidden) stop(); };
  function open(opts) {
    if (el) close();
    O = opts || {}; SC = scenes(); opener = document.activeElement; playing = true;
    CH = CHAPTERS.map(([k, label]) => ({ k, label, n: SC.filter(s => s.ch === k).length, first: SC.findIndex(s => s.ch === k) })).filter(c => c.n);
    el = document.createElement('div');
    el.className = 'ivid'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', '코이데 소개 영상');
    el.innerHTML = `<div class="iv-top"><div class="iv-chs">${CH.map(c => `<button class="iv-ch" style="flex:${c.n}" data-iv="ch" data-v="${c.k}" aria-label="${c.label} 장으로"><span class="iv-ch-l">${c.label}</span><span class="iv-bars" aria-hidden="true">${'<i><b></b></i>'.repeat(c.n)}</span></button>`).join('')}</div>
        <button class="iv-btn sm" data-iv="x" aria-label="닫기">${I.x}</button></div>
      <div class="iv-stage" data-iv="stage"><div class="iv-sc"></div></div>
      <p class="iv-cap" aria-live="polite"></p>
      <div class="iv-ctl"><button class="iv-btn" data-iv="prev" aria-label="이전 장면">${I.prev}</button>
        <button class="iv-btn main" data-iv="toggle" aria-label="멈추기">${I.pause}</button>
        <button class="iv-btn" data-iv="next" aria-label="다음 장면">${I.next}</button></div>`;
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-iv]'); if (!b) return;
      const a = b.dataset.iv;
      if (a === 'x') close();
      else if (a === 'prev') show(i - 1);
      else if (a === 'next') show(i + 1);
      else if (a === 'ch') { const c = CH.find(x => x.k === b.dataset.v); if (c) show(c.first); $q('[data-iv=toggle]').focus(); }
      else if (a === 'toggle' || a === 'stage') playing ? stop() : play();
      else if (a === 'replay') { playing = true; btn(); show(0); }
      else if (a === 'cta') { close(); if (O.onCta) O.onCta(); }
    });
    document.body.appendChild(el); document.documentElement.classList.add('iv-open');
    document.addEventListener('keydown', onKey, true); document.addEventListener('visibilitychange', onHide);
    const from = O.start ? CH.find(c => c.k === O.start) : null;
    show(from ? from.first : 0); btn(); $q('[data-iv=toggle]').focus();
    if (O.onEvent) O.onEvent('open', i + 1, SC.length);
  }
  return { open, close };
})();
