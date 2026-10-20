/* 나의 기도 노트 › 나의 보관함의 입체 그림 세 가지: 나의 올해 끈, 이달의 정원, 끈 보관함. 그리고 모임 화면과 끈 보관함에서 쓰는 '함께 짜는 그물'(weave, weaves).
 * 지난 기록을 열 때만 vendor/three.min.js와 함께 불러온다(note.html의 load3d).
 * 각 그림은 한 번 만들어 두고, 화면을 다시 그릴 때는 그림판(canvas)만 새 자리로 옮긴다(attach). 기록이 바뀌면 note.html이 새로 만든다 */
window.KOIDE_NOTE3D = (() => {
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ease = t => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
  const md = s => { const [, m, d] = s.split('-').map(Number); return `${m}월 ${d}일`; };

  // 공통 그림판: 붙일 자리(attach)가 바뀌어도 같은 그림을 이어 쓴다. 밀면 onDrag, 살짝 누르면 onTap(화면 좌표 -1~1)
  //  ortho면 정사영 카메라(정원), free()가 참이면 손가락 하나로도 위아래까지 끈다(크게 보기), pinch가 있으면 두 손가락으로 키우고 옮긴다(크게 보기)
  //  grab이 있으면(꾸미기) 누른 자리에 잡을 것이 있을 때 grab.start가 true를 돌려주고, 그 뒤로는 돌리기 대신 grab.move · grab.end
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

  // ── 나의 올해 끈: 달마다 한 가닥(기도한 날만큼 굵게, 아직 오지 않은 달은 옅게), 응답 매듭, 감사 금실 ──────────
  //  data: { year, days[12], now(0~11), answers: [{ d, text, item }], thanks: [{ d, text }] }, info(): 고른 것을 쓸 자리
  function cord(data, info) {
    const LEN = 6.6, CORE = 0.28, TURNS = 3, N = 12, MAXD = Math.max(8, ...data.days);
    const doy = s => { const [y, m, d] = s.split('-').map(Number); return (Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 864e5; };
    const uOf = s => 0.05 + 0.9 * doy(s) / 365;
    let T = reduce() ? 9 : 0, sel = null;
    const tilt = new THREE.Group(), rope = new THREE.Group(); tilt.rotation.z = -0.1; tilt.add(rope);
    const S = stage({
      onDrag: (dx, dy) => { rope.rotation.x += dx * 0.012; tilt.rotation.x = Math.max(-0.8, Math.min(0.8, tilt.rotation.x + dy * 0.006)); },
      onTap: (x, y) => { ray.setFromCamera(new THREE.Vector2(x, y), S.camera); const h = ray.intersectObjects(picks, true)[0]; let o = h && h.object; while (o && !o.userData.kind) o = o.parent; select(o && o !== sel ? o : null); },
      frame: dt => { let moved = false; if (T < 4) { T += dt; build(); moved = true; } if (!reduce() && !sel && performance.now() - S.idleAt > 3000) { rope.rotation.x += dt * 0.22; moved = true; } return moved; }
    });
    S.scene.add(tilt); light(S.scene, 0x445550);
    S.fit = () => { S.camera.position.set(0, 0.8, S.camera.aspect < 1.5 ? 10.5 : 8.6); S.camera.lookAt(0, 0, 0); };
    const accent = new THREE.Color(css('--accent') || '#2B6A62'), pale = accent.clone().lerp(new THREE.Color(css('--surface') || '#fff'), 0.7);
    const mats = Array.from({ length: N }, (_, i) => new THREE.MeshStandardMaterial({ roughness: 0.8, color: i <= data.now ? accent : pale }));
    const knotMat = new THREE.MeshStandardMaterial({ roughness: 0.5, color: accent.clone().offsetHSL(0, 0.05, -0.1) });
    const goldMat = new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0.6, color: new THREE.Color('#D4A64A') });
    const hiMat = new THREE.MeshStandardMaterial({ roughness: 0.4, color: accent.clone().offsetHSL(0, 0, 0.15), emissive: accent.clone().multiplyScalar(0.4) });
    const pathAt = (i, u, p, o) => { const fray = 1 + 1.2 * (ease((0.04 - u) / 0.04) + ease((u - 0.96) / 0.04)), r = CORE * fray * (1 + 2 * (1 - p)), a = i / N * Math.PI * 2 + TURNS * Math.PI * 2 * u * p; return o.set(-LEN / 2 + LEN * u, r * Math.cos(a), r * Math.sin(a)); };
    class Strand extends THREE.Curve { constructor(i) { super(); this.i = i; this.reach = 1; this.p = 1; } getPoint(t, o = new THREE.Vector3()) { return pathAt(this.i, t * this.reach, this.p, o); } }
    const strands = data.days.map((d, i) => { const c = new Strand(i), m = new THREE.Mesh(new THREE.BufferGeometry(), mats[i]); rope.add(m); return { c, m, r: i <= data.now ? 0.035 + 0.05 * Math.min(1, d / MAXD) : 0.03, key: '' }; });
    const picks = [], ray = new THREE.Raycaster();
    data.answers.forEach((a, k) => {
      const g = new THREE.Group(), ring = new THREE.Mesh(new THREE.TorusGeometry(CORE + 0.07, 0.085, 12, 36), knotMat), bump = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), knotMat);
      ring.rotation.y = Math.PI / 2; bump.position.y = CORE + 0.12; g.add(ring, bump); g.position.x = -LEN / 2 + LEN * uOf(a.d);
      g.userData = Object.assign({ kind: 'answer', parts: [ring, bump], mat: knotMat, at: 2.6 + k * 0.1 }, a); rope.add(g); picks.push(g);
    });
    const RING = new THREE.TorusGeometry(CORE + 0.05, 0.022, 8, 40);
    data.thanks.forEach((t, k) => {
      const g = new THREE.Group(); [-0.05, 0.05].forEach(dx => { const r = new THREE.Mesh(RING, goldMat); r.rotation.y = Math.PI / 2; r.position.x = dx; g.add(r); });
      g.position.x = -LEN / 2 + LEN * uOf(t.d); g.userData = Object.assign({ kind: 'thanks', parts: g.children.slice(), mat: goldMat, at: 3 + k * 0.03 }, t); rope.add(g); picks.push(g);
    });
    function build() {
      const p = ease((T - 1.2) / 1.4);
      strands.forEach((s, i) => {
        const reach = Math.max(0.001, ease((T - i * 0.07) / 0.6)), k = reach.toFixed(3) + p.toFixed(3);
        if (k === s.key) return; s.key = k; s.c.reach = reach; s.c.p = p;
        s.m.geometry.dispose(); s.m.geometry = new THREE.TubeGeometry(s.c, Math.max(8, Math.round(200 * reach)), s.r, 8, false);
      });
      picks.forEach(o => { const t = ease((T - o.userData.at) / 0.35); o.scale.setScalar(Math.max(0.001, t < 1 ? t * (1.25 - 0.25 * t) : 1)); o.visible = t > 0; });
    }
    function select(o) {
      if (sel) sel.userData.parts.forEach(m => { m.material = sel.userData.mat; });
      sel = o; const el = info(); S.draw(); if (!el) return;
      if (!o) { el.innerHTML = '<p class="hint">매듭이나 금실을 누르면 그날의 기록이 보여요. 밀어서 돌려 볼 수 있어요.</p>'; return; }
      o.userData.parts.forEach(m => { m.material = hiMat; }); S.draw();
      const u = o.userData;
      el.innerHTML = u.kind === 'answer' ? `<div class="pick3d"><small>${md(u.d)} · 응답 매듭</small><p>${esc(u.text)}</p>${u.item ? `<q>기도제목: ${esc(u.item)}</q>` : ''}</div>`
        : `<div class="pick3d gold"><small>${md(u.d)} · 감사의 금실</small><p>${esc(u.text)}</p></div>`;
    }
    build();
    return S;
  }

  // ── 이달의 정원: 한 달 한 판(note.html이 고른 달 하나를 넘긴다). 그 달 첫 기도에 주인공, 그다음 기도한 날마다 소품 하나가 정원에 놓인다 ──────────
  //  row: { key, title, hero: [파일, 이름, 너비], props: [[파일, 이름, 너비]], days: ['YYYY-MM-DD'…], count }, base: 그림 폴더, info(): 고른 것을 쓸 자리
  //  A: { st: { n, pos: { 이름: [i, j, 뒤집음] } }, hand, month, on(), big(), save(st), tray(): 서랍을 그릴 자리들, ui() }
  //  자리는 판 한가운데 칸을 (0, 0)으로 둔 칸 번호(i, j)로 적는다. 판이 커져도(3→4→5) 번호가 그대로라서 놓아 둔 소품이 움직이지 않는다.
  //  판 크기 n의 칸 번호는 -floor(n/2) ~ n-1-floor(n/2): 한 칸 커질 때마다 한쪽 가장자리에 새 칸이 돋는다. 2×2 소품은 왼쪽 위 칸 번호를 적는다
  function garden(row, base, info, A) {
    const BIG = 56;           // 소품 너비(art-data의 w)가 이 값 이상이면 2×2 칸을 쓴다: 천막·나무·우물·타작마당·방주·시렁처럼 장면에서 큼직한 것. 나머지는 1×1
    const SZ = 1.4, ELEV = 0.62, YAW = Math.PI / 4, SLAB = 0.42, TH = 0.14, GOLD = '#F2B84B';
    const lo = n => -Math.floor(n / 2), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const MAXN = 5;           // 땅은 5×5까지만 키운다(그 이상은 화면에서 소품이 너무 작아진다)
    const nOf = k => k <= 4 ? 3 : k <= 8 ? 4 : MAXN;   // 모은 것이 1~4개면 3×3, 5~8개 4×4, 9개부터 5×5
    const st = A.st, prevN = Math.min(st.n || 0, MAXN);
    const order = [row.hero, ...row.props].slice(0, Math.min(row.count, 1 + row.props.length));
    const items = order.map(([file, name, w], i) => ({ name, file, w, i, date: row.days[i], fp: i === 0 || w >= BIG ? 2 : 1, cell: null, flip: false, g: null, card: null, mask: null, hop: null, pop: null }));
    const byName = {}; items.forEach(it => { byName[it.name] = it; });
    let N = Math.min(MAXN, Math.max(st.n || 0, nOf(items.length))), Z = 1, PX = 0, PY = 0, V = { cx: 0, cy: 0, hw: 5, hh: 4 }, sel = null, tray = null, lastTap = { t: 0, it: null };
    const dark = css('color-scheme') === 'dark';

    // 칸 차지: 이름 → 왼쪽 위 칸, 칸 → 이름
    const occ = new Map();
    const keyOf = (i, j) => i + ',' + j;
    const cellsOf = (it, a) => { const r = []; for (let x = 0; x < it.fp; x++) for (let y = 0; y < it.fp; y++) r.push([a[0] + x, a[1] + y]); return r; };
    const inside = (i, j, n = N) => i >= lo(n) && i < lo(n) + n && j >= lo(n) && j < lo(n) + n;
    const fits = (it, a, skip) => cellsOf(it, a).every(([i, j]) => inside(i, j) && (!occ.has(keyOf(i, j)) || occ.get(keyOf(i, j)) === skip));
    const anchors = (it, skip) => { const r = []; for (let i = lo(N); i < lo(N) + N; i++) for (let j = lo(N); j < lo(N) + N; j++) if (fits(it, [i, j], skip)) r.push([i, j]); return r; };
    const occupy = (it, a) => { it.cell = a; cellsOf(it, a).forEach(([i, j]) => occ.set(keyOf(i, j), it.name)); };
    const vacate = it => { if (!it.cell) return; cellsOf(it, it.cell).forEach(([i, j]) => { if (occ.get(keyOf(i, j)) === it.name) occ.delete(keyOf(i, j)); }); it.cell = null; };
    const center = (it, a = it.cell) => [a[0] + (it.fp - 1) / 2, a[1] + (it.fp - 1) / 2];
    const hash = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 1009; return h / 1009; };
    // 좋은 자리: 한가운데에서 가깝되 다른 소품과는 떨어진 자리(가운데부터 퍼져 나가게)
    function best(it) {
      const mid = lo(N) + (N - 1) / 2, others = items.filter(o => o.cell && o !== it).map(o => ({ c: center(o), fp: o.fp }));
      let pick = null, top = 1e9;
      anchors(it).forEach(a => {
        const c = center(it, a), dc = Math.hypot(c[0] - mid, c[1] - mid), near = others.reduce((m, o) => Math.min(m, Math.hypot(c[0] - o.c[0], c[1] - o.c[1])), 2.6);
        // 화면에서 앞 소품이 뒤 소품을 가리는 자리는 피한다(같은 세로줄(i-j)에서 앞뒤(i+j)로 가까운 자리)
        let hid = 0;
        others.forEach(o => {
          const dx = Math.abs((c[0] - c[1]) - (o.c[0] - o.c[1])), dd = (c[0] + c[1]) - (o.c[0] + o.c[1]), front = dd > 0 ? it.fp : o.fp, lim = ((it.fp + o.fp) * 0.45 + 0.1) * 1.41 * 0.7 + 0.3;
          if (dd !== 0 && Math.abs(dd) <= (front === 2 ? 5.5 : 2.6) && dx < lim) hid += 1 - dx / lim;
        });
        const sc = dc * 0.8 - near + hid * 3.2 + hash(it.name + a) * 0.25;
        if (sc < top) { top = sc; pick = a; }
      });
      return pick;
    }

    // 저장된 자리 불러오기(판 밖이거나 겹치면 자리 없음으로)
    items.forEach(it => {
      const p = st.pos[it.name];
      if (Array.isArray(p) && Number.isInteger(p[0]) && Number.isInteger(p[1])) {
        const need = Math.max(N, ...cellsOf(it, p).map(([i, j]) => Math.max(j - lo(N) + 1, i - lo(N) + 1, 0)));
        while (!fits(it, p) && N < need && N < MAXN) N++;
        if (fits(it, p)) { occupy(it, p); it.flip = !!p[2]; }
      }
    });
    // 직접 놓기가 아니면 자리 없는 것은 알아서 놓는다(큰 것부터). 모두 놓일 칸 넓이가 판의 72%를 넘으면 판을 한 칸 키운다
    const todo = A.hand ? [] : items.filter(it => !it.cell).sort((a, b) => b.fp - a.fp || a.i - b.i);
    const area = () => items.reduce((s, it) => s + (A.hand && !it.cell ? 0 : it.fp * it.fp), 0);
    while (todo.length && area() > 0.72 * N * N && N < MAXN) N++;
    const born = [];
    todo.forEach(it => {
      let a = best(it); while (!a && N < MAXN) { N++; a = best(it); }
      if (!a && it.fp === 2) { it.fp = 1; a = best(it); }   // 5×5에서도 2×2 자리가 없으면(흩어 놓았을 때 등) 1×1로 줄여 놓는다
      if (a) { occupy(it, a); born.push(it); }
    });
    const waiting = () => items.filter(it => !it.cell);
    const persist = () => { st.n = N; st.pos = {}; items.forEach(it => { if (it.cell) st.pos[it.name] = [it.cell[0], it.cell[1], it.flip ? 1 : 0]; }); A.save(st); };

    const S = stage({
      srgb: true, ortho: true,
      free: () => A.big(),
      pinch: { on: () => A.big(), move: (r, dx, dy, nx, ny) => { zoomBy(r, nx, ny); pan(dx, dy); } },
      onDrag: (dx, dy) => { if (A.big() && Z > 1) { pan(dx, dy); } },
      onTap: (x, y) => tap(x, y),
      frame: (dt, now) => {
        let moved = false;
        items.forEach(it => {
          if (it.hop) { it.hop.t += dt / 0.28; const p = Math.min(1, it.hop.t), e = ease(p); it.g.position.x = it.hop.x0 + (it.hop.x1 - it.hop.x0) * e; it.g.position.z = it.hop.z0 + (it.hop.z1 - it.hop.z0) * e; it.g.position.y = Math.sin(p * Math.PI) * 0.45; if (p >= 1) { it.hop = null; it.g.position.y = 0; } moved = true; }
          if (it.pop) { it.pop.t += dt / 0.5; const p = Math.min(1, it.pop.t), b = 1 - Math.pow(1 - p, 3); it.g.scale.setScalar(Math.max(0.001, b * (1.15 - 0.15 * b))); if (p >= 1) { it.pop = null; it.g.scale.setScalar(1); } moved = true; }
        });
        tiles.forEach(t => { if (t.rise) { t.rise.t += dt; const p = ease((t.rise.t - t.rise.delay) / 0.5); t.m.scale.y = Math.max(0.001, p); if (p >= 1) t.rise = null; moved = true; } });
        return moved;
      }
    });
    const lin = c => new THREE.Color(c).convertSRGBToLinear();
    const shade = (c, k) => { const o = lin(c); o.multiplyScalar(k); return o; };
    const ray = new THREE.Raycaster(), loader = new THREE.TextureLoader();

    // ── 판: 달마다 땅 색이 조금씩 다르다(봄 연두, 가을 누런 풀, 겨울 옅은 빛). 새로 생긴 가장자리 칸은 솟아오른다 ──────────
    const TINT = [['#D8E3CF', '#CBDAC2'], ['#CFE0D6', '#C2D6CB'], ['#D3E6B8', '#C6DDA8'], ['#CFE5B0', '#C0DB9E'], ['#C7E0A4', '#B8D692'], ['#BDDB96', '#AECF86'],
      ['#C0DCA0', '#B2D18F'], ['#C8D9A0', '#BACD8E'], ['#DCDDA6', '#CFD097'], ['#C9DDA4', '#BBD393'], ['#E0D3A0', '#D4C690'], ['#C5D3E6', '#B6C6DB']][clamp((A.month || 10) - 1, 0, 11)];
    const k = dark ? 0.5 : 1, tileMat = TINT.map(c => new THREE.MeshBasicMaterial({ color: shade(c, k) }));
    const soil = css('--wood') || '#B98756', sideMat = [1, 0.8, 1, 0.6, 0.9, 0.7].map(f => new THREE.MeshBasicMaterial({ color: shade(soil, f * (dark ? 0.9 : 1)) }));
    const root = new THREE.Group(); S.scene.add(root);
    const tiles = [], tileAt = new Map();
    let slab = null;
    function board(from) {
      const r0 = lo(N);
      for (let i = r0; i < r0 + N; i++) for (let j = r0; j < r0 + N; j++) {
        if (tileAt.has(keyOf(i, j))) continue;
        const geo = new THREE.BoxGeometry(SZ - 0.06, TH, SZ - 0.06); geo.translate(0, TH / 2, 0);
        const m = new THREE.Mesh(geo, tileMat[(i + j) & 1 ? 1 : 0]); m.position.set(i * SZ, -TH, j * SZ); root.add(m);
        const t = { m, i, j, rise: null }; tiles.push(t); tileAt.set(keyOf(i, j), t);
        if (from && !inside(i, j, from) && !reduce()) { m.scale.y = 0.001; t.rise = { t: 0, delay: 0.05 * (Math.abs(i) + Math.abs(j)) }; }
      }
      if (slab) { root.remove(slab); slab.geometry.dispose(); }
      slab = new THREE.Mesh(new THREE.BoxGeometry(N * SZ + 0.1, SLAB, N * SZ + 0.1), sideMat);
      const mid = (r0 + (N - 1) / 2) * SZ; slab.position.set(mid, -TH - SLAB / 2 + 0.01, mid); root.add(slab);
    }
    board(prevN > 0 && N > prevN ? prevN : 0);
    // 칸 표시(놓을 수 있는 칸)와 고른 소품 아래 받침
    const markMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(GOLD).convertSRGBToLinear(), transparent: true, opacity: 0.55, depthWrite: false });
    const marks = new Map(), selMark = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(GOLD).convertSRGBToLinear(), transparent: true, opacity: 0.4, depthWrite: false }));
    selMark.rotation.x = -Math.PI / 2; selMark.position.y = 0.03; selMark.visible = false; root.add(selMark); S.hide.push(selMark);
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.16, depthWrite: false });

    // ── 소품: 카메라를 바라보는 오려 낸 그림 ──────────
    const place3d = it => { const c = center(it); it.g.position.set(c[0] * SZ, 0, c[1] * SZ); };
    items.forEach(it => {
      const g = new THREE.Group(); g.rotation.y = YAW; it.g = g; root.add(g);
      if (it.cell) place3d(it); else g.visible = false;
      loader.load(base + row.key + '/' + it.file + '.webp', tex => {
        tex.encoding = THREE.sRGBEncoding;
        const asp = tex.image.height / tex.image.width;
        const hero = it.i === 0;   // 주인공은 칸은 2×2 그대로 쓰되 그림만 다른 큰 소품보다 작게(양이 너무 크다는 의견)
        let pw = it.fp === 2 ? SZ * (hero ? 1.45 : 1.8) : SZ * (0.55 + 0.4 * clamp((it.w - 14) / 30, 0, 1)), ph = pw * asp; const maxH = it.fp === 2 ? SZ * (hero ? 2.1 : 2.6) : SZ * 1.4;
        if (ph > maxH) { ph = maxH; pw = ph / asp; }
        const card = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.08, side: THREE.DoubleSide }));
        card.position.y = ph / 2; card.scale.x = it.flip ? -1 : 1; card.userData.it = it; g.add(card); it.card = card;
        const sh = new THREE.Mesh(new THREE.CircleGeometry(Math.max(pw, SZ * it.fp * 0.5) * 0.42, 24), shadowMat); sh.rotation.x = -Math.PI / 2; sh.scale.y = 0.38; sh.position.y = 0.012; g.add(sh);
        const c = document.createElement('canvas'); c.width = c.height = 64; const cx = c.getContext('2d'); cx.drawImage(tex.image, 0, 0, 64, 64); it.mask = cx.getImageData(0, 0, 64, 64).data;
        S.draw();
      });
      if (it.cell && born.includes(it) && it.date === A.today && !reduce() && prevN) { it.pop = { t: 0 }; g.scale.setScalar(0.001); }
    });

    // ── 카메라: 고정된 등각 시점. 판과 소품이 모두 들어오게 맞추고, 크게 보기에서만 두 손가락으로 키우고 옮긴다 ──────────
    const dir = new THREE.Vector3(Math.sin(YAW) * Math.cos(ELEV), Math.sin(ELEV), Math.cos(YAW) * Math.cos(ELEV));
    function apply() {
      const hw = V.hw / Z, hh = V.hh / Z, cam = S.camera;
      cam.left = V.cx + PX - hw; cam.right = V.cx + PX + hw; cam.top = V.cy + PY + hh; cam.bottom = V.cy + PY - hh; cam.updateProjectionMatrix();
    }
    S.fit = () => {
      const r0 = lo(N), a = lo(N) * SZ - SZ / 2, b = (lo(N) + N) * SZ - SZ / 2, mid = (r0 + (N - 1) / 2) * SZ, cam = S.camera, aspect = S.aspect || 1.3;
      cam.position.set(mid, 0, mid).addScaledVector(dir, 40); cam.lookAt(mid, 0, mid); cam.near = 0.1; cam.far = 100; cam.updateMatrixWorld();
      const pts = []; [[a, b], [a, a], [b, a], [b, b]].forEach(([x, z]) => { pts.push(new THREE.Vector3(x, -TH - SLAB, z), new THREE.Vector3(x, 0, z)); });
      items.forEach(it => { if (it.cell) { const c = center(it); pts.push(new THREE.Vector3(c[0] * SZ, it.i === 0 ? SZ * 2.0 : it.fp === 2 ? SZ * 2.5 : SZ * 1.3, c[1] * SZ)); } });
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      pts.forEach(p => { p.applyMatrix4(cam.matrixWorldInverse); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); });
      const hw0 = (x1 - x0) / 2 * 1.08 + 0.2, hh0 = (y1 - y0) / 2 * 1.08 + 0.2;
      let hw = hw0, hh = hh0; if (hw / hh < aspect) hw = hh * aspect; else hh = hw / aspect;
      V = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, hw, hh }; clampPan(); apply();
    };
    const baseResize = S.resize;
    S.resize = () => { if (S.host) S.aspect = (S.host.clientWidth || 1) / (S.host.clientHeight || 1); baseResize(); };
    function clampPan() { const mx = V.hw * (1 - 1 / Z) * 1.1, my = V.hh * (1 - 1 / Z) * 1.1; PX = clamp(PX, -mx, mx); PY = clamp(PY, -my, my); }
    function pan(dx, dy) {
      const w = S.host ? S.host.clientWidth : 400, h = S.host ? S.host.clientHeight : 300;
      PX -= dx / w * 2 * V.hw / Z; PY += dy / h * 2 * V.hh / Z; clampPan(); apply(); S.draw();
    }
    function zoomBy(r, nx, ny) {
      const z2 = clamp(Z * r, 1, 3.5); if (z2 === Z) return;
      PX += nx * V.hw * (1 / Z - 1 / z2); PY += ny * V.hh * (1 / Z - 1 / z2); Z = z2; clampPan(); apply(); S.draw();
    }
    S.el.addEventListener('wheel', e => {
      if (!A.big()) return; e.preventDefault();
      const r = S.el.getBoundingClientRect(); zoomBy(Math.exp(-e.deltaY * 0.0015), (e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    }, { passive: false });

    // ── 누르기: 소품(그림이 있는 곳만)과 칸 찾기 ──────────
    const itemAt = (x, y) => {
      ray.setFromCamera(new THREE.Vector2(x, y), S.camera);
      const cards = items.filter(it => it.card && it.cell).map(it => it.card);
      for (const h of ray.intersectObjects(cards, false)) {
        const it = h.object.userData.it; if (!it.mask || !h.uv) return it;
        const u = it.flip ? 1 - h.uv.x : h.uv.x, px = Math.floor(clamp(u, 0, 0.999) * 64), py = Math.floor(clamp(1 - h.uv.y, 0, 0.999) * 64);
        if (it.mask[(py * 64 + px) * 4 + 3] > 40) return it;
      }
      return null;
    };
    const cellAt = (x, y) => {
      ray.setFromCamera(new THREE.Vector2(x, y), S.camera); const p = new THREE.Vector3();
      if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p)) return null;
      return { i: Math.round(p.x / SZ), j: Math.round(p.z / SZ), x: p.x / SZ, z: p.z / SZ };
    };
    // 눌린 칸이 들어가는 자리 중 소품 가운데가 가장 가까운 자리(2×2는 눌린 칸을 낀 네 자리 중에서)
    function anchorFor(it, c, skip) {
      let pick = null, top = 1e9;
      for (let x = 0; x < it.fp; x++) for (let y = 0; y < it.fp; y++) {
        const a = [c.i - x, c.j - y]; if (!fits(it, a, skip)) continue;
        const m = center(it, a), d = Math.hypot(m[0] - c.x, m[1] - c.z); if (d < top) { top = d; pick = a; }
      }
      return pick;
    }
    function showMarks() {
      // 칸은 꾸미는 중이거나 서랍에서 고른 때만 빛낸다. 그냥 소품을 누르면 이름·온 날 글만
      const live = A.on() || !!tray, mover = tray ? byName[tray] : live ? sel : null, ok = new Set();
      if (mover) anchors(mover, mover.cell ? mover.name : null).forEach(a => cellsOf(mover, a).forEach(([i, j]) => ok.add(keyOf(i, j))));
      marks.forEach((m, kk) => { m.visible = ok.has(kk); });
      ok.forEach(kk => {
        if (marks.has(kk)) return; const [i, j] = kk.split(',').map(Number), m = new THREE.Mesh(new THREE.PlaneGeometry(SZ - 0.14, SZ - 0.14), markMat);
        m.rotation.x = -Math.PI / 2; m.position.set(i * SZ, 0.02, j * SZ); root.add(m); S.hide.push(m); marks.set(kk, m);
      });
      marks.forEach((m, kk) => { m.visible = ok.has(kk); });
      if (live && sel && sel.cell) { selMark.visible = true; selMark.scale.set(sel.fp * SZ - 0.06, sel.fp * SZ - 0.06, 1); const c = center(sel); selMark.position.x = c[0] * SZ; selMark.position.z = c[1] * SZ; } else selMark.visible = false;
      S.draw();
    }
    const hintHtml = () => (info() && info().id === 'gbig-say') ? (A.on() ? '<div class="pick3d"><small>소품을 한 번 누르고 빛나는 빈 자리를 눌러 옮겨요. 소품을 두 번 누르면 좌우가 바뀌어요. 이 기기에만 남아요.</small></div>' : '') : '<p class="hint">기도한 날마다 그 달 그림의 소품이 하나씩 정원에 놓여요.</p>';
    const say = html => { const el = info(); if (el) el.innerHTML = html == null ? hintHtml() : html; };
    const md2 = it => it.date ? `${esc(it.name)} · ${md(it.date)}에 왔어요` : esc(it.name);
    function choose(it) {
      sel = it;
      showMarks(); A.ui && A.ui(!!sel);
      if (!it) { say(null); return; }
      say(A.on() ? `<div class="pick3d"><p>${esc(it.name)}</p><small>${it.cell ? '옮길 빛나는 자리를 누르세요. 두 번 누르면 좌우가 바뀌어요.' : ''}</small></div>` : `<div class="pick3d"><p>${md2(it)}</p></div>`);
    }
    function move(it, a, fromTray) {
      const old = it.cell ? center(it) : null; vacate(it); occupy(it, a);
      const c = center(it);
      if (old && !reduce()) { it.hop = { t: 0, x0: old[0] * SZ, z0: old[1] * SZ, x1: c[0] * SZ, z1: c[1] * SZ }; } else place3d(it);
      if (fromTray) { it.g.visible = true; place3d(it); if (!reduce()) { it.pop = { t: 0 }; it.g.scale.setScalar(0.001); } }
      persist(); S.fit(); S.draw();
    }
    function grow() { const was = N; N++; board(was); persist(); S.fit(); }
    function tap(x, y) {
      const it = itemAt(x, y), now = performance.now(), dbl = it && now - lastTap.t < 350 && lastTap.it === it;
      lastTap = { t: dbl ? 0 : now, it };
      if (tray) {
        const mover = byName[tray], c = cellAt(x, y), a = c && anchorFor(mover, c, null);
        if (a) { tray = null; move(mover, a, true); showMarks(); syncUI(); say(`<div class="pick3d"><p>${esc(mover.name)}을(를) 정원에 놓았어요</p></div>`); } else if (!it) say('<div class="pick3d"><p>빛나는 칸을 눌러 주세요</p></div>');
        return;
      }
      // 카드에서 정원을 누르면 크게 보기(서랍에서 고른 상태는 위에서 칸 놓기로 갔다)
      if (!A.big()) { A.open && A.open(); return; }
      if (!A.on()) { choose(it && it !== sel ? it : null); return; }
      if (it) { if (dbl) { if (sel !== it) choose(it); flip(); return; } choose(it === sel ? null : it); return; }
      if (sel) {
        const c = cellAt(x, y), a = c && anchorFor(sel, c, sel.name);
        if (a) { const same = sel.cell[0] === a[0] && sel.cell[1] === a[1]; if (!same) move(sel, a, false); showMarks(); } else say('<div class="pick3d"><p>그 자리에는 놓을 수 없어요</p><small>빛나는 칸을 눌러 주세요.</small></div>');
      }
    }
    function flip() {
      if (!sel || !sel.card) return; sel.flip = !sel.flip; sel.card.scale.x = sel.flip ? -1 : 1; persist(); S.draw();
    }

    // ── 서랍(직접 놓기): 아직 자리가 없는 것들. 눌러서 고르면 놓을 수 있는 칸이 빛난다 ──────────
    function syncUI() {
      S.el.style.touchAction = A.big() ? 'none' : 'pan-y';
      if (!A.big() && (Z !== 1 || PX || PY)) { Z = 1; PX = PY = 0; S.fit(); }
      document.querySelectorAll('[data-a=gflip]').forEach(b => { b.disabled = !(sel && sel.cell && A.on()); });
      const left = waiting();
      A.tray().forEach(el => {
        if (!el) return;
        el.hidden = !(A.hand && left.length);
        el.innerHTML = !el.hidden ? `<p class="hint">서랍에서 소품을 고른 뒤, 빛나는 칸을 눌러 놓아요.</p><div class="gt-list">${left.map(it => `<button class="gt-it${tray === it.name ? ' on' : ''}" data-n="${esc(it.name)}" aria-pressed="${tray === it.name}"><img src="${base}${row.key}/${it.file}.webp" alt=""><span>${esc(it.name)}</span></button>`).join('')}</div>` : '';
        el.onclick = e => { const b = e.target.closest && e.target.closest('.gt-it'); if (b) pickTray(b.dataset.n); };
      });
    }
    function pickTray(name) {
      if (tray === name) { tray = null; showMarks(); syncUI(); say(null); return; }
      const it = byName[name]; if (!it) return;
      choose(null); tray = name;
      while (!anchors(it).length && N < MAXN) grow();           // 빈 자리가 없으면 판을 한 칸 키운다
      if (!anchors(it).length && it.fp === 2) it.fp = 1;      // 5×5에서도 2×2 자리가 없으면 1×1로 줄인다
      showMarks(); syncUI(); say(`<div class="pick3d"><p>${esc(it.name)}</p><small>빛나는 칸을 눌러 놓아요.</small></div>`);
    }
    S.syncUI = syncUI;
    S.select = choose;
    S.flip = flip;
    S.leave = () => { tray = null; choose(null); syncUI(); };
    S.hasTray = () => !!tray;
    S.refreshMarks = showMarks;

    // 그림 저장: 크게 보기나 확대와 상관없이 늘 판 전체를, 가로 1600 × 세로 1200으로 한 번 그린다(칸 표시는 감춤)
    S.snap = () => {
      const r0 = S.renderer.getPixelRatio(), z0 = Z, px0 = PX, py0 = PY, a0 = S.aspect;
      Z = 1; PX = PY = 0; S.aspect = 4 / 3; S.hide.forEach(o => { o.visible = false; });
      S.renderer.setPixelRatio(1); S.renderer.setSize(1600, 1200, false); S.fit(); S.renderer.render(S.scene, S.camera);
      const url = S.el.toDataURL('image/png');
      Z = z0; PX = px0; PY = py0; S.aspect = a0; S.renderer.setPixelRatio(r0); S.resize(); showMarks();
      return url;
    };

    persist(); S.fit();
    return S;
  }

  // ── 끈 보관함: 한 해가 끝나면 그해 끈을 감아 상자에 넣는다(해마다 한 칸, 올해 칸은 비어 있다) ──────────
  //  years: 세 해 [{ y, days, answers: [글], long } | { y, now } | { y, later }]
  function chest(years, info) {
    const CW = 2.6, CD = 2.6, WALL = 0.12, HGT = 0.7, N = Math.max(3, years.length), BW = N * CW + (N + 1) * WALL;
    let yaw = reduce() ? 0 : 0.5, pitch = reduce() ? 0.95 : 0.65, intro = reduce() ? 1 : 0, sel = null;
    const S = stage({
      srgb: true,
      onDrag: (dx, dy) => { intro = 1; yaw = Math.max(-0.9, Math.min(0.9, yaw + dx * 0.006)); pitch = Math.max(0.35, Math.min(1.3, pitch + dy * 0.004)); place(); },
      onTap: (x, y) => { ray.setFromCamera(new THREE.Vector2(x, y), S.camera); const h = ray.intersectObjects(coils, true)[0]; let g = h && h.object; while (g && !g.userData.Y) g = g.parent; select(g && g !== sel ? g : null); },
      frame: dt => { if (intro >= 1) return false; intro = Math.min(1, intro + dt / 1.4); const e = 1 - Math.pow(1 - intro, 3); yaw = 0.5 * (1 - e); pitch = 0.65 + 0.3 * e; place(); return true; }
    });
    light(S.scene, 0x886644);
    const lin = c => new THREE.Color(c).convertSRGBToLinear();
    const wood = new THREE.MeshStandardMaterial({ roughness: 0.75, color: lin(css('--wood') || '#B98756') }), linen = new THREE.MeshStandardMaterial({ roughness: 1, color: lin(css('--linen') || '#EFE6D6') });
    const accent = lin(css('--accent') || '#2B6A62'), strandMat = new THREE.MeshStandardMaterial({ roughness: 0.8, color: accent }), knotMat = new THREE.MeshStandardMaterial({ roughness: 0.5, color: accent.clone().offsetHSL(0, 0.05, -0.08) });
    const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); S.scene.add(b); };
    box(BW, 0.1, CD + 2 * WALL, wood, 0, -0.05, 0); box(BW - 2 * WALL, 0.02, CD, linen, 0, 0.01, 0);
    box(BW, HGT, WALL, wood, 0, HGT / 2, -CD / 2 - WALL / 2); box(BW, HGT, WALL, wood, 0, HGT / 2, CD / 2 + WALL / 2);
    for (let i = 0; i <= N; i++) box(WALL, HGT, CD, wood, -BW / 2 + WALL / 2 + i * (CW + WALL), HGT / 2, 0);
    const cx = i => -BW / 2 + WALL + CW / 2 + i * (CW + WALL);
    const tag = (text, sub, x) => {
      const c = document.createElement('canvas'); c.width = 320; c.height = 120; const g = c.getContext('2d');
      g.fillStyle = css('--plaque') || '#FBF6EC'; g.fillRect(0, 0, 320, 120);
      g.fillStyle = css('--ink') || '#1B2523'; g.font = '700 48px "Gowun Batang", serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 160, 46);
      g.fillStyle = css('--ink-2') || '#5B6965'; g.font = '500 26px "IBM Plex Sans KR", sans-serif'; g.fillText(sub, 160, 94);
      const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.56), new THREE.MeshBasicMaterial({ map: t })); m.position.set(x, HGT / 2, CD / 2 + WALL + 0.01); S.scene.add(m);
    };
    const coils = [], ray = new THREE.Raycaster();
    years.forEach((Y, i) => {
      if (Y.now) { tag(String(Y.y), '12월 31일에 들어가요', cx(i)); return; }
      if (Y.later || !Y.days) { tag(String(Y.y), '', cx(i)); return; }
      const g = new THREE.Group(), turns = 1.4 + Math.min(3, Y.days / 70), pts = [];
      for (let k = 0; k <= 240; k++) { const t = k / 240, a = t * turns * Math.PI * 2, r = 0.28 + 0.8 * t; pts.push(new THREE.Vector3(r * Math.cos(a), 0.17, r * Math.sin(a))); }
      const path = new THREE.CatmullRomCurve3(pts), seg = 400, F = path.computeFrenetFrames(seg, false), rho = 0.075, thick = 0.045 + 0.03 * Math.min(1, Y.days / 150);
      for (let s = 0; s < 3; s++) {
        const sp = [];
        for (let k = 0; k <= seg; k++) { const t = k / seg, p = path.getPointAt(t), f = s * 2.094 + t * turns * 22; sp.push(p.clone().addScaledVector(F.normals[k], Math.cos(f) * rho).addScaledVector(F.binormals[k], Math.sin(f) * rho)); }
        g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sp), seg, thick, 8, false), strandMat));
      }
      Y.answers.forEach((_, k) => { const t = (k + 1) / (Y.answers.length + 1), p = path.getPointAt(t), ring = new THREE.Mesh(new THREE.TorusGeometry(rho + 0.09, 0.06, 10, 28), knotMat); ring.position.copy(p); ring.lookAt(p.clone().add(path.getTangentAt(t))); g.add(ring); });
      g.position.x = cx(i); g.userData = { Y }; S.scene.add(g); coils.push(g);
      tag(String(Y.y), `기도한 날 ${Y.days}일`, cx(i));
    });
    const place = () => { const d = S.dist || 12; S.camera.position.set(Math.sin(yaw) * Math.cos(pitch) * d, Math.sin(pitch) * d, Math.cos(yaw) * Math.cos(pitch) * d); S.camera.lookAt(0, 0.2, 0.3); };
    S.fit = () => { S.dist = Math.max(9, (BW + 1.2) / (2 * Math.tan(15 * Math.PI / 180) * S.camera.aspect)); place(); };
    function select(g) {
      if (sel) sel.position.y = 0;
      sel = g; const el = info(); S.draw(); if (!el) return;
      if (!g) { el.innerHTML = '<p class="hint">한 해가 끝나면 그해의 끈을 상자에 넣어요.</p>'; return; }
      g.position.y = 0.25; S.draw();
      const Y = g.userData.Y;
      el.innerHTML = `<div class="pick3d"><small>${Y.y}년의 끈 · 기도한 날 ${Y.days}일 · 응답 매듭 ${Y.answers.length}개</small>${Y.long ? `<p>오래 이어 온 기도: ${esc(Y.long)}</p>` : ''}${Y.answers.length ? `<ul>${Y.answers.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}</div>`;
    }
    return S;
  }

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

  // 그물 한 장 보여 주기(모임 화면의 카드와 크게 보기, 끈 보관함에서 연 그물). 비스듬히 위에서 내려다보고, 밀어서 돌려 본다
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

  return { cord, garden, chest, weave, weaves, saveBlob, period };
})();
