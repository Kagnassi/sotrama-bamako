/* Sotrama Bamako - game loop, driving, passengers, career, coach trips, HUD and menus. */
(function () {
  "use strict";
  const SB = window.SB;
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Math.round(n).toLocaleString("fr-FR");
  const rand = (a, b) => a + (b - a) * Math.random();
  const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  /* ---------- saved progress ---------- */
  const SAVE_KEY = "sotrama-bamako-save-v2";
  const DEFAULTS = {
    savings: 0, best: 0, day: 1, owned: ["vert"], livery: "vert", engine: 0, tank: 0, noAds: false, quality: "", sound: true, voice: true,
    totalPassengers: 0, permis: false, permisCar: false, fleet: [], staff: [], city: "bamako", nextId: 1,
  };
  let S;
  try {
    const v2 = localStorage.getItem(SAVE_KEY), v1 = localStorage.getItem("sotrama-bamako-save-v1");
    S = Object.assign({}, DEFAULTS, JSON.parse(v2 || v1 || "{}"));
  } catch (e) { S = Object.assign({}, DEFAULTS); }
  const save = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* storage unavailable */ } };
  const isTouch = window.matchMedia("(pointer: coarse)").matches;
  if (!S.quality) S.quality = isTouch ? "eco" : "haute";
  const HIGH = S.quality === "haute";

  /* ---------- economy (F CFA) ---------- */
  const DAY = 360, FUEL_PRICE = 800, M_PER_L = 220;
  const ENGINE = [{ v: 17, price: 0 }, { v: 19, price: 80000 }, { v: 21, price: 160000 }];
  const TANK = [{ v: 50, price: 0 }, { v: 70, price: 50000 }, { v: 90, price: 110000 }];
  const PRICE = { permis: 75000, permisCar: 150000, sotrama: 600000, car: 2500000, hire: 25000, apprenti: 10000 };
  const VERSEMENT = 10000, ENTRETIEN = 1000, APPRENTI_PAY = 1000, SHARE = 0.25;
  const carRent = (km) => 20000 + 150 * km, carMaint = (km) => 25 * km;
  const NAMES = ["Moussa", "Bakary", "Seydou", "Adama", "Oumar", "Fousseyni", "Drissa", "Sékou", "Mamadou", "Ibrahim", "Lassana", "Modibo", "Souleymane", "Boubacar", "Yacouba", "Aminata", "Kadiatou", "Fatoumata", "Salif", "Issa"];

  function rank() {
    const cars = S.fleet.filter((v) => v.type === "car").length, sot = S.fleet.filter((v) => v.type === "sotrama").length;
    if (cars >= 2 && sot >= 3) return "Grand transporteur";
    if (cars >= 1) return "Transporteur";
    if (S.permisCar) return "Chauffeur de car";
    if (S.fleet.length >= 2) return "Patron";
    if (S.fleet.length >= 1) return "Propriétaire";
    if (S.permis) return "Chauffeur";
    return "Apprenti";
  }
  const OBJECTIVES = [
    { id: "permis", title: "Passer le permis transport", text: "Tu deviens chauffeur : tu gardes la recette, moins 10 000 F de versement par jour au patron.", price: PRICE.permis, done: () => S.permis, buy: () => { S.permis = true; } },
    { id: "sotrama", title: "Acheter ta première Sotrama", text: "Une Sotrama d'occasion : plus de versement, la recette est pour toi (entretien 1 000 F par jour).", price: PRICE.sotrama, done: () => S.fleet.some((v) => v.type === "sotrama"), buy: () => addVehicle("sotrama") },
    { id: "patron", title: "Devenir patron", text: "Achète une deuxième Sotrama et embauche un chauffeur : elle te rapporte un versement chaque jour.", price: PRICE.sotrama, done: () => S.fleet.length >= 2, buy: () => addVehicle("sotrama") },
    { id: "permisCar", title: "Passer le permis car", text: "Tu conduis les cars de la compagnie vers les régions du Mali (location du car à chaque voyage).", price: PRICE.permisCar, done: () => S.permisCar, buy: () => { S.permisCar = true; } },
    { id: "car", title: "Acheter ton premier car", text: "Ta propre ligne : Kagnassi Transport. Plus de location, seulement l'entretien.", price: PRICE.car, done: () => S.fleet.some((v) => v.type === "car"), buy: () => addVehicle("car") },
    { id: "grand", title: "Devenir grand transporteur", text: "Deux cars et trois Sotrama, avec leurs chauffeurs.", price: PRICE.car, done: () => S.fleet.filter((v) => v.type === "car").length >= 2 && S.fleet.filter((v) => v.type === "sotrama").length >= 3, buy: () => addVehicle(S.fleet.filter((v) => v.type === "car").length < 2 ? "car" : "sotrama") },
  ];
  function addVehicle(type) {
    const n = S.fleet.filter((v) => v.type === type).length + 1;
    const mine = S.fleet.some((v) => v.type === type && v.driver === "me");
    S.fleet.push({ id: S.nextId++, type, name: (type === "car" ? "Car n°" : "Sotrama n°") + n, driver: mine ? null : "me" });
  }
  const staffName = () => { const used = new Set(S.staff.map((p) => p.name)); const free = NAMES.filter((n) => !used.has(n)); return free.length ? free[Math.floor(Math.random() * free.length)] : "Employé " + (S.staff.length + 1); };

  /* ---------- engine objects ---------- */
  let renderer, scene, camera, sun, hemi, sky, sunSprite, dust;
  let worldGroup = null, world = null, loaded = "";
  let busMesh, motos, taxis, aiBuses = {}, trucks, coaches, people;
  const agents = [], walkers = [], pedestrians = [];
  const bus = { x: 0, z: 0, h: 0, v: 0, steer: 0, fuel: 20 };
  let veh = null; // the vehicle driven today
  let mode = "loading", camMode = 0, time = 0, elapsed = 0;
  let day = null, pending = null;
  let onboard = [], onboardDirty = true;
  let atStop = null, lastStop = null, workT = 0, announced = false, hinted = false, fullShown = false, crashCool = 0, fuelWarned = false, slowT = 0;
  let maliPick = null;

  async function boot() {
    try { await Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), new Promise((r) => setTimeout(r, 2500))]); } catch (e) { /* fonts optional */ }
    renderer = new THREE.WebGLRenderer({ antialias: HIGH, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, HIGH ? 1.6 : 1.1));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = HIGH;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    SB.maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    $("stage").appendChild(renderer.domElement);
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(lin(0xe9d8b6), 150, HIGH ? 900 : 650);
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, HIGH ? 1300 : 950);
    hemi = new THREE.HemisphereLight(lin(0xcfd8e0), lin(0x8a4a2a), 0.8); scene.add(hemi);
    sun = new THREE.DirectionalLight(lin(0xfff3e0), 2.6);
    sun.castShadow = HIGH; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 10, far: 400 });
    sun.shadow.camera.updateProjectionMatrix(); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
    scene.add(sun, sun.target);
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
    SB.voice.setEnabled(S.voice);
    setupInput();
    SB.purchases.onOwned = () => { S.noAds = true; save(); renderGarage(); };
    SB.ads.init(S);
    document.addEventListener("deviceready", () => SB.purchases.init(), false);
    if (S.city === "bamako") await loadCity(); else await loadRoute(SB.mali.routesFrom(S.city)[0]);
    if (window.location.search.includes("debug")) SB.debug = { bus, get world() { return world; }, onboard: () => onboard, stats: () => renderer.info.render, S, startTrip, startCityDay };
    showGarage();
    requestAnimationFrame(frame);
  }

  /* ---------- loading a world (Bamako, or a road between two cities) ---------- */
  function disposeGroup(g) {
    g.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) { if (m.map) m.map.dispose(); m.dispose(); }
    });
    scene.remove(g);
  }
  async function withLoading(text, fn) {
    $("loading").textContent = text; $("loading").hidden = false;
    await new Promise((r) => setTimeout(r, 40));
    try { fn(); } finally { $("loading").hidden = true; }
  }
  function resetWorldState() {
    if (worldGroup) disposeGroup(worldGroup);
    agents.length = 0; walkers.length = 0; pedestrians.length = 0; markers = null; aiBuses = {}; trucks = coaches = null;
    worldGroup = new THREE.Group(); scene.add(worldGroup);
  }
  async function loadCity() {
    if (loaded === "city") return;
    await withLoading("Bamako se réveille…", () => {
      resetWorldState();
      world = SB.buildWorld(worldGroup, { quality: S.quality });
      world.kind = "city";
      people = new SB.People(worldGroup, HIGH ? 320 : 260);
      motos = SB.motoFleet(worldGroup, HIGH ? 46 : 32);
      taxis = SB.taxiFleet(worldGroup, HIGH ? 14 : 10);
      aiBuses = { vert: SB.busFleet(worldGroup, "vert", 5), bleu: SB.busFleet(worldGroup, "bleu", 2) };
      const parked = {};
      for (const p of world.parked) (parked[p.livery] = parked[p.livery] || []).push(p);
      for (const [liv, list] of Object.entries(parked)) { const f = SB.busFleet(worldGroup, liv, list.length, true); list.forEach((p, i) => f.set(i, p.x, 0.06, p.z, p.ang)); f.commit(); }
      spawnTraffic(); spawnPedestrians();
      for (const s of world.stops) { const n = Math.floor(rand(1, 4)); for (let k = 0; k < n; k++) addWaiting(s); }
      loaded = "city";
    });
  }
  async function loadRoute(trip) {
    const key = "route:" + trip.from + ">" + trip.to;
    if (loaded === key) return;
    await withLoading("Route de " + SB.mali.CITIES[trip.to].name + "…", () => {
      resetWorldState();
      world = SB.buildRoute(worldGroup, trip, { quality: S.quality });
      people = new SB.People(worldGroup, 220);
      motos = SB.motoFleet(worldGroup, HIGH ? 12 : 8);
      taxis = SB.taxiFleet(worldGroup, 4);
      trucks = SB.truckFleet(worldGroup, HIGH ? 10 : 7);
      coaches = SB.coachFleet(worldGroup, HIGH ? 3 : 2);
      const pc = SB.coachFleet(worldGroup, world.parked.length); world.parked.forEach((p, i) => pc.set(i, p.x, 0.06, p.z, p.ang)); pc.commit();
      spawnTraffic();
      // police and toll agents
      for (const cp of world.checkpoints) for (const [x, z] of cp.people) { const id = people.alloc(); if (id < 0) continue; people.dress(id, cp.kind === "police" ? 0x34465e : 0xe2b31d, 0x1f2a36); people.set(id, x, z, Math.atan2(-world.at(cp.s, 1)[0] + world.at(cp.s, 0)[0], -world.at(cp.s, 1)[1] + world.at(cp.s, 0)[1])); }
      people.commit();
      loaded = key;
    });
  }

  /* ---------- the vehicle driven today ---------- */
  function myVehicle(type) {
    let v = S.fleet.find((x) => x.type === type && x.driver === "me");
    if (!v) v = S.fleet.find((x) => x.type === type && !x.driver);
    return v || null;
  }
  function setupVehicle(kind, trip) {
    if (busMesh) { disposeGroup(busMesh); busMesh = null; }
    $("plate").textContent = kind === "coach" ? "KAGNASSI TRANSPORT · CAISSE" : "SOTRAMA · RECETTE DU JOUR";
    if (kind === "coach") {
      const own = myVehicle("car");
      veh = { type: "coach", own, cap: 60, maxv: 26, acc: 3.4, hl: 6, hw: 1.27, wheelR: 0.55, tank: 300, perMeter: trip ? (trip.km * 0.3) / world.L : 0.001, label: "Car" };
      busMesh = SB.makeCoach(trip ? SB.mali.CITIES[trip.to].name : "");
    } else {
      const own = myVehicle("sotrama");
      veh = { type: "sotrama", own, cap: 22, maxv: own ? ENGINE[S.engine].v : 17, acc: 6.5, hl: 2.7, hw: 1.15, wheelR: 0.45, tank: own ? TANK[S.tank].v : 50, perMeter: 1 / M_PER_L, label: "Sotrama" };
      busMesh = SB.makeBus(own ? S.livery : "vert");
    }
    scene.add(busMesh);
    $("cap").textContent = veh.cap;
  }
  function resetBus() { Object.assign(bus, { x: world.start.x, z: world.start.z, h: world.start.h, v: 0, steer: 0 }); camInit = false; }

  /* ---------- traffic ---------- */
  function legPath(a, b, lane) {
    const N = world.nodes, A = N[a], B = N[b], L = Math.hypot(B.x - A.x, B.z - A.z), dx = (B.x - A.x) / L, dz = (B.z - A.z) / L, nx = -dz, nz = dx;
    const ta = A.r ? A.r + world.RING : 0, tb = B.r ? B.r + world.RING : 0;
    return [[A.x + dx * ta + nx * lane, A.z + dz * ta + nz * lane], [B.x - dx * tb + nx * lane, B.z - dz * tb + nz * lane]];
  }
  function ringArc(n, from, to) {
    const rad = n.r + world.RING * 0.65, f0 = Math.atan2(-(from[1] - n.z), from[0] - n.x);
    let f1 = Math.atan2(-(to[1] - n.z), to[0] - n.x);
    while (f1 <= f0 + 0.35) f1 += Math.PI * 2;
    const pts = []; for (let f = f0 + 0.18; f < f1 - 0.12; f += 0.18) pts.push([n.x + rad * Math.cos(f), n.z - rad * Math.sin(f)]);
    return pts;
  }
  function nextLeg(ag) {
    const B = world.nodes[ag.b];
    let opts = B.nb.filter((x) => x !== ag.a); if (!opts.length) opts = [ag.a];
    const c = opts[Math.floor(Math.random() * opts.length)];
    const leg = legPath(ag.b, c, ag.lane), pre = B.r ? ringArc(B, ag.path[ag.path.length - 1], leg[0]) : [];
    ag.a = ag.b; ag.b = c; ag.path = pre.concat(leg); ag.pi = 0;
  }
  function placeAgent(ag, far) {
    for (let tries = 0; tries < 20; tries++) {
      const rd = world.roads[Math.floor(Math.random() * world.roads.length)], flip = Math.random() < 0.5;
      ag.a = flip ? rd.b : rd.a; ag.b = flip ? rd.a : rd.b; ag.path = legPath(ag.a, ag.b, ag.lane);
      const t = Math.random(); ag.x = ag.path[0][0] + (ag.path[1][0] - ag.path[0][0]) * t; ag.z = ag.path[0][1] + (ag.path[1][1] - ag.path[0][1]) * t;
      if (far && Math.hypot(ag.x - bus.x, ag.z - bus.z) < 160) continue;
      break;
    }
    ag.pi = 1; ag.rx = ag.x; ag.rz = ag.z;
    const d = Math.hypot(ag.path[1][0] - ag.path[0][0], ag.path[1][1] - ag.path[0][1]) || 1;
    ag.hx = (ag.path[1][0] - ag.path[0][0]) / d; ag.hz = (ag.path[1][1] - ag.path[0][1]) / d; ag.rang = Math.atan2(ag.hx, ag.hz);
    ag.crash = 0; ag.roll = 0; ag.speed = ag.base * 0.6;
  }
  const SIZE = { moto: [1.8, 0.7], taxi: [4.2, 1.8], bus: [5.4, 2.3], coach: [12, 2.55], truck: [10.8, 2.55] };
  function spawnTraffic() {
    const add = (fleet, i, type, base, lane) => { const ag = { fleet, i, type, base, lane, len: SIZE[type][0], wid: SIZE[type][1], dodge: 0 }; placeAgent(ag); agents.push(ag); };
    const road = world.kind === "route";
    for (let i = 0; i < motos.count; i++) add(motos, i, "moto", road ? rand(12, 18) : rand(9, 14), road ? rand(2.4, 3.4) : rand(2.0, 4.2));
    for (let i = 0; i < taxis.count; i++) add(taxis, i, "taxi", road ? rand(17, 22) : rand(8, 12), road ? 2.3 : 3);
    for (const f of Object.values(aiBuses)) for (let i = 0; i < f.count; i++) add(f, i, "bus", rand(7, 10), 3.2);
    if (trucks) for (let i = 0; i < trucks.count; i++) add(trucks, i, "truck", rand(14, 19), 2.3);
    if (coaches) for (let i = 0; i < coaches.count; i++) add(coaches, i, "coach", rand(18, 23), 2.3);
  }
  function updateTraffic(dt) {
    const k = 1 - Math.exp(-dt * 8);
    for (const ag of agents) {
      if (ag.crash > 0) {
        ag.crash -= dt; ag.roll = Math.min(1.35, ag.roll + dt * 5);
        if (ag.crash <= 0) placeAgent(ag, true);
      } else {
        ag.dodge = Math.max(0, ag.dodge - dt);
        let blocked = false;
        const rx = bus.x - ag.x, rz = bus.z - ag.z, al = rx * ag.hx + rz * ag.hz;
        if (veh && al > 0 && al < 7 + veh.hl + ag.len / 2 && Math.abs(rx * ag.hz - rz * ag.hx) < 2.8) blocked = true;
        if (!blocked) for (const o of agents) {
          if (o === ag || o.crash > 0) continue;
          const ox = o.x - ag.x, oz = o.z - ag.z; if (Math.abs(ox) > 16 || Math.abs(oz) > 16) continue;
          const a2 = ox * ag.hx + oz * ag.hz;
          if (a2 > 0 && a2 < (ag.len + o.len) / 2 + 2 && Math.abs(ox * ag.hz - oz * ag.hx) < 1.8 && ox * o.hx + oz * o.hz > -2) { blocked = true; break; }
        }
        ag.speed += ((blocked ? 0 : ag.base) - ag.speed) * Math.min(1, dt * (blocked ? 5 : 1.2));
        let step = ag.speed * dt;
        while (step > 0) {
          if (ag.pi >= ag.path.length) nextLeg(ag);
          const t = ag.path[ag.pi], dx = t[0] - ag.x, dz = t[1] - ag.z, d = Math.hypot(dx, dz);
          if (d <= step) { ag.x = t[0]; ag.z = t[1]; step -= d; ag.pi++; }
          else { ag.x += (dx / d) * step; ag.z += (dz / d) * step; ag.hx = dx / d; ag.hz = dz / d; step = 0; }
        }
      }
      const dodge = ag.dodge > 0 ? 1.4 : 0;
      ag.rx += (ag.x - ag.hz * dodge - ag.rx) * k; ag.rz += (ag.z + ag.hx * dodge - ag.rz) * k;
      let da = Math.atan2(ag.hx, ag.hz) - ag.rang; da = Math.atan2(Math.sin(da), Math.cos(da)); ag.rang += da * Math.min(1, dt * 7);
      ag.fleet.set(ag.i, ag.rx, 0.08, ag.rz, ag.rang, ag.type === "moto" ? ag.roll : ag.roll * 0.15);
    }
    for (const f of [motos, taxis, trucks, coaches, ...Object.values(aiBuses)]) if (f) f.commit();
  }

  /* ---------- people ---------- */
  function spawnPedestrians() {
    for (let k = 0; k < (HIGH ? 70 : 40); k++) {
      const rd = world.roads[Math.floor(Math.random() * world.roads.length)];
      if (Math.abs(world.nodes[rd.a].z) < 80 && Math.abs(world.nodes[rd.b].z) < 80) continue;
      const id = people.alloc(); if (id < 0) break;
      pedestrians.push({ id, rd, t: rand(10, rd.len - 10), side: Math.random() < 0.5 ? -1 : 1, dir: Math.random() < 0.5 ? -1 : 1, v: rand(0.9, 1.5), ph: rand(0, 6) });
    }
  }
  function updatePeople(dt) {
    for (const p of pedestrians) {
      p.t += p.dir * p.v * dt; if (p.t < 8 || p.t > p.rd.len - 8) p.dir *= -1;
      const A = world.nodes[p.rd.a], off = p.rd.w / 2 + 1.8;
      p.ph += dt * 7;
      people.set(p.id, A.x + p.rd.dx * p.t + p.rd.nx * p.side * off, A.z + p.rd.dz * p.t + p.rd.nz * p.side * off, Math.atan2(p.rd.dx * p.dir, p.rd.dz * p.dir), Math.abs(Math.sin(p.ph)) * 0.05);
    }
    for (let i = walkers.length - 1; i >= 0; i--) {
      const w = walkers[i]; w.life -= dt; w.x += w.vx * dt; w.z += w.vz * dt; w.ph += dt * 7;
      if (w.life <= 0) { people.release(w.id); walkers.splice(i, 1); continue; }
      people.set(w.id, w.x, w.z, Math.atan2(w.vx, w.vz), Math.abs(Math.sin(w.ph)) * 0.05);
    }
    people.commit();
  }
  const SLOTS = [[-0.6, 0], [0.6, 0], [-1.8, 0.3], [1.8, 0.3], [-1.2, 1.2], [1.2, 1.2], [-3, 0.5], [3, 0.5]];
  function addWaiting(s, info) {
    const used = new Set(s.waiting.map((w) => w.slot));
    let slot = SLOTS.findIndex((_, i) => !used.has(i));
    if (slot < 0) slot = -1;
    const w = Object.assign({ slot, id: -1 }, info || {});
    if (slot >= 0) {
      const id = people.alloc();
      if (id >= 0) { const [a, o] = SLOTS[slot]; people.set(id, s.sx + s.dx * a - s.nx * (1.4 - o), s.sz + s.dz * a - s.nz * (1.4 - o), Math.atan2(-s.nx, -s.nz)); people.commit(); w.id = id; }
    }
    s.waiting.push(w);
  }
  function addWalker(s) {
    const id = people.alloc(); if (id < 0) return;
    walkers.push({ id, x: s.zx + s.nx * 2.5, z: s.zz + s.nz * 2.5, vx: s.nx * 1.3 + s.dx * rand(-0.4, 0.4), vz: s.nz * 1.3 + s.dz * rand(-0.4, 0.4), life: 4, ph: 0 });
  }
  function clearStops() { for (const s of world.stops) { s.waiting.forEach((w) => people.release(w.id)); s.waiting = []; } people.commit(); }

  /* ---------- a day in the city ---------- */
  async function startCityDay() {
    blurActive(); initAudio();
    hideAll();
    await loadCity();
    setupVehicle("sotrama");
    const asApprenti = !veh.own && !S.permis;
    day = { kind: "city", fares: 0, fuel: 0, fines: 0, toll: 0, served: 0, accidents: 0, doubled: false, apprenti: asApprenti, own: !!veh.own };
    elapsed = 0; onboard = []; onboardDirty = true; fuelWarned = false; slowT = 0;
    resetBus(); bus.fuel = veh.own ? Math.min(20 + veh.tank * 0.2, veh.tank) : 30;
    clearStops();
    for (const s of world.stops) { s.spawnT = rand(1, 8); const n = Math.floor(rand(1, 4)); for (let k = 0; k < n; k++) addWaiting(s); }
    mode = "play";
    toast(asApprenti ? "Jour " + S.day + " · Apprenti : le patron te laisse conduire sa Sotrama" : "Jour " + S.day + " · 6 h : départ de Grand Marché");
  }
  const helpers = () => S.staff.filter((p) => p.role === "apprenti").length;
  function pickDest(s) { let d; do { d = Math.floor(Math.random() * world.stops.length); } while (d === s.i); return d; }
  function fareFor(from, to) {
    const a = world.stops[from], b = world.stops[to];
    let f = a.bank !== b.bank ? 300 : 250;
    if (Math.hypot(a.zx - b.zx, a.zz - b.zz) > 900) f += 50;
    return f;
  }

  /* ---------- a coach trip ---------- */
  function tripFare(trip, sFrom, sTo) { return Math.max(500, Math.round((trip.fare * (sTo - sFrom)) / world.L / 100) * 100); }
  async function startTrip(trip) {
    blurActive(); initAudio();
    if (!S.permisCar) return;
    hideAll();
    await loadRoute(trip);
    setupVehicle("coach", trip);
    const own = veh.own;
    day = { kind: "trip", trip, fares: 0, fuel: 0, fines: 0, toll: 0, served: 0, accidents: 0, doubled: false, own: !!own, rent: own ? 0 : carRent(trip.km), maint: own ? carMaint(trip.km) : 0 };
    elapsed = 0; onboard = []; onboardDirty = true; fuelWarned = false; slowT = 0;
    resetBus();
    const need = trip.km * 0.3;
    bus.fuel = Math.min(veh.tank, need * 0.7 + 10); day.fuel = bus.fuel * FUEL_PRICE;
    for (const cp of world.checkpoints) { cp.state = "pending"; cp.wait = 0; }
    clearStops();
    const stops = world.stops, last = stops.length - 1;
    const n = Math.round(veh.cap * rand(0.55, 0.92));
    for (let k = 0; k < n; k++) { const dest = Math.random() < 0.78 || last === 1 ? last : 1 + Math.floor(Math.random() * (last - 1)); addWaiting(stops[0], { dest }); }
    for (let i = 1; i < last; i++) { const m = Math.floor(rand(1, 7)); for (let k = 0; k < m; k++) addWaiting(stops[i], { dest: i + 1 + Math.floor(Math.random() * (last - i)) }); }
    mode = "play";
    SB.voice.say("depart_car", { dest: SB.mali.CITIES[trip.to].name }, true);
    toast("Départ pour " + SB.mali.CITIES[trip.to].name + " · " + n + " passagers attendent à la gare");
  }

  /* ---------- end of the day and money ---------- */
  function settle() {
    const lines = [];
    let net = 0;
    const add = (label, v, note) => { lines.push({ label, v, note }); net += v; };
    if (day.kind === "city") {
      if (day.apprenti) {
        add("Recette des courses (pour le patron)", 0, fmt(day.fares) + " F");
        add("Ta part d'apprenti (25 %)", Math.round(day.fares * SHARE));
        if (day.fines) add("Accidents", -day.fines);
      } else {
        add("Recette des courses", day.fares);
        add("Carburant", -day.fuel);
        if (day.fines) add("Accidents", -day.fines);
        if (day.own) add("Entretien de ta Sotrama", -ENTRETIEN); else add("Versement au patron", -VERSEMENT);
      }
    } else {
      add("Billets vendus", day.fares);
      add("Carburant", -day.fuel);
      if (day.toll) add("Péage", -day.toll);
      if (day.fines) add("Amendes et accidents", -day.fines);
      if (day.own) add("Entretien de ton car", -day.maint); else add("Location du car", -day.rent);
    }
    // vehicles driven by your employees
    const drivenByMe = veh && veh.own ? veh.own.id : null;
    let fleetIncome = 0; const events = [];
    for (const v of S.fleet) {
      if (v.id === drivenByMe || !v.driver || v.driver === "me") continue;
      const drv = S.staff.find((p) => p.id === v.driver); if (!drv) continue;
      let inc = (v.type === "car" ? 45000 : 9000) * rand(0.7, 1.25) * (drv.trained ? 1.15 : 1);
      if (Math.random() < 0.08) { const cost = v.type === "car" ? 40000 : 12000; inc -= cost; events.push(v.name + " : panne réparée (−" + fmt(cost) + " F)"); }
      fleetIncome += Math.round(inc / 100) * 100;
    }
    if (fleetIncome) add("Versements de ta flotte", fleetIncome, events.join(" · "));
    const app = helpers(); if (app) add("Salaire des apprentis", -app * APPRENTI_PAY);
    return { lines, net };
  }
  function endDay(title) {
    mode = "end"; keys.up = keys.down = false;
    pending = settle();
    $("endDay").textContent = title || "Jour " + S.day + " terminé";
    $("endKicker").textContent = day.kind === "trip" ? "Fin du voyage" : "20 h";
    $("ledger").innerHTML = pending.lines.map((l) => `<div><span>${esc(l.label)}${l.note ? `<small>${esc(l.note)}</small>` : ""}</span><b>${l.v === 0 && l.note ? "" : (l.v < 0 ? "− " : "") + fmt(Math.abs(l.v))}</b></div>`).join("") + `<div class="total"><span>Gain net ${day.kind === "trip" ? "du voyage" : "de la journée"}</span><b id="endNet">${(pending.net < 0 ? "− " : "") + fmt(Math.abs(pending.net))} F</b></div>`;
    $("endServed").textContent = day.served;
    const bonus = Math.min(25000, Math.max(2000, Math.round(day.fares * 0.3 / 1000) * 1000));
    $("btnDouble").hidden = !SB.ads.rewardedAvailable(); $("btnDouble").textContent = "Regarder une pub : +" + fmt(bonus) + " F"; $("btnDouble").dataset.bonus = bonus;
    show("endBox", true);
  }
  async function bonusAd() {
    $("btnDouble").disabled = true;
    const ok = await SB.ads.showRewarded();
    $("btnDouble").disabled = false;
    if (ok && !day.doubled) { day.doubled = true; const b = +$("btnDouble").dataset.bonus; pending.net += b; $("endNet").textContent = fmt(pending.net) + " F"; $("btnDouble").hidden = true; }
  }
  async function nextDay() {
    S.savings = Math.max(0, S.savings + pending.net); S.best = Math.max(S.best, pending.net); S.totalPassengers += day.served;
    if (day.kind === "trip") S.city = day.trip.to;
    for (const p of S.staff) { p.days++; if (p.role === "apprenti" && p.days === 12) p.ready = true; }
    S.day += 1; save();
    show("endBox", false);
    if (!S.noAds && S.day % 2 === 1) await SB.ads.showInterstitial();
    day = null; showGarage();
  }

  /* ---------- driving ---------- */
  function fits(x, z, h) {
    const fx = Math.sin(h), fz = Math.cos(h), rx = -fz, rz = fx, L = veh.hl, W = veh.hw;
    for (const [a, b] of [[L, W], [L, -W], [-L, W], [-L, -W], [0, W], [0, -W], [L / 2, W], [L / 2, -W], [-L / 2, W], [-L / 2, -W]]) if (!world.inRoad(x + fx * a + rx * b, z + fz * a + rz * b)) return false;
    return true;
  }
  function updateBus(dt) {
    const MAXV = veh.maxv, dry = bus.fuel <= 0;
    if (keys.up && !dry) bus.v += (bus.v >= 0 ? veh.acc : 14) * dt;
    if (keys.down) bus.v -= (bus.v > 0.4 ? 14 : dry ? 0 : 4) * dt;
    if (!keys.up && !keys.down || dry) bus.v -= Math.sign(bus.v) * Math.min(Math.abs(bus.v), 2.6 * dt);
    if (keys.brake) bus.v -= Math.sign(bus.v) * Math.min(Math.abs(bus.v), 20 * dt);
    bus.v = Math.max(-6, Math.min(MAXV, bus.v));
    const target = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
    bus.steer += (target - bus.steer) * Math.min(1, dt * 8);
    const turn = veh.type === "coach" ? 0.9 : 1.5;
    const grip = Math.max(-1, Math.min(1, bus.v / 6)) * (1 - 0.35 * Math.min(1, Math.abs(bus.v) / MAXV));
    let nh = bus.h + bus.steer * turn * grip * dt;
    if (!fits(bus.x, bus.z, nh)) nh = bus.h;
    const nx = bus.x + Math.sin(nh) * bus.v * dt, nz = bus.z + Math.cos(nh) * bus.v * dt, ox = bus.x, oz = bus.z;
    if (fits(nx, nz, nh)) { bus.x = nx; bus.z = nz; }
    else if (fits(nx, bus.z, nh)) { bus.x = nx; bus.v *= 0.94; }
    else if (fits(bus.x, nz, nh)) { bus.z = nz; bus.v *= 0.94; }
    else { if (Math.abs(bus.v) > 7) { thud(); toast("Attention au bord de la route !", "bad"); if (onboard.length) SB.voice.say("doucement"); } bus.v *= -0.25; }
    bus.h = nh;
    bus.fuel = Math.max(0, bus.fuel - Math.hypot(bus.x - ox, bus.z - oz) * veh.perMeter);
    if (bus.fuel < veh.tank * 0.12 && !fuelWarned) { fuelWarned = true; toast("Réservoir presque vide : passe à une station", "bad"); SB.voice.say("essence"); }
    if (bus.fuel <= 0 && Math.abs(bus.v) < 0.3 && mode === "play") breakdown();
    if (engGain) { engOsc.frequency.value = (veh.type === "coach" ? 30 : 38) + Math.abs(bus.v) * 4.5; engGain.gain.value = dry ? 0 : 0.035 + Math.abs(bus.v) * 0.003; }
    // impatient passengers
    if (onboard.length && Math.abs(bus.v) < 1 && !atStop) { slowT += dt; if (slowT > 25) { slowT = 0; SB.voice.say("vite"); } } else slowT = 0;

    crashCool -= dt;
    const fx = Math.sin(bus.h), fz = Math.cos(bus.h);
    for (const ag of agents) {
      if (ag.crash > 0) continue;
      const rx = ag.rx - bus.x, rz = ag.rz - bus.z, al = rx * fx + rz * fz, lt = rx * fz - rz * fx;
      if (Math.abs(al) < (veh.hl + ag.len / 2) * 0.9 && Math.abs(lt) < (veh.hw + ag.wid / 2) * 0.9 && Math.abs(bus.v) > 2.5 && crashCool <= 0) {
        const fine = { moto: 1000, taxi: 2000, bus: 2000, truck: 5000, coach: 5000 }[ag.type];
        day.fines += fine; day.accidents++; crashCool = 1.5; bus.v *= -0.2; ag.crash = 2.4;
        thud(); popCash("−" + fmt(fine) + " F", true); SB.voice.say("doucement");
        toast({ moto: "Accident avec une Djakarta", taxi: "Accrochage avec un taxi", bus: "Accrochage avec une Sotrama", truck: "Accrochage avec un camion", coach: "Accrochage avec un car" }[ag.type] + " : −" + fmt(fine) + " F", "bad");
      }
    }
  }
  function breakdown() { mode = "panne"; keys.up = false; $("btnTowAd").hidden = !SB.ads.rewardedAvailable(); show("panneBox", true); }
  async function tow(withAd) {
    if (withAd) { const ok = await SB.ads.showRewarded(); if (!ok) return; } else day.fines += 6000;
    bus.fuel = veh.type === "coach" ? 40 : 10; show("panneBox", false); mode = "play"; fuelWarned = false;
    toast(withAd ? "Remorqué gratuitement, carburant ajouté" : "Remorquage : −6 000 F, carburant ajouté");
  }

  /* ---------- stops, checkpoints and fuel stations ---------- */
  let fuelT = 0;
  const cash = () => day.fares - (day.apprenti ? 0 : day.fuel) - day.fines - day.toll;
  function refuel(dt) {
    for (const st of world.stations) {
      if (Math.hypot(bus.x - st.zx, bus.z - st.zz) > (veh.type === "coach" ? 12 : 8)) continue;
      if (Math.abs(bus.v) < 1.2 && bus.fuel < veh.tank - 0.2) {
        fuelT += dt; if (fuelT < 0.2) continue; fuelT = 0;
        const litres = Math.min(veh.type === "coach" ? 6 : 1.5, veh.tank - bus.fuel), cost = litres * FUEL_PRICE;
        if (!day.apprenti && cash() < cost && S.savings < cost) { toast("Pas assez d'argent pour le carburant", "bad"); continue; }
        bus.fuel += litres; day.fuel += cost;
        toast("Plein en cours : " + Math.round(bus.fuel) + " / " + veh.tank + " L" + (day.apprenti ? " (payé par le patron)" : ""));
      }
    }
  }
  function updateStops(dt) {
    refuel(dt);
    const city = world.kind === "city";
    if (city) for (const s of world.stops) { s.spawnT -= dt; if (s.spawnT <= 0) { s.spawnT = rand(7, 18) / (helpers() ? 1.3 : 1); if (s.waiting.length < 8) addWaiting(s); } }
    if (!city) updateCheckpoints(dt);
    let near = null, nd = 1e9;
    for (const s of world.stops) { const d = Math.hypot(bus.x - s.zx, bus.z - s.zz); if (d < nd) { nd = d; near = s; } }
    atStop = nd < (city ? 8 : 14) ? near : null;
    if (atStop !== lastStop) { lastStop = atStop; announced = false; hinted = false; fullShown = false; workT = 0; }
    if (!atStop) return;
    const s = atStop, last = world.stops.length - 1;
    const drop = onboard.some((p) => p.dest === s.i), pickup = s.waiting.length > 0 && onboard.length < veh.cap && (city || s.i < last);
    if (Math.abs(bus.v) < 1.2) {
      if (!announced && (drop || pickup)) { announced = true; if (city || s.kind === "village") SB.voice.say("appel", { stop: s.name }); toast("« " + s.name + " ! »", "call"); }
      workT += dt; if (workT < (city ? (helpers() ? 0.2 : 0.3) : 0.12)) return; workT = 0;
      const k = onboard.findIndex((p) => p.dest === s.i);
      if (k >= 0) {
        const p = onboard.splice(k, 1)[0]; day.fares += p.fare; day.served++; onboardDirty = true; addWalker(s); ding(); popCash("+" + fmt(p.fare) + " F");
        if (Math.random() < 0.2) SB.voice.say("merci");
        if (!city && s.i === last && !onboard.length) arrive();
        return;
      }
      if (!city && s.i === last && onboard.length) {
        // passengers who missed their village get off here without paying
        const n = onboard.length; onboard = []; onboardDirty = true; for (let q = 0; q < Math.min(n, 6); q++) addWalker(s);
        toast(n + (n > 1 ? " passagers ont raté leur village : pas payés" : " passager a raté son village : pas payé"), "bad");
        arrive(); return;
      }
      if (pickup) {
        const w = s.waiting.shift(); people.release(w.id);
        const hidden = w.slot >= 0 ? s.waiting.find((x) => x.slot < 0) : null;
        if (hidden) {
          const id = people.alloc();
          if (id >= 0) { const [a, o] = SLOTS[w.slot]; people.set(id, s.sx + s.dx * a - s.nx * (1.4 - o), s.sz + s.dz * a - s.nz * (1.4 - o), Math.atan2(-s.nx, -s.nz)); hidden.slot = w.slot; hidden.id = id; }
        }
        people.commit();
        if (city) { const dest = pickDest(s); onboard.push({ dest, fare: fareFor(s.i, dest) }); }
        else onboard.push({ dest: w.dest, fare: tripFare(day.trip, s.s, world.stops[w.dest].s) });
        onboardDirty = true; tick();
        if (Math.random() < 0.18) { const h = 6 + (city ? elapsed / DAY : (bus.z === 0 ? 0 : -bus.z / world.L)) * 14; SB.voice.say(h < 12 ? "bonjour_matin" : h < 16 ? "bonjour_jour" : "bonjour_soir"); }
      } else if (s.waiting.length && onboard.length >= veh.cap && !fullShown) { fullShown = true; toast(veh.label + " pleine : " + veh.cap + " places"); SB.voice.say("plein"); }
      if (!city && s.i === last && !onboard.length) arrive();
    } else if ((drop || pickup) && !hinted && Math.abs(bus.v) > 3) { hinted = true; toast("Arrête-toi dans le cercle"); }
  }
  function updateCheckpoints(dt) {
    const sb = world.progress(bus.x, bus.z);
    for (const cp of world.checkpoints) {
      if (cp.state !== "pending") continue;
      const d = Math.hypot(bus.x - cp.zx, bus.z - cp.zz);
      if (d < 16) {
        if (!cp.greeted) { cp.greeted = true; SB.voice.say(cp.kind === "police" ? "police_papiers" : "peage", null, true); }
        if (Math.abs(bus.v) < 1) { cp.wait += dt; if (cp.wait > 1.4) {
          cp.state = "ok";
          if (cp.kind === "peage") { day.toll += 2000; popCash("−2 000 F", true); toast("Péage payé : 2 000 F"); }
          else { SB.voice.say("police_ok", null, true); toast("Contrôle de police : papiers en règle"); }
        } }
      } else if (sb > cp.s + 25) {
        cp.state = "fined"; const fine = cp.kind === "police" ? 10000 : 5000; day.fines += fine; popCash("−" + fmt(fine) + " F", true);
        SB.voice.say("police_amende", null, true); toast(cp.kind === "police" ? "Tu n'as pas marqué l'arrêt au contrôle : −10 000 F" : "Passage en force au péage : −5 000 F", "bad");
      }
    }
  }
  function arrive() {
    if (mode !== "play") return;
    const name = SB.mali.CITIES[day.trip.to].name;
    SB.voice.say("arrivee_car", { dest: name }, true);
    setTimeout(() => endDay("Arrivée à " + name), 1200);
    mode = "arrive";
  }

  /* ---------- markers ---------- */
  let markers = null;
  function buildMarkers() {
    const ringGeo = new THREE.RingGeometry(5.2, 6.4, 48); ringGeo.rotateX(-Math.PI / 2);
    const beamGeo = new THREE.CylinderGeometry(0.8, 0.8, 50, 12, 1, true);
    const mk = (x, z, color, beam) => {
      const r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false })); r.position.set(x, 0.2, z); worldGroup.add(r);
      let b = null; if (beam) { b = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, depthWrite: false, fog: false, toneMapped: false })); b.position.set(x, 25, z); worldGroup.add(b); }
      return { ring: r, beam: b };
    };
    markers = { stops: world.stops.map((s) => mk(s.zx, s.zz, 0xffffff, true)), stations: world.stations.map((s) => mk(s.zx, s.zz, 0xe25a3c, false)), cps: (world.checkpoints || []).map((c) => mk(c.zx, c.zz, 0x5aa0ff, true)) };
  }
  function updateMarkers() {
    if (!markers) buildMarkers();
    const dests = new Set(onboard.map((p) => p.dest)), playing = !!day;
    world.stops.forEach((s, i) => {
      const isDest = dests.has(i), isPick = playing && s.waiting.length > 0 && (world.kind === "city" || i < world.stops.length - 1);
      const m = markers.stops[i];
      m.ring.visible = m.beam.visible = isDest || isPick;
      m.ring.material.color.setHex(isDest ? 0xf2b233 : 0xffffff); m.beam.material.color.setHex(isDest ? 0xf2b233 : 0xffffff); m.beam.material.opacity = isDest ? 0.35 : 0.07;
    });
    (world.checkpoints || []).forEach((c, i) => { const m = markers.cps[i]; m.ring.visible = m.beam.visible = playing && c.state === "pending"; });
  }

  /* ---------- sky ---------- */
  const KEYS = [[0, 0x6d86ad, 0xf0b07a, 0xffb27a, 1.4, 0.5], [0.14, 0x7c9fc6, 0xecd6b2, 0xfff0d8, 2.4, 0.8], [0.5, 0x86a9cf, 0xeadbbd, 0xfff6e8, 2.7, 0.9], [0.84, 0x7a8fb8, 0xeec08f, 0xffc890, 2.2, 0.75], [1, 0x47507a, 0xd98a64, 0xff8a50, 0.9, 0.4]];
  const cA = new THREE.Color(), cB = new THREE.Color(), zen = new THREE.Color(), hor = new THREE.Color(), tmp = new THREE.Color();
  function updateSky(t) {
    let i = 0; while (i < KEYS.length - 2 && t > KEYS[i + 1][0]) i++;
    const k0 = KEYS[i], k1 = KEYS[i + 1], f = Math.max(0, Math.min(1, (t - k0[0]) / (k1[0] - k0[0])));
    zen.copy(cA.setHex(k0[1]).convertSRGBToLinear()).lerp(cB.setHex(k1[1]).convertSRGBToLinear(), f);
    hor.copy(cA.setHex(k0[2]).convertSRGBToLinear()).lerp(cB.setHex(k1[2]).convertSRGBToLinear(), f);
    sun.color.copy(cA.setHex(k0[3]).convertSRGBToLinear()).lerp(cB.setHex(k1[3]).convertSRGBToLinear(), f);
    sun.intensity = k0[4] + (k1[4] - k0[4]) * f; hemi.intensity = k0[5] + (k1[5] - k0[5]) * f;
    hemi.color.copy(zen).lerp(hor, 0.5); scene.fog.color.copy(hor);
    const pos = sky.geometry.attributes.position, col = sky.geometry.attributes.color, R = sky.geometry.parameters.radius;
    for (let v = 0; v < pos.count; v++) { const m = Math.pow(Math.max(0, pos.getY(v) / R), 0.45); tmp.copy(hor).lerp(zen, m); col.setXYZ(v, tmp.r, tmp.g, tmp.b); }
    col.needsUpdate = true;
    const a = Math.PI * (0.06 + 0.88 * t), dir = new THREE.Vector3(Math.cos(a), Math.sin(a) * 0.9 + 0.08, 0.4).normalize();
    sun.position.set(bus.x + dir.x * 200, dir.y * 200, bus.z + dir.z * 200); sun.target.position.set(bus.x, 0, bus.z);
    sky.position.copy(camera.position);
    const sd = R * 0.9; sunSprite.position.set(camera.position.x + dir.x * sd, camera.position.y + dir.y * sd, camera.position.z + dir.z * sd);
    sunSprite.material.color.copy(sun.color);
  }
  const dayFraction = () => {
    if (!day) return 0.3;
    if (day.kind === "trip") { const h = 1 + (world.progress(bus.x, bus.z) / world.L) * (day.trip.km / 55); return Math.min(1, h / 14); }
    return Math.min(1, elapsed / DAY);
  };

  /* ---------- camera ---------- */
  let orbit = 0, camInit = false, viewShift = 0;
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  const CAMS = ["Caméra : poursuite", "Caméra : haute", "Caméra : large", "Caméra : chauffeur"];
  function updateCamera(dt) {
    const fx = Math.sin(bus.h), fz = Math.cos(bus.h), big = veh && veh.type === "coach" ? 1.6 : 1;
    let p, l, snap = false;
    if (mode === "garage" || mode === "loading" || mode === "mali") {
      // slow swing behind the vehicle, staying above the road
      orbit += dt * 0.25; const a = bus.h + Math.PI + 0.6 * Math.sin(orbit), R = 13 * big;
      p = [bus.x + Math.sin(a) * R, 5 * big, bus.z + Math.cos(a) * R]; l = [bus.x + fx * 2, 1.8 * big, bus.z + fz * 2];
    }
    else if (camMode === 1) { p = [bus.x - fx * 6, 60, bus.z - fz * 6]; l = [bus.x + fx * 8, 0, bus.z + fz * 8]; }
    else if (camMode === 2) { p = [bus.x - fx * 26 * big, 14 * big, bus.z - fz * 26 * big]; l = [bus.x + fx * 10, 1.5, bus.z + fz * 10]; }
    else if (camMode === 3) { const fwd = veh.type === "coach" ? 5.4 : 1.9, up = veh.type === "coach" ? 2.9 : 2.25, side = veh.type === "coach" ? 0.7 : 0.55; p = [bus.x + fx * fwd + fz * side, up, bus.z + fz * fwd - fx * side]; l = [bus.x + fx * 30 + fz * side, 1.6, bus.z + fz * 30 - fx * side]; snap = true; }
    else { p = [bus.x - fx * 12.5 * big, 6 * big, bus.z - fz * 12.5 * big]; l = [bus.x + fx * 7, 1.6, bus.z + fz * 7]; }
    if (!camInit) { camInit = true; snap = true; }
    const k = snap ? 1 : 1 - Math.exp(-dt * (mode === "garage" ? 2 : 4.5));
    camPos.x += (p[0] - camPos.x) * k; camPos.y += (p[1] - camPos.y) * k; camPos.z += (p[2] - camPos.z) * k;
    const kl = snap ? 1 : Math.min(1, k * 1.6);
    camLook.x += (l[0] - camLook.x) * kl; camLook.y += (l[1] - camLook.y) * kl; camLook.z += (l[2] - camLook.z) * kl;
    camera.position.copy(camPos); camera.lookAt(camLook);
    if (busMesh) busMesh.visible = camMode !== 3 || mode !== "play";
    const want = mode === "garage" && window.innerWidth > 760 ? Math.round(Math.min(260, window.innerWidth * 0.2)) : 0;
    if (want !== viewShift) { viewShift = want; if (want) camera.setViewOffset(window.innerWidth, window.innerHeight, -want, 0, window.innerWidth, window.innerHeight); else camera.clearViewOffset(); }
  }

  /* ---------- maps ---------- */
  const radar = $("radar"), rctx = radar.getContext("2d"), big = $("bigMap"), bctx = big.getContext("2d");
  function sizeMaps() { for (const c of [radar, big]) { const r = c.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2); c.width = Math.max(1, Math.round(r.width * dpr)); c.height = Math.max(1, Math.round(r.height * dpr)); } }
  function drawRoads(g, tx, ty, s, scaleW) {
    if (world.RIVER) { g.fillStyle = "#3e7f86"; g.fillRect(-1e4, ty(world.RIVER[0]), 2e4, (world.RIVER[1] - world.RIVER[0]) * s); }
    g.strokeStyle = "#d8c8a8"; g.lineCap = "round";
    for (const rd of world.roads) { const A = world.nodes[rd.a], B = world.nodes[rd.b]; g.lineWidth = Math.max(1.5, rd.w * s * scaleW); g.beginPath(); g.moveTo(tx(A.x), ty(A.z)); g.lineTo(tx(B.x), ty(B.z)); g.stroke(); }
    for (const n of world.nodes) if (n.r) { g.lineWidth = Math.max(1.5, world.RING * s * scaleW); g.beginPath(); g.arc(tx(n.x), ty(n.z), (n.r + world.RING / 2) * s, 0, 7); g.stroke(); }
  }
  const clampX = (v, max) => Math.max(6, Math.min(max - 6, v));
  function arrowAt(g, cx, cy, r, u) {
    const fx = Math.sin(bus.h), fz = Math.cos(bus.h);
    g.fillStyle = "#1f8a4c"; g.strokeStyle = "#f7ecd8"; g.lineWidth = 1.5 * u;
    g.beginPath(); g.moveTo(cx + fx * r, cy + fz * r); g.lineTo(cx - fx * r * 0.6 + fz * r * 0.6, cy - fz * r * 0.6 - fx * r * 0.6); g.lineTo(cx - fx * r * 0.6 - fz * r * 0.6, cy - fz * r * 0.6 + fx * r * 0.6); g.closePath(); g.fill(); g.stroke();
  }
  function drawRadar() {
    const W = radar.width, H = radar.height, R = world.kind === "route" ? 400 : 260, s = W / (2 * R), g = rctx;
    g.fillStyle = world.kind === "route" ? "#5b4a2c" : "#3a2618"; g.fillRect(0, 0, W, H);
    const tx = (x) => W / 2 + (x - bus.x) * s, ty = (z) => H / 2 + (z - bus.z) * s;
    drawRoads(g, tx, ty, s, 1);
    const dests = new Set(onboard.map((p) => p.dest)), u = W / 170;
    for (const st of world.stations) { g.fillStyle = "#e25a3c"; g.beginPath(); g.arc(clampX(tx(st.zx), W), clampX(ty(st.zz), H), 4 * u, 0, 7); g.fill(); }
    for (const c of world.checkpoints || []) if (c.state === "pending") { g.fillStyle = "#5aa0ff"; g.beginPath(); g.arc(clampX(tx(c.zx), W), clampX(ty(c.zz), H), 4 * u, 0, 7); g.fill(); }
    world.stops.forEach((st, i) => {
      const x = tx(st.zx), y = ty(st.zz), out = x < 0 || y < 0 || x > W || y > H;
      if (dests.has(i)) { g.fillStyle = "#f2b233"; g.beginPath(); g.arc(clampX(x, W), clampX(y, H), (out ? 4 : 6) * u, 0, 7); g.fill(); }
      else if (st.waiting.length && !out) { g.fillStyle = "#f7ecd8"; g.beginPath(); g.arc(x, y, (2.5 + Math.min(8, st.waiting.length) * 0.4) * u, 0, 7); g.fill(); }
    });
    arrowAt(g, W / 2, H / 2, 8 * u, u);
  }
  function drawBigMap() {
    const W = big.width, H = big.height, b = world.bounds, s = Math.min(W / (b.x1 - b.x0), H / (b.z1 - b.z0)) * 0.96;
    const ox = (W - (b.x1 - b.x0) * s) / 2, oy = (H - (b.z1 - b.z0) * s) / 2, tx = (x) => ox + (x - b.x0) * s, ty = (z) => oy + (z - b.z0) * s, g = bctx, u = Math.min(W, H) / 600;
    g.fillStyle = world.kind === "route" ? "#5b4a2c" : "#3a2618"; g.fillRect(0, 0, W, H);
    drawRoads(g, tx, ty, s, 1.2);
    const dests = new Set(onboard.map((p) => p.dest));
    g.textAlign = "left"; g.textBaseline = "middle";
    world.stops.forEach((st, i) => {
      const x = tx(st.zx), y = ty(st.zz), d = dests.has(i);
      g.fillStyle = d ? "#f2b233" : st.waiting.length ? "#f7ecd8" : "rgba(247,236,216,0.45)";
      g.beginPath(); g.arc(x, y, (d ? 5 : 3.5) * u, 0, 7); g.fill();
      g.font = `600 ${Math.round(12 * u)}px "Barlow Condensed", sans-serif`; g.fillText(st.name + (st.waiting.length ? " · " + st.waiting.length : ""), x + 8 * u, y);
    });
    for (const st of world.stations) { g.fillStyle = "#e25a3c"; g.beginPath(); g.arc(tx(st.zx), ty(st.zz), 4.5 * u, 0, 7); g.fill(); g.fillText("Station", tx(st.zx) + 8 * u, ty(st.zz)); }
    for (const c of world.checkpoints || []) { g.fillStyle = "#5aa0ff"; g.beginPath(); g.arc(tx(c.zx), ty(c.zz), 4.5 * u, 0, 7); g.fill(); g.fillText(c.kind === "police" ? "Contrôle de police" : "Péage", tx(c.zx) + 8 * u, ty(c.zz)); }
    if (world.kind === "city") { g.fillStyle = "rgba(247,236,216,0.6)"; g.font = `700 ${Math.round(13 * u)}px "Barlow Condensed", sans-serif`; g.textAlign = "center"; g.fillText("FLEUVE NIGER", tx(-650), ty(0)); g.fillText("RIVE GAUCHE", tx(-650), ty(-300)); g.fillText("RIVE DROITE", tx(-650), ty(260)); }
    arrowAt(g, tx(bus.x), ty(bus.z), 10 * u, u);
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
    if (!onboard.length) { box.innerHTML = `<h2>À bord</h2><p>${veh.label} vide. Va chercher des passagers aux cercles blancs.</p>`; return; }
    const counts = {}; for (const p of onboard) counts[p.dest] = (counts[p.dest] || 0) + 1;
    box.innerHTML = `<h2>À bord · ${onboard.length}</h2><ul>${Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([d, n]) => `<li><span>${esc(world.stops[d].name.replace("Gare routière de ", ""))}</span><b>${n}</b></li>`).join("")}</ul>`;
  }
  function guideTarget() {
    if (bus.fuel < veh.tank * 0.12 && world.stations.length) {
      let bd = 1e9, t = null; for (const st of world.stations) { const d = Math.hypot(st.zx - bus.x, st.zz - bus.z); if (d < bd) { bd = d; t = { zx: st.zx, zz: st.zz, name: "Station" }; } }
      return [t, "Carburant :"];
    }
    if (world.kind === "route") {
      const sb = world.progress(bus.x, bus.z);
      const cp = world.checkpoints.find((c) => c.state === "pending" && c.s > sb - 20);
      const st = world.stops.find((s, i) => s.s > sb - 10 && (onboard.some((p) => p.dest === i) || (s.waiting.length && i < world.stops.length - 1)));
      if (cp && (!st || cp.s < st.s)) return [{ zx: cp.zx, zz: cp.zz, name: cp.kind === "police" ? "Contrôle de police" : "Péage" }, "Arrêt obligatoire :"];
      if (st) return [st, st.kind === "arrivee" ? "Arrivée :" : st.kind === "gare" ? "Embarquement :" : "Prochain arrêt :"];
      return [null, ""];
    }
    if (onboard.length) {
      const counts = {}; for (const p of onboard) counts[p.dest] = (counts[p.dest] || 0) + 1;
      let bn = -1e9, n0 = 0, t = null;
      for (const [d, n] of Object.entries(counts)) { const s = world.stops[d], score = n * 300 - Math.hypot(s.zx - bus.x, s.zz - bus.z); if (score > bn) { bn = score; n0 = n; t = s; } }
      return [t, n0 > 1 ? n0 + " passagers pour" : "1 passager pour"];
    }
    let best = -1e9, t = null;
    for (const s of world.stops) { if (!s.waiting.length) continue; const score = s.waiting.length * 150 - Math.hypot(s.zx - bus.x, s.zz - bus.z); if (score > best) { best = score; t = s; } }
    return [t, t ? t.waiting.length + " attendent à" : ""];
  }
  function updateHUD(dt) {
    if (!day) return;
    $("money").firstChild.nodeValue = fmt(cash());
    let mins;
    if (day.kind === "trip") mins = 7 * 60 + (world.progress(bus.x, bus.z) / world.L) * (day.trip.km / 55) * 60;
    else mins = 360 + Math.min(1, elapsed / DAY) * 840;
    setText("clock", String(Math.floor(mins / 60) % 24).padStart(2, "0") + ":" + String(Math.floor(mins % 60)).padStart(2, "0"));
    setText("seats", String(onboard.length)); setText("dayLabel", "Jour " + S.day);
    $("speed").firstChild.nodeValue = String(Math.round(Math.abs(bus.v) * 3.6));
    const f = bus.fuel / veh.tank;
    $("fuelBar").style.width = (f * 100).toFixed(1) + "%"; $("fuel").classList.toggle("low", f < 0.12); setText("fuelText", Math.round(bus.fuel) + " L");
    if (onboardDirty) { onboardDirty = false; renderOnboard(); }
    const [target, label] = guideTarget();
    $("guide").hidden = !target;
    if (target) {
      setText("guideLabel", label); setText("guideName", target.name.replace("Gare routière de ", "Gare de "));
      const dx = target.zx - bus.x, dz = target.zz - bus.z, dist = Math.hypot(dx, dz);
      setText("guideDist", dist < 10 ? "Tu y es" : dist >= 1000 ? (dist / 1000).toFixed(1).replace(".", ",") + " km" : Math.round(dist / 10) * 10 + " m");
      const fx = Math.sin(bus.h), fz = Math.cos(bus.h);
      $("arrow").style.transform = "rotate(" + Math.atan2(dx * -fz + dz * fx, dx * fx + dz * fz).toFixed(3) + "rad)";
      $("arrow").classList.toggle("pick", label.indexOf("attendent") >= 0);
    }
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) $("toast").classList.remove("show"); }
    drawRadar();
  }
  let toastT = 0;
  function toast(text, kind) { const t = $("toast"); t.textContent = text; t.className = "hud panel show" + (kind ? " " + kind : ""); toastT = kind === "call" ? 2.6 : 2.6; }
  function popCash(text, bad) { const el = document.createElement("div"); el.className = "pop" + (bad ? " bad" : ""); el.textContent = text; document.body.appendChild(el); setTimeout(() => el.remove(), 1200); }

  /* ---------- hub: career, fleet, team, garage ---------- */
  async function showGarage() {
    mode = "garage"; day = null; onboard = []; onboardDirty = true;
    if (S.city === "bamako") await loadCity();
    else if (!world.trip || world.trip.from !== S.city) await loadRoute(SB.mali.routesFrom(S.city)[0]);
    if (world.kind === "city") setupVehicle("sotrama"); else setupVehicle("coach", world.trip);
    resetBus(); show("garage", true); renderGarage();
  }
  function hideAll() { for (const id of ["garage", "maliBox", "endBox", "pauseBox", "panneBox", "mapBox"]) show(id, false); }
  function renderGarage() {
    const city = SB.mali.CITIES[S.city].name;
    $("gDay").textContent = "Jour " + S.day + " · " + rank();
    $("gWhere").textContent = "Tu es à " + city + ".";
    $("gSavings").textContent = fmt(S.savings) + " F";
    $("gBest").textContent = S.best ? "Meilleure journée : " + fmt(S.best) + " F · " + fmt(S.totalPassengers) + " passagers transportés" : "";
    $("btnStart").hidden = S.city !== "bamako";
    $("btnStart").textContent = (S.fleet.some((v) => v.type === "sotrama") ? "Journée en Sotrama" : S.permis ? "Journée en Sotrama (location)" : "Journée d'apprenti") + " · jour " + S.day;
    $("btnMali").textContent = S.city === "bamako" ? "Carte du Mali : voyages en car" : "Carte du Mali : prochain voyage";
    // next objective
    const obj = OBJECTIVES.find((o) => !o.done());
    $("goal").innerHTML = obj ? `<div class="goal-t">Objectif : ${esc(obj.title)}</div><p>${esc(obj.text)}</p>
      <div class="bar"><i style="width:${Math.min(100, (S.savings / obj.price) * 100).toFixed(1)}%"></i></div>
      <button type="button" class="small" data-goal="${obj.id}" ${S.savings < obj.price ? "disabled" : ""}>${fmt(obj.price)} F</button>` : `<div class="goal-t">Tu es au sommet : grand transporteur !</div>`;
    // fleet
    const opts = (v) => {
      const drivers = S.staff.filter((p) => p.role === "chauffeur");
      const taken = new Set(S.fleet.filter((x) => x !== v && typeof x.driver === "number").map((x) => x.driver));
      return `<option value="">Personne (au garage)</option><option value="me" ${v.driver === "me" ? "selected" : ""}>Toi</option>` + drivers.filter((d) => !taken.has(d.id) || v.driver === d.id).map((d) => `<option value="${d.id}" ${v.driver === d.id ? "selected" : ""}>${esc(d.name)}${d.trained ? " (formé)" : ""}</option>`).join("");
    };
    $("fleet").innerHTML = (S.fleet.length ? S.fleet.map((v) => `<div class="up"><div><b>${esc(v.name)}</b><span>${v.type === "car" ? "Car de 60 places" : "Sotrama de 22 places"}</span></div><label class="sel">Conduite par <select data-veh="${v.id}">${opts(v)}</select></label></div>`).join("")
      : `<p class="muted">Aucun véhicule. ${S.permis ? "Tu loues la Sotrama du patron." : "Tu conduis la Sotrama du patron comme apprenti."}</p>`)
      + `<div class="row-btns">${S.permis ? `<button type="button" class="small ghost" data-buy="sotrama" ${S.savings < PRICE.sotrama ? "disabled" : ""}>Acheter une Sotrama · ${fmt(PRICE.sotrama)} F</button>` : ""}${S.permisCar ? `<button type="button" class="small ghost" data-buy="car" ${S.savings < PRICE.car ? "disabled" : ""}>Acheter un car · ${fmt(PRICE.car)} F</button>` : ""}</div>`;
    // team
    $("team").innerHTML = (S.staff.length ? S.staff.map((p) => `<div class="up"><div><b>${esc(p.name)}</b><span>${p.role === "chauffeur" ? "Chauffeur" + (p.trained ? " formé par toi" : "") : p.ready ? "Apprenti prêt à devenir chauffeur" : "Apprenti · " + p.days + "/12 jours de formation"}</span></div>${p.ready ? `<button type="button" class="small" data-promote="${p.id}">Le nommer chauffeur</button>` : ""}</div>`).join("") : `<p class="muted">Personne pour l'instant. Un apprenti fait monter les passagers plus vite et devient chauffeur après 12 jours.</p>`)
      + `<div class="row-btns"><button type="button" class="small ghost" data-hire="apprenti" ${S.savings < PRICE.apprenti ? "disabled" : ""}>Prendre un apprenti · ${fmt(PRICE.apprenti)} F</button>${S.fleet.length ? `<button type="button" class="small ghost" data-hire="chauffeur" ${S.savings < PRICE.hire ? "disabled" : ""}>Embaucher un chauffeur · ${fmt(PRICE.hire)} F</button>` : ""}</div>`;
    // liveries and upgrades (own Sotrama only)
    const ownSot = S.fleet.some((v) => v.type === "sotrama");
    $("ownBlock").hidden = !ownSot;
    const L = SB.tex.LIVERIES;
    $("liveries").innerHTML = Object.entries(L).map(([id, l]) => {
      const owned = S.owned.includes(id), on = S.livery === id;
      return `<button class="liv${on ? " on" : ""}" data-liv="${id}" type="button" ${!owned && S.savings < l.price ? "data-locked" : ""}><span class="sw" style="--b:${l.body};--s:${l.stripe};--r:${l.roof}"></span><span class="ln">${l.name}</span><span class="lp">${on ? "Équipée" : owned ? "Choisir" : fmt(l.price) + " F"}</span></button>`;
    }).join("");
    const up = (key, list, name, unit) => { const lvl = S[key], next = list[lvl + 1]; return `<div class="up"><div><b>${name}</b><span>${list[lvl].v} ${unit}${next ? " → " + next.v + " " + unit : " · max"}</span></div>${next ? `<button type="button" class="small" data-up="${key}" ${S.savings < next.price ? "disabled" : ""}>${fmt(next.price)} F</button>` : ""}</div>`; };
    $("upgrades").innerHTML = up("engine", ENGINE.map((e) => ({ v: Math.round(e.v * 3.6), price: e.price })), "Moteur", "km/h") + up("tank", TANK, "Réservoir", "L");
    $("qualityBtn").textContent = "Graphismes : " + (S.quality === "haute" ? "haute qualité" : "économie");
    $("soundBtn").textContent = "Son : " + (S.sound ? "oui" : "non");
    $("voiceBtn").textContent = "Voix : " + (S.voice ? "oui" : "non");
    const shop = SB.purchases.available && !S.noAds;
    $("btnNoAds").hidden = !shop; $("btnRestore").hidden = !SB.purchases.available;
    if (shop) $("btnNoAds").textContent = "Retirer les pubs" + (SB.purchases.price() ? " · " + SB.purchases.price() : "");
  }
  function onGarageClick(e) {
    const t = (sel) => e.target.closest(sel);
    let el;
    if ((el = t("[data-goal]"))) { const o = OBJECTIVES.find((x) => x.id === el.dataset.goal); if (o && S.savings >= o.price) { S.savings -= o.price; o.buy(); save(); gToast("Bravo ! Tu es maintenant : " + rank()); renderGarage(); if (world.kind === "city") showGarage(); } }
    else if ((el = t("[data-buy]"))) { const type = el.dataset.buy, p = PRICE[type]; if (S.savings >= p) { S.savings -= p; addVehicle(type); save(); renderGarage(); } }
    else if ((el = t("[data-hire]"))) {
      const role = el.dataset.hire, p = role === "apprenti" ? PRICE.apprenti : PRICE.hire;
      if (S.savings >= p) { S.savings -= p; const name = staffName(); S.staff.push({ id: S.nextId++, name, role, days: 0, trained: false, ready: false }); save(); gToast(name + (role === "apprenti" ? " devient ton apprenti" : " rejoint ton équipe")); renderGarage(); }
    }
    else if ((el = t("[data-promote]"))) { const p = S.staff.find((x) => x.id === +el.dataset.promote); if (p) { p.role = "chauffeur"; p.trained = true; p.ready = false; save(); gToast(p.name + " est maintenant chauffeur"); renderGarage(); } }
    else if ((el = t("[data-liv]"))) {
      const id = el.dataset.liv, l = SB.tex.LIVERIES[id];
      if (!S.owned.includes(id)) { if (S.savings < l.price) { gToast("Il te manque " + fmt(l.price - S.savings) + " F"); return; } S.savings -= l.price; S.owned.push(id); }
      S.livery = id; save(); if (world.kind === "city") setupVehicle("sotrama"); renderGarage();
    }
    else if ((el = t("[data-up]"))) { const key = el.dataset.up, list = key === "engine" ? ENGINE : TANK, next = list[S[key] + 1]; if (next && S.savings >= next.price) { S.savings -= next.price; S[key]++; save(); renderGarage(); } }
  }
  function onGarageChange(e) {
    const sel = e.target.closest("[data-veh]"); if (!sel) return;
    const v = S.fleet.find((x) => x.id === +sel.dataset.veh); if (!v) return;
    const val = sel.value;
    if (val === "me") for (const o of S.fleet) if (o.type === v.type && o.driver === "me") o.driver = null;
    v.driver = val === "" ? null : val === "me" ? "me" : +val;
    save(); renderGarage();
    if (world.kind === "city" && v.type === "sotrama") setupVehicle("sotrama");
  }
  function gToast(t) { const el = $("gMsg"); el.textContent = t; clearTimeout(gToast.t); gToast.t = setTimeout(() => (el.textContent = ""), 3000); }

  /* ---------- the map of Mali ---------- */
  function openMali() { show("garage", false); show("maliBox", true); mode = "mali"; maliPick = null; renderMali(); }
  function closeMali() { show("maliBox", false); showGarage(); }
  function renderMali() {
    const M = SB.mali, here = S.city, routes = M.routesFrom(here);
    M.renderMap($("maliSvg"), here, (id) => { maliPick = id; renderMali(); }, maliPick);
    const ownCar = S.fleet.some((v) => v.type === "car");
    let html = `<p class="kicker">Tu es à ${esc(M.CITIES[here].name)}</p><h2 class="mt">Où veux-tu aller ?</h2>`;
    if (here === "bamako") html += `<button type="button" class="dest${maliPick === "city" ? " on" : ""}" data-dest="city"><b>Rester à Bamako</b><span>Journée en Sotrama dans les quartiers</span></button>`;
    for (const r of routes) {
      const c = M.CITIES[r.to], cost = ownCar ? "Entretien ≈ " + fmt(carMaint(r.km)) + " F" : "Location du car " + fmt(carRent(r.km)) + " F";
      html += `<button type="button" class="dest${maliPick === r.to ? " on" : ""}" data-dest="${r.to}"><b>${esc(c.name)} · ≈ ${r.km} km</b><span>Billet ${fmt(r.fare)} F · ${cost}${r.towns.length ? " · par " + r.towns.map((t) => esc(t[0])).join(", ") : ""}</span></button>`;
    }
    const pickR = routes.find((r) => r.to === maliPick);
    if (maliPick === "city") html += `<button type="button" class="cta wide" data-go="city">Démarrer la journée</button>`;
    else if (pickR) html += S.permisCar ? `<button type="button" class="cta wide" data-go="${pickR.to}">Partir pour ${esc(M.CITIES[pickR.to].name)}</button>` : `<p class="warn">Il te faut le permis car (${fmt(PRICE.permisCar)} F) pour conduire un car. Regarde l'objectif dans le menu.</p>`;
    html += `<p class="muted">Les villes en gris arrivent bientôt.</p><button type="button" class="small ghost" data-go="back">Retour</button>`;
    $("maliSide").innerHTML = html;
  }
  function onMaliClick(e) {
    const d = e.target.closest("[data-dest]"), g = e.target.closest("[data-go]");
    if (d) { maliPick = d.dataset.dest; renderMali(); }
    if (g) {
      const v = g.dataset.go;
      if (v === "back") closeMali();
      else if (v === "city") startCityDay();
      else { const r = SB.mali.routesFrom(S.city).find((x) => x.to === v); if (r) startTrip(r); }
    }
  }

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
    for (const f of freqs) { const o = actx.createOscillator(), g = actx.createGain(); o.type = type; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.setValueAtTime(vol, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05); }
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
    tone(veh && veh.type === "coach" ? [311, 370] : [392, 494], "square", 0.45, 0.07);
    const fx = Math.sin(bus.h), fz = Math.cos(bus.h);
    for (const ag of agents) { const rx = ag.x - bus.x, rz = ag.z - bus.z, al = rx * fx + rz * fz; if (al > 0 && al < 30 && Math.abs(rx * fz - rz * fx) < 5) ag.dodge = 2.5; }
  }

  /* ---------- input ---------- */
  const keys = { up: false, down: false, left: false, right: false, brake: false };
  function setupInput() {
    const KEYMAP = { ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right", Space: "brake" };
    window.addEventListener("keydown", (e) => {
      const k = KEYMAP[e.code];
      if (k && mode === "play") { keys[k] = true; e.preventDefault(); }
      if (e.repeat) return;
      if (e.code === "KeyH" && mode === "play") honk();
      if (e.code === "KeyC") cycleCam();
      if (e.code === "KeyM") toggleMap();
      if (e.code === "KeyP" || e.code === "Escape") { if (mode === "map") toggleMap(false); else togglePause(); }
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
    $("btnStart").addEventListener("click", startCityDay);
    $("btnMali").addEventListener("click", openMali);
    $("maliSide").addEventListener("click", onMaliClick);
    $("btnDouble").addEventListener("click", bonusAd);
    $("btnNext").addEventListener("click", nextDay);
    $("btnTowPay").addEventListener("click", () => tow(false));
    $("btnTowAd").addEventListener("click", () => tow(true));
    $("garage").addEventListener("click", onGarageClick);
    $("garage").addEventListener("change", onGarageChange);
    $("qualityBtn").addEventListener("click", () => { S.quality = S.quality === "haute" ? "eco" : "haute"; save(); window.location.reload(); });
    $("soundBtn").addEventListener("click", () => { S.sound = !S.sound; save(); if (master) master.gain.value = S.sound ? 0.5 : 0; renderGarage(); });
    $("voiceBtn").addEventListener("click", () => { S.voice = !S.voice; save(); SB.voice.setEnabled(S.voice); renderGarage(); });
    $("btnNoAds").addEventListener("click", () => SB.purchases.buy());
    $("btnRestore").addEventListener("click", () => SB.purchases.restore());
    window.addEventListener("resize", () => { renderer.setSize(window.innerWidth, window.innerHeight); camera.aspect = window.innerWidth / window.innerHeight; viewShift = -1; camera.clearViewOffset(); camera.updateProjectionMatrix(); sizeMaps(); if (mode === "map") drawBigMap(); });
    sizeMaps();
  }
  function cycleCam() { camMode = (camMode + 1) % CAMS.length; if (mode === "play") toast(CAMS[camMode]); }
  function togglePause() { if (mode === "play") { mode = "pause"; show("pauseBox", true); } else if (mode === "pause") { initAudio(); mode = "play"; show("pauseBox", false); } }
  function show(id, yes) { $(id).hidden = !yes; document.body.classList.toggle("in-" + id, !!yes); }
  function blurActive() { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }

  /* ---------- loop ---------- */
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const frozen = mode === "pause" || mode === "map" || mode === "panne";
    if (!frozen) time += dt;
    if (mode === "play") { updateBus(dt); updateStops(dt); elapsed += dt; if (day.kind === "city" && elapsed >= DAY) endDay(); }
    else if (engGain) engGain.gain.value = 0;
    if (!frozen) { updateTraffic(dt); updatePeople(dt); }
    if (!frozen && world.water) {
      world.texWater.offset.x = (time * 0.004) % 1; world.texWater.offset.y = (time * 0.01) % 1;
      const pa = world.waterGeo.attributes.position, arr = pa.array, base = world.waterBase;
      for (let i = 0; i < arr.length; i += 3) arr[i + 1] = base[i + 1] + Math.sin(base[i] * 0.05 + time * 1.1) * 0.1 + Math.cos(base[i + 2] * 0.25 + time * 1.5) * 0.06;
      pa.needsUpdate = true;
    }
    if (!frozen && dust) {
      const p = dust.geometry.attributes.position.array, b0 = dust.userData.base;
      for (let i = 0; i < p.length; i += 3) {
        p[i] = camera.position.x + ((((b0[i] + time * 2.2 - camera.position.x) % 180) + 270) % 180) - 90;
        p[i + 1] = b0[i + 1] + Math.sin(time * 0.5 + i) * 0.4;
        p[i + 2] = camera.position.z + ((((b0[i + 2] + time * 0.8 - camera.position.z) % 180) + 270) % 180) - 90;
      }
      dust.geometry.attributes.position.needsUpdate = true;
    }
    if (busMesh) {
      busMesh.position.set(bus.x, 0.08, bus.z); busMesh.rotation.y = bus.h;
      busMesh.rotation.z = -bus.steer * Math.min(1, Math.abs(bus.v) / 17) * 0.04;
      for (const w of busMesh.userData.wheels) w.rotation.x += (bus.v * dt) / (busMesh.userData.wheelR || 0.45);
    }
    updateCamera(dt);
    updateSky(dayFraction());
    updateMarkers();
    updateHUD(dt);
    renderer.render(scene, camera);
    SB.stats = renderer.info.render;
    requestAnimationFrame(frame);
  }

  window.addEventListener("load", () => { boot().catch((e) => { console.error(e); $("loading").hidden = false; $("loading").textContent = "Erreur au démarrage : " + e.message; }); });
})();
