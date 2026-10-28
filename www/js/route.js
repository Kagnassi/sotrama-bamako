/* Sotrama Bamako - a coach trip between two cities: national road through the savanna,
 * villages, police checkpoints, toll, fuel stations, kilometre markers, departure and arrival bus stations. */
(function () {
  "use strict";
  const SB = (window.SB = window.SB || {});

  SB.buildRoute = function (scene, trip, opts) {
    const quality = (opts && opts.quality) || "haute";
    const ECO = quality === "eco";
    let seed = 7 + trip.km * 13 + trip.to.length * 101;
    const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const rr = (a, b) => a + (b - a) * rnd();
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();
    const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.95, metalness: 0 }, o || {}));
    const C = (hex, v) => { const c = new THREE.Color(hex); if (v) c.multiplyScalar(1 - v / 2 + rnd() * v); return c.convertSRGBToLinear(); };
    const TX = SB.tex;
    const CITY = SB.mali.CITIES;
    const destName = CITY[trip.to].name, fromName = CITY[trip.from].name;

    /* ---- the road: x = f(s), the coach drives north (towards -z), s = -z ---- */
    const L = Math.min(9200, 2400 + trip.km * 10);
    const HW = 4.6, LANE = 2.3;
    const ph1 = rr(0, 6.28), ph2 = rr(0, 6.28);
    const ramp = (s) => Math.min(1, Math.max(0, s / 300), Math.max(0, (L - s) / 300));
    const f = (s) => ramp(s) * (85 * Math.sin((2 * Math.PI * s) / 1900 + ph1) + 30 * Math.sin((2 * Math.PI * s) / 730 + ph2));
    const pos = (s) => [f(s), -s];
    const dir = (s) => { const a = pos(s - 2), b = pos(s + 2), l = Math.hypot(b[0] - a[0], b[1] - a[1]); return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
    const right = (s) => { const d = dir(s); return [-d[1], d[0]]; };
    const at = (s, off) => { const p = pos(s), r = right(s); return [p[0] + r[0] * off, p[1] + r[1] * off]; };
    const progress = (x, z) => Math.max(0, Math.min(L, -z));

    const nodes = [], roads = [];
    const STEP = 60;
    for (let s = -60; s <= L + 60; s += STEP) nodes.push({ x: f(s), z: -s, r: 0, nb: [], roads: [], disc: 0, deadEnd: false });
    for (let i = 1; i < nodes.length; i++) {
      const A = nodes[i - 1], B = nodes[i], len = Math.hypot(B.x - A.x, B.z - A.z), dx = (B.x - A.x) / len, dz = (B.z - A.z) / len;
      const rd = { a: i - 1, b: i, w: HW * 2, len, dx, dz, nx: -dz, nz: dx, ta: 0, tb: 0, main: true };
      roads.push(rd); A.nb.push(i); B.nb.push(i - 1); A.roads.push(roads.length - 1); B.roads.push(roads.length - 1);
    }
    nodes[0].deadEnd = nodes[nodes.length - 1].deadEnd = true;

    // extra drivable areas: bus stations, lay-bys at villages and stations
    const lots = [];
    function inRoad(x, z) {
      const s = -z;
      if (s > -70 && s < L + 70 && Math.abs(x - f(s)) <= HW) return true;
      for (const l of lots) if (Math.hypot(x - l.x, z - l.z) <= l.r) return true;
      return false;
    }
    function nearestRoad(x, z) {
      const i = Math.max(0, Math.min(roads.length - 1, Math.floor((-z + 60) / STEP)));
      return { d: Math.abs(x - f(-z)) - HW, rd: roads[i] };
    }

    /* ---- builders ---- */
    function Builder() { return { p: [], n: [], uv: [], c: [], idx: [] }; }
    const WHITE = new THREE.Color(1, 1, 1);
    function quad(b, v0, v1, v2, v3, nrm, uvs, col) {
      const ux = v1[0] - v0[0], uy = v1[1] - v0[1], uz = v1[2] - v0[2], wx = v2[0] - v0[0], wy = v2[1] - v0[1], wz = v2[2] - v0[2];
      const cx = uy * wz - uz * wy, cy = uz * wx - ux * wz, cz = ux * wy - uy * wx;
      if (cx * nrm[0] + cy * nrm[1] + cz * nrm[2] < 0) { [v1, v3] = [v3, v1]; uvs = [uvs[0], uvs[3], uvs[2], uvs[1]]; }
      const base = b.p.length / 3;
      for (const v of [v0, v1, v2, v3]) { b.p.push(v[0], v[1], v[2]); b.n.push(nrm[0], nrm[1], nrm[2]); b.c.push(col.r, col.g, col.b); }
      for (const t of uvs) b.uv.push(t[0], t[1]);
      b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    function finish(b, mat, shadows) {
      if (!b.idx.length) return null;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(b.p, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(b.n, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(b.uv, 2)); g.setAttribute("color", new THREE.Float32BufferAttribute(b.c, 3)); g.setIndex(b.idx);
      const m = new THREE.Mesh(g, mat); m.castShadow = !!shadows; m.receiveShadow = true; scene.add(m); return m;
    }
    function disc(b, x, z, y, r, uvs) {
      for (let i = 0; i < 28; i++) {
        const a0 = (i / 28) * 6.2832, a1 = ((i + 1) / 28) * 6.2832;
        const p = [[x, z], [x + Math.cos(a0) * r, z + Math.sin(a0) * r], [x + Math.cos(a1) * r, z + Math.sin(a1) * r], [x, z]];
        quad(b, ...p.map((q) => [q[0], y, q[1]]), [0, 1, 0], p.map((q) => [q[0] / uvs, q[1] / uvs]), WHITE);
      }
    }
    function boxFaces(b, cx, y0, cz, w, d, h, ang, tint, uvW, uvH, roofB) {
      const c = Math.cos(ang), s = Math.sin(ang);
      const P = (lx, lz) => [cx + lx * c + lz * s, cz - lx * s + lz * c];
      const k = [P(-w / 2, -d / 2), P(w / 2, -d / 2), P(w / 2, d / 2), P(-w / 2, d / 2)];
      for (let i = 0; i < 4; i++) {
        const a = k[i], bb = k[(i + 1) % 4], ex = bb[0] - a[0], ez = bb[1] - a[1], Lq = Math.hypot(ex, ez);
        quad(b, [bb[0], y0, bb[1]], [a[0], y0, a[1]], [a[0], y0 + h, a[1]], [bb[0], y0 + h, bb[1]], [ez / Lq, 0, -ex / Lq], [[0, 0], [Lq / uvW, 0], [Lq / uvW, h / uvH], [0, h / uvH]], tint);
      }
      if (roofB) quad(roofB, [k[0][0], y0 + h, k[0][1]], [k[3][0], y0 + h, k[3][1]], [k[2][0], y0 + h, k[2][1]], [k[1][0], y0 + h, k[1][1]], [0, 1, 0], [k[0], k[3], k[2], k[1]].map((q) => [q[0] / 6, q[1] / 6]), WHITE);
    }
    const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
    const M = (x, y, z, sx, sy, sz, rx, ry, rz) => { _e.set(rx || 0, ry || 0, rz || 0); _q.setFromEuler(_e); return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)); };
    const INST = { box: [], cyl: [], cone: [], ico: [], stem: [], trunk: [], hut: [], roofc: [] };
    const iBox = (x, y0, z, sx, sy, sz, col, ry) => INST.box.push({ m: M(x, y0 + sy / 2, z, sx, sy, sz, 0, ry || 0, 0), c: col });
    const iCyl = (x, y, z, r, h, col, rx, ry, rz) => INST.cyl.push({ m: M(x, y, z, 2 * r, h, 2 * r, rx || 0, ry || 0, rz || 0), c: col });
    const iCone = (x, y0, z, r, h, col) => INST.cone.push({ m: M(x, y0 + h / 2, z, r, h, r), c: col });
    const iIco = (x, y, z, r, col, sy) => INST.ico.push({ m: M(x, y, z, r, r * (sy || 1), r, 0, rnd() * 3, 0), c: col });
    function flushInst(geo, list, mat, flat) {
      if (!list.length) return;
      const TILE = 600, tiles = new Map();
      for (const it of list) { const e = it.m.elements, k = Math.floor(e[12] / TILE) + "," + Math.floor(e[14] / TILE); if (!tiles.has(k)) tiles.set(k, []); tiles.get(k).push(it); }
      const material = mat || std({ flatShading: !!flat });
      for (const items of tiles.values()) {
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9, sc = 0;
        for (const it of items) { const e = it.m.elements; x0 = Math.min(x0, e[12]); x1 = Math.max(x1, e[12]); y0 = Math.min(y0, e[13]); y1 = Math.max(y1, e[13]); z0 = Math.min(z0, e[14]); z1 = Math.max(z1, e[14]); sc = Math.max(sc, Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6])); }
        const g = geo.clone(); g.boundingSphere = new THREE.Sphere(new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + sc);
        const im = new THREE.InstancedMesh(g, material, items.length);
        items.forEach((it, i) => { im.setMatrixAt(i, it.m); im.setColorAt(i, it.c); });
        im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.castShadow = true; im.receiveShadow = true; scene.add(im);
      }
    }

    const texSav = TX.savanna(), texRoad = TX.asphaltRoad(), texPlain = TX.asphaltPlain(), texSand = TX.sand(), texThatch = TX.thatch();
    const facades = TX.facades(), texRoof = TX.roof();

    /* ---- ground, road, shoulders ---- */
    texSav.repeat.set(160, 420);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, L + 3000), std({ map: texSav, polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 4 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, -L / 2); ground.receiveShadow = true; scene.add(ground);
    const roadB = Builder(), shB = Builder(), lotB = Builder();
    for (let s = -80; s < L + 80; s += 10) {
      const a0 = at(s, -HW), a1 = at(s, HW), b0 = at(s + 10, -HW), b1 = at(s + 10, HW);
      quad(roadB, [a0[0], 0.08, a0[1]], [a1[0], 0.08, a1[1]], [b1[0], 0.08, b1[1]], [b0[0], 0.08, b0[1]], [0, 1, 0], [[s / 10, 0], [s / 10, 1], [(s + 10) / 10, 1], [(s + 10) / 10, 0]], WHITE);
      const c0 = at(s, -HW - 3), c1 = at(s, HW + 3), d0 = at(s + 10, -HW - 3), d1 = at(s + 10, HW + 3);
      quad(shB, [c0[0], 0.03, c0[1]], [c1[0], 0.03, c1[1]], [d1[0], 0.03, d1[1]], [d0[0], 0.03, d0[1]], [0, 1, 0], [[s / 6, 0], [s / 6, 2.6], [(s + 10) / 6, 2.6], [(s + 10) / 6, 0]], WHITE);
    }
    function addLot(s, off, r, paved) {
      const p = at(s, off); lots.push({ x: p[0], z: p[1], r }); disc(paved ? lotB : shB, p[0], p[1], paved ? 0.09 : 0.035, r + (paved ? 0 : 3), paved ? 12 : 6);
      if (!paved) disc(lotB, p[0], p[1], 0.09, r, 12);
      return p;
    }

    /* ---- stops: departure station, villages, arrival station ---- */
    const stops = [], stations = [], checkpoints = [], landmarks = [], parked = [];
    function makeStop(name, s, kind) {
      const zone = at(s, HW + (kind === "village" ? 3 : 8)), shelter = at(s, HW + (kind === "village" ? 10 : 20)), d = dir(s), r = right(s);
      const st = { i: stops.length, name, kind, s, zx: zone[0], zz: zone[1], sx: shelter[0], sz: shelter[1], nx: r[0], nz: r[1], dx: d[0], dz: d[1], ang: Math.atan2(d[0], d[1]), bank: "", waiting: [], spawnT: 0 };
      stops.push(st); return st;
    }
    // departure
    addLot(30, HW + 14, 24, true);
    makeStop("Gare routière de " + fromName, 30, "gare");
    // villages
    for (const [name, km] of trip.towns) {
      const s = (km / trip.km) * L;
      if (s < 200 || s > L - 250) continue;
      addLot(s, HW + 4, 9, false);
      makeStop(name, s, "village");
    }
    // arrival
    addLot(L - 40, HW + 14, 26, true);
    makeStop("Gare routière de " + destName, L - 40, "arrivee");

    // police checkpoints, toll, fuel stations
    const cpFracs = trip.km > 180 ? [0.1, 0.62] : [0.15];
    for (const fr of cpFracs) checkpoints.push({ kind: "police", s: fr * L });
    if (trip.km > 100) checkpoints.push({ kind: "peage", s: 0.36 * L });
    checkpoints.sort((a, b) => a.s - b.s);
    for (const cp of checkpoints) {
      const z = at(cp.s, LANE); cp.zx = z[0]; cp.zz = z[1]; cp.state = "pending"; cp.wait = 0;
      const d = dir(cp.s), ang = Math.atan2(d[0], d[1]);
      if (cp.kind === "police") {
        const h = at(cp.s - 6, HW + 6); iBox(h[0], 0, h[1], 3, 2.6, 3, C(0xe8e2d4), ang); iBox(h[0], 2.6, h[1], 3.6, 0.25, 3.6, C(0x2b3a5c), ang);
        for (const o of [HW + 1.2, -HW - 1.2]) { for (let k = -2; k <= 2; k++) { const c = at(cp.s + 10 + k * 2.2, o); iCone(c[0], 0.08, c[1], 0.3, 0.8, C(0xff6a1a)); } }
        const bar = at(cp.s - 2, HW + 2); iBox(bar[0], 0.9, bar[1], 0.18, 0.18, 4, C(0xffffff), ang + Math.PI / 2);
        cp.people = [at(cp.s - 2, HW + 1.4), at(cp.s + 3, HW + 2.2)];
        const sg = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.roadSign("CONTRÔLE DE POLICE", "ARRÊT OBLIGATOIRE", "#2b3a5c") })); const sp = at(cp.s - 60, HW + 4); sg.position.set(sp[0], 3.6, sp[1]); sg.scale.set(7, 2.7, 1); scene.add(sg);
      } else {
        const c = at(cp.s, 0); iBox(c[0], 5.5, c[1], 2 * HW + 10, 0.7, 7, C(0xf2b233), ang);
        for (const o of [-HW - 3.5, HW + 3.5, 0]) { const p = at(cp.s, o); iBox(p[0], 0, p[1], o === 0 ? 1.2 : 2.4, 5.5, o === 0 ? 3 : 4, C(0xe8e2d4), ang); }
        cp.people = [at(cp.s, HW + 2)];
        const sg = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.roadSign("PÉAGE", "2 000 F · ARRÊT", "#9a6a12") })); const sp = at(cp.s - 70, HW + 4); sg.position.set(sp[0], 3.6, sp[1]); sg.scale.set(7, 2.7, 1); scene.add(sg);
      }
    }
    const nStations = Math.max(1, Math.floor(trip.km / 170));
    for (let k = 1; k <= nStations; k++) {
      let s = (k / (nStations + 1)) * L + 120;
      while (checkpoints.some((c) => Math.abs(c.s - s) < 220) || stops.some((t) => Math.abs(t.s - s) < 160)) s += 140;
      const p = addLot(s, HW + 9, 14, true), d = dir(s), ang = Math.atan2(d[0], d[1]);
      iBox(p[0], 5.2, p[1], 12, 0.8, 16, C(0xc0392b), ang);
      for (const [lx, lz] of [[-4, -6], [4, -6], [-4, 6], [4, 6]]) { const q = [p[0] + Math.cos(ang) * lx + Math.sin(ang) * lz, p[1] - Math.sin(ang) * lx + Math.cos(ang) * lz]; iCyl(q[0], 2.6, q[1], 0.25, 5.2, C(0xe8e2d4)); }
      const sg = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.stationSign() })); const sp = at(s - 40, HW + 5); sg.position.set(sp[0], 4.5, sp[1]); sg.scale.set(7, 2.2, 1); scene.add(sg);
      const z = at(s, HW + 3); stations.push({ name: "Station", zx: z[0], zz: z[1], s });
    }
    // kilometre markers every 25 km
    for (let km = 25; km < trip.km; km += 25) {
      const s = (km / trip.km) * L, p = at(s, HW + 2.2);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.kmMarker(destName, trip.km - km) })); sp.position.set(p[0], 0.75, p[1]); sp.scale.set(0.8, 1.0, 1); scene.add(sp);
    }
    // big signs
    { const sp = at(140, HW + 6); const sg = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.roadSign(destName.toUpperCase(), "≈ " + trip.km + " km") })); sg.position.set(sp[0], 4, sp[1]); sg.scale.set(7, 2.7, 1); scene.add(sg); }
    { const sp = at(L - 380, HW + 6); const sg = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.roadSign("BIENVENUE À", destName.toUpperCase()) })); sg.position.set(sp[0], 4, sp[1]); sg.scale.set(7, 2.7, 1); scene.add(sg); }
    for (const st of stops) if (st.kind === "village") { const sp = at(st.s - 120, HW + 5); const sg = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.roadSign(st.name.toUpperCase(), null, "#f4f1ea") })); sg.material.color.set(0x333333); sg.position.set(sp[0], 3.2, sp[1]); sg.scale.set(5, 2, 1); scene.add(sg); }

    /* ---- scenery ---- */
    const FB = { banco: Builder(), plaster: Builder() }, roofB = Builder();
    const free = (x, z, m) => Math.abs(x - f(-z)) > HW + 6 + (m || 0) && !lots.some((l) => Math.hypot(x - l.x, z - l.z) < l.r + 6);
    function tree(x, z, kind) {
      const hv = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
      if (ECO && hv - Math.floor(hv) < 0.4) return;
      if (kind === "baobab") {
        const h = rr(6, 9);
        INST.trunk.push({ m: M(x, h / 2, z, rr(2.6, 3.6), h, rr(2.6, 3.6)), c: C(0x8d7a66, 0.15) });
        for (let k = 0; k < 5; k++) { const a = rnd() * 6.28; iCyl(x + Math.cos(a) * 1.2, h + 1.2, z + Math.sin(a) * 1.2, 0.25, 3.2, C(0x8d7a66, 0.1), Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8); }
        for (let k = 0; k < 3; k++) iIco(x + rr(-3, 3), h + rr(2.2, 3.2), z + rr(-3, 3), rr(1.4, 2.2), C(0x6f8a3c, 0.2), 0.6);
        return;
      }
      const big = kind === "karite", h = rr(2.2, 3.4), tr = big ? 0.3 : 0.22;
      INST.stem.push({ m: M(x, h / 2, z, 2 * tr, h, 2 * tr), c: C(0x5e4330, 0.2) });
      const r = big ? rr(2.8, 4) : rr(2, 3), col = kind === "neem" ? 0x56823a : kind === "karite" ? 0x5f7d34 : 0x6f8a3c;
      iIco(x, h + r * 0.5, z, r, C(col, 0.25), 0.75);
      iIco(x + rr(-1.4, 1.4), h + r * 0.9, z + rr(-1.4, 1.4), r * 0.65, C(col, 0.3), 0.8);
    }
    // savanna along the whole road
    const density = ECO ? 0.6 : 1;
    for (let s = -300; s < L + 300; s += 9 / density) {
      for (const side of [-1, 1]) {
        if (rnd() < 0.55) continue;
        const off = side * rr(HW + 10, 260), p = at(s, off);
        if (!free(p[0], p[1])) continue;
        const u = rnd();
        if (u < 0.08) tree(p[0], p[1], "baobab");
        else if (u < 0.5) tree(p[0], p[1], pick(["karite", "nere", "karite"]));
        else if (u < 0.6) iCone(p[0], 0, p[1], rr(0.8, 1.6), rr(1.6, 3.4), C(0xa8653a, 0.15)); // termite mound
        else iIco(p[0], 0.3, p[1], rr(0.6, 1.4), C(pick([0xb8a25e, 0x8c8a45, 0xa48f52]), 0.2), 0.55); // dry bush
      }
    }
    // a village: round huts with thatched roofs, square banco houses, granaries, fields, neem trees
    function village(s, size, side) {
      for (let k = 0; k < size; k++) {
        const off = side * rr(HW + 16, HW + 90) * (rnd() < 0.3 ? -1 : 1), p = at(s + rr(-120, 120), off);
        if (!free(p[0], p[1], 2)) continue;
        if (rnd() < 0.55) {
          const r = rr(1.8, 2.6), h = rr(2.2, 2.8);
          INST.hut.push({ m: M(p[0], h / 2, p[1], 2 * r, h, 2 * r), c: C(0xffffff, 0.12) });
          INST.roofc.push({ m: M(p[0], h + r * 0.55, p[1], r * 1.25, r * 1.2, r * 1.25), c: C(0xffffff, 0.15) });
        } else {
          const w = pick([6, 8, 10]), d = pick([5, 6, 8]);
          boxFaces(FB.banco, p[0], 0, p[1], w, d, rr(2.6, 3.4), rr(0, 3), C(0xffffff, 0.1), 4, 3, roofB);
        }
        if (rnd() < 0.3) { const q = [p[0] + rr(-6, 6), p[1] + rr(-6, 6)]; INST.hut.push({ m: M(q[0], 1.2, q[1], 1.6, 1.6, 1.6), c: C(0xd8b48a, 0.1) }); INST.roofc.push({ m: M(q[0], 2.6, q[1], 1.1, 1.2, 1.1), c: C(0xffffff, 0.1) }); }
        if (rnd() < 0.4) tree(p[0] + rr(-8, 8), p[1] + rr(-8, 8), "neem");
      }
      for (let k = 0; k < 4; k++) { // millet fields
        const p = at(s + rr(-200, 200), side * rr(40, 160));
        if (!free(p[0], p[1], 10)) continue;
        for (let r = 0; r < 8; r++) iBox(p[0] + r * 2.2 - 8, 0, p[1], 0.9, rr(0.8, 1.6), 22, C(pick([0x9a9a48, 0xb3a256, 0x7f8a3e]), 0.2));
      }
    }
    for (const st of stops) {
      if (st.kind === "village") { village(st.s, ECO ? 18 : 30, 1); village(st.s, ECO ? 10 : 16, -1); }
    }
    // town at both ends: denser houses
    function town(s0, s1) {
      for (let k = 0; k < (ECO ? 90 : 160); k++) {
        const s = rr(s0, s1), side = rnd() < 0.5 ? -1 : 1, off = side * rr(HW + 12, HW + 140), p = at(s, off);
        if (!free(p[0], p[1], 6)) continue;
        const w = pick([8, 8, 12]), d = pick([8, 12]), fl = pick([1, 1, 2]);
        boxFaces(rnd() < 0.5 ? FB.plaster : FB.banco, p[0], 0, p[1], w, d, fl * 3 + 0.6, Math.atan2(dir(s)[0], dir(s)[1]), C(pick([0xf3ede2, 0xe9c99a, 0xd9a877, 0xa9c6d6, 0xe6b3a3]), 0.08), 4, 3, roofB);
        if (rnd() < 0.3) tree(p[0] + 7, p[1] + 7, "neem");
      }
    }
    town(-150, 260); town(L - 380, L + 200);
    // parked coaches and minibuses at both stations
    for (const [s, off] of [[30, HW + 14], [L - 40, HW + 14]]) {
      const c = at(s, off), d = dir(s);
      for (let k = 0; k < 4; k++) parked.push({ x: c[0] + d[0] * (k * 6 - 9) + right(s)[0] * 16, z: c[1] + d[1] * (k * 6 - 9) + right(s)[1] * 16, ang: Math.atan2(right(s)[0], right(s)[1]), kind: "coach" });
      const b = at(s, off + 28), ang = Math.atan2(d[0], d[1]);
      boxFaces(FB.plaster, b[0], 0, b[1], 10, 30, 4.2, ang, C(0xe9e3d5), 4, 3, roofB);
    }
    // distant hills
    for (let k = 0; k < 18; k++) iIco(rr(-900, 900) + (rnd() < 0.5 ? -700 : 700), -12, rr(-L - 600, 600), rr(120, 260), C(0x9a7a50, 0.15), 0.3);

    // something to eat on the way: the shop of each station, the women selling at the village stops
    const food = [], vendors = [];
    for (const st of stations) { const p = at(st.s, HW + 15); food.push({ x: p[0], z: p[1], name: "Boutique de la station", item: "du pain et du thé", price: 500, energy: 80, kind: "station" }); }
    for (const st of stops) {
      if (st.kind !== "village") continue;
      const p = at(st.s + 5, HW + 9), q = at(st.s + 6.5, HW + 10.5);
      iBox(p[0], 0, p[1], 0.9, 0.82, 1.9, C(0x7a5534, 0.2), st.ang);
      iIco(p[0], 0.95, p[1], 0.3, C(0x9a4a22, 0.15), 0.6);
      vendors.push({ x: q[0], z: q[1], ang: Math.atan2(-st.nx, -st.nz), kind: "brochettes" });
      food.push({ x: p[0] - st.nx * 1.1, z: p[1] - st.nz * 1.1, name: "Vendeuse", item: "des brochettes et du pain", price: 500, energy: 55, kind: "brochettes" });
    }

    /* ---- flush ---- */
    finish(shB, std({ map: texSand, vertexColors: true, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }), false);
    finish(roadB, std({ map: texRoad, vertexColors: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }), false);
    finish(lotB, std({ map: texPlain, vertexColors: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), false);
    finish(FB.banco, std({ map: facades.banco, vertexColors: true }), true);
    finish(FB.plaster, std({ map: facades.plaster, vertexColors: true }), true);
    finish(roofB, std({ map: texRoof, vertexColors: true }), false);
    const hutTex = facades.banco.clone(); hutTex.needsUpdate = true; hutTex.repeat.set(3, 1);
    texThatch.repeat.set(2, 1);
    flushInst(new THREE.CylinderGeometry(0.5, 0.5, 1, 10), INST.hut, std({ map: hutTex }));
    flushInst(new THREE.ConeGeometry(1, 1, 10), INST.roofc, std({ map: texThatch }));
    flushInst(new THREE.BoxGeometry(1, 1, 1), INST.box);
    flushInst(new THREE.CylinderGeometry(0.5, 0.5, 1, 7), INST.cyl);
    flushInst(new THREE.CylinderGeometry(0.32, 0.5, 1, 7), INST.trunk, null, true);
    flushInst(new THREE.CylinderGeometry(0.4, 0.5, 1, 5, 1, true), INST.stem, null, true);
    flushInst(new THREE.ConeGeometry(1, 1, 7), INST.cone, null, true);
    flushInst(new THREE.IcosahedronGeometry(1, 0), INST.ico, null, true);

    landmarks.push({ name: destName, x: f(L), z: -L });
    return {
      kind: "route", trip, L, nodes, roads, stops, stations, checkpoints, landmarks, parked, inRoad, nearestRoad, progress, at, food, vendors,
      RING: 12, RIVER: null, water: null,
      bounds: { x0: -400, x1: 400, z0: -L - 200, z1: 200 },
      start: { x: at(30, HW + 14)[0] - 6, z: at(30, HW + 14)[1] + 14, h: Math.PI },
    };
  };
})();
