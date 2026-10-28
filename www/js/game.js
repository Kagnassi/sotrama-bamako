/* Sotrama Bamako - game loop, driving, passengers, fuel, HUD and menus. */
(function () {
  "use strict";
  const SB = window.SB;
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Math.round(n).toLocaleString("fr-FR");
  const rand = (a, b) => a + (b - a) * Math.random();
  const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();

  /* ---------- saved progress ---------- */
  const SAVE_KEY = "sotrama-bamako-save-v1";
  const DEFAULTS = { savings: 0, best: 0, day: 1, owned: ["vert"], livery: "vert", engine: 0, tank: 0, noAds: false, quality: "", sound: true, totalPassengers: 0 };
  let S;
  try { S = Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(SAVE_KEY) || "{}")); } catch (e) { S = Object.assign({}, DEFAULTS); }
  const save = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* storage unavailable */ } };
  const isTouch = window.matchMedia("(pointer: coarse)").matches;
  if (!S.quality) S.quality = isTouch ? "eco" : "haute";
  const HIGH = S.quality === "haute";

  const DAY = 360, CAP = 22, FUEL_PRICE = 800, M_PER_L = 220;
  const ENGINE = [{ v: 17, price: 0 }, { v: 19, price: 80000 }, { v: 21, price: 160000 }];
  const TANK = [{ v: 50, price: 0 }, { v: 70, price: 50000 }, { v: 90, price: 110000 }];

  let renderer, scene, camera, world, busMesh, sun, hemi, sky, sunSprite, dust;
  let motos, taxis, aiBuses, people;
  const agents = [], walkers = [], pedestrians = [];
  const bus = { x: 0, z: 0, h: 0, v: 0, steer: 0, fuel: 20 };
  let mode = "loading", camMode = 0, time = 0, elapsed = 0;
  let day = null; // stats of the current day
  let onboard = [], onboardDirty = true;
  let atStop = null, lastStop = null, workT = 0, announced = false, hinted = false, fullShown = false, crashCool = 0, fuelWarned = false;

  async function boot() {
    try { await Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), new Promise((r) => setTimeout(r, 2500))]); } catch (e) { /* fonts optional */ }
    renderer = new THREE.WebGLRenderer({ antialias: HIGH, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, HIGH ? 1.6 : 1.1));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = HIGH;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    SB.maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    $("stage").appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(lin(0xe9d8b6), 150, HIGH ? 900 : 650);
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, HIGH ? 1300 : 950);
    hemi = new THREE.HemisphereLight(lin(0xcfd8e0), lin(0x8a4a2a), 0.8);
    scene.add(hemi);
    sun = new THREE.DirectionalLight(lin(0xfff3e0), 2.6);
    sun.castShadow = HIGH;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 10, far: 400 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
    scene.add(sun, sun.target);

    // sky dome with a vertical gradient, a soft sun and harmattan dust
    const SKY_R = HIGH ? 1200 : 900;
    const skyGeo = new THREE.SphereGeometry(SKY_R, 32, 16);
    skyGeo.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(skyGeo.attributes.position.count * 3), 3));
    sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.renderOrder = -1; scene.add(sky);
    sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: SB.tex.glow("rgba(255,244,220,1)", "rgba(255,200,120,0)"), blending: THREE.AdditiveBlending, fog: false, depthWrite: false, transparent: true }));
    sunSprite.scale.set(230, 230, 1); scene.add(sunSprite);
    if (HIGH) {
      const n = 700, pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { pos[i * 3] = rand(-90, 90); pos[i * 3 + 1] = rand(0.5, 25); pos[i * 3 + 2] = rand(-90, 90); }
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      dust = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.5, map: SB.tex.glow("rgba(230,200,160,0.9)", "rgba(230,200,160,0)"), transparent: true, opacity: 0.55, depthWrite: false }));
      dust.userData.base = Float32Array.from(pos); scene.add(dust);
    }

    world = SB.buildWorld(scene, { quality: S.quality });
    buildBus();
    people = new SB.People(scene, HIGH ? 320 : 260);
    motos = SB.motoFleet(scene, HIGH ? 46 : 32);
    taxis = SB.taxiFleet(scene, HIGH ? 14 : 10);
    aiBuses = { vert: SB.busFleet(scene, "vert", 5), bleu: SB.busFleet(scene, "bleu", 2) };
    // parked minibuses at the gare routière
    const parkedFleets = {};
    for (const p of world.parked) (parkedFleets[p.livery] = parkedFleets[p.livery] || []).push(p);
    for (const [liv, list] of Object.entries(parkedFleets)) { const f = SB.busFleet(scene, liv, list.length, true); list.forEach((p, i) => f.set(i, p.x, 0.06, p.z, p.ang)); f.commit(); }
    spawnTraffic();
    spawnPedestrians();
    for (const s of world.stops) { const n = Math.floor(rand(1, 4)); for (let k = 0; k < n; k++) addWaiting(s); }
    resetBus();
    setupInput();
    sizeMaps();
    SB.purchases.onOwned = () => { S.noAds = true; save(); renderGarage(); };
    SB.ads.init(S);
    document.addEventListener("deviceready", () => SB.purchases.init(), false);
    $("loading").hidden = true;
    if (window.location.search.includes("debug")) SB.debug = { bus, world, onboard: () => onboard, stats: () => renderer.info.render };
    showGarage();
    requestAnimationFrame(frame);
  }

  function buildBus() {
    if (busMesh) scene.remove(busMesh);
    busMesh = SB.makeBus(S.livery);
    scene.add(busMesh);
  }
  function resetBus() {
    Object.assign(bus, { x: world.start.x, z: world.start.z, h: world.start.h, v: 0, steer: 0 });
  }

  /* ---------- traffic ---------- */
  const nodes = () => world.nodes;
  function legPath(a, b, lane) {
    const A = nodes()[a], B = nodes()[b], L = Math.hypot(B.x - A.x, B.z - A.z), dx = (B.x - A.x) / L, dz = (B.z - A.z) / L, nx = -dz, nz = dx;
    const ta = A.r ? A.r + world.RING : 0, tb = B.r ? B.r + world.RING : 0;
    return [[A.x + dx * ta + nx * lane, A.z + dz * ta + nz * lane], [B.x - dx * tb + nx * lane, B.z - dz * tb + nz * lane]];
  }
  function ringArc(n, from, to) {
    const rad = n.r + world.RING * 0.65;
    const f0 = Math.atan2(-(from[1] - n.z), from[0] - n.x);
    let f1 = Math.atan2(-(to[1] - n.z), to[0] - n.x);
    while (f1 <= f0 + 0.35) f1 += Math.PI * 2;
    const pts = [];
    for (let f = f0 + 0.18; f < f1 - 0.12; f += 0.18) pts.push([n.x + rad * Math.cos(f), n.z - rad * Math.sin(f)]);
    return pts;
  }
  function nextLeg(ag) {
    const B = nodes()[ag.b];
    let opts = B.nb.filter((x) => x !== ag.a);
    if (!opts.length) opts = [ag.a];
    const c = opts[Math.floor(Math.random() * opts.length)];
    const leg = legPath(ag.b, c, ag.lane);
    const pre = B.r ? ringArc(B, ag.path[ag.path.length - 1], leg[0]) : [];
    ag.a = ag.b; ag.b = c; ag.path = pre.concat(leg); ag.pi = 0;
  }
  function placeAgent(ag, farFromBus) {
    for (let tries = 0; tries < 20; tries++) {
      const rd = world.roads[Math.floor(Math.random() * world.roads.length)];
      const flip = Math.random() < 0.5;
      ag.a = flip ? rd.b : rd.a; ag.b = flip ? rd.a : rd.b;
      ag.path = legPath(ag.a, ag.b, ag.lane);
      const t = Math.random();
      ag.x = ag.path[0][0] + (ag.path[1][0] - ag.path[0][0]) * t; ag.z = ag.path[0][1] + (ag.path[1][1] - ag.path[0][1]) * t;
      if (farFromBus && Math.hypot(ag.x - bus.x, ag.z - bus.z) < 160) continue;
      break;
    }
    ag.pi = 1; ag.rx = ag.x; ag.rz = ag.z;
    const d = Math.hypot(ag.path[1][0] - ag.path[0][0], ag.path[1][1] - ag.path[0][1]) || 1;
    ag.hx = (ag.path[1][0] - ag.path[0][0]) / d; ag.hz = (ag.path[1][1] - ag.path[0][1]) / d; ag.rang = Math.atan2(ag.hx, ag.hz);
    ag.crash = 0; ag.roll = 0; ag.speed = ag.base * 0.6;
  }
  function spawnTraffic() {
    const add = (fleet, i, type, base, lane, len) => { const ag = { fleet, i, type, base, lane, len, dodge: 0 }; placeAgent(ag); agents.push(ag); };
    for (let i = 0; i < motos.count; i++) add(motos, i, "moto", rand(9, 14), rand(2.0, 4.2), 1.8);
    for (let i = 0; i < taxis.count; i++) add(taxis, i, "taxi", rand(8, 12), 3, 4.2);
    for (const f of Object.values(aiBuses)) for (let i = 0; i < f.count; i++) add(f, i, "bus", rand(7, 10), 3.2, 5.4);
  }
  function updateTraffic(dt) {
    const k = 1 - Math.exp(-dt * 8);
    for (const ag of agents) {
      if (ag.crash > 0) {
        ag.crash -= dt; ag.roll = Math.min(1.35, ag.roll + dt * 5);
        if (ag.crash <= 0) placeAgent(ag, true);
      } else {
        ag.dodge = Math.max(0, ag.dodge - dt);
        // slow down behind the player's bus or another vehicle
        let blocked = false;
        const rx = bus.x - ag.x, rz = bus.z - ag.z, al = rx * ag.hx + rz * ag.hz;
        if (al > 0 && al < 11 && Math.abs(rx * ag.hz - rz * ag.hx) < 2.8) blocked = true;
        if (!blocked) for (const o of agents) {
          if (o === ag || o.crash > 0) continue;
          const ox = o.x - ag.x, oz = o.z - ag.z; if (Math.abs(ox) > 9 || Math.abs(oz) > 9) continue;
          const a2 = ox * ag.hx + oz * ag.hz;
          if (a2 > 0 && a2 < (ag.len + o.len) / 2 + 1.8 && Math.abs(ox * ag.hz - oz * ag.hx) < 1.8 && ox * o.hx + oz * o.hz > -2) { blocked = true; break; }
        }
        const target = blocked ? 0 : ag.base;
        ag.speed += (target - ag.speed) * Math.min(1, dt * (blocked ? 5 : 1.2));
        let step = ag.speed * dt;
        while (step > 0) {
          if (ag.pi >= ag.path.length) nextLeg(ag);
          const t = ag.path[ag.pi], dx = t[0] - ag.x, dz = t[1] - ag.z, d = Math.hypot(dx, dz);
          if (d <= step) { ag.x = t[0]; ag.z = t[1]; step -= d; ag.pi++; }
          else { ag.x += (dx / d) * step; ag.z += (dz / d) * step; ag.hx = dx / d; ag.hz = dz / d; step = 0; }
        }
      }
      const dodge = ag.dodge > 0 ? 1.6 : 0;
      ag.rx += (ag.x - ag.hz * dodge - ag.rx) * k; ag.rz += (ag.z + ag.hx * dodge - ag.rz) * k;
      let da = Math.atan2(ag.hx, ag.hz) - ag.rang; da = Math.atan2(Math.sin(da), Math.cos(da)); ag.rang += da * Math.min(1, dt * 7);
      ag.fleet.set(ag.i, ag.rx, 0.08, ag.rz, ag.rang, ag.type === "moto" ? ag.roll : ag.roll * 0.15);
    }
    motos.commit(); taxis.commit(); for (const f of Object.values(aiBuses)) f.commit();
  }

  /* ---------- people ---------- */
  function spawnPedestrians() {
    for (let k = 0; k < (HIGH ? 70 : 40); k++) {
      const rd = world.roads[Math.floor(Math.random() * world.roads.length)];
      const A = world.nodes[rd.a];
      if (Math.abs(A.z) < 80 && Math.abs(world.nodes[rd.b].z) < 80) continue;
      const id = people.alloc(); if (id < 0) break;
      pedestrians.push({ id, rd, t: rand(10, rd.len - 10), side: Math.random() < 0.5 ? -1 : 1, dir: Math.random() < 0.5 ? -1 : 1, v: rand(0.9, 1.5), ph: rand(0, 6) });
    }
  }
  function updatePeople(dt) {
    for (const p of pedestrians) {
      p.t += p.dir * p.v * dt; if (p.t < 8 || p.t > p.rd.len - 8) p.dir *= -1;
      const A = world.nodes[p.rd.a], off = p.rd.w / 2 + 1.8;
      const x = A.x + p.rd.dx * p.t + p.rd.nx * p.side * off, z = A.z + p.rd.dz * p.t + p.rd.nz * p.side * off;
      p.ph += dt * 7;
      people.set(p.id, x, z, Math.atan2(p.rd.dx * p.dir, p.rd.dz * p.dir), Math.abs(Math.sin(p.ph)) * 0.05);
    }
    for (let i = walkers.length - 1; i >= 0; i--) {
      const w = walkers[i]; w.life -= dt; w.x += w.vx * dt; w.z += w.vz * dt; w.ph += dt * 7;
      if (w.life <= 0) { people.release(w.id); walkers.splice(i, 1); continue; }
      people.set(w.id, w.x, w.z, Math.atan2(w.vx, w.vz), Math.abs(Math.sin(w.ph)) * 0.05);
    }
    people.commit();
  }
  const SLOTS = [[-0.6, 0], [0.6, 0], [-1.8, 0.3], [1.8, 0.3], [-1.2, 1.2], [1.2, 1.2], [-3, 0.5], [3, 0.5]];
  function addWaiting(s) {
    const used = new Set(s.waiting.map((w) => w.slot));
    const slot = SLOTS.findIndex((_, i) => !used.has(i)); if (slot < 0) return;
    const id = people.alloc(); if (id < 0) return;
    const [a, o] = SLOTS[slot];
    const x = s.sx + s.dx * a - s.nx * (1.4 - o), z = s.sz + s.dz * a - s.nz * (1.4 - o);
    people.set(id, x, z, Math.atan2(-s.nx, -s.nz)); people.commit();
    s.waiting.push({ slot, id });
  }
  function addWalker(s) {
    const id = people.alloc(); if (id < 0) return;
    walkers.push({ id, x: s.zx + s.nx * 2.5, z: s.zz + s.nz * 2.5, vx: s.nx * 1.3 + s.dx * rand(-0.4, 0.4), vz: s.nz * 1.3 + s.dz * rand(-0.4, 0.4), life: 4, ph: 0 });
  }

  /* ---------- the day ---------- */
  function startDay() {
    blurActive(); initAudio();
    day = { fares: 0, fuel: 0, fines: 0, served: 0, accidents: 0, doubled: false };
    elapsed = 0; onboard = []; onboardDirty = true; fuelWarned = false;
    resetBus(); bus.fuel = Math.min(20 + TANK[S.tank].v * 0.2, TANK[S.tank].v);
    for (const s of world.stops) { s.waiting.forEach((w) => people.release(w.id)); s.waiting = []; s.spawnT = rand(1, 8); const n = Math.floor(rand(1, 4)); for (let k = 0; k < n; k++) addWaiting(s); }
    people.commit();
    mode = "play"; show("garage", false); show("endBox", false);
    toast("Jour " + S.day + " · 6 h : départ de Grand Marché");
  }
  const cash = () => day.fares - day.fuel - day.fines;
  function endDay() {
    mode = "end"; keys.up = keys.down = false;
    const net = cash();
    $("endFares").textContent = fmt(day.fares); $("endFuel").textContent = "− " + fmt(day.fuel); $("endFines").textContent = "− " + fmt(day.fines);
    $("endNet").textContent = fmt(net); $("endServed").textContent = day.served;
    $("endDay").textContent = "Jour " + S.day + " terminé";
    const canDouble = SB.ads.rewardedAvailable() && day.fares > 0;
    $("btnDouble").hidden = !canDouble; $("btnDouble").textContent = "Regarder une pub : +" + fmt(day.fares) + " F";
    show("endBox", true);
  }
  async function doubleFares() {
    $("btnDouble").disabled = true;
    const ok = await SB.ads.showRewarded();
    $("btnDouble").disabled = false;
    if (ok && !day.doubled) { day.doubled = true; day.fares *= 2; $("endFares").textContent = fmt(day.fares); $("endNet").textContent = fmt(cash()); $("btnDouble").hidden = true; }
  }
  async function nextDay() {
    const net = cash();
    S.savings = Math.max(0, S.savings + net); S.best = Math.max(S.best, net); S.totalPassengers += day.served; S.day += 1; save();
    show("endBox", false);
    if (!S.noAds && S.day % 2 === 1) await SB.ads.showInterstitial();
    showGarage();
  }

  /* ---------- driving ---------- */
  function fits(x, z, h) {
    const fx = Math.sin(h), fz = Math.cos(h), rx = -fz, rz = fx;
    for (const [a, b] of [[2.7, 1.15], [2.7, -1.15], [-2.7, 1.15], [-2.7, -1.15], [0, 1.15], [0, -1.15]]) if (!world.inRoad(x + fx * a + rx * b, z + fz * a + rz * b)) return false;
    return true;
  }
  function updateBus(dt) {
    const MAXV = ENGINE[S.engine].v, MAXR = -6;
    const dry = bus.fuel <= 0;
    if (keys.up && !dry) bus.v += (bus.v >= 0 ? 6.5 : 14) * dt;
    if (keys.down) bus.v -= (bus.v > 0.4 ? 14 : dry ? 0 : 4) * dt;
    if (!keys.up && !keys.down || dry) bus.v -= Math.sign(bus.v) * Math.min(Math.abs(bus.v), 2.6 * dt);
    if (keys.brake) bus.v -= Math.sign(bus.v) * Math.min(Math.abs(bus.v), 20 * dt);
    bus.v = Math.max(MAXR, Math.min(MAXV, bus.v));
    const target = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
    bus.steer += (target - bus.steer) * Math.min(1, dt * 8);
    const grip = Math.max(-1, Math.min(1, bus.v / 6)) * (1 - 0.35 * Math.min(1, Math.abs(bus.v) / MAXV));
    let nh = bus.h + bus.steer * 1.5 * grip * dt;
    if (!fits(bus.x, bus.z, nh)) nh = bus.h;
    const nx = bus.x + Math.sin(nh) * bus.v * dt, nz = bus.z + Math.cos(nh) * bus.v * dt;
    const ox = bus.x, oz = bus.z;
    if (fits(nx, nz, nh)) { bus.x = nx; bus.z = nz; }
    else if (fits(nx, bus.z, nh)) { bus.x = nx; bus.v *= 0.94; }
    else if (fits(bus.x, nz, nh)) { bus.z = nz; bus.v *= 0.94; }
    else { if (Math.abs(bus.v) > 7) { thud(); toast("Attention au trottoir !", "bad"); } bus.v *= -0.25; }
    bus.h = nh;
    bus.fuel = Math.max(0, bus.fuel - Math.hypot(bus.x - ox, bus.z - oz) / M_PER_L);
    if (bus.fuel < 6 && !fuelWarned) { fuelWarned = true; toast("Réservoir presque vide : passe à une station", "bad"); }
    if (bus.fuel <= 0 && Math.abs(bus.v) < 0.3 && mode === "play") breakdown();
    if (engGain) { engOsc.frequency.value = 38 + Math.abs(bus.v) * 5.2; engGain.gain.value = dry ? 0 : 0.035 + Math.abs(bus.v) * 0.003; }

    crashCool -= dt;
    for (const ag of agents) {
      if (ag.crash > 0) continue;
      const d = Math.hypot(ag.rx - bus.x, ag.rz - bus.z), lim = ag.type === "moto" ? 2.6 : ag.type === "taxi" ? 3.4 : 4;
      if (d < lim && Math.abs(bus.v) > 2.5 && crashCool <= 0) {
        const fine = ag.type === "moto" ? 500 : 1000;
        day.fines += fine; day.accidents++; crashCool = 1.5; bus.v *= -0.2; ag.crash = 2.4;
        thud(); popCash("−" + fmt(fine) + " F", true);
        toast(ag.type === "moto" ? "Accident avec une Djakarta : −500 F" : ag.type === "taxi" ? "Accrochage avec un taxi : −1 000 F" : "Accrochage avec une Sotrama : −1 000 F", "bad");
      }
    }
  }
  function breakdown() {
    mode = "panne"; keys.up = false;
    $("btnTowAd").hidden = !SB.ads.rewardedAvailable();
    show("panneBox", true);
  }
  async function tow(withAd) {
    if (withAd) { const ok = await SB.ads.showRewarded(); if (!ok) return; }
    else day.fines += 6000;
    bus.fuel = 10; show("panneBox", false); mode = "play"; fuelWarned = false;
    toast(withAd ? "Remorqué gratuitement, 10 L ajoutés" : "Remorquage : −6 000 F, 10 L ajoutés");
  }

  /* ---------- stops and fuel stations ---------- */
  function pickDest(s) { let d; do { d = Math.floor(Math.random() * world.stops.length); } while (d === s.i); return d; }
  function fareFor(from, to) {
    const a = world.stops[from], b = world.stops[to];
    let f = a.bank !== b.bank ? 300 : 250;
    if (Math.hypot(a.zx - b.zx, a.zz - b.zz) > 900) f += 50;
    return f;
  }
  let fuelT = 0;
  function updateStops(dt) {
    for (const s of world.stops) { s.spawnT -= dt; if (s.spawnT <= 0) { s.spawnT = rand(7, 18); if (s.waiting.length < 8) addWaiting(s); } }
    // fuel stations
    for (const st of world.stations) {
      if (Math.hypot(bus.x - st.zx, bus.z - st.zz) > 8) continue;
      const tank = TANK[S.tank].v;
      if (Math.abs(bus.v) < 1.2 && bus.fuel < tank - 0.2) {
        fuelT += dt; if (fuelT < 0.2) continue; fuelT = 0;
        const litres = Math.min(1.5, tank - bus.fuel), cost = litres * FUEL_PRICE;
        if (cash() < cost) { toast("Pas assez d'argent pour le carburant : fais des courses d'abord", "bad"); continue; }
        bus.fuel += litres; day.fuel += cost;
        toast("Plein en cours : " + Math.round(bus.fuel) + " / " + tank + " L");
      }
    }
    let near = null, nd = 1e9;
    for (const s of world.stops) { const d = Math.hypot(bus.x - s.zx, bus.z - s.zz); if (d < nd) { nd = d; near = s; } }
    atStop = nd < 8 ? near : null;
    if (atStop !== lastStop) { lastStop = atStop; announced = false; hinted = false; fullShown = false; workT = 0; }
    if (!atStop) return;
    const s = atStop;
    const drop = onboard.some((p) => p.dest === s.i), pickup = s.waiting.length > 0 && onboard.length < CAP;
    if (Math.abs(bus.v) < 1.2) {
      if (!announced && (drop || pickup)) { announced = true; toast("« " + s.name + " ! " + s.name + " ! »", "call"); }
      workT += dt; if (workT < 0.3) return; workT = 0;
      const k = onboard.findIndex((p) => p.dest === s.i);
      if (k >= 0) { const p = onboard.splice(k, 1)[0]; day.fares += p.fare; day.served++; onboardDirty = true; addWalker(s); ding(); popCash("+" + p.fare + " F"); return; }
      if (s.waiting.length) {
        if (onboard.length >= CAP) { if (!fullShown) { fullShown = true; toast("Sotrama pleine : 22 places"); } return; }
        const w = s.waiting.shift(); people.release(w.id); people.commit();
        const dest = pickDest(s); onboard.push({ dest, fare: fareFor(s.i, dest) }); onboardDirty = true; tick();
      }
    } else if ((drop || pickup) && !hinted && Math.abs(bus.v) > 3) { hinted = true; toast("Arrête-toi dans le cercle"); }
  }

  /* ---------- markers above the stops ---------- */
  let markers = null;
  function buildMarkers() {
    const ringGeo = new THREE.RingGeometry(5.2, 6.4, 48); ringGeo.rotateX(-Math.PI / 2);
    const beamGeo = new THREE.CylinderGeometry(0.8, 0.8, 50, 12, 1, true);
    markers = world.stops.map((s) => {
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }));
      ring.position.set(s.zx, 0.2, s.zz); scene.add(ring);
      const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xf2b233, transparent: true, opacity: 0.3, depthWrite: false, fog: false, toneMapped: false }));
      beam.position.set(s.zx, 25, s.zz); scene.add(beam);
      return { ring, beam };
    });
    for (const st of world.stations) {
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xe25a3c, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false }));
      ring.position.set(st.zx, 0.2, st.zz); scene.add(ring); st.ring = ring;
    }
  }
  function updateMarkers() {
    if (!markers) buildMarkers();
    const dests = new Set(onboard.map((p) => p.dest));
    world.stops.forEach((s, i) => {
      const isDest = dests.has(i), isPick = s.waiting.length > 0 && mode !== "garage";
      const m = markers[i];
      m.ring.visible = isDest || isPick; m.ring.material.color.setHex(isDest ? 0xf2b233 : 0xffffff);
      m.beam.visible = isDest || isPick; m.beam.material.color.setHex(isDest ? 0xf2b233 : 0xffffff); m.beam.material.opacity = isDest ? 0.35 : 0.07;
    });
  }

  /* ---------- sky and light through the day ---------- */
  const KEYS = [
    // t, zenith, horizon, sun colour, sun intensity, hemi intensity
    [0, 0x6d86ad, 0xf0b07a, 0xffb27a, 1.4, 0.5],
    [0.14, 0x7c9fc6, 0xecd6b2, 0xfff0d8, 2.4, 0.8],
    [0.5, 0x86a9cf, 0xeadbbd, 0xfff6e8, 2.7, 0.9],
    [0.84, 0x7a8fb8, 0xeec08f, 0xffc890, 2.2, 0.75],
    [1, 0x47507a, 0xd98a64, 0xff8a50, 0.9, 0.4],
  ];
  const cA = new THREE.Color(), cB = new THREE.Color(), zen = new THREE.Color(), hor = new THREE.Color(), tmp = new THREE.Color();
  function updateSky(t) {
    let i = 0; while (i < KEYS.length - 2 && t > KEYS[i + 1][0]) i++;
    const k0 = KEYS[i], k1 = KEYS[i + 1], f = Math.max(0, Math.min(1, (t - k0[0]) / (k1[0] - k0[0])));
    zen.copy(cA.setHex(k0[1]).convertSRGBToLinear()).lerp(cB.setHex(k1[1]).convertSRGBToLinear(), f);
    hor.copy(cA.setHex(k0[2]).convertSRGBToLinear()).lerp(cB.setHex(k1[2]).convertSRGBToLinear(), f);
    sun.color.copy(cA.setHex(k0[3]).convertSRGBToLinear()).lerp(cB.setHex(k1[3]).convertSRGBToLinear(), f);
    sun.intensity = k0[4] + (k1[4] - k0[4]) * f; hemi.intensity = k0[5] + (k1[5] - k0[5]) * f;
    hemi.color.copy(zen).lerp(hor, 0.5);
    scene.fog.color.copy(hor);
    const pos = sky.geometry.attributes.position, col = sky.geometry.attributes.color;
    for (let v = 0; v < pos.count; v++) {
      const y = pos.getY(v) / sky.geometry.parameters.radius, m = Math.pow(Math.max(0, y), 0.45);
      tmp.copy(hor).lerp(zen, m); col.setXYZ(v, tmp.r, tmp.g, tmp.b);
    }
    col.needsUpdate = true;
    const a = Math.PI * (0.06 + 0.88 * t);
    const dir = new THREE.Vector3(Math.cos(a), Math.sin(a) * 0.9 + 0.08, 0.4).normalize();
    sun.position.set(bus.x + dir.x * 200, dir.y * 200, bus.z + dir.z * 200); sun.target.position.set(bus.x, 0, bus.z);
    sky.position.copy(camera.position);
    const sd = sky.geometry.parameters.radius * 0.9;
    sunSprite.position.set(camera.position.x + dir.x * sd, camera.position.y + dir.y * sd, camera.position.z + dir.z * sd);
    sunSprite.material.color.copy(sun.color);
  }

  /* ---------- camera ---------- */
  let orbit = 0, camInit = false, viewShift = 0;
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  const CAMS = ["Caméra : poursuite", "Caméra : haute", "Caméra : large", "Caméra : chauffeur"];
  function updateCamera(dt) {
    const fx = Math.sin(bus.h), fz = Math.cos(bus.h);
    let p, l, snap = false;
    if (mode === "garage" || mode === "loading") { orbit += dt * 0.08; p = [bus.x + Math.sin(orbit) * 15, 5.5, bus.z + Math.cos(orbit) * 15]; l = [bus.x, 1.8, bus.z]; }
    else if (camMode === 1) { p = [bus.x - fx * 6, 60, bus.z - fz * 6]; l = [bus.x + fx * 8, 0, bus.z + fz * 8]; }
    else if (camMode === 2) { p = [bus.x - fx * 26, 14, bus.z - fz * 26]; l = [bus.x + fx * 10, 1.5, bus.z + fz * 10]; }
    else if (camMode === 3) { p = [bus.x + fx * 1.9 + fz * 0.55, 2.25, bus.z + fz * 1.9 - fx * 0.55]; l = [bus.x + fx * 30 + fz * 0.55, 1.6, bus.z + fz * 30 - fx * 0.55]; snap = true; }
    else { p = [bus.x - fx * 12.5, 6, bus.z - fz * 12.5]; l = [bus.x + fx * 7, 1.6, bus.z + fz * 7]; }
    if (!camInit) { camInit = true; snap = true; }
    const k = snap ? 1 : 1 - Math.exp(-dt * (mode === "garage" ? 2 : 4.5));
    camPos.x += (p[0] - camPos.x) * k; camPos.y += (p[1] - camPos.y) * k; camPos.z += (p[2] - camPos.z) * k;
    const kl = snap ? 1 : Math.min(1, k * 1.6);
    camLook.x += (l[0] - camLook.x) * kl; camLook.y += (l[1] - camLook.y) * kl; camLook.z += (l[2] - camLook.z) * kl;
    camera.position.copy(camPos); camera.lookAt(camLook);
    busMesh.visible = camMode !== 3 || mode === "garage";
    // on wide screens, push the minibus to the right of the garage panel
    const want = mode === "garage" && window.innerWidth > 760 ? Math.round(Math.min(260, window.innerWidth * 0.2)) : 0;
    if (want !== viewShift) { viewShift = want; if (want) camera.setViewOffset(window.innerWidth, window.innerHeight, -want, 0, window.innerWidth, window.innerHeight); else camera.clearViewOffset(); }
  }

  /* ---------- maps ---------- */
  const radar = $("radar"), rctx = radar.getContext("2d");
  const big = $("bigMap"), bctx = big.getContext("2d");
  function sizeMaps() {
    for (const c of [radar, big]) { const r = c.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2); c.width = Math.max(1, Math.round(r.width * dpr)); c.height = Math.max(1, Math.round(r.height * dpr)); }
  }
  function drawRoads(g, tx, ty, s, scaleW) {
    g.fillStyle = "#3e7f86"; g.fillRect(-1e4, ty(world.RIVER[0]), 2e4, (world.RIVER[1] - world.RIVER[0]) * s);
    g.strokeStyle = "#d8c8a8"; g.lineCap = "round";
    for (const rd of world.roads) { const A = world.nodes[rd.a], B = world.nodes[rd.b]; g.lineWidth = Math.max(1.5, rd.w * s * scaleW); g.beginPath(); g.moveTo(tx(A.x), ty(A.z)); g.lineTo(tx(B.x), ty(B.z)); g.stroke(); }
    for (const n of world.nodes) if (n.r) { g.lineWidth = Math.max(1.5, world.RING * s * scaleW); g.beginPath(); g.arc(tx(n.x), ty(n.z), (n.r + world.RING / 2) * s, 0, 7); g.stroke(); }
  }
  function drawRadar() {
    const W = radar.width, H = radar.height, R = 260, s = W / (2 * R), g = rctx;
    g.save(); g.fillStyle = "#3a2618"; g.fillRect(0, 0, W, H);
    const tx = (x) => W / 2 + (x - bus.x) * s, ty = (z) => H / 2 + (z - bus.z) * s;
    drawRoads(g, tx, ty, s, 1);
    const dests = new Set(onboard.map((p) => p.dest)), u = W / 170;
    for (const st of world.stations) { g.fillStyle = "#e25a3c"; g.beginPath(); g.arc(clampX(tx(st.zx), W), clampX(ty(st.zz), H), 4 * u, 0, 7); g.fill(); }
    world.stops.forEach((st, i) => {
      const x = tx(st.zx), y = ty(st.zz), out = x < 0 || y < 0 || x > W || y > H;
      if (dests.has(i)) { g.fillStyle = "#f2b233"; g.beginPath(); g.arc(clampX(x, W), clampX(y, H), (out ? 4 : 6) * u, 0, 7); g.fill(); }
      else if (st.waiting.length && !out) { g.fillStyle = "#f7ecd8"; g.beginPath(); g.arc(x, y, (2.5 + st.waiting.length * 0.4) * u, 0, 7); g.fill(); }
    });
    const fx = Math.sin(bus.h), fz = Math.cos(bus.h), r = 8 * u, cx = W / 2, cy = H / 2;
    g.fillStyle = "#1f8a4c"; g.strokeStyle = "#f7ecd8"; g.lineWidth = 1.5 * u;
    g.beginPath(); g.moveTo(cx + fx * r, cy + fz * r); g.lineTo(cx - fx * r * 0.6 + fz * r * 0.6, cy - fz * r * 0.6 - fx * r * 0.6); g.lineTo(cx - fx * r * 0.6 - fz * r * 0.6, cy - fz * r * 0.6 + fx * r * 0.6); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }
  const clampX = (v, max) => Math.max(6, Math.min(max - 6, v));
  function drawBigMap() {
    const W = big.width, H = big.height, b = world.bounds, s = Math.min(W / (b.x1 - b.x0), H / (b.z1 - b.z0)) * 0.96;
    const ox = (W - (b.x1 - b.x0) * s) / 2, oy = (H - (b.z1 - b.z0) * s) / 2;
    const tx = (x) => ox + (x - b.x0) * s, ty = (z) => oy + (z - b.z0) * s, g = bctx, u = W / 600;
    g.fillStyle = "#3a2618"; g.fillRect(0, 0, W, H);
    drawRoads(g, tx, ty, s, 1.2);
    const dests = new Set(onboard.map((p) => p.dest));
    g.textAlign = "center"; g.textBaseline = "bottom";
    world.stops.forEach((st, i) => {
      const x = tx(st.zx), y = ty(st.zz), d = dests.has(i);
      g.fillStyle = d ? "#f2b233" : st.waiting.length ? "#f7ecd8" : "rgba(247,236,216,0.45)";
      g.beginPath(); g.arc(x, y, (d ? 5 : 3.5) * u, 0, 7); g.fill();
      g.font = `600 ${Math.round(11 * u)}px "Barlow Condensed", sans-serif`; g.fillText(st.name + (st.waiting.length ? " · " + st.waiting.length : ""), x, y - 6 * u);
    });
    for (const st of world.stations) { g.fillStyle = "#e25a3c"; g.beginPath(); g.arc(tx(st.zx), ty(st.zz), 4.5 * u, 0, 7); g.fill(); g.fillText("Station", tx(st.zx), ty(st.zz) - 6 * u); }
    g.fillStyle = "rgba(247,236,216,0.6)"; g.font = `700 ${Math.round(13 * u)}px "Barlow Condensed", sans-serif`; g.textBaseline = "middle";
    g.fillText("FLEUVE NIGER", tx(-650), ty(0)); g.fillText("RIVE GAUCHE", tx(-650), ty(-300)); g.fillText("RIVE DROITE", tx(-650), ty(260));
    const fx = Math.sin(bus.h), fz = Math.cos(bus.h), r = 10 * u, cx = tx(bus.x), cy = ty(bus.z);
    g.fillStyle = "#1f8a4c"; g.strokeStyle = "#ffffff"; g.lineWidth = 2 * u;
    g.beginPath(); g.moveTo(cx + fx * r, cy + fz * r); g.lineTo(cx - fx * r * 0.6 + fz * r * 0.6, cy - fz * r * 0.6 - fx * r * 0.6); g.lineTo(cx - fx * r * 0.6 - fz * r * 0.6, cy - fz * r * 0.6 + fx * r * 0.6); g.closePath(); g.fill(); g.stroke();
  }
  function toggleMap(force) {
    const open = force !== undefined ? force : $("mapBox").hidden;
    if (open && mode !== "play") return;
    show("mapBox", open);
    if (open) { mode = "map"; sizeMaps(); drawBigMap(); } else if (mode === "map") mode = "play";
  }

  /* ---------- HUD ---------- */
  const cache = {};
  const setText = (id, v) => { if (cache[id] !== v) { cache[id] = v; $(id).textContent = v; } };
  function renderOnboard() {
    const box = $("onboard");
    if (!onboard.length) { box.innerHTML = "<h2>À bord</h2><p>Sotrama vide. Va chercher des passagers aux cercles blancs.</p>"; return; }
    const counts = {}; for (const p of onboard) counts[p.dest] = (counts[p.dest] || 0) + 1;
    const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([d, n]) => `<li><span>${world.stops[d].name}</span><b>${n}</b></li>`).join("");
    box.innerHTML = `<h2>À bord · ${onboard.length}</h2><ul>${rows}</ul>`;
  }
  function updateHUD(dt) {
    if (!day) return;
    $("money").firstChild.nodeValue = fmt(cash());
    const mins = 360 + Math.min(1, elapsed / DAY) * 840;
    setText("clock", String(Math.floor(mins / 60)).padStart(2, "0") + ":" + String(Math.floor(mins % 60)).padStart(2, "0"));
    setText("seats", String(onboard.length));
    setText("dayLabel", "Jour " + S.day);
    $("speed").firstChild.nodeValue = String(Math.round(Math.abs(bus.v) * 3.6));
    const tank = TANK[S.tank].v, f = bus.fuel / tank;
    $("fuelBar").style.width = (f * 100).toFixed(1) + "%"; $("fuel").classList.toggle("low", f < 0.15);
    setText("fuelText", Math.round(bus.fuel) + " L");
    if (onboardDirty) { onboardDirty = false; renderOnboard(); }
    let target = null, label = "";
    if (bus.fuel < 6) {
      let bd = 1e9; for (const st of world.stations) { const d = Math.hypot(st.zx - bus.x, st.zz - bus.z); if (d < bd) { bd = d; target = { zx: st.zx, zz: st.zz, name: st.name }; } }
      label = "Carburant :";
    } else if (onboard.length) {
      const counts = {}; for (const p of onboard) counts[p.dest] = (counts[p.dest] || 0) + 1;
      let bn = -1, bd = 1e9;
      for (const [d, n] of Object.entries(counts)) { const s = world.stops[d], dist = Math.hypot(s.zx - bus.x, s.zz - bus.z); const score = n * 300 - dist; if (score > bn) { bn = score; bd = n; target = s; } }
      label = bd > 1 ? bd + " passagers pour" : "1 passager pour";
    } else {
      let best = -1e9;
      for (const s of world.stops) { if (!s.waiting.length) continue; const score = s.waiting.length * 150 - Math.hypot(s.zx - bus.x, s.zz - bus.z); if (score > best) { best = score; target = s; } }
      label = target ? target.waiting.length + " attendent à" : "";
    }
    $("guide").hidden = !target;
    if (target) {
      setText("guideLabel", label); setText("guideName", target.name);
      const dx = target.zx - bus.x, dz = target.zz - bus.z, dist = Math.hypot(dx, dz);
      setText("guideDist", dist < 8 ? "Tu y es" : dist >= 1000 ? (dist / 1000).toFixed(1).replace(".", ",") + " km" : Math.round(dist / 10) * 10 + " m");
      const fx = Math.sin(bus.h), fz = Math.cos(bus.h);
      $("arrow").style.transform = "rotate(" + Math.atan2(dx * -fz + dz * fx, dx * fx + dz * fz).toFixed(3) + "rad)";
      $("arrow").classList.toggle("pick", !onboard.length && bus.fuel >= 6);
    }
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) $("toast").classList.remove("show"); }
    drawRadar();
  }
  let toastT = 0;
  function toast(text, kind) { const t = $("toast"); t.textContent = text; t.className = "hud panel show" + (kind ? " " + kind : ""); toastT = kind === "call" ? 2.6 : 2.4; }
  function popCash(text, bad) {
    const el = document.createElement("div"); el.className = "pop" + (bad ? " bad" : ""); el.textContent = text;
    document.body.appendChild(el); setTimeout(() => el.remove(), 1200);
  }

  /* ---------- garage / title screen ---------- */
  function showGarage() {
    mode = "garage"; day = null; resetBus(); buildBus();
    show("garage", true); renderGarage();
  }
  function renderGarage() {
    $("gDay").textContent = "Jour " + S.day;
    $("gSavings").textContent = fmt(S.savings) + " F";
    $("gBest").textContent = S.best ? "Meilleure journée : " + fmt(S.best) + " F" : "";
    $("btnStart").textContent = "Démarrer le jour " + S.day;
    const L = SB.tex.LIVERIES;
    $("liveries").innerHTML = Object.entries(L).map(([id, l]) => {
      const owned = S.owned.includes(id), on = S.livery === id;
      const label = on ? "Équipée" : owned ? "Choisir" : fmt(l.price) + " F";
      return `<button class="liv${on ? " on" : ""}" data-liv="${id}" type="button" ${!owned && S.savings < l.price ? "data-locked" : ""}>
        <span class="sw" style="--b:${l.body};--s:${l.stripe};--r:${l.roof}"></span><span class="ln">${l.name}</span><span class="lp">${label}</span></button>`;
    }).join("");
    const up = (key, list, name, unit) => {
      const lvl = S[key], next = list[lvl + 1];
      return `<div class="up"><div><b>${name}</b><span>${list[lvl].v} ${unit}${next ? " → " + next.v + " " + unit : " · max"}</span></div>${next ? `<button type="button" class="small" data-up="${key}" ${S.savings < next.price ? "disabled" : ""}>${fmt(next.price)} F</button>` : ""}</div>`;
    };
    $("upgrades").innerHTML = up("engine", ENGINE.map((e) => ({ v: Math.round(e.v * 3.6), price: e.price })), "Moteur", "km/h") + up("tank", TANK, "Réservoir", "L");
    $("qualityBtn").textContent = "Graphismes : " + (S.quality === "haute" ? "haute qualité" : "économie");
    $("soundBtn").textContent = "Son : " + (S.sound ? "oui" : "non");
    const shop = SB.purchases.available && !S.noAds;
    $("btnNoAds").hidden = !shop; $("btnRestore").hidden = !SB.purchases.available;
    if (shop) $("btnNoAds").textContent = "Retirer les pubs" + (SB.purchases.price() ? " · " + SB.purchases.price() : "");
  }
  function onGarageClick(e) {
    const liv = e.target.closest("[data-liv]"), upb = e.target.closest("[data-up]");
    if (liv) {
      const id = liv.dataset.liv, l = SB.tex.LIVERIES[id];
      if (!S.owned.includes(id)) { if (S.savings < l.price) { gToast("Il te manque " + fmt(l.price - S.savings) + " F"); return; } S.savings -= l.price; S.owned.push(id); }
      S.livery = id; save(); buildBus(); renderGarage();
    } else if (upb) {
      const key = upb.dataset.up, list = key === "engine" ? ENGINE : TANK, next = list[S[key] + 1];
      if (next && S.savings >= next.price) { S.savings -= next.price; S[key]++; save(); renderGarage(); }
    }
  }
  function gToast(t) { const el = $("gMsg"); el.textContent = t; clearTimeout(gToast.t); gToast.t = setTimeout(() => (el.textContent = ""), 2500); }

  /* ---------- audio ---------- */
  let actx = null, master = null, engOsc = null, engGain = null;
  function initAudio() {
    if (actx) { if (actx.state === "suspended") actx.resume(); return; }
    try {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      master = actx.createGain(); master.gain.value = S.sound ? 0.5 : 0; master.connect(actx.destination);
      const lp = actx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 360;
      engOsc = actx.createOscillator(); engOsc.type = "sawtooth"; engOsc.frequency.value = 40;
      engGain = actx.createGain(); engGain.gain.value = 0;
      engOsc.connect(lp); lp.connect(engGain); engGain.connect(master); engOsc.start();
    } catch (e) { actx = null; }
  }
  function tone(freqs, type, dur, vol, t0) {
    if (!actx) return; const t = actx.currentTime + (t0 || 0);
    for (const f of freqs) {
      const o = actx.createOscillator(), g = actx.createGain(); o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.setValueAtTime(vol, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
    }
  }
  const ding = () => { tone([988], "sine", 0.12, 0.12); tone([1318], "sine", 0.18, 0.1, 0.09); };
  const tick = () => tone([660], "triangle", 0.06, 0.06);
  function thud() {
    if (!actx) return; const len = actx.sampleRate * 0.25, buf = actx.createBuffer(1, len, actx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const src = actx.createBufferSource(), lp = actx.createBiquadFilter(), g = actx.createGain(); lp.type = "lowpass"; lp.frequency.value = 600; g.gain.value = 0.6;
    src.buffer = buf; src.connect(lp); lp.connect(g); g.connect(master); src.start();
  }
  function honk() {
    tone([392, 494], "square", 0.45, 0.07);
    const fx = Math.sin(bus.h), fz = Math.cos(bus.h);
    for (const ag of agents) { const rx = ag.x - bus.x, rz = ag.z - bus.z, al = rx * fx + rz * fz; if (al > 0 && al < 28 && Math.abs(rx * fz - rz * fx) < 5) ag.dodge = 2.5; }
  }

  /* ---------- input ---------- */
  const keys = { up: false, down: false, left: false, right: false, brake: false };
  function setupInput() {
    const KEYMAP = { ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right", Space: "brake" };
    window.addEventListener("keydown", (e) => {
      const k = KEYMAP[e.code];
      if (k && (mode === "play")) { keys[k] = true; e.preventDefault(); }
      if (e.repeat) return;
      if (e.code === "KeyH" && mode === "play") honk();
      if (e.code === "KeyC") cycleCam();
      if (e.code === "KeyM") toggleMap();
      if (e.code === "KeyP" || e.code === "Escape") { if (mode === "map") toggleMap(false); else togglePause(); }
      if (e.code === "Enter" && mode === "garage") startDay();
    });
    window.addEventListener("keyup", (e) => { const k = KEYMAP[e.code]; if (k) keys[k] = false; });
    window.addEventListener("blur", () => { for (const k in keys) keys[k] = false; });
    document.addEventListener("visibilitychange", () => { if (document.hidden && mode === "play") togglePause(); });
    window.addEventListener("touchstart", () => document.body.classList.add("touch"), { passive: true, once: true });
    if (isTouch) document.body.classList.add("touch");
    for (const btn of document.querySelectorAll("#pad button")) {
      const k = btn.dataset.k;
      const on = (e) => { e.preventDefault(); initAudio(); btn.classList.add("on"); try { btn.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } if (k === "horn") { if (mode === "play") honk(); } else keys[k] = true; };
      const off = () => { btn.classList.remove("on"); if (k !== "horn") keys[k] = false; };
      btn.addEventListener("pointerdown", on); btn.addEventListener("pointerup", off); btn.addEventListener("pointercancel", off); btn.addEventListener("lostpointercapture", off);
      btn.addEventListener("contextmenu", (e) => e.preventDefault());
    }
    $("btnCam").addEventListener("click", cycleCam);
    $("btnMap").addEventListener("click", () => toggleMap());
    $("radar").addEventListener("click", () => toggleMap());
    $("btnCloseMap").addEventListener("click", () => toggleMap(false));
    $("btnPause").addEventListener("click", togglePause);
    $("btnResume").addEventListener("click", togglePause);
    $("btnQuit").addEventListener("click", () => { show("pauseBox", false); day = null; showGarage(); });
    $("btnStart").addEventListener("click", startDay);
    $("btnDouble").addEventListener("click", doubleFares);
    $("btnNext").addEventListener("click", nextDay);
    $("btnTowPay").addEventListener("click", () => tow(false));
    $("btnTowAd").addEventListener("click", () => tow(true));
    $("garage").addEventListener("click", onGarageClick);
    $("qualityBtn").addEventListener("click", () => { S.quality = S.quality === "haute" ? "eco" : "haute"; save(); window.location.reload(); });
    $("soundBtn").addEventListener("click", () => { S.sound = !S.sound; save(); if (master) master.gain.value = S.sound ? 0.5 : 0; renderGarage(); });
    $("btnNoAds").addEventListener("click", () => SB.purchases.buy());
    $("btnRestore").addEventListener("click", () => SB.purchases.restore());
    window.addEventListener("resize", () => { renderer.setSize(window.innerWidth, window.innerHeight); camera.aspect = window.innerWidth / window.innerHeight; viewShift = -1; camera.clearViewOffset(); camera.updateProjectionMatrix(); sizeMaps(); if (mode === "map") drawBigMap(); });
  }
  function cycleCam() { camMode = (camMode + 1) % CAMS.length; if (mode === "play") toast(CAMS[camMode]); }
  function togglePause() {
    if (mode === "play") { mode = "pause"; show("pauseBox", true); }
    else if (mode === "pause") { initAudio(); mode = "play"; show("pauseBox", false); }
  }
  function show(id, yes) { $(id).hidden = !yes; document.body.classList.toggle("in-" + id, !!yes); }
  function blurActive() { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }

  /* ---------- loop ---------- */
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const frozen = mode === "pause" || mode === "map" || mode === "panne";
    if (!frozen) time += dt;
    if (mode === "play") { updateBus(dt); updateStops(dt); elapsed += dt; if (elapsed >= DAY) endDay(); }
    else if (engGain) engGain.gain.value = 0;
    if (!frozen) { updateTraffic(dt); updatePeople(dt); }
    // water and dust
    if (!frozen) {
      world.texWater.offset.x = (time * 0.004) % 1; world.texWater.offset.y = (time * 0.01) % 1;
      const pa = world.waterGeo.attributes.position, arr = pa.array, base = world.waterBase;
      for (let i = 0; i < arr.length; i += 3) arr[i + 1] = base[i + 1] + Math.sin(base[i] * 0.05 + time * 1.1) * 0.1 + Math.cos(base[i + 2] * 0.25 + time * 1.5) * 0.06;
      pa.needsUpdate = true;
      if (dust) {
        const p = dust.geometry.attributes.position.array, b0 = dust.userData.base;
        for (let i = 0; i < p.length; i += 3) {
          p[i] = camera.position.x + ((((b0[i] + time * 2.2 - camera.position.x) % 180) + 270) % 180) - 90;
          p[i + 1] = b0[i + 1] + Math.sin(time * 0.5 + i) * 0.4;
          p[i + 2] = camera.position.z + ((((b0[i + 2] + time * 0.8 - camera.position.z) % 180) + 270) % 180) - 90;
        }
        dust.geometry.attributes.position.needsUpdate = true;
      }
    }
    busMesh.position.set(bus.x, 0.08, bus.z); busMesh.rotation.y = bus.h;
    busMesh.rotation.z = -bus.steer * Math.min(1, Math.abs(bus.v) / 17) * 0.04;
    for (const w of busMesh.userData.wheels) w.rotation.x += (bus.v * dt) / 0.45;
    updateCamera(dt);
    updateSky(mode === "garage" ? 0.3 : Math.min(1, elapsed / DAY));
    updateMarkers();
    updateHUD(dt);
    renderer.render(scene, camera);
    SB.stats = renderer.info.render;
    requestAnimationFrame(frame);
  }

  window.addEventListener("load", () => { boot().catch((e) => { console.error(e); $("loading").textContent = "Erreur au démarrage : " + e.message; }); });
})();
