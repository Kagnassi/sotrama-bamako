/* Sotrama Bamako - vehicles and people (the player's minibus, instanced traffic, crowds). */
(function () {
  "use strict";
  const SB = (window.SB = window.SB || {});
  const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();
  const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.8, metalness: 0 }, o || {}));
  const CLOTH = [0x2b3a8c, 0xe2b31d, 0xb83280, 0x1f8a4c, 0xd2541f, 0x3d8fd1, 0xf3efe6, 0x6a2d7a, 0x0f6b6b, 0xc0392b, 0x8c6d1f];
  const SKIN = [0x4a2f20, 0x5c3a26, 0x3b261a, 0x6b4430];
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  SB.CLOTH = CLOTH; SB.SKIN = SKIN;

  const personGeo = { body: new THREE.CylinderGeometry(0.24, 0.38, 1.3, 7), head: new THREE.SphereGeometry(0.2, 7, 5), wrap: new THREE.CylinderGeometry(0.23, 0.21, 0.2, 7) };
  SB.personMesh = function (cloth) {
    const g = new THREE.Group();
    const b = new THREE.Mesh(personGeo.body, std({ color: lin(cloth || pick(CLOTH)) })); b.position.y = 0.65; b.castShadow = true; g.add(b);
    const h = new THREE.Mesh(personGeo.head, std({ color: lin(pick(SKIN)) })); h.position.y = 1.5; g.add(h);
    const w = new THREE.Mesh(personGeo.wrap, std({ color: lin(pick(CLOTH)) })); w.position.y = 1.68; g.add(w);
    return g;
  };

  /* ---------- the player's Sotrama ---------- */
  SB.makeBus = function (livery) {
    const T = SB.tex.bus(livery);
    const g = new THREE.Group();
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
    const dark = std({ color: lin(0x1a1a1a), roughness: 0.9 }), chrome = std({ color: lin(0xb9b9b9), roughness: 0.3, metalness: 0.8 });
    add(new THREE.BoxGeometry(2.3, 1.95, 5.4), [
      std({ map: T.left, roughness: 0.5 }), std({ map: T.right, roughness: 0.5 }), std({ color: lin(T.roof), roughness: 0.6 }),
      dark, std({ map: T.front, roughness: 0.45 }), std({ map: T.back, roughness: 0.5 }),
    ], 0, 1.43, 0);
    add(new THREE.BoxGeometry(2.36, 0.22, 0.25), dark, 0, 0.55, 2.74);
    add(new THREE.BoxGeometry(2.36, 0.22, 0.25), dark, 0, 0.55, -2.74);
    for (const x of [-1.32, 1.32]) { add(new THREE.BoxGeometry(0.5, 0.05, 0.05), dark, x * 0.95, 2.0, 2.55); add(new THREE.BoxGeometry(0.08, 0.32, 0.2), dark, x * 1.12, 1.95, 2.55); }
    // roof rack with luggage
    add(new THREE.BoxGeometry(2.1, 0.07, 4.4), dark, 0, 2.48, -0.15);
    for (const x of [-1.03, 1.03]) add(new THREE.BoxGeometry(0.05, 0.3, 4.4), dark, x, 2.62, -0.15);
    const bags = [[0.6, 0.5, 0.9, 0x2e6fb0, -0.45, -1.3], [0.9, 0.55, 0.8, 0xe2b31d, 0.35, -0.3], [0.7, 0.45, 1.1, 0xc0392b, -0.35, 0.8], [0.6, 0.6, 0.6, 0x7a5534, 0.45, 1.4], [0.5, 0.35, 0.7, 0x2f7a4d, 0.4, 0.6]];
    for (const [w, h, d, c, x, z] of bags) add(new THREE.BoxGeometry(w, h, d), std({ color: lin(c) }), x, 2.52 + h / 2, z);
    const sack = add(new THREE.CylinderGeometry(0.34, 0.34, 1.5, 10), std({ color: lin(0xe7dcc6) }), 0, 2.86, -2.0); sack.rotation.z = Math.PI / 2;
    // wheels with hub caps
    const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.32, 18); wheelGeo.rotateZ(Math.PI / 2);
    const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.34, 10); hubGeo.rotateZ(Math.PI / 2);
    const wheels = [];
    for (const [x, z] of [[-1.08, 1.75], [1.08, 1.75], [-1.08, -1.75], [1.08, -1.75]]) {
      const w = add(wheelGeo, std({ color: lin(0x161616), roughness: 0.95 }), x, 0.45, z);
      const hub = new THREE.Mesh(hubGeo, chrome); w.add(hub); wheels.push(w);
    }
    // the apprenti, hanging at the open side door
    const app = SB.personMesh(0x2b3a8c); app.position.set(-1.36, 0.42, -1.65); app.rotation.z = 0.16; g.add(app);
    g.userData.wheels = wheels;
    return g;
  };

  /* ---------- instanced vehicles ---------- */
  const _m = new THREE.Matrix4(), _v = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  function Fleet(scene, parts, count) {
    this.count = count;
    this.parts = parts.map((pt) => {
      const im = new THREE.InstancedMesh(pt.geo, pt.mat, count);
      im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < count; i++) { im.setMatrixAt(i, ZERO); if (pt.colors) im.setColorAt(i, lin(pt.colors[i % pt.colors.length])); }
      if (pt.colorsRandom) for (let i = 0; i < count; i++) im.setColorAt(i, lin(pick(pt.colorsRandom)));
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      scene.add(im);
      _e.set(pt.rx || 0, pt.ry || 0, pt.rz || 0); _q.setFromEuler(_e);
      const local = new THREE.Matrix4().compose(new THREE.Vector3(pt.x || 0, pt.y || 0, pt.z || 0), _q.clone(), new THREE.Vector3(1, 1, 1));
      return { im, local, optional: pt.optional };
    });
    this.hidden = new Array(count).fill(false);
    this.optionalOn = Array.from({ length: count }, () => Math.random() < 0.4);
  }
  Fleet.prototype.set = function (i, x, y, z, ang, roll) {
    _e.set(0, ang, roll || 0, "YXZ"); _q.setFromEuler(_e);
    _v.compose(_p.set(x, y, z), _q, _s);
    for (const pt of this.parts) {
      if (pt.optional && !this.optionalOn[i]) { pt.im.setMatrixAt(i, ZERO); continue; }
      _m.multiplyMatrices(_v, pt.local); pt.im.setMatrixAt(i, _m);
    }
  };
  Fleet.prototype.hide = function (i) { for (const pt of this.parts) pt.im.setMatrixAt(i, ZERO); };
  Fleet.prototype.commit = function () { for (const pt of this.parts) pt.im.instanceMatrix.needsUpdate = true; };
  SB.Fleet = Fleet;

  const wheelGeo = (r, w) => { const g = new THREE.CylinderGeometry(r, r, w, 12); g.rotateZ(Math.PI / 2); return g; };
  // all the wheels of a vehicle in one geometry (one draw call instead of four)
  function wheelSet(r, w, positions) {
    const parts = positions.map(([x, y, z]) => { const g = wheelGeo(r, w); g.translate(x, y, z); return g; });
    const out = new THREE.BufferGeometry(), pos = [], nor = [], uv = [], idx = [];
    let off = 0;
    for (const g of parts) {
      pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); uv.push(...g.attributes.uv.array);
      for (const i of g.index.array) idx.push(i + off);
      off += g.attributes.position.count;
    }
    out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3)); out.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); out.setIndex(idx);
    return out;
  }
  SB.motoFleet = function (scene, count) {
    const tire = std({ color: lin(0x111111), roughness: 0.95 });
    return new Fleet(scene, [
      { geo: new THREE.BoxGeometry(0.42, 0.5, 1.6), mat: std({ roughness: 0.4 }), y: 0.62, colorsRandom: [0xb3261e, 0x1d1d1d, 0x2e6fb0, 0xd0d0d0, 0x1d1d1d] },
      { geo: wheelSet(0.32, 0.12, [[0, 0.32, 0.72], [0, 0.32, -0.72]]), mat: tire },
      { geo: personGeo.body, mat: std(), y: 1.25, z: -0.15, colorsRandom: CLOTH },
      { geo: personGeo.head, mat: std(), y: 2.05, z: -0.15, colorsRandom: SKIN },
      { geo: personGeo.body, mat: std(), y: 1.22, z: -0.75, colorsRandom: CLOTH, optional: true },
      { geo: personGeo.head, mat: std(), y: 2.0, z: -0.75, colorsRandom: SKIN, optional: true },
    ], count);
  };
  SB.taxiFleet = function (scene, count) {
    const T = SB.tex.taxi();
    const yellow = std({ color: lin(0xf1c232), roughness: 0.45 }), dark = std({ color: lin(0x1a1a1a) });
    const glass = std({ color: lin(0x26323a), roughness: 0.15, metalness: 0.3 }), tire = std({ color: lin(0x111111), roughness: 0.95 });
    const parts = [
      { geo: new THREE.BoxGeometry(1.8, 0.75, 4.2), mat: [std({ map: T.left, roughness: 0.45 }), std({ map: T.right, roughness: 0.45 }), yellow, dark, yellow, yellow], y: 0.72 },
      { geo: new THREE.BoxGeometry(1.6, 0.62, 2.3), mat: [std({ map: T.cabin }), std({ map: T.cabin }), yellow, dark, glass, glass], y: 1.4, z: -0.2 },
      { geo: new THREE.BoxGeometry(0.5, 0.2, 0.25), mat: std({ color: lin(0xffffff) }), y: 1.81, z: -0.2 },
    ];
    parts.push({ geo: wheelSet(0.36, 0.24, [[-0.86, 0.36, 1.3], [0.86, 0.36, 1.3], [-0.86, 0.36, -1.3], [0.86, 0.36, -1.3]]), mat: tire });
    return new Fleet(scene, parts, count);
  };
  SB.busFleet = function (scene, livery, count, parkedOnly) {
    const T = SB.tex.bus(livery);
    const dark = std({ color: lin(0x1a1a1a) }), tire = std({ color: lin(0x111111), roughness: 0.95 });
    const parts = [
      { geo: new THREE.BoxGeometry(2.3, 1.95, 5.4), mat: [std({ map: T.left, roughness: 0.5 }), std({ map: T.right, roughness: 0.5 }), std({ color: lin(T.roof) }), dark, std({ map: T.front }), std({ map: T.back })], y: 1.43 },
      { geo: new THREE.BoxGeometry(2.1, 0.3, 4.2), mat: dark, y: 2.55, z: -0.15 },
      { geo: new THREE.BoxGeometry(1.5, 0.5, 2.2), mat: std(), y: 2.9, z: -0.4, colorsRandom: [0x2e6fb0, 0xe2b31d, 0xc0392b, 0x7a5534, 0xe7dcc6] },
    ];
    if (parkedOnly) parts.length = 2;
    parts.push({ geo: wheelSet(0.45, 0.32, [[-1.08, 0.45, 1.75], [1.08, 0.45, 1.75], [-1.08, 0.45, -1.75], [1.08, 0.45, -1.75]]), mat: tire });
    return new Fleet(scene, parts, count);
  };

  /* ---------- crowds (one draw call per body part) ---------- */
  function People(scene, capacity) {
    this.cap = capacity;
    this.free = []; for (let i = capacity - 1; i >= 0; i--) this.free.push(i);
    const mk = (geo) => { const im = new THREE.InstancedMesh(geo, std(), capacity); im.castShadow = true; im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); for (let i = 0; i < capacity; i++) { im.setMatrixAt(i, ZERO); im.setColorAt(i, lin(0xffffff)); } scene.add(im); return im; };
    this.body = mk(personGeo.body); this.head = mk(personGeo.head); this.wrap = mk(personGeo.wrap);
    this.hasWrap = new Array(capacity).fill(false);
  }
  People.prototype.alloc = function () {
    const i = this.free.pop(); if (i === undefined) return -1;
    this.body.setColorAt(i, lin(pick(CLOTH))); this.head.setColorAt(i, lin(pick(SKIN))); this.wrap.setColorAt(i, lin(pick(CLOTH)));
    this.hasWrap[i] = Math.random() < 0.5;
    this.body.instanceColor.needsUpdate = this.head.instanceColor.needsUpdate = this.wrap.instanceColor.needsUpdate = true;
    return i;
  };
  People.prototype.set = function (i, x, z, ang, bob) {
    const y = bob || 0;
    _e.set(0, ang || 0, 0); _q.setFromEuler(_e);
    _m.compose(_p.set(x, 0.65 + y + 0.08, z), _q, _s); this.body.setMatrixAt(i, _m);
    _m.compose(_p.set(x, 1.5 + y + 0.08, z), _q, _s); this.head.setMatrixAt(i, _m);
    if (this.hasWrap[i]) { _m.compose(_p.set(x, 1.68 + y + 0.08, z), _q, _s); this.wrap.setMatrixAt(i, _m); } else this.wrap.setMatrixAt(i, ZERO);
  };
  People.prototype.release = function (i) { if (i < 0) return; this.body.setMatrixAt(i, ZERO); this.head.setMatrixAt(i, ZERO); this.wrap.setMatrixAt(i, ZERO); this.free.push(i); };
  People.prototype.commit = function () { this.body.instanceMatrix.needsUpdate = this.head.instanceMatrix.needsUpdate = this.wrap.instanceMatrix.needsUpdate = true; };
  SB.People = People;
})();
