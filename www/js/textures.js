/* Sotrama Bamako - textures drawn on canvases (no image files to ship). */
(function () {
  "use strict";
  const SB = (window.SB = window.SB || {});
  const T = (SB.tex = {});

  let seed = 1234567;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const rr = (a, b) => a + (b - a) * rnd();
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

  function canvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    return [c, c.getContext("2d")];
  }
  function toTex(c, repeat) {
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = SB.maxAniso || 4;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }
  // small squares drawn with wrap-around so the texture tiles without seams
  function speckle(g, w, h, n, colors, rmin, rmax, alpha) {
    for (let i = 0; i < n; i++) {
      g.globalAlpha = alpha * (0.35 + rnd() * 0.65);
      g.fillStyle = pick(colors);
      const r = rr(rmin, rmax), x = rnd() * w, y = rnd() * h;
      for (const ox of [0, -w]) for (const oy of [0, -h]) {
        if (ox && x + r < w) continue;
        if (oy && y + r < h) continue;
        g.fillRect(x + ox, y + oy, r, r);
      }
    }
    g.globalAlpha = 1;
  }
  function blotch(g, w, h, n, color, rmin, rmax, alpha) {
    for (let i = 0; i < n; i++) {
      const x = rnd() * w, y = rnd() * h, r = rr(rmin, rmax);
      for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        gr.addColorStop(0, color); gr.addColorStop(1, "rgba(0,0,0,0)");
        g.globalAlpha = alpha; g.fillStyle = gr; g.fillRect(x + ox - r, y + oy - r, 2 * r, 2 * r);
      }
    }
    g.globalAlpha = 1;
  }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
  }
  function fitText(g, text, maxW, size, weight, family) {
    let s = size;
    do { g.font = `${weight} ${s}px ${family}`; s -= 2; } while (g.measureText(text).width > maxW && s > 10);
  }
  const COND = '"Barlow Condensed", "Arial Narrow", sans-serif';
  const DISPLAY = '"Bowlby One", "Arial Black", Impact, sans-serif';

  /* ---------- ground ---------- */
  T.laterite = () => {
    const [c, g] = canvas(512, 512);
    g.fillStyle = "#a65a33"; g.fillRect(0, 0, 512, 512);
    blotch(g, 512, 512, 18, "#8c4528", 40, 110, 0.35);
    blotch(g, 512, 512, 14, "#c27a48", 30, 90, 0.3);
    speckle(g, 512, 512, 14000, ["#7a3d22", "#c47a4a", "#d39363", "#5e2f1b", "#b8693c"], 1, 3, 0.55);
    speckle(g, 512, 512, 260, ["#d9b08a", "#e3c39f", "#6d4a33"], 2, 5, 0.7);
    return toTex(c, true);
  };
  T.sand = () => {
    const [c, g] = canvas(256, 256);
    g.fillStyle = "#c4a072"; g.fillRect(0, 0, 256, 256);
    blotch(g, 256, 256, 10, "#a9824f", 20, 60, 0.3);
    speckle(g, 256, 256, 6000, ["#d8b98d", "#a8834f", "#e6cfa8", "#8f6b3e"], 1, 2, 0.6);
    return toTex(c, true);
  };
  T.grass = () => {
    const [c, g] = canvas(256, 256);
    g.fillStyle = "#7c7f43"; g.fillRect(0, 0, 256, 256);
    blotch(g, 256, 256, 12, "#5f6a30", 20, 60, 0.45);
    blotch(g, 256, 256, 8, "#a39a5a", 20, 50, 0.35);
    g.lineWidth = 1;
    for (let i = 0; i < 2600; i++) {
      const x = rnd() * 256, y = rnd() * 256, l = rr(3, 8);
      g.strokeStyle = pick(["#4f5a26", "#94924f", "#6d7436", "#b3a868"]); g.globalAlpha = 0.6;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + rr(-2, 2), y - l); g.stroke();
    }
    g.globalAlpha = 1;
    return toTex(c, true);
  };

  /* ---------- asphalt ---------- */
  // u runs along the road (one tile = 10 m), v across the full width
  function asphaltBase(g, w, h) {
    g.fillStyle = "#4a4541"; g.fillRect(0, 0, w, h);
    blotch(g, w, h, 16, "#3a3633", 20, 70, 0.35);
    blotch(g, w, h, 10, "#5d5650", 20, 60, 0.3);
    speckle(g, w, h, 16000, ["#5f5953", "#34302d", "#6b645d", "#2c2927"], 1, 2, 0.45);
    // cracks
    g.strokeStyle = "#2a2724"; g.lineWidth = 1.2; g.globalAlpha = 0.55;
    for (let i = 0; i < 9; i++) {
      let x = rnd() * w, y = rnd() * h; g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += rr(-14, 14); y += rr(-14, 14); g.lineTo(x, y); }
      g.stroke();
    }
    g.globalAlpha = 1;
  }
  T.asphaltRoad = () => {
    const [c, g] = canvas(512, 256);
    asphaltBase(g, 512, 256);
    // patched repairs
    for (let i = 0; i < 3; i++) { g.globalAlpha = 0.35; g.fillStyle = "#2f2c29"; g.fillRect(rr(0, 440), rr(40, 200), rr(30, 70), rr(14, 30)); }
    g.globalAlpha = 1;
    // wheel tracks
    for (const v of [0.3, 0.7]) { const gr = g.createLinearGradient(0, v * 256 - 18, 0, v * 256 + 18); gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(0.5, "rgba(20,18,16,0.22)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(0, v * 256 - 18, 512, 36); }
    // dusty edges, sand blown on the road
    for (const [y0, y1] of [[0, 40], [256, 216]]) {
      const gr = g.createLinearGradient(0, y0, 0, y1);
      gr.addColorStop(0, "rgba(176,128,84,0.95)"); gr.addColorStop(0.4, "rgba(176,128,84,0.45)"); gr.addColorStop(1, "rgba(176,128,84,0)");
      g.fillStyle = gr; g.fillRect(0, Math.min(y0, y1), 512, 40);
    }
    speckle(g, 512, 40, 1400, ["#b9875a", "#9c6c43"], 1, 3, 0.6);
    g.save(); g.translate(0, 216); speckle(g, 512, 40, 1400, ["#b9875a", "#9c6c43"], 1, 3, 0.6); g.restore();
    // worn centre dashes: 4 m painted, 6 m gap
    g.fillStyle = "#e6dfcc"; g.globalAlpha = 0.8; g.fillRect(20, 124, 205, 8); g.globalAlpha = 1;
    speckle(g, 512, 256, 900, ["#4a4541", "#3d3936"], 1, 3, 0.8);
    return toTex(c, true);
  };
  T.asphaltPlain = () => {
    const [c, g] = canvas(512, 512);
    asphaltBase(g, 512, 512);
    return toTex(c, true);
  };

  /* ---------- buildings ---------- */
  // one tile = one bay of 4 m by one floor of 3 m (64 px per metre)
  function plasterBase(g, base, dirt) {
    g.fillStyle = base; g.fillRect(0, 0, 256, 192);
    blotch(g, 256, 192, 8, "rgba(120,100,80,1)", 20, 60, 0.12);
    speckle(g, 256, 192, 3000, ["#ffffff", "#d8cfc0", "#bfb3a0"], 1, 2, 0.35);
    const gr = g.createLinearGradient(0, 192, 0, 120);
    gr.addColorStop(0, dirt); gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr; g.fillRect(0, 120, 256, 72);
    g.fillStyle = "rgba(0,0,0,0.16)"; g.fillRect(0, 0, 256, 7); // floor slab line
  }
  function glassWindow(g, x, y, w, h) {
    g.fillStyle = "#ece6da"; g.fillRect(x - 6, y - 6, w + 12, h + 12);
    const gr = g.createLinearGradient(x, y, x + w, y + h);
    gr.addColorStop(0, "#5c7484"); gr.addColorStop(0.45, "#2c3a44"); gr.addColorStop(1, "#1f2a31");
    g.fillStyle = gr; g.fillRect(x, y, w, h);
    g.fillStyle = "rgba(255,255,255,0.12)"; g.beginPath(); g.moveTo(x + w * 0.1, y); g.lineTo(x + w * 0.45, y); g.lineTo(x + w * 0.1, y + h * 0.7); g.closePath(); g.fill();
    g.fillStyle = "#2a2826";
    for (let bx = x + 8; bx < x + w; bx += 11) g.fillRect(bx, y, 3, h);
    g.fillRect(x, y + h / 2 - 1, w, 3);
    g.fillStyle = "#d9d0c0"; g.fillRect(x - 10, y + h + 6, w + 20, 6);
    g.fillStyle = "rgba(110,70,40,0.25)"; g.fillRect(x + 4, y + h + 12, 4, rr(10, 30)); g.fillRect(x + w - 10, y + h + 12, 3, rr(8, 22));
  }
  T.facades = () => {
    const out = {};
    // painted plaster with glass and iron grille (tinted per building)
    let [c, g] = canvas(256, 192);
    plasterBase(g, "#f1ebe1", "rgba(150,95,60,0.5)");
    glassWindow(g, 88, 48, 80, 88);
    out.plaster = toTex(c, true);
    // plaster with wooden louvred shutters
    [c, g] = canvas(256, 192);
    plasterBase(g, "#efe8dc", "rgba(150,95,60,0.5)");
    g.fillStyle = "#e8e1d4"; g.fillRect(80, 40, 96, 104);
    for (const [x0, w] of [[86, 42], [128, 42]]) {
      g.fillStyle = "#4c7c94"; g.fillRect(x0, 46, w, 92);
      g.fillStyle = "rgba(0,0,0,0.28)"; for (let y = 50; y < 136; y += 7) g.fillRect(x0 + 3, y, w - 6, 2);
    }
    g.fillStyle = "#d9d0c0"; g.fillRect(76, 144, 104, 6);
    out.shutters = toTex(c, true);
    // banco (mud plaster), small wooden window
    [c, g] = canvas(256, 192);
    g.fillStyle = "#b47547"; g.fillRect(0, 0, 256, 192);
    blotch(g, 256, 192, 10, "#94582f", 20, 60, 0.4);
    blotch(g, 256, 192, 8, "#c98d5c", 16, 50, 0.35);
    speckle(g, 256, 192, 5000, ["#8a5130", "#c88a5b", "#6d3e22", "#d9a273"], 1, 3, 0.5);
    g.strokeStyle = "rgba(70,40,20,0.35)"; g.lineWidth = 1;
    for (let i = 0; i < 6; i++) { let x = rnd() * 256, y = rnd() * 192; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += rr(-12, 12); y += rr(4, 14); g.lineTo(x, y); } g.stroke(); }
    g.fillStyle = "#5a3920"; g.fillRect(100, 58, 56, 64);
    g.fillStyle = "rgba(0,0,0,0.3)"; for (let x = 104; x < 156; x += 9) g.fillRect(x, 58, 2, 64);
    out.banco = toTex(c, true);
    // glass curtain wall for the towers
    [c, g] = canvas(256, 192);
    const gr = g.createLinearGradient(0, 0, 256, 192);
    gr.addColorStop(0, "#7d98a6"); gr.addColorStop(0.5, "#3e5562"); gr.addColorStop(1, "#5b7482");
    g.fillStyle = gr; g.fillRect(0, 0, 256, 192);
    g.fillStyle = "rgba(255,255,255,0.1)"; g.beginPath(); g.moveTo(40, 0); g.lineTo(120, 0); g.lineTo(30, 192); g.lineTo(0, 192); g.closePath(); g.fill();
    g.fillStyle = "#d8d4cc"; g.fillRect(0, 0, 256, 20);
    g.fillStyle = "#2c3236"; for (let x = 0; x < 256; x += 64) g.fillRect(x, 20, 4, 172);
    out.glass = toTex(c, true);
    return out;
  };
  T.roof = () => {
    const [c, g] = canvas(256, 256);
    g.fillStyle = "#b7aa96"; g.fillRect(0, 0, 256, 256);
    blotch(g, 256, 256, 14, "#8f8371", 16, 60, 0.4);
    blotch(g, 256, 256, 6, "#6b5f50", 10, 30, 0.35);
    speckle(g, 256, 256, 5000, ["#cbbfab", "#9d9180", "#8a7d6b"], 1, 2, 0.5);
    return toTex(c, true);
  };
  T.door = () => {
    const [c, g] = canvas(128, 192);
    g.fillStyle = "#e9e5de"; g.fillRect(0, 0, 128, 192);
    g.fillStyle = "rgba(0,0,0,0.18)"; for (let x = 6; x < 128; x += 12) g.fillRect(x, 0, 3, 192);
    g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(62, 0, 4, 192); g.fillRect(0, 0, 128, 6);
    g.fillStyle = "#3a3a3a"; g.fillRect(52, 100, 8, 14); g.fillRect(70, 100, 8, 14);
    blotch(g, 128, 192, 8, "rgba(120,60,20,1)", 6, 18, 0.3);
    const gr = g.createLinearGradient(0, 192, 0, 140); gr.addColorStop(0, "rgba(140,90,50,0.6)"); gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr; g.fillRect(0, 140, 128, 52);
    return toTex(c, false);
  };
  // shop signs: 2 columns x 4 rows atlas
  T.SIGNS = [
    ["ALIMENTATION GÉNÉRALE", "#b8322a", "#fff6e6"], ["QUINCAILLERIE", "#2e66a6", "#ffffff"],
    ["PHARMACIE", "#1d7f46", "#ffffff"], ["BOUTIQUE", "#f0b12f", "#2a1c10"],
    ["TÉLÉCENTRE", "#6f3a8c", "#ffffff"], ["COIFFURE", "#e9dfc9", "#2a1c10"],
    ["RESTAURANT", "#c9501d", "#fff6e6"], ["ATELIER COUTURE", "#283a86", "#f2d36b"],
  ];
  T.signs = () => {
    const [c, g] = canvas(1024, 512);
    T.SIGNS.forEach(([text, bg, fg], i) => {
      const x = (i % 2) * 512, y = Math.floor(i / 2) * 128;
      g.fillStyle = bg; g.fillRect(x + 4, y + 6, 504, 116);
      g.strokeStyle = "rgba(0,0,0,0.25)"; g.lineWidth = 6; g.strokeRect(x + 7, y + 9, 498, 110);
      if (text === "PHARMACIE") { g.fillStyle = "#ffffff"; g.fillRect(x + 30, y + 44, 44, 40); g.fillStyle = "#1d7f46"; g.fillRect(x + 46, y + 48, 12, 32); g.fillRect(x + 36, y + 58, 32, 12); }
      g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle";
      fitText(g, text, 440, 72, 700, COND);
      g.fillText(text, x + 256 + (text === "PHARMACIE" ? 30 : 0), y + 68);
      blotch(g, 512, 128, 4, "rgba(90,60,30,1)", 10, 30, 0.18);
    });
    return toTex(c, false);
  };

  /* ---------- water, sky, particles ---------- */
  T.water = () => {
    const [c, g] = canvas(256, 256);
    g.fillStyle = "#3d7a80"; g.fillRect(0, 0, 256, 256);
    blotch(g, 256, 256, 10, "#2f6168", 30, 80, 0.4);
    g.lineWidth = 2;
    for (let i = 0; i < 70; i++) {
      const y = rnd() * 256, x = rnd() * 256, l = rr(20, 60);
      g.strokeStyle = pick(["rgba(200,230,225,0.35)", "rgba(120,170,170,0.4)", "rgba(30,70,75,0.4)"]);
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y - 3, x + l, y); g.stroke();
      if (x + l > 256) { g.beginPath(); g.moveTo(x - 256, y); g.quadraticCurveTo(x - 256 + l / 2, y - 3, x - 256 + l, y); g.stroke(); }
    }
    return toTex(c, true);
  };
  T.glow = (inner, outer) => {
    const [c, g] = canvas(128, 128);
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, inner); gr.addColorStop(0.25, inner); gr.addColorStop(1, outer);
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  };

  /* ---------- labels ---------- */
  T.stopSign = (name) => {
    const [c, g] = canvas(512, 160);
    g.fillStyle = "#1d7f46"; roundRect(g, 6, 6, 500, 148, 18); g.fill();
    g.strokeStyle = "#f2efe6"; g.lineWidth = 6; roundRect(g, 14, 14, 484, 132, 12); g.stroke();
    g.fillStyle = "#f2b233"; g.font = `700 30px ${COND}`; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("ARRÊT SOTRAMA", 256, 44);
    g.fillStyle = "#ffffff"; fitText(g, name.toUpperCase(), 440, 64, 700, COND); g.fillText(name.toUpperCase(), 256, 100);
    return toTex(c, false);
  };
  T.stationSign = () => {
    const [c, g] = canvas(512, 160);
    g.fillStyle = "#c0392b"; roundRect(g, 6, 6, 500, 148, 18); g.fill();
    g.fillStyle = "#ffffff"; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = `700 76px ${COND}`; g.fillText("STATION", 256, 70);
    g.font = `600 30px ${COND}`; g.fillText("CARBURANT · 800 F/L", 256, 124);
    return toTex(c, false);
  };

  /* ---------- vehicles ---------- */
  T.LIVERIES = {
    vert: { name: "Vert classique", body: "#1f8a4c", dark: "#14603a", stripe: "#f2b233", roof: "#ece6d6", text: "#f7ecd8", slogan: "DIEU MERCI", price: 0 },
    bleu: { name: "Bleu fleuve", body: "#2a64a8", dark: "#1b4677", stripe: "#f2efe6", roof: "#f2efe6", text: "#ffffff", slogan: "BARAKA", price: 60000 },
    rouge: { name: "Rouge et or", body: "#b3261e", dark: "#7f1913", stripe: "#f2b233", roof: "#f4e9d0", text: "#ffe9a8", slogan: "INCH'ALLAH", price: 120000 },
    soleil: { name: "Jaune soleil", body: "#f0b12f", dark: "#b8801c", stripe: "#1d7f46", roof: "#ffffff", text: "#1d3a24", slogan: "ALHAMDOULILLAH", price: 200000 },
  };
  const busCache = {};
  T.bus = (id) => {
    if (busCache[id]) return busCache[id];
    const L = T.LIVERIES[id] || T.LIVERIES.vert;
    const W = 1024, H = 384, PX = W / 5.4;           // pixels per metre along the bus
    function side(frontLeft, door) {
      const [c, g] = canvas(W, H);
      const X = (m) => (frontLeft ? m * PX : W - m * PX);  // m = metres from the front
      g.fillStyle = L.body; g.fillRect(0, 0, W, H);
      g.fillStyle = L.roof; g.fillRect(0, 0, W, 26);
      g.fillStyle = L.dark; g.fillRect(0, H - 46, W, 46);
      g.fillStyle = L.stripe; g.fillRect(0, 196, W, 20);
      g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(0, 216, W, 3);
      // windows
      const wins = [[0.15, 0.95], [1.05, 1.85], [1.95, 2.75], [2.85, 3.65], [3.75, 4.55], [4.65, 5.25]];
      for (const [a, b] of wins) {
        if (door && a > 3.6 && a < 4.0) continue;
        const x0 = Math.min(X(a), X(b)), w = Math.abs(X(b) - X(a));
        const gr = g.createLinearGradient(0, 40, 0, 170);
        gr.addColorStop(0, "#6f8b96"); gr.addColorStop(0.5, "#253038"); gr.addColorStop(1, "#1a2228");
        g.fillStyle = "#151b1f"; roundRect(g, x0 - 4, 38, w + 8, 140, 12); g.fill();
        g.fillStyle = gr; roundRect(g, x0, 42, w, 132, 10); g.fill();
        g.fillStyle = "rgba(255,255,255,0.13)"; g.beginPath(); g.moveTo(x0 + w * 0.15, 42); g.lineTo(x0 + w * 0.5, 42); g.lineTo(x0 + w * 0.2, 174); g.lineTo(x0, 174); g.closePath(); g.fill();
        // passengers' heads behind the glass
        for (let k = 0; k < 2; k++) { if (rnd() < 0.5) continue; g.fillStyle = "rgba(15,10,8,0.85)"; g.beginPath(); g.arc(x0 + w * (0.3 + 0.4 * k), 140, 16, Math.PI, 0); g.fill(); }
      }
      if (door) { // open sliding door near the back
        const x0 = Math.min(X(3.7), X(4.75)), w = Math.abs(X(4.75) - X(3.7));
        g.fillStyle = "#120d0a"; g.fillRect(x0, 36, w, H - 70);
        g.fillStyle = "#3b2a20"; g.fillRect(x0 + 10, 180, w - 20, 26);
        g.fillStyle = "#2b2b2b"; g.fillRect(x0 - 6, 34, 6, H - 68);
      }
      // wheel arches
      for (const m of [0.95, 4.45]) { g.fillStyle = "#0e0e0e"; g.beginPath(); g.arc(X(m), H + 6, 0.58 * PX, Math.PI, 0); g.fill(); }
      // slogan and route
      g.textBaseline = "middle"; g.textAlign = "center";
      g.font = `400 46px ${DISPLAY}`; g.lineWidth = 6; g.strokeStyle = L.dark; g.fillStyle = L.text;
      const sx = door ? X(1.9) : X(2.7);
      g.strokeText(L.slogan, sx, 268); g.fillText(L.slogan, sx, 268);
      g.font = `700 30px ${COND}`; g.fillStyle = L.text;
      g.fillText("BAMAKO ⇄ KATI · LIGNE 12", door ? X(1.9) : X(2.7), 314);
      // dust, scratches and panel joints
      const dust = g.createLinearGradient(0, H, 0, H - 120); dust.addColorStop(0, "rgba(150,90,50,0.55)"); dust.addColorStop(1, "rgba(150,90,50,0)");
      g.fillStyle = dust; g.fillRect(0, H - 120, W, 120);
      g.fillStyle = "rgba(0,0,0,0.18)"; for (const m of [1.0, 2.0, 3.0, 4.6]) g.fillRect(X(m), 180, 2, H - 226);
      blotch(g, W, H, 10, "rgba(120,70,30,1)", 6, 16, 0.22);
      return toTex(c, false);
    }
    function front() {
      const [c, g] = canvas(512, 432);
      g.fillStyle = L.body; g.fillRect(0, 0, 512, 432);
      g.fillStyle = L.roof; g.fillRect(0, 0, 512, 26);
      const gr = g.createLinearGradient(0, 40, 0, 200); gr.addColorStop(0, "#8aa3ad"); gr.addColorStop(0.55, "#2a363e"); gr.addColorStop(1, "#1a2228");
      g.fillStyle = "#151b1f"; roundRect(g, 18, 36, 476, 176, 18); g.fill();
      g.fillStyle = gr; roundRect(g, 24, 42, 228, 164, 14); g.fill(); roundRect(g, 260, 42, 228, 164, 14); g.fill();
      g.fillStyle = "#101010"; g.fillRect(150, 44, 212, 30);
      g.fillStyle = "#f2b233"; g.font = `700 24px ${COND}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("BAMAKO", 256, 60);
      g.fillStyle = "rgba(15,10,8,0.85)"; g.beginPath(); g.arc(380, 196, 34, Math.PI, 0); g.fill();
      g.fillStyle = L.stripe; g.fillRect(0, 226, 512, 18);
      g.fillStyle = "#1c1c1c"; roundRect(g, 150, 262, 212, 74, 8); g.fill();
      g.fillStyle = "#3a3a3a"; for (let y = 270; y < 330; y += 12) g.fillRect(158, y, 196, 5);
      for (const x of [62, 450]) { g.fillStyle = "#e9e9e2"; roundRect(g, x - 44, 266, 88, 58, 10); g.fill(); g.fillStyle = "#fff4c8"; g.beginPath(); g.arc(x, 295, 22, 0, 7); g.fill(); g.fillStyle = "#f29a1e"; g.fillRect(x - 40, 330, 80, 14); }
      g.fillStyle = "#2b2b2b"; g.fillRect(0, 360, 512, 72);
      g.fillStyle = "#f3f0e6"; g.fillRect(196, 372, 120, 34); g.fillStyle = "#222"; g.font = `700 22px ${COND}`; g.fillText("BKO 12", 256, 390);
      const dust = g.createLinearGradient(0, 432, 0, 330); dust.addColorStop(0, "rgba(150,90,50,0.5)"); dust.addColorStop(1, "rgba(150,90,50,0)"); g.fillStyle = dust; g.fillRect(0, 330, 512, 102);
      return toTex(c, false);
    }
    function back() {
      const [c, g] = canvas(512, 432);
      g.fillStyle = L.body; g.fillRect(0, 0, 512, 432);
      g.fillStyle = L.roof; g.fillRect(0, 0, 512, 26);
      const gr = g.createLinearGradient(0, 44, 0, 180); gr.addColorStop(0, "#6f8b96"); gr.addColorStop(1, "#1a2228");
      g.fillStyle = "#151b1f"; roundRect(g, 40, 40, 432, 150, 14); g.fill();
      g.fillStyle = gr; roundRect(g, 46, 46, 420, 138, 12); g.fill();
      g.fillStyle = L.stripe; g.fillRect(0, 226, 512, 18);
      g.fillStyle = L.text; g.font = `400 52px ${DISPLAY}`; g.textAlign = "center"; g.textBaseline = "middle";
      g.lineWidth = 6; g.strokeStyle = L.dark; g.strokeText("SOTRAMA", 256, 292); g.fillText("SOTRAMA", 256, 292);
      for (const x of [44, 468]) { g.fillStyle = "#a3170f"; roundRect(g, x - 30, 250, 60, 80, 8); g.fill(); g.fillStyle = "#f29a1e"; g.fillRect(x - 26, 314, 52, 12); }
      g.fillStyle = "#555"; for (let y = 40; y < 340; y += 26) g.fillRect(470, y, 22, 4); g.fillRect(470, 40, 4, 300); g.fillRect(488, 40, 4, 300);
      g.fillStyle = "#2b2b2b"; g.fillRect(0, 360, 512, 72);
      const dust = g.createLinearGradient(0, 432, 0, 300); dust.addColorStop(0, "rgba(150,90,50,0.6)"); dust.addColorStop(1, "rgba(150,90,50,0)"); g.fillStyle = dust; g.fillRect(0, 300, 512, 132);
      return toTex(c, false);
    }
    busCache[id] = { left: side(true, false), right: side(false, true), front: front(), back: back(), roof: L.roof, body: L.body };
    return busCache[id];
  };
  let taxiCache = null;
  T.taxi = () => {
    if (taxiCache) return taxiCache;
    function body(frontLeft) {
      const [c, g] = canvas(512, 128);
      const X = (m) => (frontLeft ? m * 512 / 4.2 : 512 - m * 512 / 4.2);
      g.fillStyle = "#f1c232"; g.fillRect(0, 0, 512, 128);
      g.fillStyle = "rgba(0,0,0,0.25)"; for (const m of [1.25, 2.35, 3.3]) g.fillRect(X(m), 0, 3, 100);
      g.fillStyle = "#2b2b2b"; g.fillRect(0, 104, 512, 24);
      for (const m of [0.8, 3.4]) { g.fillStyle = "#0e0e0e"; g.beginPath(); g.arc(X(m), 132, 44, Math.PI, 0); g.fill(); }
      g.fillStyle = "#1f2a31"; g.font = `700 36px ${COND}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("TAXI", X(2.0), 56);
      const dust = g.createLinearGradient(0, 128, 0, 60); dust.addColorStop(0, "rgba(150,90,50,0.5)"); dust.addColorStop(1, "rgba(150,90,50,0)"); g.fillStyle = dust; g.fillRect(0, 60, 512, 68);
      return toTex(c, false);
    }
    function cabin() {
      const [c, g] = canvas(256, 64);
      g.fillStyle = "#f1c232"; g.fillRect(0, 0, 256, 64);
      const gr = g.createLinearGradient(0, 6, 0, 60); gr.addColorStop(0, "#7b95a0"); gr.addColorStop(1, "#1d262c");
      g.fillStyle = gr; roundRect(g, 10, 8, 110, 52, 8); g.fill(); roundRect(g, 128, 8, 116, 52, 8); g.fill();
      return toTex(c, false);
    }
    taxiCache = { left: body(true), right: body(false), cabin: cabin() };
    return taxiCache;
  };

  /* ---------- countryside (coach trips) ---------- */
  T.savanna = () => {
    const [c, g] = canvas(512, 512);
    g.fillStyle = "#b99a5e"; g.fillRect(0, 0, 512, 512);
    blotch(g, 512, 512, 16, "#a8673d", 30, 100, 0.45);
    blotch(g, 512, 512, 12, "#cdb37a", 30, 90, 0.4);
    blotch(g, 512, 512, 8, "#7f8040", 20, 70, 0.3);
    speckle(g, 512, 512, 9000, ["#8e6a3c", "#d4bd85", "#9c5a33", "#6f6a35"], 1, 3, 0.5);
    g.lineWidth = 1;
    for (let i = 0; i < 3500; i++) {
      const x = rnd() * 512, y = rnd() * 512, l = rr(3, 9);
      g.strokeStyle = pick(["#d9c58f", "#a58b4f", "#c7ad6c", "#8c7a43"]); g.globalAlpha = 0.55;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + rr(-3, 3), y - l); g.stroke();
    }
    g.globalAlpha = 1;
    return toTex(c, true);
  };
  T.thatch = () => {
    const [c, g] = canvas(256, 256);
    g.fillStyle = "#b8955a"; g.fillRect(0, 0, 256, 256);
    g.lineWidth = 2;
    for (let i = 0; i < 1600; i++) {
      const x = rnd() * 256, y = rnd() * 256;
      g.strokeStyle = pick(["#d8b877", "#8f6f3a", "#c6a462", "#a5823f"]); g.globalAlpha = 0.7;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + rr(-2, 2), y + rr(10, 22)); g.stroke();
    }
    g.globalAlpha = 1;
    for (let y = 0; y < 256; y += 32) { g.fillStyle = "rgba(60,40,20,0.25)"; g.fillRect(0, y, 256, 3); }
    return toTex(c, true);
  };
  T.roadSign = (top, bottom, color) => {
    const [c, g] = canvas(512, 200);
    g.fillStyle = color || "#1d7f46"; roundRect(g, 6, 6, 500, 188, 16); g.fill();
    g.strokeStyle = "#ffffff"; g.lineWidth = 7; roundRect(g, 16, 16, 480, 168, 10); g.stroke();
    g.fillStyle = "#ffffff"; g.textAlign = "center"; g.textBaseline = "middle";
    fitText(g, top, 440, 70, 700, COND); g.fillText(top, 256, bottom ? 76 : 100);
    if (bottom) { fitText(g, bottom, 440, 48, 600, COND); g.fillText(bottom, 256, 142); }
    return toTex(c, false);
  };
  T.hospitalSign = (name) => {
    const [c, g] = canvas(640, 180);
    g.fillStyle = "#f7f5ef"; roundRect(g, 4, 4, 632, 172, 14); g.fill();
    g.strokeStyle = "#c0392b"; g.lineWidth = 6; roundRect(g, 14, 14, 612, 152, 10); g.stroke();
    g.fillStyle = "#c0392b"; g.fillRect(78, 42, 32, 96); g.fillRect(46, 74, 96, 32);
    g.textAlign = "left"; g.textBaseline = "middle";
    g.fillStyle = "#1a1a1a"; fitText(g, "HÔPITAL", 430, 54, 700, COND); g.fillText("HÔPITAL", 176, 64);
    g.fillStyle = "#c0392b"; fitText(g, name.toUpperCase(), 430, 50, 700, COND); g.fillText(name.toUpperCase(), 176, 122);
    return toTex(c, false);
  };
  T.kmMarker = (name, km) => {
    const [c, g] = canvas(128, 160);
    g.fillStyle = "#f4f1ea"; roundRect(g, 4, 4, 120, 152, 14); g.fill();
    g.fillStyle = "#c0392b"; g.beginPath(); g.moveTo(4, 50); g.quadraticCurveTo(4, 4, 64, 4); g.quadraticCurveTo(124, 4, 124, 50); g.closePath(); g.fill();
    g.fillStyle = "#ffffff"; g.textAlign = "center"; g.textBaseline = "middle"; fitText(g, name.toUpperCase(), 104, 26, 700, COND); g.fillText(name.toUpperCase(), 64, 30);
    g.fillStyle = "#1a1a1a"; g.font = `700 52px ${COND}`; g.fillText(String(km), 64, 100);
    return toTex(c, false);
  };

  /* ---------- the coach (car) of Kagnassi Transport ---------- */
  const coachCache = {};
  T.coach = (dest) => {
    const key = dest || "";
    if (coachCache[key]) return coachCache[key];
    const W = 1600, H = 440, PX = W / 12;
    function side(frontLeft, door) {
      const [c, g] = canvas(W, H);
      const X = (m) => (frontLeft ? m * PX : W - m * PX);
      g.fillStyle = "#f4f2ec"; g.fillRect(0, 0, W, H);
      // windows band
      const gr = g.createLinearGradient(0, 40, 0, 190); gr.addColorStop(0, "#56707c"); gr.addColorStop(0.6, "#1d272d"); gr.addColorStop(1, "#151c20");
      g.fillStyle = gr; g.fillRect(0, 44, W, 150);
      g.fillStyle = "#e9e6de"; for (let m = 0.4; m < 12; m += 1.45) g.fillRect(X(m), 44, 8, 150);
      for (let k = 0; k < 22; k++) { if (rnd() < 0.35) continue; g.fillStyle = "rgba(12,8,6,0.8)"; g.beginPath(); g.arc(X(1.2 + k * 0.5), 175, 16, Math.PI, 0); g.fill(); }
      g.fillStyle = "rgba(255,255,255,0.1)"; for (let m = 0.6; m < 12; m += 2.9) { g.beginPath(); g.moveTo(X(m), 44); g.lineTo(X(m + 0.9), 44); g.lineTo(X(m + 0.3), 194); g.lineTo(X(m - 0.6), 194); g.closePath(); g.fill(); }
      // stripes
      g.fillStyle = "#1d7f46"; g.fillRect(0, 206, W, 26); g.fillStyle = "#f2b233"; g.fillRect(0, 232, W, 12);
      g.fillStyle = "#c0392b"; g.fillRect(0, 244, W, 6);
      // luggage hatches
      g.strokeStyle = "rgba(0,0,0,0.28)"; g.lineWidth = 3;
      for (let m = 2.6; m < 10.5; m += 1.6) g.strokeRect(Math.min(X(m), X(m + 1.4)), 300, Math.abs(X(m + 1.4) - X(m)), 96);
      g.fillStyle = "#2a2a2a"; g.fillRect(0, H - 40, W, 40);
      for (const m of [1.9, 8.6, 9.9]) { g.fillStyle = "#0e0e0e"; g.beginPath(); g.arc(X(m), H + 4, 0.62 * PX, Math.PI, 0); g.fill(); }
      if (door) { const x0 = Math.min(X(0.25), X(1.25)); g.fillStyle = "#1b2328"; g.fillRect(x0, 44, Math.abs(X(1.25) - X(0.25)), H - 90); g.fillStyle = "#3a464d"; g.fillRect(x0 + Math.abs(X(1.25) - X(0.25)) / 2 - 2, 44, 4, H - 90); }
      g.textAlign = "center"; g.textBaseline = "middle";
      g.font = `400 54px ${DISPLAY}`; g.fillStyle = "#1d7f46"; g.fillText("KAGNASSI TRANSPORT", X(6.4), 286);
      g.font = `700 30px ${COND}`; g.fillStyle = "#3a3a3a"; g.fillText("BAMAKO · SÉGOU · SIKASSO · KAYES · MOPTI", X(6.4), 404 - 40);
      const dust = g.createLinearGradient(0, H, 0, H - 150); dust.addColorStop(0, "rgba(150,90,50,0.6)"); dust.addColorStop(1, "rgba(150,90,50,0)"); g.fillStyle = dust; g.fillRect(0, H - 150, W, 150);
      return toTex(c, false);
    }
    function front() {
      const [c, g] = canvas(640, 820);
      g.fillStyle = "#f4f2ec"; g.fillRect(0, 0, 640, 820);
      g.fillStyle = "#101010"; g.fillRect(70, 30, 500, 60);
      g.fillStyle = "#ff9a2e"; g.textAlign = "center"; g.textBaseline = "middle"; fitText(g, (dest || "KAGNASSI").toUpperCase(), 470, 46, 700, COND); g.fillText((dest || "KAGNASSI").toUpperCase(), 320, 62);
      const gr = g.createLinearGradient(0, 100, 0, 470); gr.addColorStop(0, "#9bb3bd"); gr.addColorStop(0.55, "#26323a"); gr.addColorStop(1, "#151c20");
      g.fillStyle = "#121212"; roundRect(g, 24, 100, 592, 380, 24); g.fill();
      g.fillStyle = gr; roundRect(g, 34, 110, 572, 360, 20); g.fill();
      g.fillStyle = "rgba(255,255,255,0.14)"; g.beginPath(); g.moveTo(60, 110); g.lineTo(200, 110); g.lineTo(80, 470); g.lineTo(34, 470); g.closePath(); g.fill();
      g.fillStyle = "#1d7f46"; g.fillRect(0, 500, 640, 40); g.fillStyle = "#f2b233"; g.fillRect(0, 540, 640, 16);
      g.fillStyle = "#1d7f46"; g.font = `400 70px ${DISPLAY}`; g.fillText("KT", 320, 610);
      for (const x of [90, 550]) { g.fillStyle = "#e9e9e2"; roundRect(g, x - 70, 650, 140, 70, 14); g.fill(); g.fillStyle = "#fff4c8"; g.beginPath(); g.arc(x - 24, 685, 22, 0, 7); g.arc(x + 26, 685, 22, 0, 7); g.fill(); }
      g.fillStyle = "#2a2a2a"; g.fillRect(0, 740, 640, 80);
      g.fillStyle = "#f3f0e6"; g.fillRect(250, 752, 140, 40); g.fillStyle = "#222"; g.font = `700 26px ${COND}`; g.fillText("KT 2026", 320, 773);
      return toTex(c, false);
    }
    function back() {
      const [c, g] = canvas(640, 820);
      g.fillStyle = "#f4f2ec"; g.fillRect(0, 0, 640, 820);
      const gr = g.createLinearGradient(0, 60, 0, 300); gr.addColorStop(0, "#6f8b96"); gr.addColorStop(1, "#151c20");
      g.fillStyle = gr; roundRect(g, 60, 60, 520, 240, 18); g.fill();
      g.fillStyle = "#1d7f46"; g.fillRect(0, 360, 640, 40); g.fillStyle = "#f2b233"; g.fillRect(0, 400, 640, 16);
      g.textAlign = "center"; g.textBaseline = "middle"; g.font = `400 52px ${DISPLAY}`; g.fillStyle = "#1d7f46"; g.fillText("KAGNASSI", 320, 470);
      g.font = `700 36px ${COND}`; g.fillStyle = "#333"; g.fillText("TRANSPORT", 320, 520);
      g.fillStyle = "#3a3a3a"; for (let y = 560; y < 690; y += 18) g.fillRect(120, y, 400, 8);
      for (const x of [50, 590]) { g.fillStyle = "#a3170f"; roundRect(g, x - 34, 540, 68, 150, 10); g.fill(); g.fillStyle = "#f29a1e"; g.fillRect(x - 30, 660, 60, 18); }
      g.fillStyle = "#2a2a2a"; g.fillRect(0, 740, 640, 80);
      const dust = g.createLinearGradient(0, 820, 0, 560); dust.addColorStop(0, "rgba(150,90,50,0.6)"); dust.addColorStop(1, "rgba(150,90,50,0)"); g.fillStyle = dust; g.fillRect(0, 560, 640, 260);
      return toTex(c, false);
    }
    coachCache[key] = { left: side(true, false), right: side(false, true), front: front(), back: back() };
    return coachCache[key];
  };

  T._rnd = rnd;
})();
