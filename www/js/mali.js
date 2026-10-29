/* Sotrama Bamako - the map of Mali: border, rivers, cities and coach routes.
 * Coordinates are longitude / latitude (simplified outline). Distances and fares are game values close to reality. */
(function () {
  "use strict";
  const SB = (window.SB = window.SB || {});

  const BORDER = [
    [-12.24, 14.76], [-11.67, 15.39], [-10.9, 15.1], [-10.65, 15.43], [-9.7, 15.26], [-9.55, 15.49], [-5.54, 15.5],
    [-5.32, 16.2], [-5.6, 16.5], [-6.0, 20.6], [-6.45, 24.95], [-4.83, 25.0], [1.14, 21.1], [1.17, 20.74], [3.15, 19.69],
    [3.23, 19.05], [4.27, 19.16], [4.27, 16.85], [3.72, 15.65], [3.3, 15.4], [1.31, 15.29], [0.23, 14.99], [-0.27, 15.12],
    [-0.72, 15.08], [-1.07, 14.97], [-2.0, 14.56], [-2.84, 14.25], [-3.1, 13.54], [-3.52, 13.34], [-4.01, 13.47],
    [-4.28, 13.23], [-4.43, 12.54], [-5.22, 11.71], [-5.2, 11.38], [-5.47, 10.95], [-5.52, 10.43], [-6.05, 10.1],
    [-6.67, 10.35], [-7.62, 10.15], [-8.03, 10.21], [-8.33, 10.49], [-8.24, 11.0], [-8.4, 11.39], [-8.67, 11.81],
    [-8.91, 12.09], [-9.13, 12.31], [-9.33, 12.33], [-9.57, 12.19], [-10.17, 11.84], [-10.59, 11.92], [-10.87, 12.18],
    [-11.04, 12.21], [-11.46, 12.08], [-11.39, 12.41], [-11.47, 12.75], [-11.42, 13.35], [-11.83, 13.74], [-12.12, 13.99],
    [-12.17, 14.62],
  ];
  const RIVERS = [
    [[-9.17, 11.42], [-8.41, 11.94], [-7.99, 12.64], [-7.56, 12.86], [-6.95, 13.05], [-6.26, 13.44], [-6.07, 13.7], [-5.4, 14.05],
      [-4.2, 14.49], [-4.1, 15.25], [-3.4, 16.27], [-3.03, 16.68], [-1.9, 16.75], [-0.35, 16.95], [-0.04, 16.27], [0.5, 15.66], [1.38, 14.95]],
    [[-5.9, 12.5], [-4.9, 13.3], [-4.55, 13.91], [-4.2, 14.49]],
    [[-12.24, 14.76], [-11.44, 14.45], [-10.83, 13.81]],
  ];
  // lab: label offset [dx, dy, anchor] on the SVG map
  const CITIES = {
    bamako: { name: "Bamako", lon: -8.0, lat: 12.64, capital: true, lab: [-40, 44, "end"] },
    koulikoro: { name: "Koulikoro", lon: -7.56, lat: 12.86, lab: [22, 42, "start"] },
    kita: { name: "Kita", lon: -9.49, lat: 13.03, lab: [-26, 12, "end"] },
    kayes: { name: "Kayes", lon: -11.44, lat: 14.45 },
    dieme: { name: "Diéma", lon: -9.18, lat: 14.54, lab: [26, 34, "start"] },
    nioro: { name: "Nioro du Sahel", lon: -9.59, lat: 15.23, lab: [0, -30, "middle"] },
    nara: { name: "Nara", lon: -7.28, lat: 15.17, lab: [0, -30, "middle"] },
    segou: { name: "Ségou", lon: -6.27, lat: 13.43, lab: [-20, -18, "end"] },
    niono: { name: "Niono", lon: -5.99, lat: 14.25, lab: [-24, 12, "end"] },
    bougouni: { name: "Bougouni", lon: -7.48, lat: 11.42, lab: [-24, 36, "end"] },
    sikasso: { name: "Sikasso", lon: -5.67, lat: 11.32 },
    koutiala: { name: "Koutiala", lon: -5.46, lat: 12.39 },
    san: { name: "San", lon: -4.9, lat: 13.3 },
    djenne: { name: "Djenné", lon: -4.55, lat: 13.91, lab: [-24, 16, "end"] },
    mopti: { name: "Mopti", lon: -4.2, lat: 14.49, lab: [-24, -14, "end"] },
    bandiagara: { name: "Bandiagara", lon: -3.61, lat: 14.35, lab: [26, 30, "start"] },
    douentza: { name: "Douentza", lon: -2.95, lat: 15.0 },
    tombouctou: { name: "Tombouctou", lon: -3.0, lat: 16.77, lab: [0, -32, "middle"] },
    gao: { name: "Gao", lon: -0.04, lat: 16.27 },
    menaka: { name: "Ménaka", lon: 2.4, lat: 15.92, lab: [-24, 40, "end"] },
    kidal: { name: "Kidal", lon: 1.41, lat: 18.44 },
  };
  // towns: [name, km from the first city]; distances and fares are close to reality, for the game
  const ROUTES = [
    { a: "bamako", b: "koulikoro", km: 57, fare: 1000, towns: [["Tienfala", 35]] },
    { a: "bamako", b: "bougouni", km: 160, fare: 3500, towns: [["Ouéléssébougou", 80]] },
    { a: "bamako", b: "kita", km: 180, fare: 4000, towns: [["Kati", 15]] },
    { a: "bamako", b: "segou", km: 235, fare: 5500, towns: [["Kassela", 45], ["Fana", 124], ["Konobougou", 180]] },
    { a: "bamako", b: "sikasso", km: 375, fare: 7500, towns: [["Ouéléssébougou", 80], ["Bougouni", 160], ["Koumantou", 230]] },
    { a: "bamako", b: "nara", km: 370, fare: 7500, towns: [["Kati", 15], ["Kolokani", 120]] },
    { a: "bamako", b: "dieme", km: 350, fare: 7000, towns: [["Kati", 15], ["Kolokani", 120], ["Didiéni", 190]] },
    { a: "bamako", b: "kayes", km: 600, fare: 11000, towns: [["Kati", 15], ["Kolokani", 120], ["Didiéni", 190], ["Diéma", 350]] },
    { a: "bamako", b: "mopti", km: 630, fare: 11000, towns: [["Fana", 124], ["Ségou", 235], ["Bla", 320], ["San", 430], ["Sévaré", 620]] },
    { a: "kita", b: "kayes", km: 330, fare: 6500, towns: [["Bafoulabé", 200]] },
    { a: "dieme", b: "nioro", km: 110, fare: 2500, towns: [] },
    { a: "dieme", b: "kayes", km: 250, fare: 5000, towns: [] },
    { a: "segou", b: "niono", km: 100, fare: 2000, towns: [["Markala", 35]] },
    { a: "segou", b: "san", km: 200, fare: 4000, towns: [["Bla", 85]] },
    { a: "segou", b: "koutiala", km: 210, fare: 4500, towns: [["Bla", 85]] },
    { a: "segou", b: "mopti", km: 395, fare: 6500, towns: [["Bla", 85], ["San", 195], ["Sévaré", 385]] },
    { a: "bougouni", b: "sikasso", km: 215, fare: 4000, towns: [["Koumantou", 70]] },
    { a: "sikasso", b: "koutiala", km: 140, fare: 3000, towns: [] },
    { a: "koutiala", b: "san", km: 130, fare: 2500, towns: [] },
    { a: "san", b: "mopti", km: 200, fare: 4000, towns: [["Sévaré", 190]] },
    { a: "mopti", b: "djenne", km: 130, fare: 2500, towns: [["Sévaré", 12]] },
    { a: "mopti", b: "bandiagara", km: 70, fare: 1500, towns: [["Sévaré", 12]] },
    { a: "mopti", b: "douentza", km: 190, fare: 4000, towns: [["Sévaré", 12], ["Boré", 120]] },
    { a: "douentza", b: "gao", km: 400, fare: 9000, towns: [["Hombori", 170], ["Gossi", 280]] },
    { a: "douentza", b: "tombouctou", km: 200, fare: 5000, towns: [["Bambara Maoundé", 100]] },
    { a: "gao", b: "kidal", km: 350, fare: 8000, towns: [["Anéfis", 230]] },
    { a: "gao", b: "menaka", km: 320, fare: 7500, towns: [["Ansongo", 100]] },
  ];

  // routes leaving a city, in the right direction (towns reversed when needed)
  function routesFrom(city) {
    const out = [];
    for (const r of ROUTES) {
      if (r.a === city) out.push({ from: r.a, to: r.b, km: r.km, fare: r.fare, towns: r.towns.slice() });
      else if (r.b === city) out.push({ from: r.b, to: r.a, km: r.km, fare: r.fare, towns: r.towns.map(([n, k]) => [n, r.km - k]).reverse() });
    }
    return out.sort((x, y) => x.km - y.km);
  }

  /* ---------- SVG map ---------- */
  // the map shows the south and the Niger bend, where the coaches run (the desert north is cut)
  const LON0 = -12.6, LON1 = 4.6, LAT0 = 10.0, LAT1 = 19.3, K = 100;
  const px = (lon) => (lon - LON0) * K, py = (lat) => (LAT1 - lat) * K;
  const pathOf = (pts, close) => pts.map(([lon, lat], i) => (i ? "L" : "M") + px(lon).toFixed(1) + " " + py(lat).toFixed(1)).join("") + (close ? "Z" : "");

  function renderMap(svg, current, onPick, selected) {
    const W = (LON1 - LON0) * K, H = (LAT1 - LAT0) * K;
    const routes = routesFrom(current);
    const reach = new Set(routes.map((r) => r.to));
    const NS = "http://www.w3.org/2000/svg";
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    let html = `<defs><linearGradient id="land" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#e3c48d"/><stop offset="0.55" stop-color="#d7a96b"/><stop offset="0.8" stop-color="#a7a35a"/><stop offset="1" stop-color="#7d9147"/></linearGradient></defs>`;
    html += `<path d="${pathOf(BORDER, true)}" fill="url(#land)" stroke="#f7ecd8" stroke-width="7" stroke-linejoin="round"/>`;
    for (const rv of RIVERS) html += `<path d="${pathOf(rv)}" fill="none" stroke="#3d8fa0" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`;
    html += `<text x="${px(-1.6)}" y="${py(16.95)}" class="mr">Niger</text>`;
    for (const r of ROUTES) html += `<line x1="${px(CITIES[r.a].lon)}" y1="${py(CITIES[r.a].lat)}" x2="${px(CITIES[r.b].lon)}" y2="${py(CITIES[r.b].lat)}" stroke="#b9876a" stroke-width="6" stroke-linecap="round" opacity="0.7"/>`;
    for (const r of routes) {
      const A = CITIES[r.from], B = CITIES[r.to], on = selected === r.to;
      html += `<line x1="${px(A.lon)}" y1="${py(A.lat)}" x2="${px(B.lon)}" y2="${py(B.lat)}" stroke="${on ? "#f2b233" : "#16110c"}" stroke-width="${on ? 13 : 7}" stroke-dasharray="${on ? "0" : "20 14"}" stroke-linecap="round" opacity="${on ? 1 : 0.65}"/>`;
    }
    for (const [id, c] of Object.entries(CITIES)) {
      const here = id === current, can = reach.has(id), sel = selected === id;
      const r = here ? 26 : c.capital ? 20 : 15;
      html += `<g class="city${can ? " can" : ""}${c.soon ? " soon" : ""}" data-city="${id}">`;
      if (here) html += `<circle cx="${px(c.lon)}" cy="${py(c.lat)}" r="42" fill="none" stroke="#1f8a4c" stroke-width="7"/>`;
      html += `<circle cx="${px(c.lon)}" cy="${py(c.lat)}" r="${r}" fill="${here ? "#1f8a4c" : sel ? "#f2b233" : can ? "#f7ecd8" : "#7a6a55"}" stroke="#16110c" stroke-width="5"/>`;
      const [lx, ly, anchor] = c.lab || [30, 12, "start"];
      html += `<text x="${px(c.lon) + lx}" y="${py(c.lat) + ly}" text-anchor="${anchor}" class="cl">${c.name}</text></g>`;
    }
    svg.innerHTML = html;
    svg.onclick = (e) => { const g = e.target.closest("[data-city]"); if (g && reach.has(g.dataset.city)) onPick(g.dataset.city); };
    void NS;
  }

  SB.mali = { CITIES, ROUTES, routesFrom, renderMap };
})();
