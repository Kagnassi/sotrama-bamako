/* Sotrama Bamako - the city: road network, river, bridges, districts, landmarks. */
(function () {
  "use strict";
  const SB = (window.SB = window.SB || {});

  SB.buildWorld = function (scene, opts) {
    const quality = (opts && opts.quality) || "haute";
    let seed = 20261028;
    const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const rr = (a, b) => a + (b - a) * rnd();
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();
    const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.95, metalness: 0 }, o || {}));

    const RIVER = [-62, 62];
    const RING = 12; // width of the roundabout carriageway

    /* ================= road network ================= */
    const nodes = [], byKey = {}, roads = [];
    const ROUND = { "0,-290": 16, "-240,-390": 12, "240,-190": 12, "60,190": 14, "300,290": 12 };
    function N(x, z) {
      const k = x + "," + z;
      if (byKey[k] === undefined) { byKey[k] = nodes.length; nodes.push({ x, z, r: ROUND[k] || 0, nb: [], roads: [] }); }
      return byKey[k];
    }
    function R(a, b, w) {
      if (nodes[a].nb.includes(b)) return;
      const id = roads.length; roads.push({ a, b, w });
      nodes[a].nb.push(b); nodes[b].nb.push(a); nodes[a].roads.push(id); nodes[b].roads.push(id);
    }
    const path = (pts, w) => { for (let i = 1; i < pts.length; i++) R(N(pts[i - 1][0], pts[i - 1][1]), N(pts[i][0], pts[i][1]), w); };
    // rive gauche: centre-ville grid
    const XN = [-360, -240, -120, 0, 120, 240, 360], ZN = [-90, -190, -290, -390, -490];
    for (const z of ZN) for (let i = 1; i < XN.length; i++) R(N(XN[i - 1], z), N(XN[i], z), z === -90 || z === -290 ? 15 : 11);
    for (const x of XN) for (let j = 1; j < ZN.length; j++) R(N(x, ZN[j - 1]), N(x, ZN[j]), x === 0 ? 15 : 11);
    // rive droite grid
    const XS = [-300, -180, -60, 60, 180, 300, 420], ZS = [90, 190, 290, 390];
    for (const z of ZS) for (let i = 1; i < XS.length; i++) R(N(XS[i - 1], z), N(XS[i], z), z === 90 || z === 290 ? 15 : 11);
    for (const x of XS) for (let j = 1; j < ZS.length; j++) R(N(x, ZS[j - 1]), N(x, ZS[j]), x === 60 ? 15 : 11);
    // three bridges over the Niger
    path([[-120, -90], [-180, 90]], 15); path([[120, -90], [60, 90]], 15); path([[360, -90], [420, 90]], 15);
    // west and north-west districts
    path([[-360, -190], [-560, -190], [-720, -250]], 11);
    path([[-360, -390], [-560, -430], [-560, -190]], 11);
    path([[-560, -430], [-420, -560]], 11);
    path([[-240, -390], [-420, -560], [-560, -700]], 15);
    path([[-360, -90], [-560, -90], [-760, -110]], 15);
    path([[-560, -90], [-560, -190]], 11);
    path([[0, -490], [0, -640]], 15);
    // east and north-east
    path([[360, -390], [540, -480], [680, -640]], 15);
    path([[360, -190], [560, -200], [760, -150]], 11);
    path([[560, -200], [540, -480]], 11);
    path([[360, -90], [560, -90], [760, -80]], 15);
    path([[560, -90], [560, -200]], 11);
    // south
    path([[-300, 290], [-500, 330], [-660, 470]], 15);
    path([[-300, 90], [-500, 90], [-720, 110]], 15);
    path([[-500, 90], [-500, 330]], 11);
    path([[180, 390], [300, 560], [400, 780]], 15);
    path([[300, 390], [300, 560]], 11);
    path([[420, 190], [620, 230], [780, 260]], 11);
    path([[420, 90], [620, 90], [780, 100]], 15);
    path([[620, 90], [620, 230]], 11);

    // derived geometry
    for (const n of nodes) {
      n.deadEnd = n.nb.length === 1;
      n.disc = n.r ? 0 : n.deadEnd ? 14 : Math.max(...n.roads.map((id) => roads[id].w)) / 2 + 1.5;
    }
    const trimOf = (n) => (n.r ? n.r + RING - 1 : 0);
    for (const rd of roads) {
      const A = nodes[rd.a], B = nodes[rd.b];
      rd.len = Math.hypot(B.x - A.x, B.z - A.z);
      rd.dx = (B.x - A.x) / rd.len; rd.dz = (B.z - A.z) / rd.len;
      rd.nx = -rd.dz; rd.nz = rd.dx;             // right-hand side of A -> B
      rd.ta = trimOf(A); rd.tb = trimOf(B);
      rd.main = rd.w >= 15;
    }

    /* ================= collision: spatial hash ================= */
    const CELL = 50, hash = new Map();
    const key = (i, j) => i * 100000 + j;
    function addShape(sh, x0, z0, x1, z1) {
      for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
        const k = key(i, j); if (!hash.has(k)) hash.set(k, []); hash.get(k).push(sh);
      }
    }
    for (const rd of roads) {
      const A = nodes[rd.a], B = nodes[rd.b];
      const ax = A.x + rd.dx * rd.ta, az = A.z + rd.dz * rd.ta, bx = B.x - rd.dx * rd.tb, bz = B.z - rd.dz * rd.tb;
      const sh = { t: "s", ax, az, bx, bz, hw: rd.w / 2, rd };
      rd.seg = sh;
      addShape(sh, Math.min(ax, bx) - rd.w, Math.min(az, bz) - rd.w, Math.max(ax, bx) + rd.w, Math.max(az, bz) + rd.w);
    }
    for (const n of nodes) {
      if (n.r) addShape({ t: "r", x: n.x, z: n.z, ri: n.r, ro: n.r + RING }, n.x - n.r - RING, n.z - n.r - RING, n.x + n.r + RING, n.z + n.r + RING);
      else addShape({ t: "d", x: n.x, z: n.z, rad: n.disc }, n.x - n.disc, n.z - n.disc, n.x + n.disc, n.z + n.disc);
    }
    function segDist(sh, x, z) {
      const vx = sh.bx - sh.ax, vz = sh.bz - sh.az, l2 = vx * vx + vz * vz;
      let t = ((x - sh.ax) * vx + (z - sh.az) * vz) / l2; t = Math.max(0, Math.min(1, t));
      return Math.hypot(x - (sh.ax + vx * t), z - (sh.az + vz * t));
    }
    function inRoad(x, z) {
      const list = hash.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
      if (!list) return false;
      let ok = false;
      for (const sh of list) {
        if (sh.t === "r") { const d = Math.hypot(x - sh.x, z - sh.z); if (d < sh.ri) return false; if (d <= sh.ro) ok = true; }
        else if (!ok) {
          if (sh.t === "s") { if (segDist(sh, x, z) <= sh.hw) ok = true; }
          else if (Math.hypot(x - sh.x, z - sh.z) <= sh.rad) ok = true;
        }
      }
      return ok;
    }
    function nearestRoad(x, z, maxD) {
      let best = null, bd = maxD;
      const r = Math.ceil(maxD / CELL);
      const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL);
      for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) {
        const list = hash.get(key(i, j)); if (!list) continue;
        for (const sh of list) if (sh.t === "s") { const d = segDist(sh, x, z) - sh.hw; if (d < bd) { bd = d; best = sh; } }
      }
      return best ? { d: bd, rd: best.rd } : null;
    }

    /* ================= occupancy grid for buildings ================= */
    const G = { x0: -900, z0: -1000, w: 900, h: 950, s: 2 };
    const occ = new Uint8Array(G.w * G.h);
    const cellOf = (x, z) => { const i = Math.floor((x - G.x0) / G.s), j = Math.floor((z - G.z0) / G.s); return i < 0 || j < 0 || i >= G.w || j >= G.h ? -1 : j * G.w + i; };
    function markDisc(x, z, r) { for (let px = x - r; px <= x + r; px += 1.5) for (let pz = z - r; pz <= z + r; pz += 1.5) if (Math.hypot(px - x, pz - z) <= r) { const c = cellOf(px, pz); if (c >= 0) occ[c] = 1; } }
    function rectPoints(cx, cz, w, d, ang, margin, fn) {
      const c = Math.cos(ang), s = Math.sin(ang);
      for (let lx = -w / 2 - margin; lx <= w / 2 + margin; lx += 1.5) for (let lz = -d / 2 - margin; lz <= d / 2 + margin; lz += 1.5) {
        if (fn(cx + lx * c + lz * s, cz - lx * s + lz * c) === false) return false;
      }
      return true;
    }
    const isFree = (cx, cz, w, d, ang) => rectPoints(cx, cz, w, d, ang, 0.5, (x, z) => { if (z > RIVER[0] - 20 && z < RIVER[1] + 20) return false; const c = cellOf(x, z); return c >= 0 && !occ[c]; });
    const markRect = (cx, cz, w, d, ang, m) => rectPoints(cx, cz, w, d, ang, m || 0.5, (x, z) => { const c = cellOf(x, z); if (c >= 0) occ[c] = 1; });
    for (const rd of roads) {
      const sh = rd.seg, m = rd.w / 2 + 4.5;
      for (let x = Math.min(sh.ax, sh.bx) - m; x <= Math.max(sh.ax, sh.bx) + m; x += 1.5) for (let z = Math.min(sh.az, sh.bz) - m; z <= Math.max(sh.az, sh.bz) + m; z += 1.5) {
        if (segDist(sh, x, z) <= m) { const c = cellOf(x, z); if (c >= 0) occ[c] = 1; }
      }
    }
    for (const n of nodes) markDisc(n.x, n.z, n.r ? n.r + RING + 4.5 : n.disc + 4);
    // solid ground (walls), used when the driver walks
    const solid = new Uint8Array(G.w * G.h);
    const markSolid = (cx, cz, w, d, ang) => rectPoints(cx, cz, w, d, ang, 0.3, (x, z) => { const c = cellOf(x, z); if (c >= 0) solid[c] = 1; });
    function walkable(x, z) {
      if (z > RIVER[0] + 2 && z < RIVER[1] - 2 && !inRoad(x, z)) return false;
      const c = cellOf(x, z);
      return c < 0 || !solid[c];
    }

    /* ================= mesh builders ================= */
    function Builder() { return { p: [], n: [], uv: [], c: [], idx: [] }; }
    function quad(b, v0, v1, v2, v3, nrm, uvs, col) {
      // make the winding agree with the normal, so every face is visible from the outside
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
      g.setAttribute("position", new THREE.Float32BufferAttribute(b.p, 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(b.n, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(b.uv, 2));
      g.setAttribute("color", new THREE.Float32BufferAttribute(b.c, 3));
      g.setIndex(b.idx);
      const m = new THREE.Mesh(g, mat);
      m.castShadow = !!shadows; m.receiveShadow = true;
      scene.add(m); return m;
    }
    const WHITE = new THREE.Color(1, 1, 1);
    // flat polygon (disc / ring) with world-space UVs
    function flatDisc(b, x, z, y, r0, r1, segs, uvScale) {
      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
        const pts = [[x + Math.cos(a0) * r1, z + Math.sin(a0) * r1], [x + Math.cos(a1) * r1, z + Math.sin(a1) * r1], [x + Math.cos(a1) * r0, z + Math.sin(a1) * r0], [x + Math.cos(a0) * r0, z + Math.sin(a0) * r0]];
        quad(b, ...pts.map((q) => [q[0], y, q[1]]), [0, 1, 0], pts.map((q) => [q[0] / uvScale, q[1] / uvScale]), WHITE);
      }
    }

    const TX = SB.tex;
    const texLat = TX.laterite(), texSand = TX.sand(), texRoad = TX.asphaltRoad(), texPlain = TX.asphaltPlain(), texGrass = TX.grass();
    const facades = TX.facades(), texRoof = TX.roof(), texDoor = TX.door(), texSigns = TX.signs();

    /* ---- ground and river ---- */
    texLat.repeat.set(220, 100);
    for (const [z0, z1] of [[-1600, RIVER[0]], [RIVER[1], 1600]]) {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(3600, z1 - z0), std({ map: texLat, polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 4 }));
      g.rotation.x = -Math.PI / 2; g.position.z = (z0 + z1) / 2; g.receiveShadow = true; scene.add(g);
    }
    const texWater = TX.water(); texWater.repeat.set(80, 3);
    const waterGeo = new THREE.PlaneGeometry(3600, RIVER[1] - RIVER[0] + 4, 180, 6); waterGeo.rotateX(-Math.PI / 2);
    const water = new THREE.Mesh(waterGeo, std({ map: texWater, roughness: 0.25, metalness: 0.15 }));
    water.position.set(0, -0.7, 0); water.receiveShadow = true; scene.add(water);
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(3600, RIVER[1] - RIVER[0]), std({ color: lin(0x23464a) }));
    bed.rotation.x = -Math.PI / 2; bed.position.y = -2; scene.add(bed);
    const bankB = Builder();
    for (const [za, zb] of [[-80, RIVER[0]], [RIVER[1], 80]]) {
      const top = 0.02, x0 = -1800, x1 = 1800;
      const edge = za < 0 ? zb : za, inner = za < 0 ? za : zb;
      quad(bankB, [x0, top, inner], [x1, top, inner], [x1, top, edge], [x0, top, edge], [0, 1, 0], [[x0 / 8, inner / 8], [x1 / 8, inner / 8], [x1 / 8, edge / 8], [x0 / 8, edge / 8]], WHITE);
      const s = za < 0 ? 1 : -1;
      quad(bankB, [x0, top, edge], [x1, top, edge], [x1, -1.6, edge + s * 3], [x0, -1.6, edge + s * 3], [0, 0.7, s * 0.7], [[x0 / 8, 0], [x1 / 8, 0], [x1 / 8, 0.4], [x0 / 8, 0.4]], WHITE);
    }
    finish(bankB, std({ map: texGrass, vertexColors: true, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }), false);
    const waterBase = Float32Array.from(waterGeo.attributes.position.array);

    /* ---- roads, junctions, verges ---- */
    const roadB = Builder(), vergeB = Builder(), junB = Builder();
    for (const rd of roads) {
      const A = nodes[rd.a], B = nodes[rd.b];
      const ax = A.x + rd.dx * rd.ta, az = A.z + rd.dz * rd.ta, bx = B.x - rd.dx * rd.tb, bz = B.z - rd.dz * rd.tb;
      const L = Math.hypot(bx - ax, bz - az), hw = rd.w / 2;
      quad(roadB, [ax - rd.nx * hw, 0.08, az - rd.nz * hw], [bx - rd.nx * hw, 0.08, bz - rd.nz * hw], [bx + rd.nx * hw, 0.08, bz + rd.nz * hw], [ax + rd.nx * hw, 0.08, az + rd.nz * hw], [0, 1, 0], [[0, 0], [L / 10, 0], [L / 10, 1], [0, 1]], WHITE);
      const vw = hw + 4;
      quad(vergeB, [A.x - rd.nx * vw, 0.03, A.z - rd.nz * vw], [B.x - rd.nx * vw, 0.03, B.z - rd.nz * vw], [B.x + rd.nx * vw, 0.03, B.z + rd.nz * vw], [A.x + rd.nx * vw, 0.03, A.z + rd.nz * vw], [0, 1, 0], [[0, 0], [rd.len / 6, 0], [rd.len / 6, vw / 3], [0, vw / 3]], WHITE);
    }
    for (const n of nodes) {
      if (n.r) { flatDisc(junB, n.x, n.z, 0.12, n.r, n.r + RING, 40, 12); flatDisc(vergeB, n.x, n.z, 0.035, 0, n.r + RING + 4, 40, 6); }
      else { flatDisc(junB, n.x, n.z, 0.12, 0, n.disc, 24, 12); flatDisc(vergeB, n.x, n.z, 0.035, 0, n.disc + 4, 24, 6); }
    }
    finish(vergeB, std({ map: texSand, vertexColors: true, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }), false);
    finish(roadB, std({ map: texRoad, vertexColors: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }), false);
    finish(junB, std({ map: texPlain, vertexColors: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), false);

    /* ---- instanced helpers (trees, poles, small objects) ---- */
    const INST = { box: [], cyl: [], cone: [], ico: [], trunk: [], stem: [] };
    const ECO = quality === "eco";
    const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
    const M = (x, y, z, sx, sy, sz, rx, ry, rz) => { _e.set(rx || 0, ry || 0, rz || 0); _q.setFromEuler(_e); return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)); };
    const C = (hex, v) => { const c = new THREE.Color(hex); if (v) c.multiplyScalar(1 - v / 2 + rnd() * v); return c.convertSRGBToLinear(); };
    const iBox = (x, y0, z, sx, sy, sz, col, ry) => INST.box.push({ m: M(x, y0 + sy / 2, z, sx, sy, sz, 0, ry || 0, 0), c: col });
    const iCyl = (x, y, z, r, h, col, rx, ry, rz) => INST.cyl.push({ m: M(x, y, z, 2 * r, h, 2 * r, rx || 0, ry || 0, rz || 0), c: col });
    const iCone = (x, y0, z, r, h, col) => INST.cone.push({ m: M(x, y0 + h / 2, z, r, h, r), c: col });
    const iIco = (x, y, z, r, col, sy) => INST.ico.push({ m: M(x, y, z, r, r * (sy || 1), r, 0, rnd() * 3, 0), c: col });
    // one InstancedMesh per 350 m tile, with its own bounding sphere so off-screen tiles are skipped
    function flushInst(geo, list, flat, shadows) {
      if (!list.length) return;
      const mat = std({ flatShading: !!flat }), TILE = list.length > 1500 ? 600 : 1e6, tiles = new Map();
      for (const it of list) {
        const e = it.m.elements, k = Math.floor(e[12] / TILE) + "," + Math.floor(e[14] / TILE);
        if (!tiles.has(k)) tiles.set(k, []); tiles.get(k).push(it);
      }
      for (const items of tiles.values()) {
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9, sc = 0;
        for (const it of items) {
          const e = it.m.elements; x0 = Math.min(x0, e[12]); x1 = Math.max(x1, e[12]); y0 = Math.min(y0, e[13]); y1 = Math.max(y1, e[13]); z0 = Math.min(z0, e[14]); z1 = Math.max(z1, e[14]);
          sc = Math.max(sc, Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6]), Math.hypot(e[8], e[9], e[10]));
        }
        const g = geo.clone();
        const c = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
        g.boundingSphere = new THREE.Sphere(c, Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + sc);
        const im = new THREE.InstancedMesh(g, mat, items.length);
        items.forEach((it, i) => { im.setMatrixAt(i, it.m); im.setColorAt(i, it.c); });
        im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.castShadow = shadows !== false; im.receiveShadow = true; scene.add(im);
      }
    }
    const PAL = {
      tints: [0xf3ede2, 0xe9c99a, 0xd9a877, 0xa9c6d6, 0xbfd9b8, 0xe6b3a3, 0xf1dca6, 0xd8d2c6, 0xc9b8e0],
      doors: [0x3d6e8c, 0x2f7a4d, 0x8a8f94, 0xa23a2a, 0x5a5f66, 0x3b5d7a],
      neem: 0x56823a, mango: 0x2f5e2c, karite: 0x6c8a3e, trunk: 0x5e4330,
    };

    /* ---- buildings ---- */
    const FB = { plaster: Builder(), shutters: Builder(), banco: Builder(), glass: Builder() };
    const roofB = Builder(), doorB = Builder(), signB = Builder();
    function boxFaces(b, cx, y0, cz, w, d, h, ang, tint, uvW, uvH, skipTop) {
      if (y0 >= 0 && h > 1.5) markSolid(cx, cz, w, d, ang);
      const c = Math.cos(ang), s = Math.sin(ang);
      const P = (lx, lz) => [cx + lx * c + lz * s, cz - lx * s + lz * c];
      const corners = [P(-w / 2, -d / 2), P(w / 2, -d / 2), P(w / 2, d / 2), P(-w / 2, d / 2)];
      for (let i = 0; i < 4; i++) {
        const a = corners[i], bb = corners[(i + 1) % 4];
        const ex = bb[0] - a[0], ez = bb[1] - a[1], L = Math.hypot(ex, ez);
        const nx = ez / L, nz = -ex / L; // outward normal (corners go counter-clockwise seen from above)
        quad(b, [bb[0], y0, bb[1]], [a[0], y0, a[1]], [a[0], y0 + h, a[1]], [bb[0], y0 + h, bb[1]], [nx, 0, nz], [[0, 0], [L / uvW, 0], [L / uvW, h / uvH], [0, h / uvH]], tint);
      }
      if (!skipTop) quad(roofB, [corners[0][0], y0 + h, corners[0][1]], [corners[3][0], y0 + h, corners[3][1]], [corners[2][0], y0 + h, corners[2][1]], [corners[1][0], y0 + h, corners[1][1]], [0, 1, 0], [corners[0], corners[3], corners[2], corners[1]].map((q) => [q[0] / 6, q[1] / 6]), WHITE);
      return corners;
    }
    // a building whose local +x face (side = 1) or -x face (side = -1) looks at the street
    function building(cx, cz, w, d, ang, floors, kind, front) {
      const h = floors * 3 + 0.6;
      const tint = kind === "banco" || kind === "glass" ? C(0xffffff, 0.12) : C(pick(PAL.tints), 0.08);
      boxFaces(FB[kind], cx, 0, cz, w, d, h, ang, tint, 4, 3);
      const c = Math.cos(ang), s = Math.sin(ang);
      if (floors > 1 && rnd() < 0.5) { const lx = rr(-w / 4, w / 4), lz = rr(-d / 4, d / 4); boxFaces(FB[kind], cx + lx * c + lz * s, h, cz - lx * s + lz * c, 3, 3, 2.6, ang, tint, 4, 3); }
      if (rnd() < 0.45) { const lx = rr(-w / 3, w / 3), lz = rr(-d / 3, d / 3); iCyl(cx + lx * c + lz * s, h + 0.75, cz - lx * s + lz * c, 0.7, 1.5, C(pick([0x1d1d1d, 0x1d1d1d, 0x2b6cb0]), 0.1)); }
      if (!front || kind === "glass") return;
      // street face: local x = front * w/2, runs along local z
      const fx = front * c, fz = -front * s;          // outward normal of the street face
      const ox = cx + fx * (w / 2 + 0.06), oz = cz + fz * (w / 2 + 0.06);
      const nDoors = d >= 12 ? 2 : 1;
      for (let k = 0; k < nDoors; k++) {
        const t = nDoors === 1 ? rr(-d / 4, d / 4) : (k ? 1 : -1) * d / 4;
        const px = ox + (s * t), pz = oz + (c * t), hwid = 0.85;
        const col = C(pick(PAL.doors), 0.1);
        quad(doorB, [px - s * hwid * front, 0, pz - c * hwid * front], [px + s * hwid * front, 0, pz + c * hwid * front], [px + s * hwid * front, 2.5, pz + c * hwid * front], [px - s * hwid * front, 2.5, pz - c * hwid * front], [fx, 0, fz], [[0, 0], [1, 0], [1, 1], [0, 1]], col);
      }
      if (rnd() < 0.55) {
        const i = Math.floor(rnd() * TX.SIGNS.length), u0 = (i % 2) * 0.5, v1 = 1 - Math.floor(i / 2) * 0.25, v0 = v1 - 0.25;
        const half = Math.min(d * 0.42, 3.6), y0 = 2.55, y1 = 3.45;
        const px = ox + fx * 0.05, pz = oz + fz * 0.05;
        quad(signB, [px - s * half * front, y0, pz - c * half * front], [px + s * half * front, y0, pz + c * half * front], [px + s * half * front, y1, pz + c * half * front], [px - s * half * front, y1, pz - c * half * front], [fx, 0, fz], [[u0 + 0.5, v0], [u0, v0], [u0, v1], [u0 + 0.5, v1]], WHITE);
      }
    }
    function tree(x, z, kind) {
      if (kind === "baobab") {
        const h = rr(6, 9);
        INST.trunk.push({ m: M(x, h / 2, z, rr(2.6, 3.4), h, rr(2.6, 3.4)), c: C(0x8d7a66, 0.15) });
        for (let k = 0; k < 5; k++) { const a = rnd() * 6.28; iCyl(x + Math.cos(a) * 1.2, h + 1.2, z + Math.sin(a) * 1.2, 0.25, 3.2, C(0x8d7a66, 0.1), Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8); }
        for (let k = 0; k < 3; k++) iIco(x + rr(-3, 3), h + rr(2.2, 3.2), z + rr(-3, 3), rr(1.4, 2.2), C(0x6f8a3c, 0.2), 0.6);
        return;
      }
      // the economy mode drops some trees without changing the rest of the city
      const hv = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
      if (ECO && hv - Math.floor(hv) < 0.35) return;
      const big = kind === "mango", h = big ? rr(2.6, 3.6) : rr(2.2, 3.4), tr = big ? 0.32 : 0.22;
      INST.stem.push({ m: M(x, h / 2, z, 2 * tr, h, 2 * tr), c: C(PAL.trunk, 0.2) });
      const r = big ? rr(3.4, 4.8) : rr(2.2, 3.2), col = big ? PAL.mango : kind === "karite" ? PAL.karite : PAL.neem;
      iIco(x, h + r * 0.55, z, r, C(col, 0.25), 0.78);
      iIco(x + rr(-1.4, 1.4), h + r * 0.95, z + rr(-1.4, 1.4), r * 0.68, C(col, 0.3), 0.8);
      if (big) { const ex = x + rr(-2, 2), ez = z + rr(-2, 2), ec = C(col, 0.25); if (!ECO) iIco(ex, h + r * 0.5, ez, r * 0.7, ec, 0.75); }
    }

    /* ---- stops and fuel stations (placed before the buildings) ---- */
    const STOPS = [
      ["Grand Marché", [-120, -190], [0, -190], 0.5, 1], ["Bamako-Coura", [-120, -90], [-120, -190], 0.5, 1],
      ["Bagadadji", [120, -90], [120, -190], 0.5, 1], ["Niaréla", [240, -90], [360, -90], 0.5, -1],
      ["Bozola", [120, -190], [240, -190], 0.42, -1], ["Médina Coura", [0, -290], [120, -290], 0.58, 1],
      ["Dar Salam", [-240, -190], [-240, -290], 0.5, 1], ["Missira", [120, -390], [240, -390], 0.5, 1],
      ["Hippodrome", [0, -390], [0, -490], 0.5, 1], ["Korofina", [360, -390], [540, -480], 0.5, -1],
      ["Djélibougou", [540, -480], [680, -640], 0.5, 1], ["Quinzambougou", [360, -190], [560, -200], 0.5, 1],
      ["Hamdallaye", [-240, -390], [-420, -560], 0.55, 1], ["ACI 2000", [-360, -190], [-560, -190], 0.5, -1],
      ["Lafiabougou", [-560, -430], [-560, -190], 0.5, 1], ["Djicoroni", [-560, -90], [-760, -110], 0.5, 1],
      ["Badalabougou", [-180, 90], [-60, 90], 0.5, 1], ["Torokorobougou", [60, 90], [60, 190], 0.42, 1],
      ["Daoudabougou", [-60, 290], [60, 290], 0.45, 1], ["Sogoniko", [180, 290], [300, 290], 0.42, 1],
      ["Faladié", [300, 390], [420, 390], 0.5, 1], ["Magnambougou", [420, 190], [620, 230], 0.5, -1],
      ["Kalaban Coura", [-300, 290], [-500, 330], 0.5, 1], ["Sénou", [300, 560], [400, 780], 0.5, 1],
      ["Point G", [0, -490], [0, -640], 0.7, 1], ["Sébénikoro", [-420, -560], [-560, -700], 0.6, 1],
      ["Banconi", [560, -200], [760, -150], 0.55, 1], ["Boulkassoumbougou", [560, -200], [540, -480], 0.5, 1],
      ["Sotuba", [560, -90], [760, -80], 0.6, -1], ["Baco Djicoroni", [-500, 90], [-720, 110], 0.5, -1],
      ["Kalaban Coro", [-500, 330], [-660, 470], 0.6, 1], ["Yirimadio", [620, 90], [780, 100], 0.6, 1],
      ["Niamakoro", [300, 390], [300, 560], 0.5, 1], ["Missabougou", [620, 90], [620, 230], 0.5, 1],
      ["Ouolofobougou", [-360, -190], [-360, -290], 0.5, 1], ["N'Tomikorobougou", [-120, -290], [-120, -390], 0.5, 1],
      ["Bolibana", [-360, -90], [-360, -190], 0.5, -1],
    ];
    function roadBetween(p, q) {
      const a = byKey[p[0] + "," + p[1]], b = byKey[q[0] + "," + q[1]];
      const id = nodes[a].roads.find((r) => (roads[r].a === a && roads[r].b === b) || (roads[r].a === b && roads[r].b === a));
      const rd = roads[id];
      return { rd, flip: rd.a !== a };
    }
    function spot(p, q, t, side, off) {
      const { rd, flip } = roadBetween(p, q);
      const A = nodes[byKey[p[0] + "," + p[1]]], B = nodes[byKey[q[0] + "," + q[1]]];
      const dx = (B.x - A.x) / rd.len, dz = (B.z - A.z) / rd.len, nx = -dz, nz = dx;
      const x = A.x + (B.x - A.x) * t, z = A.z + (B.z - A.z) * t;
      return { x: x + nx * side * off, z: z + nz * side * off, dx, dz, nx: nx * side, nz: nz * side, rd, flip, ang: Math.atan2(dx, dz) };
    }
    const stops = STOPS.map(([name, p, q, t, side], i) => {
      const rd = roadBetween(p, q).rd, hw = rd.w / 2;
      const zone = spot(p, q, t, side, hw - 3), shelter = spot(p, q, t, side, hw + 3.6);
      const s = { i, name, zx: zone.x, zz: zone.z, sx: shelter.x, sz: shelter.z, nx: zone.nx, nz: zone.nz, dx: zone.dx, dz: zone.dz, ang: zone.ang, bank: zone.z < 0 ? "N" : "S", waiting: [], spawnT: 0 };
      markDisc(s.sx, s.sz, 9);
      return s;
    });
    const STATIONS = [["Station de Bozola", [240, -290], [360, -290], 0.5, -1], ["Station de Faladié", [-180, 190], [-60, 190], 0.5, 1]];
    const stations = STATIONS.map(([name, p, q, t, side]) => {
      const rd = roadBetween(p, q).rd, hw = rd.w / 2;
      const zone = spot(p, q, t, side, hw - 3), lot = spot(p, q, t, side, hw + 11);
      markRect(lot.x, lot.z, 30, 26, lot.ang, 1);
      return { name, zx: zone.x, zz: zone.z, lx: lot.x, lz: lot.z, ang: lot.ang, nx: lot.nx, nz: lot.nz };
    });

    /* ---- landmarks (reserve their ground first) ---- */
    const landmarks = [];
    function reserve(x, z, w, d, ang) { markRect(x, z, w, d, ang || 0, 2); }
    // Grand Marché
    (function () {
      const cx = -58, cz = -128, w = 64, d = 38;
      reserve(cx, cz, w + 20, d + 24);
      boxFaces(FB.banco, cx, 0, cz, w, d, 7.5, 0, C(0xd08b5a), 4, 3);
      for (let i = 0; i < 10; i++) { const x = cx - w / 2 + 3.2 + i * 6.5; quad(doorB, [x - 1.5, 0, cz - d / 2 - 0.08], [x + 1.5, 0, cz - d / 2 - 0.08], [x + 1.5, 4.6, cz - d / 2 - 0.08], [x - 1.5, 4.6, cz - d / 2 - 0.08], [0, 0, -1], [[0, 0], [1, 0], [1, 1], [0, 1]], C(0x2a1a12)); }
      for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { boxFaces(FB.banco, cx + ox * w / 2, 0, cz + oz * d / 2, 3.6, 3.6, 11, 0, C(0xc27a4a), 4, 3); iCone(cx + ox * w / 2, 11, cz + oz * d / 2, 2.2, 2.6, C(0xb36a3c)); }
      for (let k = 0; k < 40; k++) {
        const x = rr(cx - w / 2 - 8, cx + w / 2 + 8), z = rnd() < 0.5 ? rr(cz - d / 2 - 11, cz - d / 2 - 3) : rr(cz + d / 2 + 3, cz + d / 2 + 7);
        iCyl(x, 1.2, z, 0.05, 2.4, C(0x333333)); iCone(x, 2.2, z, 2.2, 0.9, C(pick([0xe2b31d, 0xc0392b, 0x2e6fb0, 0x1f8a4c, 0xe7dcc6, 0xd2541f]), 0.1));
        iBox(x, 0, z, 2.2, 0.85, 1.2, C(0x7a5534, 0.2));
        for (let j = 0; j < 3; j++) iBox(x + rr(-0.8, 0.8), 0.85, z + rr(-0.4, 0.4), 0.4, 0.3, 0.4, C(pick([0xe74c3c, 0xf39c12, 0x27ae60, 0xf1c40f, 0x8e44ad]), 0.2));
      }
      landmarks.push({ name: "Grand Marché", x: cx, z: cz });
    })();
    // Sudano-Sahelian mosque
    (function () {
      const cx = 60, cz = -128, w = 38, d = 30, col = C(0xffffff, 0.05);
      reserve(cx, cz, w + 16, d + 16);
      boxFaces(FB.banco, cx, 0, cz, w, d, 9, 0, col, 4, 3);
      for (let x = cx - w / 2 + 1; x <= cx + w / 2 - 1; x += 2.4) for (const z of [cz - d / 2, cz + d / 2]) iCone(x, 9, z, 0.55, 1.6, C(0xb47547));
      for (let z = cz - d / 2 + 1; z <= cz + d / 2 - 1; z += 2.4) for (const x of [cx - w / 2, cx + w / 2]) iCone(x, 9, z, 0.55, 1.6, C(0xb47547));
      for (let x = cx - w / 2 + 2; x < cx + w / 2; x += 3) for (const y of [3, 6]) iCyl(x, y, cz - d / 2 - 0.5, 0.1, 1.4, C(0x5a3a22), Math.PI / 2);
      const towerTex = facades.banco.clone(); towerTex.needsUpdate = true; towerTex.repeat.set(3, 6);
      const towerGeo = new THREE.CylinderGeometry(1.6, 3.2, 22, 4, 1);
      const towerMat = std({ map: towerTex, flatShading: true });
      for (const oz of [-10, 0, 10]) {
        const t = new THREE.Mesh(towerGeo, towerMat); t.position.set(cx + w / 2 - 2, 11, cz + oz); t.rotation.y = Math.PI / 4; t.castShadow = true; scene.add(t);
        iCone(cx + w / 2 - 2, 22, cz + oz, 1.3, 2.6, C(0xb47547)); iIco(cx + w / 2 - 2, 25, cz + oz, 0.5, C(0xefe6d6));
        for (let y = 4; y < 21; y += 3) iCyl(cx + w / 2 - 2, y, cz + oz, 0.1, 7.2 - y * 0.2, C(0x5a3a22), Math.PI / 2);
      }
      landmarks.push({ name: "Grande Mosquée", x: cx, z: cz });
    })();
    // monuments on the roundabout islands
    function island(n, kind) {
      const b = Builder(); flatDisc(b, n.x, n.z, 0.25, 0, n.r, 32, 4);
      finish(b, std({ map: texGrass, vertexColors: true }), false);
      iCyl(n.x, 0.2, n.z, n.r + 0.2, 0.4, C(0xe8e2d4));
      if (kind === "column") {
        iBox(n.x, 0.3, n.z, 9, 2, 9, C(0xefe6d6));
        const col = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.4, 26, 8), std({ color: lin(0xf1e9da), flatShading: true })); col.position.set(n.x, 15.3, n.z); col.castShadow = true; scene.add(col);
        const top = new THREE.Mesh(new THREE.IcosahedronGeometry(1.8, 0), std({ color: lin(0xd8a634), roughness: 0.35, metalness: 0.6, flatShading: true })); top.position.set(n.x, 29.5, n.z); scene.add(top);
      } else if (kind === "obelisk") {
        const ob = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 1.6, 16, 4), std({ color: lin(0xe9dcc4), flatShading: true })); ob.position.set(n.x, 8.3, n.z); ob.rotation.y = Math.PI / 4; ob.castShadow = true; scene.add(ob);
      } else if (kind === "arch") {
        for (const o of [-5, 5]) iBox(n.x + o, 0.3, n.z, 1.6, 10, 1.6, C(0xefe6d6));
        iBox(n.x, 10.3, n.z, 12, 1.6, 1.8, C(0x1f8a4c));
      } else {
        for (let k = 0; k < 5; k++) tree(n.x + rr(-n.r / 2, n.r / 2), n.z + rr(-n.r / 2, n.r / 2), "neem");
      }
    }
    island(nodes[byKey["0,-290"]], "column"); island(nodes[byKey["240,-190"]], "obelisk"); island(nodes[byKey["60,190"]], "arch");
    island(nodes[byKey["-240,-390"]], "garden"); island(nodes[byKey["300,290"]], "garden");
    landmarks.push({ name: "Monument", x: 0, z: -290 });
    // ACI 2000 towers
    for (const [x, z, f] of [[-470, -150, 9], [-430, -118, 7], [-510, -118, 6], [-400, -160, 5]]) { reserve(x, z, 16, 16); boxFaces(FB.glass, x, 0, z, 14, 14, f * 3 + 0.6, 0.12, C(0xffffff, 0.08), 4, 3); }
    landmarks.push({ name: "ACI 2000", x: -460, z: -140 });
    // stadium
    (function () {
      const cx = 0, cz = 240; reserve(cx, cz, 96, 72);
      const pitch = Builder(); quad(pitch, [cx - 34, 0.1, cz - 22], [cx + 34, 0.1, cz - 22], [cx + 34, 0.1, cz + 22], [cx - 34, 0.1, cz + 22], [0, 1, 0], [[0, 0], [8, 0], [8, 5], [0, 5]], C(0x7fa046)); finish(pitch, std({ map: texGrass, vertexColors: true }), false);
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2, x = cx + Math.cos(a) * 40, z = cz + Math.sin(a) * 30;
        boxFaces(FB.plaster, x, 0, z, 9, 5, 8, -a + Math.PI / 2, C(0xd8d2c6), 4, 3);
      }
      for (const [ox, oz] of [[-44, -32], [44, -32], [-44, 32], [44, 32]]) { iCyl(cx + ox, 13, cz + oz, 0.4, 26, C(0x9a9a9a)); iBox(cx + ox, 25, cz + oz, 4, 2, 0.6, C(0xf5f1e6)); }
      landmarks.push({ name: "Stade", x: cx, z: cz });
    })();
    // gare routière of Sogoniko: a dusty lot full of parked minibuses
    const parked = [];
    (function () {
      const cx = 240, cz = 342; reserve(cx, cz, 100, 72);
      const pl = Builder(); quad(pl, [cx - 48, 0.06, cz - 34], [cx + 48, 0.06, cz - 34], [cx + 48, 0.06, cz + 34], [cx - 48, 0.06, cz + 34], [0, 1, 0], [[(cx - 48) / 12, (cz - 34) / 12], [(cx + 48) / 12, (cz - 34) / 12], [(cx + 48) / 12, (cz + 34) / 12], [(cx - 48) / 12, (cz + 34) / 12]], C(0xc9b8a4));
      finish(pl, std({ map: texPlain, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1 }), false);
      for (let row = 0; row < 3; row++) for (let k = 0; k < 7; k++) if (rnd() < 0.85) parked.push({ x: cx - 39 + k * 13, z: cz - 18 + row * 18, ang: Math.PI / 2 + (rnd() - 0.5) * 0.2, livery: pick(["vert", "vert", "vert", "bleu", "rouge", "soleil"]) });
      for (let k = 0; k < 6; k++) iBox(cx - 40 + k * 16, 0, cz + 31, 10, 3.2, 3.5, C(pick(PAL.tints), 0.1));
      landmarks.push({ name: "Gare routière", x: cx, z: cz });
    })();
    // water tower
    (function () {
      const x = 360, z = 345; reserve(x, z, 16, 16);
      iCyl(x, 9, z, 1.6, 18, C(0xe8e2d4)); iCyl(x, 21, z, 6, 6, C(0x8fb3c4)); iCone(x, 24, z, 6.2, 2.2, C(0x8fb3c4));
      landmarks.push({ name: "Château d'eau", x, z });
    })();
    // fuel stations
    for (const st of stations) {
      const c = Math.cos(st.ang), s = Math.sin(st.ang);
      const P = (lx, lz) => [st.lx + lx * c + lz * s, st.lz - lx * s + lz * c];
      const roofCol = C(0xc0392b);
      for (const [lx, lz] of [[-5, -7], [5, -7], [-5, 7], [5, 7]]) { const p = P(lx, lz); iCyl(p[0], 2.6, p[1], 0.25, 5.2, C(0xe8e2d4)); }
      const ctr = P(0, 0); iBox(ctr[0], 5.2, ctr[1], 16, 0.8, 22, roofCol, st.ang);
      for (const lz of [-3.5, 3.5]) { const p = P(0, lz); iBox(p[0], 0, p[1], 0.8, 1.6, 1.2, C(0xf5f1e6), st.ang); }
      const shop = P(9, 0); iBox(shop[0], 0, shop[1], 6, 3.4, 10, C(0xf5f1e6), st.ang);
      const sg = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.stationSign() })); const sp = P(-9, 11); sg.position.set(sp[0], 7.5, sp[1]); sg.scale.set(7, 2.2, 1); scene.add(sg);
      iCyl(sp[0], 3, sp[1], 0.15, 6, C(0x777777));
    }
    // bridges: decks, railings and piers
    for (const rd of roads) {
      const A = nodes[rd.a], B = nodes[rd.b];
      if (!((A.z < RIVER[0] && B.z > RIVER[1]) || (B.z < RIVER[0] && A.z > RIVER[1]))) continue;
      const cx = (A.x + B.x) / 2, cz = (A.z + B.z) / 2, ang = Math.atan2(rd.dx, rd.dz), len = rd.len - 30;
      const deck = Builder(); boxFaces(deck, cx, -1.3, cz, rd.w + 8, len, 1.3, ang, WHITE, 6, 3, true);
      finish(deck, std({ map: texRoof, vertexColors: true }), true);
      for (const side of [-1, 1]) iBox(cx + rd.nx * side * (rd.w / 2 + 3.6), 0.03, cz + rd.nz * side * (rd.w / 2 + 3.6), 0.4, 1.1, len, C(0xd8d0c0), ang);
      for (let t = -len / 2 + 12; t < len / 2 - 6; t += 18) iBox(cx + rd.dx * t, -4, cz + rd.dz * t, rd.w - 2, 2.8, 3, C(0x9c9488), ang);
    }

    /* ---- hospitals ---- */
    function hospital(cx, cz, ang, name, floors) {
      reserve(cx, cz, 74, 64, ang);
      const c = Math.cos(ang), s = Math.sin(ang), P = (lx, lz) => [cx + lx * c + lz * s, cz - lx * s + lz * c];
      const white = C(0xf6f3ec, 0.03), h = floors * 3.4 + 0.6;
      let p = P(0, -8); boxFaces(FB.plaster, p[0], 0, p[1], 46, 16, h, ang, white, 4, 3);
      p = P(-16, 10); boxFaces(FB.shutters, p[0], 0, p[1], 14, 20, 7.4, ang, white, 4, 3);
      p = P(16, 10); boxFaces(FB.shutters, p[0], 0, p[1], 14, 20, 4, ang, C(0xe4eee6), 4, 3);
      p = P(0, 2.4); iBox(p[0], 3.1, p[1], 12, 0.35, 5, C(0xc0392b), ang);
      for (const lx of [-5.5, 5.5]) { p = P(lx, 4.6); iCyl(p[0], 1.55, p[1], 0.12, 3.1, C(0xf6f3ec)); }
      p = P(0, 2); iBox(p[0], 0, p[1], 3, 2.6, 0.2, C(0x1d2a33), ang);
      const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.hospitalSign(name) }));
      p = P(0, 0.4); sign.position.set(p[0], h + 2.2, p[1]); sign.scale.set(13, 3.6, 1); scene.add(sign);
      for (let k = 0; k < 3; k++) { // ambulances
        p = P(-19 + k * 3.4, 25); iBox(p[0], 0.45, p[1], 2.1, 2.1, 5, C(0xfbfbf8), ang);
        iBox(p[0], 1.4, p[1], 2.14, 0.35, 5.04, C(0xc0392b), ang); iBox(p[0], 2.55, p[1], 0.9, 0.2, 0.4, C(0x3d7fd8), ang);
      }
      for (let k = 0; k < 5; k++) { p = P(rr(4, 30), rr(26, 30)); tree(p[0], p[1], "neem"); }
      landmarks.push({ name, x: cx, z: cz, kind: "hospital" });
    }
    hospital(-178, -238, 0, "Gabriel Touré", 3);
    hospital(50, -580, -Math.PI / 2, "Point G", 4);

    /* ---- restaurants, maquis and dibiteries ---- */
    const food = [], vendors = [], keep = [];
    const kept = (x, z) => keep.some(([kx, kz, r]) => Math.abs(kx - x) < r && Math.abs(kz - z) < r);
    const RESTOS = [
      ["Le Baobab", "restaurant"], ["La Paillote", "maquis"], ["Chez Fati", "dibiterie"], ["Le Fleuve", "restaurant"],
      ["Le Djembé", "maquis"], ["du Carrefour", "dibiterie"], ["Wassa", "restaurant"], ["Sanké", "maquis"],
      ["Teriya", "restaurant"], ["Bara", "dibiterie"], ["Le Sahel", "restaurant"], ["Kora", "maquis"],
    ];
    const KIND = {
      restaurant: { label: "RESTAURANT", color: "#8a2c1c", roof: 0x9aa3a8, item: "un riz sauce arachide", price: 750, energy: 100 },
      maquis: { label: "MAQUIS", color: "#1f6b3a", roof: 0xc9a35a, item: "un tô sauce gombo", price: 500, energy: 90 },
      dibiterie: { label: "DIBITERIE", color: "#a8471c", roof: 0xa83a2a, item: "de la viande grillée", price: 1500, energy: 100 },
    };
    for (let tries = 0, ri = 0; tries < 600 && ri < RESTOS.length; tries++) {
      const rd = pick(roads); if (rd.len < 70) continue;
      const A = nodes[rd.a], side = rnd() < 0.5 ? -1 : 1, t = rr(24, rd.len - 32), ang = Math.atan2(rd.dx, rd.dz);
      const across = 16, along = 14, off = rd.w / 2 + 4.6 + across / 2;
      const nx = rd.nx * side, nz = rd.nz * side, cx = A.x + rd.dx * t + nx * off, cz = A.z + rd.dz * t + nz * off;
      if (Math.abs(cz) < 120) continue;
      if (food.some((f) => Math.hypot(f.x - cx, f.z - cz) < 150) || stops.some((st) => Math.hypot(st.sx - cx, st.sz - cz) < 30)) continue;
      if (!isFree(cx, cz, across, along, ang)) continue;
      markRect(cx, cz, across, along, ang, 1);
      const [name, kind] = RESTOS[ri++], K = KIND[kind];
      const Q = (o, a) => [cx + nx * o + rd.dx * a, cz + nz * o + rd.dz * a];   // o: away from the road, a: along it
      let p = Q(5, 0); boxFaces(rnd() < 0.5 ? FB.plaster : FB.banco, p[0], 0, p[1], 6, 12, 3.4, ang, C(pick(PAL.tints), 0.08), 4, 3);
      p = Q(-2.2, 0); iBox(p[0], 2.9, p[1], 9, 0.25, 12.5, C(K.roof, 0.1), ang);
      for (const [o, a] of [[-6.4, -5.8], [-6.4, 5.8], [1.8, -5.8], [1.8, 5.8]]) { p = Q(o, a); iCyl(p[0], 1.45, p[1], 0.1, 2.9, C(0x6b5440)); }
      for (const a of [-3.6, 0, 3.6]) {
        p = Q(-2.4, a); iBox(p[0], 0, p[1], 1.2, 0.75, 1.2, C(pick([0xf4f1ea, 0x2e6fb0, 0xc0392b]), 0.05), ang);
        for (const [o2, a2] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const q = Q(-2.4 + o2, a + a2); iBox(q[0], 0, q[1], 0.45, 0.85, 0.45, C(pick([0xc0392b, 0x1f8a4c, 0xf4f1ea, 0x2e6fb0]), 0.05), ang); }
      }
      if (kind === "dibiterie") { p = Q(-6, 4.5); iBox(p[0], 0, p[1], 1, 0.95, 2.2, C(0x1b1b1b), ang); iBox(p[0], 0.95, p[1], 0.9, 0.08, 2.1, C(0x7a3a1c), ang); }
      p = Q(-7.2, -6.6); iCyl(p[0], 1.9, p[1], 0.08, 3.8, C(0x444444));
      const sg = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.roadSign(name.toUpperCase(), K.label, K.color) })); sg.position.set(p[0], 4.4, p[1]); sg.scale.set(5.2, 2, 1); scene.add(sg);
      keep.push([p[0], p[1], 3]);
      p = Q(-6.2, 0);
      food.push({ x: p[0], z: p[1], name: K.label.charAt(0) + K.label.slice(1).toLowerCase() + " " + name, item: K.item, price: K.price, energy: K.energy, kind });
      landmarks.push({ name: K.label.charAt(0) + K.label.slice(1).toLowerCase() + " " + name, x: cx, z: cz, kind: "food" });
    }

    /* ---- traffic lights on the busiest crossroads ---- */
    const lights = [], lampPos = [];
    const mains = (n) => n.roads.filter((id) => roads[id].main).length;
    const cand = nodes.map((n, i) => ({ n, i })).filter(({ n }) => !n.r && n.nb.length >= 4 && Math.abs(n.z) > 120 && mains(n) > 0);
    cand.sort((a, b) => mains(b.n) - mains(a.n) || a.n.x - b.n.x);
    for (const { n, i } of cand.slice(0, 14)) {
      const L = { node: i, x: n.x, z: n.z, heads: [], phase0: rnd() * 27, cop: null }, withCop = rnd() < 0.55;
      for (const id of n.roads) {
        const rd = roads[id], other = nodes[rd.a === i ? rd.b : rd.a];
        const ux = (n.x - other.x) / rd.len, uz = (n.z - other.z) / rd.len, rx = -uz, rz = ux, hw = rd.w / 2;
        const px = n.x - ux * (n.disc + 1.6) + rx * (hw + 1.1), pz = n.z - uz * (n.disc + 1.6) + rz * (hw + 1.1);
        iCyl(px, 1.9, pz, 0.08, 3.8, C(0x3a3a3a));
        iBox(px, 2.9, pz, 0.42, 1.2, 0.34, C(0x1b1b1b), Math.atan2(ux, uz));
        const head = { axis: Math.abs(ux) > Math.abs(uz) ? "x" : "z", lamps: [] };
        for (const dy of [0.36, 0, -0.36]) { head.lamps.push(lampPos.length); lampPos.push([px - ux * 0.19, 3.5 + dy, pz - uz * 0.19]); }
        L.heads.push(head); keep.push([px, pz, 3]);
        if (!L.cop && withCop) L.cop = [n.x - ux * (n.disc + 0.6) + rx * (hw + 2.4), n.z - uz * (n.disc + 0.6) + rz * (hw + 2.4), Math.atan2(-rx, -rz)];
      }
      lights.push(L);
    }
    const lampMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.15, 10, 8), new THREE.MeshBasicMaterial({ toneMapped: false }), Math.max(1, lampPos.length));
    lampPos.forEach((q, k) => { lampMesh.setMatrixAt(k, new THREE.Matrix4().makeTranslation(q[0], q[1], q[2])); lampMesh.setColorAt(k, lin(0x222222)); });
    lampMesh.frustumCulled = false; scene.add(lampMesh);

    /* ---- police checks in town ---- */
    const checkpoints = [];
    const longMain = roads.filter((rd) => rd.main && rd.len > 100);
    for (let tries = 0; tries < 300 && checkpoints.length < 4; tries++) {
      const rd = pick(longMain), A = nodes[rd.a], t = rr(40, rd.len - 40);
      const x = A.x + rd.dx * t, z = A.z + rd.dz * t;
      if (z > RIVER[0] - 40 && z < RIVER[1] + 40) continue;
      if (stops.some((st) => Math.hypot(st.zx - x, st.zz - z) < 70) || checkpoints.some((c) => Math.hypot(c.zx - x, c.zz - z) < 350) || lights.some((l) => Math.hypot(l.x - x, l.z - z) < 50)) continue;
      const side = rnd() < 0.5 ? -1 : 1, nx = rd.nx * side, nz = rd.nz * side, ang = Math.atan2(rd.dx, rd.dz), off = rd.w / 2 + 2.4;
      const vx = x + nx * off, vz = z + nz * off;
      iBox(vx, 0.4, vz, 1.9, 1.0, 4.8, C(0x22384f), ang); iBox(vx + rd.dx * 0.9, 1.4, vz + rd.dz * 0.9, 1.8, 0.9, 2.2, C(0x22384f), ang);
      iBox(vx + rd.dx * 0.9, 2.35, vz + rd.dz * 0.9, 1.2, 0.12, 0.3, C(0x3d7fd8), ang);
      for (const a of [-9, -6, 6, 9]) iCone(x + rd.dx * a + nx * (rd.w / 2 - 0.5), 0.08, z + rd.dz * a + nz * (rd.w / 2 - 0.5), 0.3, 0.8, C(0xff6a1a));
      const sg = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.roadSign("POLICE", "CONTRÔLE", "#2b3a5c") })); sg.position.set(vx - rd.dx * 4, 3.2, vz - rd.dz * 4); sg.scale.set(4.2, 1.6, 1); scene.add(sg);
      keep.push([vx, vz, 6]);
      checkpoints.push({ kind: "police", zx: x, zz: z, state: "off", wait: 0, people: [[vx - rd.dx * 3.4, vz - rd.dz * 3.4], [x + nx * (rd.w / 2 - 1), z + nz * (rd.w / 2 - 1)]], ang });
    }

    /* ---- street vendors along the main roads ---- */
    const STALLS = [
      ["fruits", "des mangues", 200, 25, [0xf39c12, 0xe67e22, 0x8bc34a]], ["eau", "un sachet d'eau fraîche", 50, 10, [0x8fd3ff, 0xdff3ff]],
      ["beignets", "des beignets", 200, 30, [0xc68a3c, 0xe0a050]], ["brochettes", "des brochettes", 500, 45, [0x7a3a1c, 0x9a4a22]],
      ["arachides", "des arachides grillées", 100, 15, [0xb88a4a, 0xa0703a]], ["pain", "du pain", 150, 25, [0xe0b070, 0xd09a58]],
    ];
    for (const rd of roads) {
      if (!rd.main) continue;
      const A = nodes[rd.a], ang = Math.atan2(rd.dx, rd.dz);
      for (let t = 30; t < rd.len - 30; t += rr(45, 85)) {
        if (rnd() < (ECO ? 0.55 : 0.3)) continue;
        const side = rnd() < 0.5 ? -1 : 1, nx = rd.nx * side, nz = rd.nz * side, off = rd.w / 2 + 2.9;
        const x = A.x + rd.dx * t + nx * off, z = A.z + rd.dz * t + nz * off;
        if (z > RIVER[0] - 22 && z < RIVER[1] + 22) continue;
        if (stops.some((st) => Math.hypot(st.sx - x, st.sz - z) < 14) || stations.some((st) => Math.hypot(st.lx - x, st.lz - z) < 24) || kept(x, z)) continue;
        const k = pick(STALLS);
        iBox(x, 0, z, 0.9, 0.82, 1.9, C(0x7a5534, 0.2), ang);
        for (let j = 0; j < 4; j++) iIco(x + rd.dx * rr(-0.7, 0.7) + nx * rr(-0.2, 0.2), 0.95, z + rd.dz * rr(-0.7, 0.7) + nz * rr(-0.2, 0.2), rr(0.14, 0.22), C(pick(k[4]), 0.15), 0.8);
        iCyl(x, 1.3, z, 0.04, 2.6, C(0x333333)); iCone(x, 2.3, z, 1.3, 0.6, C(pick([0xe2b31d, 0xc0392b, 0x2e6fb0, 0x1f8a4c, 0xd2541f]), 0.1));
        keep.push([x, z, 3]);
        vendors.push({ x: x + rd.dx * 1.4 + nx * 0.3, z: z + rd.dz * 1.4 + nz * 0.3, ang: Math.atan2(-nx, -nz), kind: k[0] });
        food.push({ x: x - nx * 1.1, z: z - nz * 1.1, name: "Vendeuse", item: k[1], price: k[2], energy: k[3], kind: k[0] });
      }
    }

    /* ---- houses along every street ---- */
    const centre = (x, z) => Math.hypot(x - 0, (z + 200) * 1.2) < 380;
    for (const rd of roads) {
      const A = nodes[rd.a];
      const ang = Math.atan2(rd.dx, rd.dz);
      for (const side of [-1, 1]) {
        let t = 6;
        while (t < rd.len - 6) {
          const bw = pick([8, 8, 12, 12, 16]), bd = pick([8, 12, 12, 16]);
          const off = rd.w / 2 + 4.6 + bd / 2;
          const cx = A.x + rd.dx * (t + bw / 2) + rd.nx * side * off, cz = A.z + rd.dz * (t + bw / 2) + rd.nz * side * off;
          // local x is across the road: building width (local x) = bd, depth (local z) = bw
          if (isFree(cx, cz, bd, bw, ang)) {
            const wall = rnd() < 0.18;
            if (wall) {
              boxFaces(FB.banco, cx + rd.nx * side * (-bd / 2 + 0.3), 0, cz + rd.nz * side * (-bd / 2 + 0.3), 0.4, bw, 2.3, ang, C(0xffffff, 0.1), 4, 3);
              if (rnd() < 0.7) tree(cx, cz, pick(["mango", "neem", "karite"]));
              markRect(cx, cz, bd, bw, ang);
            } else {
              const floors = centre(cx, cz) ? pick([1, 2, 2, 3, 3, 4]) : pick([1, 1, 1, 2, 2]);
              const kind = centre(cx, cz) ? pick(["plaster", "plaster", "shutters", "banco"]) : pick(["plaster", "shutters", "banco", "banco"]);
              building(cx, cz, bd, bw, ang, floors, kind, side);
              markRect(cx, cz, bd, bw, ang);
            }
            t += bw + (rnd() < 0.3 ? rr(2, 5) : 0.6);
          } else t += 3;
        }
      }
    }
    // inner courtyards, back houses and trees
    for (let k = 0; k < 9000; k++) {
      const x = rr(-880, 880), z = rr(-980, 880);
      const c = cellOf(x, z); if (c < 0 || occ[c]) continue;
      if (z > RIVER[0] - 20 && z < RIVER[1] + 20) continue;
      const nr = nearestRoad(x, z, 120); if (!nr) continue;
      const ang = Math.atan2(nr.rd.dx, nr.rd.dz);
      if (rnd() < 0.62) {
        const w = pick([8, 8, 12]), d = pick([8, 12]);
        if (isFree(x, z, w, d, ang)) { building(x, z, w, d, ang, nr.d < 60 && centre(x, z) ? pick([1, 2, 2]) : 1, pick(["plaster", "banco", "banco", "shutters"]), 0); markRect(x, z, w, d, ang); }
      } else if (isFree(x, z, 4, 4, 0)) { tree(x, z, pick(["neem", "mango", "karite", "neem"])); markRect(x, z, 4, 4, 0); }
    }
    // street trees on the verges and electric poles along the main roads
    const wires = [];
    for (const rd of roads) {
      const A = nodes[rd.a];
      for (let t = 12; t < rd.len - 12; t += rr(14, 24)) for (const side of [-1, 1]) {
        if (rnd() < 0.5) continue;
        const off = rd.w / 2 + 2.6, x = A.x + rd.dx * t + rd.nx * side * off, z = A.z + rd.dz * t + rd.nz * side * off;
        if (z > RIVER[0] - 18 && z < RIVER[1] + 18) continue;
        if (stops.some((s) => Math.hypot(s.sx - x, s.sz - z) < 10) || inRoad(x, z) || kept(x, z)) continue;
        tree(x, z, rnd() < 0.8 ? "neem" : "mango");
      }
      if (!rd.main) continue;
      let prev = null;
      for (let t = 10; t < rd.len - 10; t += 34) {
        const off = rd.w / 2 + 3.4, x = A.x + rd.dx * t + rd.nx * off, z = A.z + rd.dz * t + rd.nz * off;
        if (z > RIVER[0] - 18 && z < RIVER[1] + 18) { prev = null; continue; }
        iCyl(x, 4, z, 0.13, 8, C(0x6b5440, 0.15));
        iBox(x, 7.6, z, 0.18, 0.18, 2.2, C(0x4a3a2c), Math.atan2(rd.nx, rd.nz));
        if (prev) for (const o of [-0.9, 0, 0.9]) {
          const p0 = [prev[0] + rd.nx * o, 7.75, prev[1] + rd.nz * o], p1 = [x + rd.nx * o, 7.75, z + rd.nz * o];
          const mid = [(p0[0] + p1[0]) / 2, 7.2, (p0[2] + p1[2]) / 2];
          wires.push(...p0, ...mid, ...mid, ...p1);
        }
        prev = [x, z];
      }
    }
    if (wires.length) { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(wires, 3)); scene.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: lin(0x222222) }))); }
    // outskirts: baobabs, fields and the hills (Koulouba to the north)
    for (let k = 0; k < 260; k++) {
      const x = rr(-1500, 1500), z = rr(-1500, 1500);
      if (Math.abs(x) < 880 && z > -980 && z < 880) continue;
      if (z > RIVER[0] - 25 && z < RIVER[1] + 25) continue;
      tree(x, z, rnd() < 0.35 ? "baobab" : pick(["karite", "neem", "mango"]));
    }
    for (let k = 0; k < 120; k++) { const x = rr(-860, 860), z = rr(-1000, 880); if (Math.abs(z) < 120) continue; const c = cellOf(x, z); if (c >= 0 && !occ[c] && !nearestRoad(x, z, 60)) { tree(x, z, "baobab"); markDisc(x, z, 5); } }
    for (let k = 0; k < 10; k++) iIco(rr(-900, 900), -10, rr(-1350, -1150), rr(150, 260), C(0x8a6a45, 0.15), 0.32);
    iIco(0, -20, -1080, 230, C(0x7f6a48), 0.36); // Koulouba
    for (let k = 0; k < 9; k++) iIco(rr(-1200, 1200), -6, rr(1250, 1450), rr(110, 200), C(0x8f6f4a, 0.15), 0.25);
    // riverside gardens and reeds
    for (let x = -1700; x < 1700; x += rr(5, 11)) {
      for (const zc of [-71, 71]) {
        if (rnd() < 0.55) iIco(x, 0.4, zc + rr(-5, 5), rr(0.9, 1.6), C(PAL.neem, 0.3), 0.6);
        else if (rnd() < 0.5) iBox(x, 0.02, zc + rr(-5, 5), rr(3, 6), 0.35, 1.2, C(0x4d7a2a, 0.25));
      }
    }

    for (const s of stops) {
      const P = (along, out) => [s.sx + s.dx * along + s.nx * out, s.sz + s.dz * along + s.nz * out];
      let p = P(0, 0); iBox(p[0], 2.8, p[1], 2.8, 0.2, 6, C(0x1d7f46), s.ang);
      for (const o of [-2.6, 2.6]) { p = P(o, 0.9); iBox(p[0], 0, p[1], 0.14, 2.8, 0.14, C(0x2b2b2b), s.ang); }
      p = P(0, 0.7); iBox(p[0], 0, p[1], 0.6, 0.5, 4, C(0x7a5534), s.ang);
    }

    /* ---- flush all geometry ---- */
    const facMats = {};
    for (const k of Object.keys(FB)) { facMats[k] = std({ map: facades[k], vertexColors: true, roughness: k === "glass" ? 0.3 : 0.92, metalness: k === "glass" ? 0.35 : 0 }); finish(FB[k], facMats[k], true); }
    finish(roofB, std({ map: texRoof, vertexColors: true }), false);
    finish(doorB, std({ map: texDoor, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), false);
    finish(signB, std({ map: texSigns, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), false);
    flushInst(new THREE.BoxGeometry(1, 1, 1), INST.box);
    flushInst(new THREE.CylinderGeometry(0.5, 0.5, 1, 7), INST.cyl);
    flushInst(new THREE.CylinderGeometry(0.32, 0.5, 1, 7), INST.trunk, true);
    flushInst(new THREE.CylinderGeometry(0.4, 0.5, 1, 5, 1, true), INST.stem, true);
    flushInst(new THREE.ConeGeometry(1, 1, 8), INST.cone, true);
    flushInst(new THREE.IcosahedronGeometry(1, 0), INST.ico, true);

    // stop signs (the shelters are part of the instanced boxes above)
    for (const s of stops) {
      const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.stopSign(s.name) })); sign.position.set(s.sx, 6.2, s.sz); sign.scale.set(9, 2.8, 1); scene.add(sign);
    }

    const counts = { box: INST.box.length, cyl: INST.cyl.length, cone: INST.cone.length, ico: INST.ico.length, trunk: INST.trunk.length };
    for (const k of Object.keys(FB)) counts["fac_" + k] = FB[k].idx.length / 3;
    counts.roof = roofB.idx.length / 3; counts.road = roadB.idx.length / 3; counts.verge = vergeB.idx.length / 3; counts.jun = junB.idx.length / 3;
    return {
      counts, nodes, roads, stops, stations, landmarks, parked, inRoad, nearestRoad, RING, RIVER, water, waterGeo, waterBase, texWater,
      walkable, food, vendors, lights, lampMesh, checkpoints,
      bounds: { x0: -880, x1: 880, z0: -800, z1: 820 },
      start: { x: -95, z: -190 + 3, h: Math.PI / 2 },
    };
  };
})();
