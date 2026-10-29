/* Sotrama Bamako - voices: what the apprenti, the passengers and the police say, in French or in Bambara.
 * Each line is played, in this order, from: your own recording (voice studio, saved on this device),
 * a file in www/voix/ (shipped with the app), or the text-to-speech of the phone. The text is always shown.
 * The Bambara texts below can be corrected freely: they are only used for the bubbles and the voice studio. */
(function () {
  "use strict";
  const SB = (window.SB = window.SB || {});

  const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

  const CITY_STOPS = ["Grand Marché", "Bamako-Coura", "Bagadadji", "Niaréla", "Bozola", "Médina Coura", "Dar Salam", "Missira", "Hippodrome",
    "Korofina", "Djélibougou", "Quinzambougou", "Hamdallaye", "ACI 2000", "Lafiabougou", "Djicoroni", "Badalabougou", "Torokorobougou",
    "Daoudabougou", "Sogoniko", "Faladié", "Magnambougou", "Kalaban Coura", "Sénou",
    "Point G", "Sébénikoro", "Banconi", "Boulkassoumbougou", "Sotuba", "Baco Djicoroni", "Kalaban Coro", "Yirimadio",
    "Niamakoro", "Missabougou", "Ouolofobougou", "N'Tomikorobougou", "Bolibana"];

  // id, who, French, Bambara ({dest} is replaced)
  const LINES = [
    ["bonjour_matin", "Passager", "Bonjour !", "I ni sɔgɔma !"],
    ["bonjour_jour", "Passager", "Bonjour !", "I ni tile !"],
    ["bonjour_soir", "Passager", "Bonsoir !", "I ni wula !"],
    ["merci", "Passagère", "Merci, chauffeur !", "I ni ce, sofɛri !"],
    ["descendre", "Passager", "Apprenti, je descends ici !", "Apranti, n bɛ jigin yan !"],
    ["plein", "Apprenti", "C'est plein ! Prenez le prochain Sotrama !", "A fara ! A fara !"],
    ["doucement", "Passagère", "Eh chauffeur, doucement !", "Sofɛri, dɔɔnin dɔɔnin !"],
    ["vite", "Passager", "Chauffeur, on est pressés hein !", "Sofɛri, an ka teliya !"],
    ["essence", "Apprenti", "Patron, le réservoir est presque vide !", "Patron, esansi bannen don !"],
    ["police_papiers", "Policier", "Bonjour chauffeur. Les papiers du véhicule, s'il vous plaît.", "I ni ce, sofɛri. Mobili papiyew di n ma."],
    ["police_ok", "Policier", "C'est en règle. Bonne route !", "A ka ɲi. Ala ka sira diya !"],
    ["police_amende", "Policier", "Vous n'avez pas marqué l'arrêt. Amende !", "I ma jɔ ! Amandi bɛ i kan !"],
    ["peage", "Péage", "Péage. Deux mille francs, s'il vous plaît.", "Peyaji. Waga fila."],
    ["depart_car", "Apprenti", "Passagers pour {dest}, on embarque !", "{dest} taamaw, aw ye don !"],
    ["arrivee_car", "Chauffeur", "Nous sommes arrivés à {dest}. Merci d'avoir voyagé avec Kagnassi Transport !", "An sera {dest}. Aw ni ce !"],
    ["police_feu", "Policier", "Feu rouge, chauffeur ! Garez-vous. Amende !", "Feu rouge, sofɛri ! I jɔ ! Amandi !"],
    ["police_stop", "Policier", "Police ! Chauffeur, rangez-vous sur le côté !", "Polisi ! Sofɛri, i jɔ kɛrɛfɛ !"],
    ["police_refus", "Policier", "Vous avez refusé de vous arrêter ! L'amende est doublée !", "I ma sɔn ka jɔ ! Amandi fila !"],
    ["faim", "Apprenti", "Patron, on n'a pas encore mangé ! On s'arrête au maquis ?", "Patron, an ma dumuni kɛ fɔlɔ ! An ka jɔ wa ?"],
    ["vendeuse", "Vendeuse", "Eau fraîche, beignets, mangues !", "Ji nɛnɛ ! Fritiw ! Mangoro !"],
    ["bon_appetit", "Vendeuse", "Merci ! Bon appétit, chauffeur !", "I ni ce ! Ala k'a diya !"],
    ["silence", "Apprenti", "Silence, s'il vous plaît ! Laissez le chauffeur conduire !", "Aw ye makun ! Aw ye sofɛri to !"],
  ];
  const BYID = Object.fromEntries(LINES.map(([id, who, fr, bm]) => [id, { who, fr, bm }]));

  let lang = "fr";
  const key = (id) => (lang === "bm" ? "bm_" : "") + id;

  // every line of the game, for the voice studio: generic lines + one call per destination
  function catalog(l) {
    const L = l || lang, names = new Set(CITY_STOPS);
    if (SB.mali) {
      for (const c of Object.values(SB.mali.CITIES)) names.add(c.name);
      for (const r of SB.mali.ROUTES) for (const [n] of r.towns) names.add(n);
    }
    const pre = L === "bm" ? "bm_" : "";
    const out = LINES.map(([id, who, fr, bm]) => ({ id: pre + id, who, text: L === "bm" ? bm : fr, group: id.startsWith("police") || id === "peage" ? "Police et péage" : id.endsWith("_car") ? "Voyages en car" : "Passagers et apprenti" }));
    for (const n of names) out.push({ id: pre + "appel_" + slug(n), who: "Apprenti", text: n + " ! " + n + " !", group: "Appels de l'apprenti" });
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

  /* ---------- text-to-speech (phones have no Bambara voice: the French voice reads it as well as it can) ---------- */
  function tts(text) {
    const t = lang === "bm" ? text.replace(/ɛ/g, "è").replace(/ɔ/g, "o").replace(/ɲ/g, "gn").replace(/ŋ/g, "ng") : text;
    const cap = window.Capacitor, plug = cap && cap.Plugins && cap.Plugins.TextToSpeech;
    if (plug && cap.getPlatform && cap.getPlatform() !== "web") { plug.speak({ text: t, lang: "fr-FR", rate: 1.05, pitch: 1.0, volume: 1.0 }).catch(() => {}); return 2200; }
    if (window.speechSynthesis && window.SpeechSynthesisUtterance) {
      try { const u = new SpeechSynthesisUtterance(t); u.lang = "fr-FR"; u.rate = 1.05; window.speechSynthesis.cancel(); window.speechSynthesis.speak(u); return 2200; } catch (e) { /* no voice */ }
    }
    return 0;
  }

  /* ---------- speaking in the game ---------- */
  let enabled = true, busyUntil = 0, current = null;
  const bubble = () => document.getElementById("speech");
  function show(who, text) {
    const b = bubble(); if (!b) return;
    b.querySelector("b").textContent = who; b.querySelector("span").textContent = text;
    b.classList.add("show"); clearTimeout(show.t); show.t = setTimeout(() => b.classList.remove("show"), 3000);
  }
  async function play(k, text) {
    if (!enabled) return;
    try {
      if (current) { current.pause(); current = null; }
      const blob = await store.get(k);
      if (blob) { current = new Audio(URL.createObjectURL(blob)); await current.play(); return; }
      const file = await bundled(k);
      if (file) { current = new Audio(file); await current.play(); return; }
    } catch (e) { /* fall back to speech */ }
    tts(text);
  }
  function say(id, vars, priority) {
    const now = performance.now();
    if (!priority && now < busyUntil) return;
    busyUntil = now + 2600;
    if (id === "appel") { const t = vars.stop + " ! " + vars.stop + " !"; show("Apprenti", t); play(key("appel_" + slug(vars.stop)), t); return; }
    const base = BYID[id] || { who: "Apprenti", fr: "", bm: "" };
    const text = (lang === "bm" ? base.bm : base.fr).replace(/\{dest\}/g, (vars && vars.dest) || "");
    show(base.who, text); play(key(id), text);
  }
  // a free sentence (haggling, chatter, police): t is a string or { fr, bm }
  function sayText(who, t, bubbleOn) {
    const text = typeof t === "string" ? t : lang === "bm" ? t.bm : t.fr;
    busyUntil = performance.now() + 2600;
    if (bubbleOn !== false) show(who, text);
    if (enabled) { try { if (current) { current.pause(); current = null; } } catch (e) { /* ignore */ } tts(text); }
    return text;
  }
  const tr = (fr, bm) => (lang === "bm" ? bm : fr);
  SB.voice = { say, sayText, tr, catalog, store, slug, setEnabled: (v) => { enabled = !!v; }, setLang: (l) => { lang = l === "bm" ? "bm" : "fr"; }, get lang() { return lang; }, LINES };
})();
