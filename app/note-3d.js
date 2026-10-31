/* 함께 짜는 그물의 입체 그림(weave: 그물 한 장, weaves: 벽에 걸린 보관). 공동체 모임 화면(index.html)과 기도 노트 › 더보기 › 내 모임 › 함께 짠 그물(note.html)이 함께 쓴다.
 * 모임 화면을 열 때, 함께 짠 그물 화면을 처음 열 때만 vendor/three.min.js와 함께 불러온다.
 * 각 그림은 한 번 만들어 두고, 화면을 다시 그릴 때는 그림판(canvas)만 새 자리로 옮긴다(attach). 자료가 바뀌면 부르는 쪽이 새로 만든다 */
window.KOIDE_NOTE3D = (() => {
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ease = t => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);

  // 공통 그림판: 붙일 자리(attach)가 바뀌어도 같은 그림을 이어 쓴다. 밀면 onDrag, 살짝 누르면 onTap(화면 좌표 -1~1)
  //  free()가 참이면 손가락 하나로도 위아래까지 끈다(크게 보기). ortho · pinch · grab은 지금 쓰는 그림이 없다(조각보를 없앤 뒤 남은 선택 인자)
  function stage({ srgb, ortho, onDrag, onTap, frame, grab, free, pinch }) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    if (srgb) renderer.outputEncoding = THREE.sRGBEncoding;
    const el = renderer.domElement; el.style.display = 'block'; el.style.width = '100%'; el.style.height = '100%'; el.style.touchAction = 'pan-y';
    const scene = new THREE.Scene(), camera = ortho ? new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100) : new THREE.PerspectiveCamera(30, 1.6, 0.1, 100);
    const S = { renderer, scene, camera, el, host: null, alive: true, idleAt: 0, draw: () => renderer.render(scene, camera) };
    const ndc = e => { const r = el.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1]; };
    // 그림 저장: 잠깐 크게(가로 1600 안팎) 한 번 그리고 바로 읽은 뒤 원래 크기로 돌린다. hide에 든 것(숫자가 적힌 이름표 등)은 그동안 감춘다
    S.hide = [];
    S.snap = () => {
      const r0 = renderer.getPixelRatio(), w = S.host ? S.host.clientWidth : 400, k = Math.max(r0, Math.min(4, 1600 / Math.max(1, w)));
      S.hide.forEach(o => { o.visible = false; }); renderer.setPixelRatio(k); S.resize();
      renderer.render(scene, camera); const url = el.toDataURL('image/png');
      S.hide.forEach(o => { o.visible = true; }); renderer.setPixelRatio(r0); S.resize(); return url;
    };
    let held = null;
    // 휴대폰에서 스크롤이 걸리지 않게: 손가락은 처음 움직인 방향을 보고 옆으로면 돌리고, 위아래면 손을 떼어 화면이 스크롤되게 둔다
    //  (그림판은 touch-action: pan-y라 위아래 밀기는 브라우저가 스크롤로 가져간다). 마우스는 위아래로 기울이기도 한다
    let drag = null;
    const pts = new Map(); let pin = null;
    const pm = () => { const [a, b] = [...pts.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, r: el.getBoundingClientRect() }; };
    el.addEventListener('pointerdown', e => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pinch.on() && pts.size === 2) { if (held) { held = null; grab.end(); } drag = null; pin = pm(); try { el.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ } e.preventDefault(); return; }
      if (pts.size > 1) return;
      if (grab && grab.on() && grab.start(...ndc(e))) { held = true; drag = null; try { el.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ } e.preventDefault(); return; }
      drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, touch: e.pointerType !== 'mouse', axis: e.pointerType === 'mouse' || (free && free()) ? 'xy' : '' };
    });
    el.addEventListener('pointermove', e => {
      if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pin && pts.size >= 2) { const m = pm(); pinch.move(m.d / pin.d, m.x - pin.x, m.y - pin.y, (m.x - m.r.left) / m.r.width * 2 - 1, -((m.y - m.r.top) / m.r.height) * 2 + 1); pin = m; S.idleAt = performance.now(); return; }
      if (held) { grab.move(...ndc(e)); S.idleAt = performance.now(); S.draw(); return; }
      if (!drag) return;
      if (!drag.axis) {
        const ax = Math.abs(e.clientX - drag.x0), ay = Math.abs(e.clientY - drag.y0);
        if (ax < 6 && ay < 6) return;
        if (ay >= ax) { drag = null; return; }
        drag.axis = 'x'; try { el.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
      }
      onDrag(e.clientX - drag.x, drag.axis === 'xy' ? e.clientY - drag.y : 0); drag.x = e.clientX; drag.y = e.clientY; S.idleAt = performance.now(); S.draw();
    });
    el.addEventListener('pointerup', e => {
      pts.delete(e.pointerId); if (pin) { if (pts.size < 2) pin = null; drag = null; return; }
      if (held) { held = null; grab.end(); S.draw(); return; }
      if (drag && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) { const r = el.getBoundingClientRect(); onTap((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); S.idleAt = performance.now(); }
      drag = null;
    });
    el.addEventListener('pointercancel', e => { pts.delete(e.pointerId); if (pts.size < 2) pin = null; drag = null; if (held) { held = null; grab.end(); } });
    const ro = new ResizeObserver(() => S.resize());
    S.resize = () => { if (!S.host) return; const w = S.host.clientWidth, h = S.host.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; S.fit && S.fit(); camera.updateProjectionMatrix(); S.draw(); };
    S.attach = host => { if (S.host !== host) { ro.disconnect(); S.host = host; host.appendChild(el); ro.observe(host); } S.resize(); };
    let last = 0;
    const loop = now => {
      if (!S.alive) return;
      if (document.contains(el)) { const dt = last ? Math.min((now - last) / 1000, 0.05) : 0; if (frame(dt, now)) S.draw(); }
      last = now; requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    S.dispose = () => { S.alive = false; ro.disconnect(); renderer.dispose(); try { renderer.forceContextLoss(); } catch (err) { /* 무시 */ } el.remove(); };
    return S;
  }
  const light = (scene, ground) => {
    scene.add(new THREE.HemisphereLight(0xffffff, ground, 0.75));
    const k = new THREE.DirectionalLight(0xffffff, 0.85); k.position.set(-3, 6, 7); scene.add(k);
    const r = new THREE.DirectionalLight(0xffffff, 0.3); r.position.set(4, -2, -4); scene.add(r);
  };

  // ── 함께 짜는 그물: 둥근 나무 수틀 가장자리에 말뚝 n개(2~20), 두 사람 사이에 기도가 오가면 말뚝 사이에 금실 한 가닥 ──────────
  //  말뚝은 모두 이름이 없다(누가 어느 말뚝인지 아무도 모른다. 내 말뚝도 표시하지 않는다). 실에는 방향이 없고, 같은 둘 사이에 더 오가면 조금 더 밝아진다.
  //  숫자(실 수 · 퍼센트)는 그림 어디에도 쓰지 않는다. '아직 닿지 않은 사람' 표시도 없다
  //  data: { n, pairs: [[a, b, w]…](a·b는 말뚝 번호 0~n-1, w는 밝기 1~3), name?, from?, to? }
  const hash2 = (a, b) => { const x = Math.sin((Math.min(a, b) * 13 + Math.max(a, b) * 7 + 1) * 12.9898) * 43758.5453; return x - Math.floor(x); };
  const lin = c => new THREE.Color(c).convertSRGBToLinear();
  const isDark = () => css('color-scheme') === 'dark';
  // 실 색 묶음: 모임마다 하나(모임 id로 정해 늘 같다). 밝기 1~3은 같은 색의 어두운 → 밝은 단계, 천은 그 색을 아주 옅게 탄 바탕.
  //  각 단계는 [색, 빛남 정도]. 앱 색 테마(청록·호박·파랑·장미·먹)와 어울리는 여섯 가지
  const WEAVE_PAL = [
    { light: [['#5B8F88', 0], ['#2B8C80', 0.08], ['#14B8A6', 0.3]], dark: [['#4F7D77', 0], ['#5DB5A8', 0.12], ['#7FF0DC', 0.45]], cloth: ['#DDE9E6', '#2A3633'] },
    { light: [['#9A6A78', 0], ['#C0446A', 0.08], ['#F0558A', 0.3]], dark: [['#85606B', 0], ['#D4768F', 0.12], ['#FFA3C0', 0.45]], cloth: ['#EEDFE3', '#3A2C31'] },
    { light: [['#6A7F9E', 0], ['#3A6FC0', 0.08], ['#4C97FF', 0.3]], dark: [['#5D7089', 0], ['#6E9CE0', 0.12], ['#A5CCFF', 0.45]], cloth: ['#DFE6F1', '#2A3340'] },
    { light: [['#85739F', 0], ['#7B52C8', 0.08], ['#A06CFF', 0.3]], dark: [['#756A8D', 0], ['#9A82D8', 0.12], ['#CDB8FF', 0.45]], cloth: ['#E7E1F1', '#332D40'] },
    { light: [['#9C7358', 0], ['#D8602A', 0.08], ['#FF7E3D', 0.3]], dark: [['#8A6A55', 0], ['#E08A5C', 0.12], ['#FFB88F', 0.45]], cloth: ['#F0E3DB', '#3B2F28'] },
    { light: [['#74906A', 0], ['#4B9A3B', 0.08], ['#6FD04F', 0.3]], dark: [['#667D5E', 0], ['#7FB86E', 0.12], ['#B4F29C', 0.45]], cloth: ['#E2EBDD', '#2C3629'] }
  ];
  const weavePalette = data => { let h = 0; const k = String(data.id || data.name || ''); for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0; return WEAVE_PAL[h % WEAVE_PAL.length]; };
  // 수틀 하나(반지름 1, 땅 위에 눕힌 모습: 말뚝은 +y로 선다). 벽에 걸 때는 앞으로 세운다(front)
  //  o: { fresh: [[a, b]…](오늘 새로 이어진 실), thick: 실 굵기 배율, front, still: 움직임 없이 }
  function hoop(data, o) {
    const n = Math.max(2, Math.min(20, Math.round(data.n) || 2)), g = new THREE.Group(), dark = isDark(), th = o.thick || 1, PEG = 0.3;
    const wood = lin(css('--wood') || '#B98756'), linen = lin(weavePalette(data).cloth[dark ? 1 : 0]);
    const woodM = new THREE.MeshStandardMaterial({ roughness: 0.75, color: wood }), woodDk = new THREE.MeshStandardMaterial({ roughness: 0.8, color: wood.clone().multiplyScalar(0.72) });
    const pegM = new THREE.MeshStandardMaterial({ roughness: 0.6, color: wood.clone().offsetHSL(0, 0, 0.08) });
    const clothM = new THREE.MeshStandardMaterial({ roughness: 1, color: linen, side: THREE.DoubleSide });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.055, 12, 72), woodM); rim.rotation.x = Math.PI / 2; g.add(rim);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(0.93, 0.03, 10, 72), woodDk); inner.rotation.x = Math.PI / 2; inner.position.y = -0.012; g.add(inner);
    const cloth = new THREE.Mesh(new THREE.CircleGeometry(0.95, 56), clothM); cloth.rotation.x = -Math.PI / 2; cloth.position.y = -0.005; g.add(cloth);
    const ang = i => i / n * Math.PI * 2 - Math.PI / 2, px = i => Math.cos(ang(i)), pz = i => Math.sin(ang(i));
    for (let i = 0; i < n; i++) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, PEG, 12), pegM); p.position.set(px(i), PEG / 2, pz(i)); g.add(p);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.042, 12, 10), pegM); cap.position.set(px(i), PEG, pz(i)); g.add(cap);
    }
    // 실 밝기 1~3: 어두운 금 → 밝은 금(빛이 나는 듯). 같은 둘 사이에 더 오갈수록 조금 더 밝고 조금 더 굵다(상한 3)
    const pal = weavePalette(data), tone = pal[dark ? 'dark' : 'light'];
    const rad = [0.0075, 0.0105, 0.0145];
    const mat = w => { const t = tone[w - 1]; return new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.55, color: lin(t[0]), emissive: lin(t[0]).multiplyScalar(t[1]) }); };
    const base = [1, 2, 3].map(mat), freshK = new Set((o.fresh || []).map(([a, b]) => Math.min(a, b) + '-' + Math.max(a, b)));
    const threads = [], sparks = [];
    const pairs = (data.pairs || []).filter(([a, b]) => Number.isInteger(a) && Number.isInteger(b) && a !== b && a >= 0 && b >= 0 && a < n && b < n)
      .map(([a, b, w]) => [a, b, Math.max(1, Math.min(3, Math.round(w) || 1))]).sort((x, y) => x[2] - y[2]);
    let freshN = 0;
    pairs.forEach(([a, b, w], k) => {
      const h = hash2(a, b), isNew = freshK.has(Math.min(a, b) + '-' + Math.max(a, b));
      // 두 말뚝에 거는 높이를 실마다 달리하고 가운데는 살짝 처지게 해서, 겹쳐도 한 가닥씩 보이게 한다
      const ya = PEG * (0.45 + 0.5 * hash2(a + 3, b)), yb = PEG * (0.45 + 0.5 * hash2(b + 5, a));
      const A = new THREE.Vector3(px(a), ya, pz(a)), B = new THREE.Vector3(px(b), yb, pz(b)), M = A.clone().lerp(B, 0.5), len = A.distanceTo(B);
      const sag = Math.min(len * (0.03 + 0.07 * h), M.y * 0.8);
      M.y -= sag * 2;
      const curve = new THREE.QuadraticBezierCurve3(A, M, B), SEG = 30, RAD = 5, m = isNew ? mat(w) : base[w - 1];
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, SEG, rad[w - 1] * th, RAD, false), m); g.add(mesh);
      const t = { mesh, per: SEG * RAD * 6, delay: o.still ? 0 : 0.15 + k * (1.0 / Math.max(1, pairs.length)), dur: 0.5, shown: -1, isNew, mat: m, w };
      if (isNew) {
        t.delay = o.still ? 0 : 1.7 + freshN * 0.35; t.dur = 0.7; freshN++;
        [0.35, 0.68].forEach((u, j) => { const s = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshBasicMaterial({ color: dark ? 0xFFF1B8 : 0xFFFFFF, transparent: true, opacity: 0, depthWrite: false })); s.position.copy(curve.getPoint(u)); s.position.y += 0.025; s.visible = false; g.add(s); sparks.push({ s, t, j }); });
      }
      threads.push(t);
    });
    if (o.front) g.rotation.x = Math.PI / 2;
    // T초: 실이 차례로 걸리고, 새로 이어진 실은 그 뒤에 반짝이며 걸린다. 바뀐 것이 있으면 true
    function update(T) {
      let moved = false;
      threads.forEach(t => {
        const r = ease((T - t.delay) / t.dur), c = Math.round(r * 30) * t.per;
        if (c !== t.shown) { t.shown = c; t.mesh.geometry.setDrawRange(0, c); t.mesh.visible = c > 0; moved = true; }
        if (t.isNew) {
          const q = (T - t.delay) / 2.4, on = q >= 0 && q < 1, e = on ? (1 - q) * (0.55 + 0.45 * Math.sin(q * 22)) : 0, tn = tone[t.w - 1];
          const k = tn[1] + 0.9 * Math.max(0, e); if (Math.abs((t.k || 0) - k) > 0.004 || (!on && t.k !== tn[1])) { t.k = on ? k : tn[1]; t.mat.emissive.copy(lin(tn[0])).multiplyScalar(t.k); moved = true; }
        }
      });
      sparks.forEach(({ s, t, j }) => {
        const q = (T - t.delay - 0.35 - j * 0.28) / 1.3, on = q >= 0 && q < 1;
        if (on) { s.visible = true; s.material.opacity = Math.sin(q * Math.PI) * 0.95; s.scale.setScalar(0.6 + 1.4 * Math.sin(q * Math.PI)); moved = true; } else if (s.visible) { s.visible = false; moved = true; }
      });
      return moved;
    }
    const end = Math.max(0.5, ...threads.map(t => t.delay + t.dur)) + (freshN ? 2.6 : 0.1);
    return { g, update, end, fresh: freshN };
  }
  // 결과 그림 한 장(PNG): 그림 아래에 이름과 기간. 실 수 같은 숫자는 넣지 않는다
  const period = (from, to) => {
    const p = s => (s || '').split('-').map(Number); const [y1, m1] = p(from), [y2, m2] = p(to);
    if (!y1 || !y2) return '';
    return y1 === y2 ? (m1 === m2 ? `${y1}년 ${m1}월` : `${y1}년 ${m1}월 ~ ${m2}월`) : `${y1}년 ${m1}월 ~ ${y2}년 ${m2}월`;
  };
  function captioned(url, title, sub) {
    return new Promise((ok, bad) => {
      const i = new Image(); i.onerror = bad;
      i.onload = () => {
        const W = i.width, H = i.height, cap = Math.round(W * 0.085), c = document.createElement('canvas'); c.width = W; c.height = H + cap;
        const g = c.getContext('2d'), cs = getComputedStyle(document.documentElement);
        g.fillStyle = cs.getPropertyValue('--surface').trim() || '#fff'; g.fillRect(0, 0, W, H + cap); g.drawImage(i, 0, 0);
        g.textBaseline = 'middle'; g.fillStyle = cs.getPropertyValue('--ink').trim() || '#1B2523'; g.font = `700 ${Math.round(cap * 0.36)}px "Gowun Batang", serif`; g.textAlign = 'left';
        g.fillText(title || '함께 짜는 그물', cap * 0.45, H + cap / 2);
        g.fillStyle = cs.getPropertyValue('--ink-2').trim() || '#5B6965'; g.font = `500 ${Math.round(cap * 0.24)}px "IBM Plex Sans KR", sans-serif`; g.textAlign = 'right';
        g.fillText((sub ? sub + ' · ' : '') + '코이데', W - cap * 0.45, H + cap / 2);
        c.toBlob(b => ok(b), 'image/png');
      };
      i.src = url;
    });
  }
  // 휴대폰이면 공유하기, 아니면 내려받기. 내려받았으면 true
  async function saveBlob(blob, name, title) {
    const file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && /Mobi|Android|iPhone|iPad/.test(navigator.userAgent)) {
      try { await navigator.share({ files: [file], title }); return false; } catch (e) { if (e && e.name === 'AbortError') return false; }
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return true;
  }

  // 그물 한 장 보여 주기(모임 화면의 카드와 크게 보기, 함께 짠 그물 화면의 크게 보기). 비스듬히 위에서 내려다보고, 밀어서 돌려 본다
  //  opts: { fresh: [[a, b]…](오늘 새로 이어진 실 — 처음 그릴 때 반짝이며 나타난다), big: () => 크게 보기인가 }
  function weave(data, info, opts) {
    opts = opts || {};
    const still = reduce(), H = hoop(data, { fresh: opts.fresh, still, thick: 1 });
    let yaw = 0.35, pitch = 0.95, T = still ? 99 : 0;
    const S = stage({
      srgb: true,
      free: () => !!(opts.big && opts.big()),
      onDrag: (dx, dy) => { yaw -= dx * 0.008; pitch = Math.max(0.5, Math.min(1.35, pitch + dy * 0.004)); place(); },
      onTap: () => {},
      frame: dt => {
        let moved = false;
        if (T < H.end) { T += dt; moved = H.update(T) || moved; if (T >= H.end) moved = true; }
        if (!still && performance.now() - S.idleAt > 3500) { yaw += dt * 0.12; moved = true; }
        if (moved) place();
        return moved;
      }
    });
    light(S.scene, 0x808080); S.scene.add(H.g);
    H.update(T);
    const place = () => { const d = S.dist || 8; S.camera.position.set(Math.sin(yaw) * Math.cos(pitch) * d, Math.sin(pitch) * d, Math.cos(yaw) * Math.cos(pitch) * d); S.camera.lookAt(0, 0.1, 0); };
    // 수틀이 어떤 방향에서도 다 들어오게(가로가 좁은 휴대폰이면 더 멀리)
    S.fit = () => { const a = S.camera.aspect || 1.3, t = Math.tan(15 * Math.PI / 180); S.dist = Math.max((opts.big && opts.big() ? 1.45 : 1.12) / t, 1.2 / (t * a)) + 0.3; place(); };   // 크게 보기는 아래 이름표 자리만큼 더 멀리
    // 그림 저장: 가로 1600 × 세로 1200으로 한 번 그리고, 이름과 기간을 아래에 붙인다
    S.card = async (title, sub) => {
      const r0 = S.renderer.getPixelRatio(), a0 = S.camera.aspect; const y0 = yaw, p0 = pitch;
      S.renderer.setPixelRatio(1); S.renderer.setSize(1600, 1200, false); S.camera.aspect = 4 / 3; yaw = 0.35; pitch = 0.95; S.fit(); S.camera.updateProjectionMatrix();
      H.update(99); S.renderer.render(S.scene, S.camera); const url = S.el.toDataURL('image/png');
      yaw = y0; pitch = p0; S.camera.aspect = a0; S.renderer.setPixelRatio(r0); S.resize();
      return captioned(url, title, sub);
    };
    S.fit();
    return S;
  }

  // ── 모임 그물 보관: 벽(나무 판)에 수틀이 한 줄에 셋씩 걸려 있고, 아래에 이름표. 수틀을 누르면 onOpen(순서) ──────────
  //  list: 한 쪽에 보일 그물 [{ id, name, from, to, n, pairs }] (셋까지)
  function weaves(list, onOpen) {
    const GAP = 2.3, still = reduce();
    let yaw = 0, pitch = 0, T = still ? 99 : 0;
    const S = stage({
      srgb: true,
      onDrag: (dx, dy) => { yaw = Math.max(-0.55, Math.min(0.55, yaw - dx * 0.005)); pitch = Math.max(-0.2, Math.min(0.3, pitch + dy * 0.002)); place(); },
      onTap: (x, y) => { ray.setFromCamera(new THREE.Vector2(x, y), S.camera); const h = ray.intersectObjects(hit, false)[0]; if (h && onOpen) onOpen(h.object.userData.i); },
      frame: dt => { if (T >= end) return false; T += dt; let m = false; hoops.forEach(H => { m = H.update(T) || m; }); return m; }
    });
    light(S.scene, 0x808080);
    const wood = lin(css('--wood') || '#B98756'), back = lin(css('--surface-2') || '#EAEEEC');
    const W = 14;   // 벽은 어느 화면 비율에서도 가득 차게 넉넉히 넓힌다
    const box = (w, h, d, c, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ roughness: 0.85, color: c })); m.position.set(x, y, z); S.scene.add(m); return m; };
    // 나무 판 벽: 가로 널 몇 장, 위쪽에 가로대
    const rows = 9, PH = 0.85;
    for (let r = 0; r < rows; r++) box(W, PH - 0.02, 0.1, back.clone().offsetHSL(0, 0, (r % 2 ? -0.02 : 0.01)), 0, 3.6 - r * PH - PH / 2, -0.2);
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, W - 0.2, 12), new THREE.MeshStandardMaterial({ roughness: 0.7, color: wood })); rail.rotation.z = Math.PI / 2; rail.position.set(0, 1.5, -0.05); S.scene.add(rail);
    const hoops = [], hit = [], c = list.length, ray = new THREE.Raycaster();
    list.forEach((w, i) => {
      const x = (i - (c - 1) / 2) * GAP, H = hoop(w, { front: true, thick: 2.1, still }); H.g.position.set(x, 0.05, 0); S.scene.add(H.g); hoops.push(H);
      // 가로대에 거는 끈
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 6), new THREE.MeshStandardMaterial({ color: wood })); cord.position.set(x, 1.28, 0); S.scene.add(cord);
      // 누르는 자리(보이지 않는 원판)
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1.1, 24), new THREE.MeshBasicMaterial({ visible: false })); disc.position.set(x, 0.05, 0.1); disc.userData.i = i; S.scene.add(disc); hit.push(disc);
      // 이름표
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 168; const g = cv.getContext('2d');
      g.fillStyle = css('--surface') || '#FFFFFF'; g.fillRect(0, 0, 512, 168);
      g.strokeStyle = css('--line-strong') || '#B9C4BF'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, 509, 165);
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = css('--ink') || '#1B2523'; g.font = '700 58px "Gowun Batang", serif';
      let nm = w.name || ''; while (nm.length > 1 && g.measureText(nm).width > 480) nm = nm.slice(0, -1); g.fillText(nm + (nm.length < (w.name || '').length ? '…' : ''), 256, 62);
      g.fillStyle = css('--ink-2') || '#5B6965'; g.font = '500 40px "IBM Plex Sans KR", sans-serif'; g.fillText(period(w.from, w.to), 256, 124);
      const tx = new THREE.CanvasTexture(cv); tx.encoding = THREE.sRGBEncoding; tx.anisotropy = 4;
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.69), new THREE.MeshBasicMaterial({ map: tx })); tag.position.set(x, -1.42, 0.02); S.scene.add(tag);
    });
    const end = still ? 0 : Math.max(...hoops.map(h => h.end), 0.1);
    hoops.forEach(H => H.update(T));
    const place = () => { const d = S.dist || 12; S.camera.position.set(Math.sin(yaw) * Math.cos(pitch) * d, -0.1 + Math.sin(pitch) * d, Math.cos(yaw) * Math.cos(pitch) * d); S.camera.lookAt(0, -0.1, 0); };
    S.fit = () => { const a = S.camera.aspect || 2, t = Math.tan(15 * Math.PI / 180); S.dist = Math.max(1.95 / t, 3.55 / (t * a)); place(); };
    S.fit();
    return S;
  }

  return { weave, weaves, saveBlob, period };
})();
