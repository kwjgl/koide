/* 나의 기도 노트 › 지난 기록의 입체 그림 세 가지: 나의 올해 끈, 이달의 소품 선반, 끈 보관함.
 * 지난 기록을 열 때만 vendor/three.min.js와 함께 불러온다(note.html의 load3d).
 * 각 그림은 한 번 만들어 두고, 화면을 다시 그릴 때는 그림판(canvas)만 새 자리로 옮긴다(attach). 기록이 바뀌면 note.html이 새로 만든다 */
window.KOIDE_NOTE3D = (() => {
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ease = t => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
  const md = s => { const [, m, d] = s.split('-').map(Number); return `${m}월 ${d}일`; };

  // 공통 그림판: 붙일 자리(attach)가 바뀌어도 같은 그림을 이어 쓴다. 밀면 onDrag, 살짝 누르면 onTap(화면 좌표 -1~1)
  function stage({ srgb, onDrag, onTap, frame }) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    if (srgb) renderer.outputEncoding = THREE.sRGBEncoding;
    const el = renderer.domElement; el.style.display = 'block'; el.style.width = '100%'; el.style.height = '100%'; el.style.touchAction = 'pan-y';
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(30, 1.6, 0.1, 100);
    const S = { renderer, scene, camera, el, host: null, alive: true, idleAt: 0, draw: () => renderer.render(scene, camera) };
    let drag = null;
    el.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY }; el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', e => { if (!drag) return; onDrag(e.clientX - drag.x, e.clientY - drag.y); drag.x = e.clientX; drag.y = e.clientY; S.idleAt = performance.now(); S.draw(); });
    el.addEventListener('pointerup', e => {
      if (drag && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) { const r = el.getBoundingClientRect(); onTap((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); S.idleAt = performance.now(); }
      drag = null;
    });
    el.addEventListener('pointercancel', () => { drag = null; });
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
    S.dispose = () => { S.alive = false; ro.disconnect(); renderer.dispose(); el.remove(); };
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

  // ── 이달의 소품 선반: 한 달 한 칸(note.html이 고른 달 하나를 넘긴다). 그 달 첫 기도에 주인공, 그다음 기도한 날마다 소품 하나 ──────────
  //  rows: [{ key, title, hero, props: [[파일, 이름, 너비]], days: ['YYYY-MM-DD'…], count }], base: 그림 폴더
  function shelf(rows, base, info) {
    const W = 7.6, H = 2.5, D = 1.7, T = 0.16, R = Math.max(1, rows.length), top = R * H / 2;
    let yaw = 0.3, pitch = 0.06, sel = null;
    const S = stage({
      srgb: true,
      onDrag: (dx, dy) => { yaw = Math.max(-0.7, Math.min(0.7, yaw + dx * 0.006)); pitch = Math.max(-0.25, Math.min(0.35, pitch + dy * 0.003)); place(); },
      onTap: (x, y) => { ray.setFromCamera(new THREE.Vector2(x, y), S.camera); const h = ray.intersectObjects(picks.map(g => g.userData.card).filter(Boolean))[0]; const g = h && picks.find(p => p.userData.card === h.object); select(g && g !== sel ? g : null); },
      frame: (dt, now) => { let moved = false; picks.forEach(g => { if (g.userData.born >= 0) { const t = Math.min(1, (now - (g.userData.born || (g.userData.born = now))) / 600), b = 1 - Math.pow(1 - t, 3); g.scale.setScalar(Math.max(0.001, b * (1.15 - 0.15 * b))); if (t >= 1) { g.userData.born = -1; g.scale.setScalar(1); } moved = true; } }); return moved; }
    });
    light(S.scene, 0x886644);
    const lin = c => new THREE.Color(c).convertSRGBToLinear();
    const wood = new THREE.MeshStandardMaterial({ roughness: 0.75, color: lin(css('--wood') || '#B98756') }), back = new THREE.MeshStandardMaterial({ roughness: 0.9, color: lin(css('--wood-back') || '#E9D9C2') });
    const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); S.scene.add(b); };
    box(W + 2 * T, R * H + T, 0.08, back, 0, 0, -D / 2);
    box(T, R * H + T, D, wood, -W / 2 - T / 2, 0, 0); box(T, R * H + T, D, wood, W / 2 + T / 2, 0, 0);
    for (let r = 0; r <= R; r++) box(W + 2 * T, T, D, wood, 0, top - r * H, 0);
    const label = (text, sub, y) => {
      const c = document.createElement('canvas'); c.width = 512; c.height = 112; const g = c.getContext('2d');
      g.fillStyle = css('--plaque') || '#FBF6EC'; g.fillRect(0, 0, 512, 112);
      g.fillStyle = css('--ink') || '#1B2523'; g.font = '700 44px "Gowun Batang", serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 42);
      g.fillStyle = css('--ink-2') || '#5B6965'; g.font = '500 28px "IBM Plex Sans KR", sans-serif'; g.fillText(sub, 256, 88);
      const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.57), new THREE.MeshBasicMaterial({ map: t })); m.position.set(0, y, D / 2 + 0.02); S.scene.add(m);
    };
    const loader = new THREE.TextureLoader(), picks = [], ray = new THREE.Raycaster();
    const shadow = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.16, depthWrite: false });
    const today = new Date().toISOString().slice(0, 10);
    rows.forEach((M, row) => {
      const order = [M.hero, ...M.props], n = Math.min(M.count, order.length), floor = top - (row + 1) * H + T / 2;
      const slots = order.slice(0, n).map((_, i) => i).sort((a, b) => (a % 2) - (b % 2) || a - b);
      order.slice(0, n).forEach(([file, name, w], i) => {
        const g = new THREE.Group(), slot = slots.indexOf(i), cnt = Math.max(n, 5);
        loader.load(base + M.key + '/' + file + '.webp', tex => {
          tex.encoding = THREE.sRGBEncoding;
          const asp = tex.image.height / tex.image.width; let pw = Math.max(0.55, Math.min(2.0, w / 320 * 10)), ph = pw * asp;
          if (ph > H - 0.45) { ph = H - 0.45; pw = ph / asp; }
          const card = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.08, side: THREE.DoubleSide }));
          card.position.y = ph / 2; g.add(card);
          const sh = new THREE.Mesh(new THREE.CircleGeometry(pw * 0.42, 24), shadow); sh.rotation.x = -Math.PI / 2; sh.scale.y = 0.35; sh.position.y = 0.01; g.add(sh);
          g.userData.card = card; S.draw();
        });
        g.position.set(Math.min(W / 2 - 0.7, -W / 2 + 0.9 + (W - 1.6) * ((slot + 0.5) / cnt)), floor, w >= 40 ? -0.35 : 0.3); g.rotation.y = (slot % 2 ? -1 : 1) * 0.12;
        // 오늘 놓인 것은 톡 떨어지듯
        g.userData = { name, title: M.title, d: M.days[i], born: M.days[i] === today && !reduce() ? 0 : -1 };
        S.scene.add(g); picks.push(g);
      });
      label(M.title, `기도한 날 ${M.count}일`, floor - T - 0.3);
    });
    const place = () => { const d = S.dist || 14; S.camera.position.set(Math.sin(yaw) * d, Math.sin(pitch) * d + 0.3, Math.cos(yaw) * d); S.camera.lookAt(0, -0.15, 0); };
    S.fit = () => { const k = 2 * Math.tan(15 * Math.PI / 180); S.dist = Math.max((R * H + 1.8) / k, (W + 1.4) / (k * S.camera.aspect)); place(); };
    function select(g) {
      if (sel && sel.userData.card) sel.userData.card.scale.setScalar(1);
      sel = g; const el = info(); S.draw(); if (!el) return;
      if (!g) { el.innerHTML = '<p class="hint">소품을 누르면 이름과 놓인 날이 보여요. 밀어서 선반을 돌려 볼 수 있어요.</p>'; return; }
      if (g.userData.card) g.userData.card.scale.setScalar(1.08); S.draw();
      el.innerHTML = `<div class="pick3d"><small>${esc(g.userData.title)} · ${g.userData.d ? md(g.userData.d) + '에 놓였어요' : ''}</small><p>${esc(g.userData.name)}</p></div>`;
    }
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
      if (!g) { el.innerHTML = `<p class="hint">${coils.length ? '끈을 누르면 그해의 기록이 보여요.' : '한 해가 끝나면 그해의 끈을 감아 여기에 넣어요.'} 밀어서 상자를 돌려 볼 수 있어요.</p>`; return; }
      g.position.y = 0.25; S.draw();
      const Y = g.userData.Y;
      el.innerHTML = `<div class="pick3d"><small>${Y.y}년의 끈 · 기도한 날 ${Y.days}일 · 응답 매듭 ${Y.answers.length}개</small>${Y.long ? `<p>오래 이어 온 기도: ${esc(Y.long)}</p>` : ''}${Y.answers.length ? `<ul>${Y.answers.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}</div>`;
    }
    return S;
  }

  return { cord, shelf, chest };
})();
