/* Sotrama Bamako - vehicles and people (the player's minibus, instanced traffic, crowds). */
(function () {
  "use strict";
  const SB = (window.SB = window.SB || {});
  const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();
  const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.8, metalness: 0 }, o || {}));
  const CLOTH = [0x2b3a8c, 0xe2b31d, 0xb83280, 0x1f8a4c, 0xd2541f, 0x3d8fd1, 0xf3efe6, 0x6a2d7a, 0x0f6b6b, 0xc0392b, 0x8c6d1f];
  const SKIN = [0x8d5a3b, 0xa06a46, 0x7a4a2e, 0xb07a52, 0x6e4430];
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  SB.CLOTH = CLOTH; SB.SKIN = SKIN;

  const PANTS = [0x1f2a36, 0x2b3a5c, 0x3a3a3a, 0x6b5a45, 0x24364f, 0x4a3b2c, 0xd9cdb5];
  const HAIR = [0x141010, 0x1c1714, 0x0d0b0a];
  SB.PANTS = PANTS;

  /* ---------- geometry helpers ---------- */
  const _xm = new THREE.Matrix4(), _xq = new THREE.Quaternion(), _xe = new THREE.Euler();
  function xf(geo, x, y, z, rx, ry, rz, sx, sy, sz) {
    _xe.set(rx || 0, ry || 0, rz || 0); _xq.setFromEuler(_xe);
    _xm.compose(new THREE.Vector3(x || 0, y || 0, z || 0), _xq, new THREE.Vector3(sx || 1, sy || 1, sz || 1));
    geo.applyMatrix4(_xm); return geo;
  }
  // vertex colour: white parts take the instance colour, the others keep their own colour
  function paint(geo, hex) {
    const c = hex === undefined ? new THREE.Color(1, 1, 1) : lin(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    geo.setAttribute("color", new THREE.BufferAttribute(a, 3)); return geo;
  }
  function uvAt(geo, u, v) { const a = geo.attributes.uv; for (let i = 0; i < a.count; i++) a.setXY(i, u, v); return geo; }
  function merge(list) {
    const pos = [], nor = [], uv = [], col = [], idx = []; let off = 0;
    for (const g of list) {
      const n = g.attributes.position.count, P = g.attributes.position.array, N = g.attributes.normal.array;
      for (let i = 0; i < P.length; i++) { pos.push(P[i]); nor.push(N[i]); }
      if (g.attributes.uv) { const U = g.attributes.uv.array; for (let i = 0; i < U.length; i++) uv.push(U[i]); } else for (let i = 0; i < n; i++) uv.push(0, 0);
      if (g.attributes.color) { const C = g.attributes.color.array; for (let i = 0; i < C.length; i++) col.push(C[i]); } else for (let i = 0; i < n * 3; i++) col.push(1);
      if (g.index) { const I = g.index.array; for (let i = 0; i < I.length; i++) idx.push(I[i] + off); } else for (let i = 0; i < n; i++) idx.push(i + off);
      off += n;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); out.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); out.setIndex(idx);
    return out;
  }
  // a tapered cylinder from point a (radius ra) to point b (radius rb): limbs, forks, pipes
  function rod(ra, rb, a, b, segs) {
    segs = segs || (Math.max(ra, rb) < 0.03 ? 5 : 8);
    const A = new THREE.Vector3(a[0], a[1], a[2]), d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length();
    const g = new THREE.CylinderGeometry(rb, ra, len, segs, 1, true); g.translate(0, len / 2, 0);
    g.applyMatrix4(new THREE.Matrix4().compose(A, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()), new THREE.Vector3(1, 1, 1)));
    return g;
  }

  /* ---------- people: cartoon proportions, legs and shoes, arms and hands, a face ---------- */
  const BODY = { hipY: 0.9, hipX: 0.1, legLen: 0.8, shX: 0.25, shY: 1.43, armLen: 0.6, headY: 1.68 };
  const PG = {
    leg: merge([paint(xf(new THREE.CylinderGeometry(0.085, 0.066, BODY.legLen, 6), 0, -BODY.legLen / 2, 0)), paint(xf(new THREE.BoxGeometry(0.13, 0.09, 0.27), 0, -BODY.legLen + 0.005, 0.05), 0x1c1714)]),
    torso: merge([paint(xf(new THREE.CylinderGeometry(0.205, 0.17, 0.6, 10, 1, true), 0, 1.14, 0, 0, 0, 0, 1, 1, 0.66)), paint(xf(new THREE.SphereGeometry(0.205, 10, 3, 0, Math.PI * 2, 0, Math.PI / 2), 0, 1.44, 0, 0, 0, 0, 1, 0.4, 0.66))]),
    arm: paint(xf(new THREE.CylinderGeometry(0.062, 0.05, BODY.armLen, 6, 1, true), 0, -BODY.armLen / 2, 0)),
    hand: xf(new THREE.SphereGeometry(0.066, 6, 4), 0, -BODY.armLen - 0.03, 0),
    headRaw: () => merge([xf(new THREE.SphereGeometry(0.18, 14, 10), 0, 0, 0, 0, 0, 0, 1, 1.1, 1.02), uvAt(xf(new THREE.CylinderGeometry(0.07, 0.08, 0.14, 6, 1, true), 0, -0.2, 0), 0.75, 0.3)]),
    hairRaw: () => xf(new THREE.SphereGeometry(0.19, 12, 4, 0, Math.PI * 2, 0, Math.PI * 0.42), 0, 0.03, -0.012, 0, 0, 0, 1, 1.08, 1.04),
    wrapRaw: () => xf(new THREE.CylinderGeometry(0.2, 0.175, 0.22, 10), 0, 0.17, -0.01),
    skirt: paint(xf(new THREE.CylinderGeometry(0.2, 0.3, 0.8, 10, 1, true), 0, 0.5, 0)),
    basin: xf(new THREE.CylinderGeometry(0.42, 0.28, 0.16, 10), 0, 1.98, 0),
  };
  PG.head = xf(PG.headRaw(), 0, BODY.headY, 0);
  PG.headLow = xf(merge([xf(new THREE.SphereGeometry(0.18, 10, 7), 0, 0, 0, 0, 0, 0, 1, 1.1, 1.02)]), 0, BODY.headY, 0); PG.hair = xf(PG.hairRaw(), 0, BODY.headY, 0); PG.wrap = xf(PG.wrapRaw(), 0, BODY.headY, 0);
  let faceMat = null;
  function getFaceMat() {
    if (!faceMat) { const f = SB.tex.face(); faceMat = new THREE.MeshStandardMaterial({ map: f.map, emissiveMap: f.emissive, emissive: new THREE.Color(0.6, 0.6, 0.6), roughness: 0.6 }); }
    return faceMat;
  }
  // one person as ordinary meshes (the driver on foot, the apprenti on the door)
  SB.personMesh = function (cloth, pants) {
    const g = new THREE.Group(), skin = pick(SKIN);
    const vc = (hex) => std({ vertexColors: true, color: lin(hex), roughness: 0.85 });
    const shirtM = vc(cloth || pick(CLOTH)), pantsM = vc(pants || pick(PANTS)), skinM = std({ color: lin(skin), roughness: 0.7 });
    const add = (geo, mat, parent) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; (parent || g).add(m); return m; };
    add(PG.torso, shirtM);
    const headM = getFaceMat().clone(); headM.color = lin(skin); add(PG.head, headM);
    add(PG.hair, std({ color: lin(pick(HAIR)), roughness: 0.95 }));
    const legs = [], arms = [];
    for (const side of [-1, 1]) {
      const leg = add(PG.leg, pantsM); leg.position.set(side * BODY.hipX, BODY.hipY, 0); legs.push(leg);
      const arm = add(PG.arm, shirtM); arm.rotation.order = "ZYX"; arm.position.set(side * BODY.shX, BODY.shY, 0); arm.rotation.z = side * 0.1; add(PG.hand, skinM, arm); arms.push(arm);
    }
    g.userData.legs = legs; g.userData.arms = arms;
    g.userData.pose = (phase) => {
      const sw = typeof phase === "number" ? Math.sin(phase) * 0.5 : 0;
      legs[0].rotation.x = -sw; legs[1].rotation.x = sw; arms[0].rotation.x = sw * 0.8; arms[1].rotation.x = -sw * 0.8;
    };
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
    const app = SB.personMesh(0x2b3a8c); app.position.set(-1.36, 0.42, -1.65); app.rotation.z = 0.16; app.userData.arms[1].rotation.z = 2.75; g.add(app);
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
  /* ---------- Djakarta motos and their riders ---------- */
  const MOTO_COLORS = [0xb3261e, 0x1d1d1d, 0x2e6fb0, 0xd0d0d0, 0x1d1d1d, 0x7a1f1f, 0x245a2a];
  function motoGeos() {
    const R = 0.3, wz = [0.66, -0.62], black = 0x141414, chrome = 0xc8c8c8, grey = 0x55585c;
    const body = merge([
      xf(new THREE.SphereGeometry(0.2, 10, 7), 0, 0.92, 0.2, 0, 0, 0, 0.75, 0.55, 1.25),
      xf(new THREE.BoxGeometry(0.3, 0.2, 0.36), 0, 0.76, -0.28),
      xf(new THREE.CylinderGeometry(R + 0.04, R + 0.04, 0.13, 14, 1, true, 0.3, 1.8), 0, R, wz[0], 0, 0, Math.PI / 2),
      xf(new THREE.CylinderGeometry(R + 0.04, R + 0.04, 0.14, 14, 1, true, 1.1, 1.9), 0, R, wz[1], 0, 0, Math.PI / 2),
      xf(new THREE.BoxGeometry(0.22, 0.2, 0.16), 0, 1.0, 0.64),
      xf(new THREE.BoxGeometry(0.17, 0.07, 0.5), 0, 0.9, -0.7, -0.12, 0, 0),
    ]);
    const mech = merge([
      ...wz.map((z) => paint(xf(new THREE.TorusGeometry(R - 0.055, 0.058, 5, 14), 0, R, z, 0, Math.PI / 2, 0), black)),
      ...wz.map((z) => paint(xf(new THREE.CylinderGeometry(R - 0.07, R - 0.07, 0.03, 12), 0, R, z, 0, 0, Math.PI / 2), 0x77797c)),
      ...wz.map((z) => paint(xf(new THREE.CylinderGeometry(0.08, 0.08, 0.13, 10), 0, R, z, 0, 0, Math.PI / 2), chrome)),
      paint(xf(new THREE.BoxGeometry(0.26, 0.1, 0.62), 0, 1.02, -0.3), 0x1b1b1b),
      paint(xf(new THREE.BoxGeometry(0.24, 0.24, 0.3), 0, 0.52, -0.04), grey),
      paint(xf(new THREE.CylinderGeometry(0.11, 0.11, 0.27, 12), 0, 0.42, 0.06, 0, 0, Math.PI / 2), grey),
      paint(rod(0.022, 0.022, [-0.09, R, 0.66], [-0.08, 1.02, 0.56]), chrome), paint(rod(0.022, 0.022, [0.09, R, 0.66], [0.08, 1.02, 0.56]), chrome),
      paint(rod(0.016, 0.016, [-0.34, 1.12, 0.5], [0.34, 1.12, 0.5]), chrome),
      paint(rod(0.026, 0.026, [-0.37, 1.12, 0.5], [-0.27, 1.12, 0.5]), black), paint(rod(0.026, 0.026, [0.27, 1.12, 0.5], [0.37, 1.12, 0.5]), black),
      paint(rod(0.04, 0.035, [0.15, 0.36, 0.05], [0.17, 0.5, -0.88]), chrome),
      paint(rod(0.02, 0.02, [-0.13, R, -0.62], [-0.12, 0.94, -0.45]), chrome), paint(rod(0.02, 0.02, [0.13, R, -0.62], [0.12, 0.94, -0.45]), chrome),
      paint(rod(0.012, 0.012, [-0.24, 1.12, 0.5], [-0.28, 1.33, 0.46]), chrome), paint(rod(0.012, 0.012, [0.24, 1.12, 0.5], [0.28, 1.33, 0.46]), chrome),
      paint(xf(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 10), -0.28, 1.35, 0.46, Math.PI / 2, 0, 0), black), paint(xf(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 10), 0.28, 1.35, 0.46, Math.PI / 2, 0, 0), black),
      paint(xf(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 14), 0, 1.0, 0.73, Math.PI / 2, 0, 0), 0xfff2c8),
      paint(xf(new THREE.BoxGeometry(0.11, 0.05, 0.04), 0, 0.92, -0.96), 0xc0261e),
      paint(rod(0.015, 0.015, [-0.22, 0.4, 0.02], [0.22, 0.4, 0.02]), chrome),
    ]);
    return { body, mech };
  }
  // a seated person: on the moto the rider leans to the handlebar, the passenger sits upright behind
  function seated(hip, lean, hands, knee, ankle) {
    const H = new THREE.Vector3(hip[0], hip[1], hip[2]);
    const rot = (v) => [v[0], H.y + v[1] * Math.cos(lean) - v[2] * Math.sin(lean), H.z + v[1] * Math.sin(lean) + v[2] * Math.cos(lean)];
    const torso = PG.torso.clone(); torso.translate(0, -BODY.hipY, 0); torso.rotateX(lean); torso.translate(H.x, H.y, H.z);
    const shirt = [torso], pants = [], skin = [];
    for (const s of [-1, 1]) {
      const sh = rot([s * BODY.shX, BODY.shY - BODY.hipY, 0]), hd = [s * hands[0], hands[1], hands[2]];
      shirt.push(paint(rod(0.05, 0.062, hd, sh)));
      skin.push(uvAt(xf(new THREE.SphereGeometry(0.066, 6, 4), hd[0], hd[1], hd[2]), 0.75, 0.3));
      const hp = [s * BODY.hipX, H.y, H.z], kn = [s * knee[0], knee[1], knee[2]], an = [s * ankle[0], ankle[1], ankle[2]];
      pants.push(paint(rod(0.08, 0.088, kn, hp)), paint(rod(0.066, 0.078, an, kn)), paint(xf(new THREE.BoxGeometry(0.13, 0.09, 0.27), an[0], an[1] - 0.04, an[2] + 0.06), 0x1c1714));
    }
    const head = rot([0, BODY.headY - BODY.hipY, 0]);
    skin.push(xf(PG.headRaw(), head[0], head[1], head[2]));
    return { shirt: merge(shirt), pants: merge(pants), skin: merge(skin), hair: xf(PG.hairRaw(), head[0], head[1], head[2]), wrap: xf(PG.wrapRaw(), head[0], head[1], head[2]) };
  }
  SB.motoFleet = function (scene, count) {
    const G = motoGeos(), face = getFaceMat(), vc = () => std({ vertexColors: true, roughness: 0.8 });
    const R1 = seated([0, 0.98, -0.24], 0.3, [0.31, 1.12, 0.5], [0.17, 0.96, 0.14], [0.2, 0.44, 0.08]);
    const R2 = seated([0, 1.05, -0.68], 0.05, [0.2, 1.07, -0.42], [0.17, 1.03, -0.3], [0.21, 0.5, -0.36]);
    return new Fleet(scene, [
      { geo: G.body, mat: std({ roughness: 0.35, metalness: 0.25 }), colorsRandom: MOTO_COLORS },
      { geo: G.mech, mat: std({ vertexColors: true, roughness: 0.45, metalness: 0.45 }) },
      { geo: R1.shirt, mat: vc(), colorsRandom: CLOTH },
      { geo: R1.pants, mat: vc(), colorsRandom: PANTS },
      { geo: R1.skin, mat: face, colorsRandom: SKIN },
      { geo: R1.hair, mat: std({ roughness: 0.55 }), colorsRandom: [...HAIR, ...HAIR, 0xd0d0d0, 0xc0392b, 0x2e6fb0] },
      { geo: R2.shirt, mat: vc(), colorsRandom: CLOTH, optional: true },
      { geo: R2.pants, mat: vc(), colorsRandom: CLOTH, optional: true },
      { geo: R2.skin, mat: face, colorsRandom: SKIN, optional: true },
      { geo: R2.wrap, mat: std(), colorsRandom: CLOTH, optional: true },
    ], count);
  };

  /* ---------- cars: saloon (taxi or private) and 4x4, bodies extruded from a side profile ---------- */
  const CAR = {
    saloon: {
      len: 4.4, wid: 1.62, wz: 1.32, wr: 0.42, wy: 0.34, tire: 0.34, tx: 0.78,
      profile: [[2.16, 0.34], [2.22, 0.58], [2.18, 0.76], [1.95, 0.85], [0.95, 0.94], [0.3, 1.38], [-0.8, 1.4], [-1.5, 1.0], [-2.12, 0.95], [-2.22, 0.72], [-2.18, 0.4]],
      glass: [[0.97, 1.0], [0.47, 1.34], [-1.03, 1.34], [-1.62, 1.0]], pillar: -0.28,
      front: 2.25, frontY: 0.72, back: -2.24, backY: 0.82, bump: 0.45,
    },
    suv: {
      len: 4.8, wid: 1.74, wz: 1.45, wr: 0.48, wy: 0.42, tire: 0.42, tx: 0.82,
      profile: [[2.35, 0.42], [2.4, 0.75], [2.3, 1.05], [1.3, 1.12], [0.95, 1.78], [-2.25, 1.8], [-2.38, 1.1], [-2.35, 0.45]],
      glass: [[1.35, 1.18], [1.06, 1.73], [-2.34, 1.73], [-2.45, 1.18]], pillar: -0.45,
      front: 2.39, frontY: 0.95, back: -2.43, backY: 0.95, bump: 0.55,
    },
  };
  function extrude(points, depth, bevel) {
    const sh = new THREE.Shape(); sh.moveTo(points[0][0], points[0][1]); for (const p of points.slice(1)) sh.lineTo(p[0], p[1]);
    return centreX(new THREE.ExtrudeGeometry(sh, bevel ? { depth, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2, curveSegments: 10 } : { depth, bevelEnabled: false }));
  }
  function centreX(geo) { geo.rotateY(-Math.PI / 2); geo.computeBoundingBox(); geo.translate(-(geo.boundingBox.min.x + geo.boundingBox.max.x) / 2, 0, 0); return geo; }
  const carCache = {};
  function carGeos(kind, taxi) {
    const key = kind + (taxi ? "t" : "");
    if (carCache[key]) return carCache[key];
    const K = CAR[kind];
    const sh = new THREE.Shape();
    sh.moveTo(K.profile[K.profile.length - 1][0], K.profile[K.profile.length - 1][1]);
    sh.lineTo(-K.wz - K.wr, K.wy); sh.absarc(-K.wz, K.wy, K.wr, Math.PI, 0, true);
    sh.lineTo(K.wz - K.wr, K.wy); sh.absarc(K.wz, K.wy, K.wr, Math.PI, 0, true);
    for (const p of K.profile) sh.lineTo(p[0], p[1]);
    const shell = centreX(new THREE.ExtrudeGeometry(sh, { depth: K.wid, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 1, curveSegments: 7 }));
    const W = K.wid + 0.1, glassD = W + 0.03, gy0 = K.glass[0][1], gy1 = K.glass[1][1];
    const body = merge([paint(shell), paint(xf(new THREE.BoxGeometry(glassD + 0.01, gy1 - gy0, 0.09), 0, (gy0 + gy1) / 2, K.pillar))]);
    const glass = extrude(K.glass, glassD, false);
    const lights = merge([
      ...[-1, 1].map((s) => paint(xf(new THREE.BoxGeometry(0.36, 0.13, 0.06), s * (W / 2 - 0.26), K.frontY, K.front), 0xfff6dc)),
      ...[-1, 1].map((s) => paint(xf(new THREE.BoxGeometry(0.3, 0.13, 0.06), s * (W / 2 - 0.24), K.backY, K.back), 0xc0141a)),
      ...[-1, 1].map((s) => paint(xf(new THREE.BoxGeometry(0.1, 0.07, 0.06), s * (W / 2 - 0.05), K.frontY - 0.12, K.front - 0.02), 0xffa21a)),
    ]);
    const trimParts = [
      paint(xf(new THREE.BoxGeometry(W + 0.02, 0.17, 0.16), 0, K.bump, K.front - 0.02), 0x2a2a2a), paint(xf(new THREE.BoxGeometry(W + 0.02, 0.17, 0.16), 0, K.bump, K.back + 0.02), 0x2a2a2a),
      paint(xf(new THREE.BoxGeometry(W * 0.5, 0.15, 0.04), 0, K.frontY - 0.04, K.front + 0.01), 0x161616),
      paint(xf(new THREE.BoxGeometry(0.46, 0.11, 0.02), 0, K.bump + 0.02, K.front + 0.07), 0xf2f0e8), paint(xf(new THREE.BoxGeometry(0.46, 0.11, 0.02), 0, K.backY - 0.18, K.back - 0.04), 0xf2f0e8),
      ...[-1, 1].map((s) => paint(xf(new THREE.BoxGeometry(0.12, 0.1, 0.17), s * (W / 2 + 0.06), gy0 + 0.04, K.glass[0][0] - 0.25), 0x1a1a1a)),
    ];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      trimParts.push(paint(xf(new THREE.CylinderGeometry(K.tire, K.tire, 0.24, 12), sx * K.tx, K.tire, sz * K.wz, 0, 0, Math.PI / 2), 0x121212));
      trimParts.push(paint(xf(new THREE.CylinderGeometry(K.tire * 0.6, K.tire * 0.6, 0.26, 8), sx * K.tx, K.tire, sz * K.wz, 0, 0, Math.PI / 2), 0xbdbdbd));
    }
    if (kind === "suv") {
      trimParts.push(paint(xf(new THREE.CylinderGeometry(0.4, 0.4, 0.22, 18), 0, 1.0, K.back - 0.15, Math.PI / 2, 0, 0), 0x121212));
      for (const s of [-1, 1]) trimParts.push(paint(xf(new THREE.BoxGeometry(0.05, 0.06, 2.6), s * 0.7, 1.88, -0.6), 0x2a2a2a));
    }
    if (taxi) trimParts.push(paint(xf(new THREE.BoxGeometry(0.55, 0.18, 0.22), 0, 1.5, -0.25), 0xf7f3e8), paint(xf(new THREE.BoxGeometry(0.57, 0.05, 0.24), 0, 1.6, -0.25), 0x1a1a1a));
    return (carCache[key] = { body, glass, lights, trim: merge(trimParts), half: W / 2 });
  }
  function carFleet(scene, count, kind, taxi, colors) {
    const G = carGeos(kind, taxi);
    return new Fleet(scene, [
      { geo: G.body, mat: std({ vertexColors: true, roughness: 0.3, metalness: 0.35 }), colorsRandom: colors },
      { geo: G.glass, mat: std({ color: lin(0x1b242a), roughness: 0.1, metalness: 0.6 }) },
      { geo: G.lights, mat: new THREE.MeshBasicMaterial({ vertexColors: true }) },
      { geo: G.trim, mat: std({ vertexColors: true, roughness: 0.6, metalness: 0.2 }) },
    ], count);
  }
  SB.taxiFleet = (scene, count) => carFleet(scene, count, "saloon", true, [0xf1c232]);
  SB.carFleet = (scene, count) => carFleet(scene, count, "saloon", false, [0xf2f2f0, 0xf2f2f0, 0xe6e6e2, 0xb8bcc0, 0x6f7377, 0x1b1b1d, 0x7a1f1f, 0x1f2f5a, 0xcbb894]);
  SB.suvFleet = (scene, count) => carFleet(scene, count, "suv", false, [0xf4f4f2, 0xf4f4f2, 0xf4f4f2, 0xc0c4c8, 0x1b1b1d, 0xcbb894]);
  // the police 4x4 that chases you, with its flashing light bar
  SB.makePolice = function () {
    const G = carGeos("suv", false), g = new THREE.Group();
    const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; g.add(m); return m; };
    add(G.body, std({ vertexColors: true, color: lin(0x1f3a6b), roughness: 0.35, metalness: 0.3 }));
    add(G.glass, std({ color: lin(0x1b242a), roughness: 0.1, metalness: 0.6 }));
    add(G.lights, new THREE.MeshBasicMaterial({ vertexColors: true }));
    add(G.trim, std({ vertexColors: true, roughness: 0.6, metalness: 0.2 }));
    const door = std({ map: SB.tex.policeDoor() });
    for (const s of [-1, 1]) { const pl = add(new THREE.PlaneGeometry(1.7, 0.42), door); pl.position.set(s * (G.half + 0.012), 0.86, 0.15); pl.rotation.y = s * Math.PI / 2; }
    const red = new THREE.MeshBasicMaterial({ color: 0x400808 }), blue = new THREE.MeshBasicMaterial({ color: 0x08103a });
    add(new THREE.BoxGeometry(1.3, 0.08, 0.3), std({ color: lin(0x1a1a1a) })).position.set(0, 1.86, 0.4);
    add(new THREE.BoxGeometry(0.6, 0.16, 0.28), red).position.set(-0.32, 1.97, 0.4);
    add(new THREE.BoxGeometry(0.6, 0.16, 0.28), blue).position.set(0.32, 1.97, 0.4);
    g.userData.flash = (t) => { const on = Math.floor(t * 6) % 2 === 0; red.color.setHex(on ? 0xff2a2a : 0x400808); blue.color.setHex(on ? 0x08103a : 0x2a5cff); };
    g.userData.wheelR = 0.42;
    return g;
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

  /* ---------- crowds (one draw call per body part, four moving limbs per person) ---------- */
  const _B = new THREE.Matrix4(), _L = new THREE.Matrix4(), _R = new THREE.Matrix4(), _c = new THREE.Color();
  function People(scene, capacity, opts) {
    const low = !!(opts && opts.low);
    this.cap = capacity;
    this.free = []; for (let i = capacity - 1; i >= 0; i--) this.free.push(i);
    const mk = (geo, mat, n, shadow) => {
      const im = new THREE.InstancedMesh(geo, mat, n); im.castShadow = shadow !== false; im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < n; i++) { im.setMatrixAt(i, ZERO); im.setColorAt(i, _c.setRGB(1, 1, 1)); }
      scene.add(im); return im;
    };
    const vc = () => std({ vertexColors: true, roughness: 0.85 });
    this.legs = mk(PG.leg, vc(), capacity * 2); this.arms = mk(PG.arm, vc(), capacity * 2); this.hands = mk(PG.hand, std({ roughness: 0.7 }), capacity * 2, false);
    this.torso = mk(PG.torso, vc(), capacity); this.head = mk(low ? PG.headLow : PG.head, getFaceMat(), capacity);
    this.hair = mk(PG.hair, std({ roughness: 0.95 }), capacity, false); this.wrap = mk(PG.wrap, std(), capacity, false);
    this.skirt = mk(PG.skirt, vc(), capacity); this.load = mk(PG.basin, std({ roughness: 0.5 }), capacity);
    this.meshes = [this.legs, this.arms, this.hands, this.torso, this.head, this.hair, this.wrap, this.skirt, this.load];
    this.look = Array.from({ length: capacity }, () => ({ hair: false, wrap: false, skirt: false, load: false }));
    this.used = 0; for (const m of this.meshes) m.count = 0;
  }
  People.prototype.colors = function (i, shirt, pants, skin, hair, wrap, skirt) {
    const c = (m, k, hex) => { if (hex !== undefined) m.setColorAt(k, _c.setHex(hex).convertSRGBToLinear()); };
    c(this.torso, i, shirt); c(this.arms, i * 2, shirt); c(this.arms, i * 2 + 1, shirt);
    c(this.legs, i * 2, pants); c(this.legs, i * 2 + 1, pants);
    c(this.hands, i * 2, skin); c(this.hands, i * 2 + 1, skin); c(this.head, i, skin);
    c(this.hair, i, hair); c(this.wrap, i, wrap); c(this.skirt, i, skirt);
    for (const m of this.meshes) if (m.instanceColor) m.instanceColor.needsUpdate = true;
  };
  People.prototype.alloc = function () {
    const i = this.free.pop(); if (i === undefined) return -1;
    if (i + 1 > this.used) { this.used = i + 1; for (const m of this.meshes) m.count = m === this.legs || m === this.arms || m === this.hands ? this.used * 2 : this.used; }
    const woman = Math.random() < 0.45, L = this.look[i], pagne = pick(CLOTH);
    L.skirt = woman; L.wrap = woman ? Math.random() < 0.75 : Math.random() < 0.25; L.hair = !L.wrap; L.load = false;
    this.colors(i, pick(CLOTH), woman ? pagne : pick(PANTS), pick(SKIN), pick(HAIR), woman ? pick(CLOTH) : pick([0xf3efe6, 0x2b2b2b, 0x6a2d7a, 0xe2b31d]), pagne);
    return i;
  };
  // phase: a number while walking (legs and arms swing), nothing when standing
  People.prototype.set = function (i, x, z, ang, phase) {
    const walk = typeof phase === "number", sw = walk ? Math.sin(phase) * 0.5 : 0, bob = walk ? Math.abs(Math.cos(phase)) * 0.035 : 0;
    _e.set(0, ang || 0, 0); _q.setFromEuler(_e); _B.compose(_p.set(x, 0.08 + bob, z), _q, _s);
    for (let k = 0; k < 2; k++) {
      const side = k ? 1 : -1, a = k ? sw : -sw;
      _L.makeRotationX(a); _L.setPosition(side * BODY.hipX, BODY.hipY, 0); _m.multiplyMatrices(_B, _L); this.legs.setMatrixAt(i * 2 + k, _m);
      _L.makeRotationX(-a * 0.8); _R.makeRotationZ(side * 0.1); _L.premultiply(_R); _L.setPosition(side * BODY.shX, BODY.shY, 0);
      _m.multiplyMatrices(_B, _L); this.arms.setMatrixAt(i * 2 + k, _m); this.hands.setMatrixAt(i * 2 + k, _m);
    }
    const L = this.look[i];
    this.torso.setMatrixAt(i, _B); this.head.setMatrixAt(i, _B);
    this.hair.setMatrixAt(i, L.hair ? _B : ZERO); this.wrap.setMatrixAt(i, L.wrap ? _B : ZERO);
    this.skirt.setMatrixAt(i, L.skirt ? _B : ZERO); this.load.setMatrixAt(i, L.load ? _B : ZERO);
  };
  // a basin carried on the head (walking vendors)
  People.prototype.setLoad = function (i, color) {
    const L = this.look[i]; L.load = true; L.wrap = true; L.hair = false;
    this.load.setColorAt(i, _c.setHex(color).convertSRGBToLinear()); this.load.instanceColor.needsUpdate = true;
  };
  // uniforms (police, toll agents) and vendors in pagne
  People.prototype.dress = function (i, cloth, cap, pagne) {
    const L = this.look[i]; L.hair = cap === undefined; L.wrap = cap !== undefined; L.skirt = pagne !== undefined;
    this.colors(i, cloth, pagne !== undefined ? pagne : 0x1f2a36, undefined, undefined, cap, pagne);
  };
  People.prototype.release = function (i) {
    if (i < 0) return;
    for (const m of [this.legs, this.arms, this.hands]) { m.setMatrixAt(i * 2, ZERO); m.setMatrixAt(i * 2 + 1, ZERO); }
    for (const m of [this.torso, this.head, this.hair, this.wrap, this.skirt, this.load]) m.setMatrixAt(i, ZERO);
    this.look[i].load = false; this.free.push(i);
  };
  People.prototype.commit = function () { for (const m of this.meshes) m.instanceMatrix.needsUpdate = true; };
  SB.People = People;
  /* ---------- the coach of Kagnassi Transport ---------- */
  const COACH = { w: 2.55, h: 3.2, l: 12 };
  SB.COACH = COACH;
  SB.makeCoach = function (dest) {
    const T = SB.tex.coach(dest);
    const g = new THREE.Group();
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
    const dark = std({ color: lin(0x1a1a1a), roughness: 0.9 }), white = std({ color: lin(0xf1efe8), roughness: 0.5 });
    add(new THREE.BoxGeometry(COACH.w, COACH.h, COACH.l), [
      std({ map: T.left, roughness: 0.45 }), std({ map: T.right, roughness: 0.45 }), white, dark,
      std({ map: T.front, roughness: 0.4 }), std({ map: T.back, roughness: 0.45 }),
    ], 0, 0.5 + COACH.h / 2, 0);
    // roof luggage, as on the Malian coaches: bags, a bicycle frame, a moto under a tarp
    add(new THREE.BoxGeometry(2.3, 0.1, 9), dark, 0, 0.5 + COACH.h + 0.05, -0.5);
    const load = [[1.0, 0.6, 1.4, 0x2e6fb0, -0.5, -3.5], [0.9, 0.5, 1.2, 0xc0392b, 0.5, -2.3], [1.6, 0.7, 2.0, 0x3d6b3a, 0, -0.4], [0.8, 0.5, 1.0, 0xe2b31d, -0.6, 1.4], [1.2, 0.8, 1.6, 0x7a5534, 0.4, 2.8]];
    for (const [w, h, d, c, x, z] of load) add(new THREE.BoxGeometry(w, h, d), std({ color: lin(c) }), x, 0.6 + COACH.h + h / 2, z);
    const wheelGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.4, 18); wheelGeo.rotateZ(Math.PI / 2);
    const wheels = [];
    for (const [x, z] of [[-1.15, 4.1], [1.15, 4.1], [-1.15, -2.6], [1.15, -2.6], [-1.15, -3.9], [1.15, -3.9]]) wheels.push(add(wheelGeo, std({ color: lin(0x161616), roughness: 0.95 }), x, 0.55, z));
    for (const x of [-1.38, 1.38]) add(new THREE.BoxGeometry(0.1, 0.4, 0.25), dark, x, 2.6, 5.9);
    g.userData.wheels = wheels; g.userData.wheelR = 0.55;
    return g;
  };
  SB.coachFleet = function (scene, count) {
    const T = SB.tex.coach("");
    const dark = std({ color: lin(0x1a1a1a) }), tire = std({ color: lin(0x111111), roughness: 0.95 });
    return new Fleet(scene, [
      { geo: new THREE.BoxGeometry(COACH.w, COACH.h, COACH.l), mat: [std({ map: T.left }), std({ map: T.right }), std({ color: lin(0xf1efe8) }), dark, std({ map: T.front }), std({ map: T.back })], y: 0.5 + COACH.h / 2 },
      { geo: new THREE.BoxGeometry(2.0, 0.7, 6), mat: std(), y: 0.85 + COACH.h, z: -0.5, colorsRandom: [0x2e6fb0, 0x7a5534, 0x3d6b3a, 0xc0392b] },
      { geo: wheelSet(0.55, 0.4, [[-1.15, 0.55, 4.1], [1.15, 0.55, 4.1], [-1.15, 0.55, -2.6], [1.15, 0.55, -2.6], [-1.15, 0.55, -3.9], [1.15, 0.55, -3.9]]), mat: tire },
    ], count);
  };
  SB.truckFleet = function (scene, count) {
    const tire = std({ color: lin(0x111111), roughness: 0.95 }), glass = std({ color: lin(0x26323a), roughness: 0.2, metalness: 0.3 });
    return new Fleet(scene, [
      { geo: new THREE.BoxGeometry(2.5, 2.6, 2.4), mat: std({ roughness: 0.5 }), y: 1.9, z: 4.2, colorsRandom: [0xd0d0d0, 0x2e6fb0, 0xc0392b, 0xe2b31d, 0x1d7f46, 0xffffff] },
      { geo: new THREE.BoxGeometry(2.3, 0.9, 0.08), mat: glass, y: 2.55, z: 5.42 },
      { geo: new THREE.BoxGeometry(2.55, 3.0, 8.4), mat: std({ roughness: 0.9 }), y: 2.1, z: -1.3, colorsRandom: [0x6b6b4f, 0x3a4a6b, 0x7a5534, 0x9a4a2a, 0x4f6b3a] },
      { geo: wheelSet(0.55, 0.45, [[-1.15, 0.55, 4.4], [1.15, 0.55, 4.4], [-1.15, 0.55, -2.5], [1.15, 0.55, -2.5], [-1.15, 0.55, -3.8], [1.15, 0.55, -3.8]]), mat: tire },
    ], count);
  };

})();
