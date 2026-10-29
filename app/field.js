/* DanceWeather home 3D field: radar towers on the map, or ten nights as hour blocks.
   createField(VEN) builds it once the venues are known; returns null when WebGL or three.js is missing. */
window.createField = function (VEN) {
  if (!window.THREE) return null;
  const stage = document.getElementById("stage"); if (!stage) return null;
  let renderer; try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch (e) { return null; }
  if (!renderer.getContext()) return null;
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  stage.appendChild(renderer.domElement);
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(30, 1, .1, 400);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x808890, .95));
  const sun = new THREE.DirectionalLight(0xffffff, .6); sun.position.set(-14, 26, 16); scene.add(sun);
  const flash = new THREE.PointLight(0xffffff, 0, 90); flash.position.set(0, 16, 4); scene.add(flash);
  const tok = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || "#888888";
  const C = n => new THREE.Color(tok(n));
  const now = () => performance.now() / 1000;

  /* radar: the city as a thin slab, a tower per venue */
  const S = 18, mx = x => (x - 195) / S, mz = y => (y - 220) / S;
  const MAN = [[36,0],[186,0],[150,37],[140,112],[129,185],[60,211],[15,211],[15,168],[30,56]];
  const BKQ = [[196,0],[390,0],[390,440],[0,440],[0,403],[15,315],[55,245],[90,212],[135,223],[156,185],[174,111],[186,37]];
  function slab(pts) {
    const sh = new THREE.Shape();
    pts.forEach(([x, y], i) => { const X = mx(x), Y = -mz(y); if (i) sh.lineTo(X, Y); else sh.moveTo(X, Y); });
    const g = new THREE.ExtrudeGeometry(sh, { depth: .22, bevelEnabled: false }); g.rotateX(-Math.PI / 2); return g;
  }
  const radar = new THREE.Group(); scene.add(radar);
  const landMat = new THREE.MeshStandardMaterial({ roughness: .9, metalness: 0 });
  radar.add(new THREE.Mesh(slab(MAN), landMat)); radar.add(new THREE.Mesh(slab(BKQ), landMat));
  const RW = 390 / S, RD = 440 / S;
  const waterMat = new THREE.MeshBasicMaterial();
  const water = new THREE.Mesh(new THREE.PlaneGeometry(RW + .8, RD + .8), waterMat); water.rotation.x = -Math.PI / 2; water.position.y = -.02; radar.add(water);
  const CX = mx(220), CZ = mz(210);
  const ringMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: .45, depthWrite: false });
  [70, 140].forEach(r => { const m = new THREE.Mesh(new THREE.RingGeometry(r / S - .03, r / S + .03, 96), ringMat); m.rotation.x = -Math.PI / 2; m.position.set(CX, .235, CZ); radar.add(m); });
  const sweepMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: .16, depthWrite: false, side: THREE.DoubleSide });
  const sweep = new THREE.Mesh(new THREE.CircleGeometry(150 / S, 48, 0, .7), sweepMat); sweep.rotation.x = -Math.PI / 2; sweep.position.set(CX, .24, CZ); radar.add(sweep);
  const HGT = [0, 1.1, 1.9, 2.8, 3.9, 5.3], RAD = [.2, .3, .36, .42, .5, .58];
  const towerGeo = new THREE.CylinderGeometry(1, 1, 1, 28); towerGeo.translate(0, .5, 0);
  const glowGeo = new THREE.CircleGeometry(1, 40);
  const T = {}, TL = [];
  Object.keys(VEN).forEach(k => {
    const v = VEN[k];
    const mat = new THREE.MeshStandardMaterial({ roughness: .45, metalness: .05 });
    const m = new THREE.Mesh(towerGeo, mat); m.position.set(mx(v.x), .22, mz(v.y)); m.userData.key = k; m.visible = false; radar.add(m);
    const gmat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    const g = new THREE.Mesh(glowGeo, gmat); g.rotation.x = -Math.PI / 2; g.position.set(mx(v.x), .232, mz(v.y)); g.visible = false; radar.add(g);
    const o = { key: k, m, mat, g, gmat, h: 0, vel: 0, tgt: 0, r: .3, lvl: 1, wake: 0, ph: Math.random() * 6.28 }; T[k] = o; TL.push(o);
  });
  const selRing = new THREE.Mesh(new THREE.RingGeometry(.86, 1, 48), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  selRing.rotation.x = -Math.PI / 2; selRing.visible = false; radar.add(selRing);

  /* week: one block per hour, noon to 2P next day, one row per night (tonight at the front) */
  const COLS = 26, ROWS = 10, N = COLS * ROWS, PX = .62, PZ = 1.15;
  const week = new THREE.Group(); scene.add(week); week.visible = false;
  const boxGeo = new THREE.BoxGeometry(1, 1, 1); boxGeo.translate(0, .5, 0);
  const wMat = new THREE.MeshStandardMaterial({ roughness: .62, metalness: 0 });
  const inst = new THREE.InstancedMesh(boxGeo, wMat, N); inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  { const c0 = new THREE.Color(0x8a969d); for (let i = 0; i < N; i++) inst.setColorAt(i, c0); }
  week.add(inst);
  const WFW = COLS * PX + 1, WFD = ROWS * PZ + .6;
  const wFloorMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: .7 });
  const wFloor = new THREE.Mesh(new THREE.PlaneGeometry(WFW, WFD), wFloorMat); wFloor.rotation.x = -Math.PI / 2; wFloor.position.y = -.02; week.add(wFloor);
  const rowMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: .55 });
  const rowMark = new THREE.Mesh(new THREE.PlaneGeometry(WFW - .4, PZ * .92), rowMat); rowMark.rotation.x = -Math.PI / 2; rowMark.position.y = -.01; week.add(rowMark);
  const midMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: .6 });
  const mid = new THREE.Mesh(new THREE.PlaneGeometry(.05, WFD), midMat); mid.rotation.x = -Math.PI / 2; mid.position.set((11.5 - (COLS - 1) / 2) * PX, -.005, 0); week.add(mid);
  const nowMat = new THREE.MeshBasicMaterial();
  const WX = i => ((i % COLS) - (COLS - 1) / 2) * PX, WZ = i => (ROWS - 1) / 2 * PZ - Math.floor(i / COLS) * PZ;
  const nowMark = new THREE.Mesh(new THREE.PlaneGeometry(PX * .98, PZ * .8), nowMat); nowMark.rotation.x = -Math.PI / 2; nowMark.visible = false; week.add(nowMark);
  const wh = new Float32Array(N).fill(.04), wt = new Float32Array(N).fill(.04), wv = new Float32Array(N), ww = new Float32Array(N);
  let cells = [];
  const dummy = new THREE.Object3D();

  let mode = "radar", ni = 0, selKey = null, selCell = -1, storm = false;
  const api = { onPick: null };

  function recolor() {
    const bg = C("--surface"), line = C("--line"), ink = C("--ink"), LC = [null, C("--l1"), C("--l2"), C("--l3"), C("--l4"), C("--l5")];
    const dark = (.2126 * bg.r + .7152 * bg.g + .0722 * bg.b) < .4;
    landMat.color.copy(bg);
    waterMat.color.copy(C("--surface-2")).lerp(C("--cool"), dark ? .22 : .16);
    ringMat.color.copy(LC[1]); sweepMat.color.copy(LC[1]); selRing.material.color.copy(ink);
    for (const o of TL) { const c = LC[o.lvl || 1]; o.mat.color.copy(c); o.mat.emissive.copy(c).multiplyScalar(dark ? .28 : .06); o.gmat.color.copy(c); }
    wFloorMat.color.copy(C("--surface-2")); rowMat.color.copy(C("--mid")); midMat.color.copy(C("--muted")); nowMat.color.copy(C("--accent"));
    const col = new THREE.Color();
    for (let j = 0; j < N; j++) {
      const c = cells[j]; let lv = 0; if (c) c.list.forEach(p => { if (p.lvl > lv) lv = p.lvl; });
      if (!lv) col.copy(line); else col.copy(LC[lv]);
      if (Math.floor(j / COLS) !== ni) col.lerp(bg, .55);
      if (j === selCell) col.copy(ink);
      inst.setColorAt(j, col);
    }
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  }
  api.setGrid = function (grid) {
    cells = grid; const t0 = now();
    for (let j = 0; j < N; j++) { const c = cells[j]; wt[j] = c && c.list.length ? .12 + c.list.length * .36 : .04; ww[j] = t0 + (reduce ? 0 : (j % COLS) * .012 + Math.floor(j / COLS) * .02); }
    needFit = true; recolor(); kick();
  };
  api.setNow = function (col) { if (col == null || col < 0 || col >= COLS) { nowMark.visible = false; return; } nowMark.visible = true; nowMark.position.set(WX(col), -.008, WZ(col)); };
  api.setNight = function (i, day) {
    ni = i; storm = day.kind === "storm" || day.kind === "severe";
    const on = {}; day.list.forEach(p => { if (p.v && T[p.v] && (!on[p.v] || p.lvl > on[p.v].lvl)) on[p.v] = p; });
    const t0 = now(); let k = 0;
    for (const o of TL) { const p = on[o.key]; o.tgt = p ? HGT[p.lvl] : 0; if (p) { o.lvl = p.lvl; o.r = RAD[p.lvl]; if (!reduce) o.vel += 2; } o.wake = t0 + (reduce ? 0 : (k++) * .012); }
    rowMark.position.z = (ROWS - 1) / 2 * PZ - Math.min(i, ROWS - 1) * PZ;
    needFit = true; recolor(); kick();
  };
  api.selectVenue = function (k) { selKey = k; const o = k && T[k]; if (o && !reduce) o.vel += 5; kick(); };
  api.selectCell = function (i) { if (i !== selCell) { selCell = i; if (i >= 0 && !reduce) wv[i] += 6; } recolor(); kick(); };
  api.setMode = function (m) {
    mode = m; radar.visible = m === "radar"; week.visible = m === "week"; const t0 = now();
    if (m === "week") { for (let j = 0; j < N; j++) { wh[j] = .04; wv[j] = 0; ww[j] = t0 + (reduce ? 0 : (j % COLS) * .014 + Math.floor(j / COLS) * .03); } }
    else { for (const o of TL) { o.h = 0; o.vel = 0; o.wake = t0 + (reduce ? 0 : Math.random() * .35); } }
    const L = lim(); yawT = YAW0; elevT = L.e; needFit = true; kick();
  };

  /* camera: held within 20 degrees of the starting view */
  const YAW0 = -.3, LIM = 20 * Math.PI / 180;
  const lim = () => { const e = mode === "radar" ? .95 : .6; return { y0: YAW0 - LIM, y1: YAW0 + LIM, e0: e - LIM, e1: e + LIM, e }; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const soft = (v, a, b) => v < a ? a - Math.min(.07, (a - v) * .25) : v > b ? b + Math.min(.07, (v - b) * .25) : v;
  let yaw = YAW0, elev = .95, yawT = yaw, elevT = elev, dist = 40, distT = 40, offX = 0, offY = 0, offXT = 0, offYT = 0, lookY = 0, needFit = true;
  let swayAmt = reduce ? 0 : 1, swayHold = 0;
  let SW = 1, SH = 1, BP = [];
  const corner = new THREE.Vector3();
  function buildBP() {
    BP = []; let mh = 0;
    if (mode === "radar") {
      const hw = RW / 2 + .2, hd = RD / 2 + .2; [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]].forEach(([x, z]) => BP.push([x, 0, z]));
      for (const o of TL) if (o.tgt > 0) { BP.push([o.m.position.x, o.tgt + .4, o.m.position.z]); mh = Math.max(mh, o.tgt); }
      lookY = mh * .22;
    } else {
      const hw = WFW / 2, hd = WFD / 2; [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]].forEach(([x, z]) => BP.push([x, 0, z]));
      for (let j = 0; j < N; j++) if (wt[j] > .05) { BP.push([WX(j), wt[j] + .35, WZ(j)]); mh = Math.max(mh, wt[j]); }
      lookY = mh * .3;
    }
  }
  function bounds(y, e, d) {
    cam.position.set(Math.sin(y) * Math.cos(e) * d, Math.sin(e) * d, Math.cos(y) * Math.cos(e) * d);
    cam.lookAt(0, lookY, 0); cam.updateMatrixWorld();
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const p of BP) { corner.set(p[0], p[1], p[2]).project(cam); x0 = Math.min(x0, corner.x); x1 = Math.max(x1, corner.x); y0 = Math.min(y0, corner.y); y1 = Math.max(y1, corner.y); }
    return [x0, x1, y0, y1];
  }
  function fit(y, e, snap) {
    if (cam.view && cam.view.enabled) cam.clearViewOffset();
    const top = 1 - 2 * Math.min(74, SH * .32) / SH, bot = -1 + 2 * 16 / SH, aw = 1.92, ah = top - bot;
    let lo = snap ? 4 : distT * .75, hi = snap ? 400 : distT * 1.35, b;
    for (let k = 0; k < (snap ? 18 : 9); k++) { const m = (lo + hi) / 2; b = bounds(y, e, m); if (b[1] - b[0] <= aw && b[3] - b[2] <= ah) hi = m; else lo = m; }
    b = bounds(y, e, hi); distT = hi; offXT = ((b[0] + b[1]) / 2) * SW / 2; offYT = ((top + bot) / 2 - (b[2] + b[3]) / 2) * SH / 2;
    if (snap) { dist = distT; offX = offXT; offY = offYT; }
  }
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return;
    SW = w; SH = h; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); needFit = true; kick();
  }
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage); else window.addEventListener("resize", resize);

  /* drag to turn, tap to pick */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); let down = null;
  function pick(e) {
    const r = stage.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, cam);
    if (mode === "radar") { const hit = ray.intersectObjects(TL.filter(o => o.h > .05).map(o => o.m)); return hit.length ? { type: "venue", key: hit[0].object.userData.key } : null; }
    const hit = ray.intersectObject(inst); return hit.length && hit[0].instanceId != null ? { type: "cell", i: hit[0].instanceId } : null;
  }
  stage.addEventListener("pointerdown", e => { if (e.target.closest(".lnk,a")) return; swayHold = now() + 2.5; down = { x: e.clientX, y: e.clientY, yaw: yawT, elev: elevT, moved: false, id: e.pointerId }; });
  stage.addEventListener("pointermove", e => {
    if (down && e.pointerId === down.id) {
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (Math.abs(dx) + Math.abs(dy) > 6 && !down.moved) { down.moved = true; try { stage.setPointerCapture(e.pointerId); } catch (_) {} }
      if (down.moved) { const L = lim(); yawT = soft(down.yaw - dx * .006, L.y0, L.y1); elevT = soft(down.elev + dy * .005, L.e0, L.e1); swayHold = now() + 2.5; kick(); }
      return;
    }
    if (e.pointerType === "mouse") { const p = pick(e); stage.style.cursor = p ? "pointer" : ""; }
  });
  const release = () => { const L = lim(); yawT = clamp(yawT, L.y0, L.y1); elevT = clamp(elevT, L.e0, L.e1); kick(); };
  stage.addEventListener("pointerup", e => { if (down && !down.moved) { const p = pick(e); if (p && api.onPick) api.onPick(p); } if (down && down.moved) release(); down = null; });
  stage.addEventListener("pointercancel", () => { if (down && down.moved) release(); down = null; });

  const reColor = () => { recolor(); kick(); };
  if (window.matchMedia) matchMedia("(prefers-color-scheme: dark)").addEventListener("change", reColor);
  new MutationObserver(reColor).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  let running = false, visible = true, last = 0, idleSince = 0, nextFlash = 0, lastDraw = 0, lastFit = 0;
  function kick() { idleSince = now(); if (!running && visible && !document.hidden) { running = true; last = 0; requestAnimationFrame(frame); } }
  api.kick = kick;
  if (window.IntersectionObserver) new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) kick(); }).observe(stage);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) kick(); });

  function frame(ms) {
    const t = ms / 1000, dt = last ? Math.min(.033, t - last) : .016; last = t;
    yaw += (yawT - yaw) * Math.min(1, dt * 6); elev += (elevT - elev) * Math.min(1, dt * 6);
    const urgent0 = !!down || Math.abs(yawT - yaw) > .001 || Math.abs(elevT - elev) > .001;
    if (!reduce) { const want = down || t < swayHold ? 0 : 1; swayAmt += (want - swayAmt) * Math.min(1, dt * (want ? .6 : 5)); }
    const sy = swayAmt * .1 * Math.sin(t * 2 * Math.PI / 14), se = swayAmt * .04 * Math.sin(t * 2 * Math.PI / 19 + 1.3);
    const L = lim(), ob = down ? .07 : 0, vy = clamp(yaw + sy, L.y0 - ob, L.y1 + ob), ve = clamp(elev + se, L.e0 - ob, L.e1 + ob);
    if (needFit) { buildBP(); fit(vy, ve, true); needFit = false; lastFit = t; }
    else if (urgent0 || t - lastFit > .12) { fit(vy, ve, false); lastFit = t; }
    const k = Math.min(1, dt * 4); dist += (distT - dist) * k; offX += (offXT - offX) * k; offY += (offYT - offY) * k;
    cam.position.set(Math.sin(vy) * Math.cos(ve) * dist, Math.sin(ve) * dist, Math.cos(vy) * Math.cos(ve) * dist);
    cam.lookAt(0, lookY, 0); cam.setViewOffset(SW, SH, offX, offY, SW, SH);
    let busy = false;
    if (mode === "radar") {
      for (const o of TL) {
        if (t >= o.wake) { const a = (o.tgt - o.h) * 140 - o.vel * 13; o.vel += a * dt; o.h += o.vel * dt; if (Math.abs(o.tgt - o.h) > .002 || Math.abs(o.vel) > .01) busy = true; } else busy = true;
        const hh = Math.max(0, o.h); o.m.visible = hh > .03; o.g.visible = hh > .03; o.m.scale.set(o.r, Math.max(.001, hh), o.r);
        const pulse = reduce ? 1 : 1 + .14 * Math.sin(t * 2.4 + o.ph); o.g.scale.setScalar(o.r * 2.7 * (o.lvl >= 5 ? pulse : 1)); o.gmat.opacity = Math.min(.45, hh / 5);
      }
      if (!reduce) sweep.rotation.z = -t * 1.1;
      const so = selKey && T[selKey];
      if (so && so.h > .05) { selRing.visible = true; selRing.position.set(so.m.position.x, .25, so.m.position.z); selRing.scale.setScalar(so.r * 1.7 + (reduce ? 0 : .06 * Math.sin(t * 3))); } else selRing.visible = false;
    } else {
      for (let j = 0; j < N; j++) {
        if (t >= ww[j]) { const a = (wt[j] - wh[j]) * 140 - wv[j] * 13; wv[j] += a * dt; wh[j] += wv[j] * dt; if (Math.abs(wt[j] - wh[j]) > .002 || Math.abs(wv[j]) > .01) busy = true; } else busy = true;
        dummy.position.set(WX(j), 0, WZ(j)); dummy.scale.set(PX * .9, Math.max(.03, wh[j] + (j === selCell ? .3 : 0)), PZ * .72); dummy.updateMatrix(); inst.setMatrixAt(j, dummy.matrix);
      }
      inst.instanceMatrix.needsUpdate = true;
    }
    if (storm && !reduce) { if (t > nextFlash) { flash.intensity = 2; nextFlash = t + 5 + Math.random() * 7; } flash.intensity *= .86; busy = true; } else flash.intensity = 0;
    const ambient = mode === "radar" && !reduce;
    const urgent = busy || down || urgent0;
    if (urgent || t - lastDraw >= 1 / 30 - .002) { renderer.render(scene, cam); lastDraw = t; }
    if (visible && !document.hidden && (ambient || busy || swayAmt > .001 || Math.abs(distT - dist) > .01 || t - idleSince < .5)) requestAnimationFrame(frame); else running = false;
  }
  resize();
  return api;
};
