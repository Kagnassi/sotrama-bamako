/* Sotrama Bamako - voices: what the apprenti, the passengers and the police say.
 * Each line is played, in this order, from: your own recording (voice studio, saved on this device),
 * a file in www/voix/ (shipped with the app), or the text-to-speech of the phone. The text is always shown. */
(function () {
  "use strict";
  const SB = (window.SB = window.SB || {});

  const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

  const CITY_STOPS = ["Grand Marché", "Bamako-Coura", "Bagadadji", "Niaréla", "Bozola", "Médina Coura", "Dar Salam", "Missira", "Hippodrome",
    "Korofina", "Djélibougou", "Quinzambougou", "Hamdallaye", "ACI 2000", "Lafiabougou", "Djicoroni", "Badalabougou", "Torokorobougou",
    "Daoudabougou", "Sogoniko", "Faladié", "Magnambougou", "Kalaban Coura", "Sénou",
    "Point G", "Sébénikoro", "Banconi", "Boulkassoumbougou", "Sotuba", "Baco Djicoroni", "Kalaban Coro", "Yirimadio",
    "Niamakoro", "Missabougou", "Ouolofobougou", "N'Tomikorobougou", "Bolibana"];

  // id, who, text ({stop} and {dest} are replaced)
  const LINES = [
    ["bonjour_matin", "Passager", "I ni sogoma !"],
    ["bonjour_jour", "Passager", "I ni tile !"],
    ["bonjour_soir", "Passager", "I ni wula !"],
    ["merci", "Passagère", "I ni ce, chauffeur !"],
    ["descendre", "Passager", "Apprenti, je descends ici !"],
    ["plein", "Apprenti", "C'est plein ! Prenez la prochaine Sotrama !"],
    ["doucement", "Passagère", "Eh chauffeur, doucement !"],
    ["vite", "Passager", "Chauffeur, on est pressés hein !"],
    ["essence", "Apprenti", "Patron, le réservoir est presque vide !"],
    ["police_papiers", "Policier", "Bonjour chauffeur. Les papiers du véhicule, s'il vous plaît."],
    ["police_ok", "Policier", "C'est en règle. Bonne route !"],
    ["police_amende", "Policier", "Vous n'avez pas marqué l'arrêt. Amende !"],
    ["peage", "Péage", "Péage. Deux mille francs, s'il vous plaît."],
    ["depart_car", "Apprenti", "Passagers pour {dest}, on embarque !"],
    ["arrivee_car", "Chauffeur", "Nous sommes arrivés à {dest}. Merci d'avoir voyagé avec Kagnassi Transport !"],
    ["police_feu", "Policier", "Feu rouge, chauffeur ! Garez-vous. Amende !"],
    ["police_stop", "Policier", "Police ! Chauffeur, rangez-vous sur le côté !"],
    ["police_refus", "Policier", "Vous avez refusé de vous arrêter ! L'amende est doublée !"],
    ["faim", "Apprenti", "Patron, on n'a pas encore mangé ! On s'arrête au maquis ?"],
    ["vendeuse", "Vendeuse", "Jii suma ! Eau fraîche, beignets, mangues !"],
    ["bon_appetit", "Vendeuse", "I ni ce ! Bon appétit, chauffeur !"],
  ];
  const WHO = Object.fromEntries(LINES.map(([id, who, text]) => [id, { who, text }]));

  // every line of the game, for the voice studio: generic lines + one call per destination
  function catalog(extraNames) {
    const names = new Set(CITY_STOPS);
    if (SB.mali) {
      for (const c of Object.values(SB.mali.CITIES)) names.add(c.name);
      for (const r of SB.mali.ROUTES) for (const [n] of r.towns) names.add(n);
    }
    for (const n of extraNames || []) names.add(n);
    const out = LINES.map(([id, who, text]) => ({ id, who, text, group: id.startsWith("police") || id === "peage" ? "Police et péage" : id.endsWith("_car") ? "Voyages en car" : "Passagers et apprenti" }));
    for (const n of names) out.push({ id: "appel_" + slug(n), who: "Apprenti", text: n + " ! " + n + " !", group: "Appels de l'apprenti" });
    return out;
  }

  /* ---------- own recordings (IndexedDB) ---------- */
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((resolve) => {
      try {
        const rq = indexedDB.open("sotrama-voix", 1);
        rq.onupgradeneeded = () => rq.result.createObjectStore("lines");
        rq.onsuccess = () => resolve(rq.result);
        rq.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
    return dbp;
  }
  async function op(mode, fn) {
    const d = await db(); if (!d) return null;
    return new Promise((resolve) => {
      try { const tx = d.transaction("lines", mode), rq = fn(tx.objectStore("lines")); rq.onsuccess = () => resolve(rq.result); rq.onerror = () => resolve(null); } catch (e) { resolve(null); }
    });
  }
  const store = {
    get: (id) => op("readonly", (s) => s.get(id)),
    put: (id, blob) => op("readwrite", (s) => s.put(blob, id)),
    del: (id) => op("readwrite", (s) => s.delete(id)),
    keys: () => op("readonly", (s) => s.getAllKeys()),
  };

  /* ---------- files shipped in www/voix/ (listed in voix/liste.json) ---------- */
  let shipped = null;
  async function bundled(id) {
    if (!shipped) {
      shipped = new Map();
      try {
        const r = await fetch("voix/liste.json", { cache: "no-cache" });
        if (r.ok) for (const f of await r.json()) { const m = /^(.+)\.(mp3|m4a|webm|ogg|wav)$/.exec(f); if (m) shipped.set(m[1], "voix/" + f); }
      } catch (e) { /* no shipped voices */ }
    }
    return shipped.get(id) || null;
  }

  /* ---------- text-to-speech ---------- */
  function tts(text) {
    const cap = window.Capacitor, plug = cap && cap.Plugins && cap.Plugins.TextToSpeech;
    if (plug && cap.getPlatform && cap.getPlatform() !== "web") { plug.speak({ text, lang: "fr-FR", rate: 1.05, pitch: 1.0, volume: 1.0 }).catch(() => {}); return 2200; }
    if (window.speechSynthesis && window.SpeechSynthesisUtterance) {
      try { const u = new SpeechSynthesisUtterance(text); u.lang = "fr-FR"; u.rate = 1.05; window.speechSynthesis.cancel(); window.speechSynthesis.speak(u); return 2200; } catch (e) { /* no voice */ }
    }
    return 0;
  }

  /* ---------- speaking in the game ---------- */
  let enabled = true, busyUntil = 0, current = null;
  const bubble = () => document.getElementById("speech");
  function show(who, text) {
    const b = bubble(); if (!b) return;
    b.querySelector("b").textContent = who; b.querySelector("span").textContent = text;
    b.classList.add("show"); clearTimeout(show.t); show.t = setTimeout(() => b.classList.remove("show"), 2800);
  }
  async function say(id, vars, priority) {
    const now = performance.now();
    if (!priority && now < busyUntil) return;
    busyUntil = now + 2600;
    const base = WHO[id] || { who: "Apprenti", text: "" };
    const text = base.text.replace(/\{stop\}/g, (vars && vars.stop) || "").replace(/\{dest\}/g, (vars && vars.dest) || "");
    show(base.who, id === "appel" ? vars.stop + " ! " + vars.stop + " !" : text);
    if (!enabled) return;
    const key = id === "appel" ? "appel_" + slug(vars.stop) : id;
    try {
      if (current) { current.pause(); current = null; }
      const blob = await store.get(key);
      if (blob) { current = new Audio(URL.createObjectURL(blob)); await current.play(); return; }
      const file = await bundled(key);
      if (file) { current = new Audio(file); await current.play(); return; }
    } catch (e) { /* fall back to speech */ }
    tts(id === "appel" ? vars.stop + " ! " + vars.stop + " !" : text);
  }

  SB.voice = { say, catalog, store, slug, setEnabled: (v) => { enabled = !!v; }, LINES };
})();
