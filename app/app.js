/* DanceWeather app. Reads data/events.json (written by scripts/update.mjs) and draws five tabs:
   Home (3D), 10-Day, Month, Fronts and Radar, plus a page per party. No AI anywhere; every number is worked out here from the listings. */
(function () {
"use strict";
const $ = s => document.querySelector(s), $$ = s => document.querySelectorAll(s);
const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = u => /^https?:\/\//i.test(u || "") ? u : null;
const LVL = ["", "Light", "Moderate", "Heavy", "Very heavy", "Severe"];
const lv = n => `var(--l${n || 1})`;
const andList = a => a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1];
function fmtH(h) { if (h == null) return "Late"; const H = Math.floor(h) % 24, m = Math.round((h - Math.floor(h)) * 60); let hh = H % 12; if (hh === 0) hh = 12; return hh + (m ? ":" + String(m).padStart(2, "0") : "") + (H < 12 ? "A" : "P"); }
const win = p => ({ s: p.s != null ? p.s : 23, e: p.e != null ? p.e : 28, est: p.s == null || p.e == null });
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], DOWL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';
const TZ = "America/New_York";
const isoDay = d => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const nyHour = () => (+new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hour12: false }).format(new Date())) % 24;
function holiday(m, d, w) {
  if (m === 9 && d === 31) return "Halloween";
  if (m === 10 && w === 3 && d >= 21 && d <= 27) return "Thanksgiving Eve";
  if (m === 10 && w === 4 && d >= 22 && d <= 28) return "Thanksgiving";
  if (m === 11 && d === 24) return "Christmas Eve";
  if (m === 11 && d === 31) return "New Year’s Eve";
  if (m === 0 && d === 1) return "New Year’s Day";
  if (m === 6 && d === 4) return "Fourth of July";
  if (m === 4 && w === 1 && d >= 25) return "Memorial Day";
  if (m === 8 && w === 1 && d <= 7) return "Labor Day";
  return "";
}

/* ---------- load ---------- */
async function boot() {
  $("#hmeta").textContent = "Loading this week’s listings…";
  try {
    const r = await fetch("data/events.json", { cache: "no-store" });
    if (!r.ok) throw new Error(r.status + " " + r.statusText);
    start(await r.json());
  } catch (e) {
    $("#whenTag").textContent = "DanceWeather";
    $("#hmeta").textContent = "Couldn’t load the listings.";
    $("#hfeels").textContent = location.protocol === "file:" ? "Open the app through a web server (see the README), not straight from a file." : "Check your connection and reload.";
    console.error(e);
  }
}

function start(DATA) {
const VEN = DATA.venues || {};
const Field = window.createField ? window.createField(VEN) : null;

/* ---------- days from today, with each night's conditions worked out from its listings ---------- */
const TODAY = isoDay(new Date());
const [ty, tm, td] = TODAY.split("-").map(Number);
const NDAYS = 42, FC = 10;
const DAYS = [];
for (let k = 0; k < NDAYS; k++) {
  const dt = new Date(Date.UTC(ty, tm - 1, td + k)), m = dt.getUTCMonth(), d = dt.getUTCDate(), w = dt.getUTCDay();
  DAYS.push({ key: dt.toISOString().slice(0, 10), m, d, w, dow: DOW[w], full: `${DOWL[w]}, ${MON[m]} ${d}`, short: `${MON[m]} ${d}`, list: [], i: k, tag: holiday(m, d, w) });
}
const DI = {}; DAYS.forEach(D => DI[D.key] = D.i);
const EV = (DATA.events || []).filter(p => DI[p.d] != null).map(p => Object.assign({ names: [], lvl: 1 }, p));
EV.forEach(p => { if (p.v && !VEN[p.v]) p.v = null; p.di = DI[p.d]; DAYS[p.di].list.push(p); });
const BYID = {}; EV.forEach(p => BYID[p.id] = p);
const place = p => p.v ? VEN[p.v].n : (p.where || "Address not posted");
const areaOf = p => p.v ? VEN[p.v].a : "Not on the map yet";
const namesShort = p => p.names.length ? p.names.slice(0, 3).join(", ") + (p.names.length > 3 ? ` +${p.names.length - 3}` : "") : (p.note || "Lineup not posted");
const sortShows = L => L.slice().sort((a, b) => (a.s != null ? a.s : 30) - (b.s != null ? b.s : 30) || b.lvl - a.lvl);
const maxLvl = L => L.reduce((m, p) => Math.max(m, p.lvl), 0);
DAYS.forEach((D, i) => {
  const L = D.list, n = L.length, nx = DAYS[i + 1]; D.count = n;
  const mx = maxLvl(L), top = L.slice().sort((a, b) => b.lvl - a.lvl || (a.s == null) - (b.s == null))[0] || null;
  D.top = top;
  if (!n) { D.kind = "clear"; D.lvl = 1; D.cond = "Clear"; }
  else if (mx >= 5 && (n >= 10 || L.some(p => p.fest))) { D.kind = "severe"; D.lvl = 5; D.cond = "Severe storms"; }
  else if (mx >= 4) { D.kind = "storm"; D.lvl = mx; D.cond = top.s != null && top.s < 18 ? "Afternoon storms" : "Thunderstorms"; }
  else { D.kind = "drizzle"; D.lvl = mx; D.cond = (mx >= 3 || n >= 3) ? "Showers" : "Scattered showers"; }
  const ss = L.filter(p => p.s != null).map(p => p.s), ee = L.filter(p => p.e != null).map(p => p.e), mxE = ee.length ? Math.max(...ee) : null;
  const cont = !!nx && L.some(p => p.series && nx.list.some(q => q.series === p.series));
  const s0 = ss.length ? Math.min(...ss) : null;
  D.doors = n ? (s0 != null ? fmtH(s0) : "Late") : "";
  D.end = !n ? "" : cont ? nx.dow : mxE != null ? fmtH(mxE) : "Late";
  D.meta = !n ? "Nothing listed yet" : `${s0 != null ? `Doors from <b>${fmtH(s0)}</b>` : "Doors not posted"} · ${cont ? `runs into <b>${nx.dow}</b>` : mxE != null ? `last call <b>${fmtH(mxE)}${mxE >= 36 && nx ? " " + nx.dow : ""}</b>` : "ends not posted"}`;
  const bs = s0 != null ? s0 : 23, be = mxE != null ? mxE : bs + .5;
  D.bar = n ? { s: bs, se: Math.max(be, bs + .5), de: cont ? 38 : (mxE != null ? mxE : 28) } : null;
  const buzz = L.reduce((s, p) => s + (p.mentions || 0), 0);
  D.feels = n ? `${D.tag ? D.tag + ". " : ""}${top.names[0] || top.n} at ${place(top)}${n > 1 ? `, plus ${n - 1} more` : ""}.${buzz >= 3 ? ` ${buzz} mentions on r/avesNYC.` : ""}` : (D.tag ? `${D.tag}. ` : "") + "Quiet so far. Listings land through the week.";
  D.score = L.reduce((s, p) => s + p.lvl * p.lvl, 0);
});

/* the hour grid for the home field: ten nights, noon to 2P next day */
const COLS = 26, GRID = [];
for (let i = 0; i < FC; i++) { const L = DAYS[i].list; for (let c = 0; c < COLS; c++) { const h = 12 + c; GRID.push({ di: i, h, list: L.filter(p => { const w = win(p); return h + 1 > w.s && h < w.e; }) }); } }
DAYS.slice(0, FC).forEach((D, i) => { let b = -1; for (let c = 0; c < COLS; c++) { const k = i * COLS + c; if (GRID[k].list.length && (b < 0 || GRID[k].list.length > GRID[b].list.length)) b = k; } D.peakIdx = b; });

/* ---------- fronts, worked out from the lineups ---------- */
const ART = {}; EV.forEach(p => p.names.forEach(n => { const k = n.toLowerCase(); (ART[k] = ART[k] || []).push(p); }));
const dl = di => DAYS[di].short;
const FRONTS = (function () {
  const F = [], ser = {};
  EV.forEach(p => { if (p.series) (ser[p.series] = ser[p.series] || []).push(p); });
  for (const k in ser) {
    const a = ser[k].sort((x, y) => x.di - y.di); if (a.length < 2) continue;
    const names = new Set(); a.forEach(p => p.names.forEach(n => names.add(n)));
    const lvl = Math.max(...a.map(p => p.lvl)), venue = place(a[0]), days = a.length;
    const sold = a.filter(p => /^sold out/i.test(p.status || "")).map(p => DAYS[p.di].dow), sale = a.filter(p => /on sale|from \$/i.test(p.status || "")).map(p => DAYS[p.di].dow);
    let text = names.size ? `${names.size} names over ${days} ${days > 2 ? "days" : "nights"} at ${venue}.` : `${days} days at ${venue}. Lineup not posted yet.`;
    if (names.size && names.size <= 4) text = `${days === 2 ? "Two" : days} nights at ${venue} with ${andList([...names])}.`;
    if (sold.length) text += ` ${andList(sold)} sold out.`; if (sale.length) text += ` ${andList(sale)} still on sale.`;
    F.push({ type: days >= 3 && lvl >= 4 ? "Hurricane" : days >= 3 ? "Multi-day system" : "Two-day system", lvl, title: a[0].n.replace(/ · .*$/, ""), dis: a.map(p => p.di), when: `${dl(a[0].di)} → ${dl(a[a.length - 1].di)}`, text, ref: a[a.length > 2 ? 1 : 0].id, ids: a.map(p => p.id) });
  }
  const groups = {};
  for (const k in ART) { const a = ART[k]; if (new Set(a.map(p => p.di)).size < 2) continue; const sig = a.map(p => p.id).join("|"); (groups[sig] = groups[sig] || { a, names: [] }).names.push(a[0].names.find(n => n.toLowerCase() === k)); }
  for (const sig in groups) {
    const g = groups[sig], a = g.a;
    if (a.every(p => p.names.length === g.names.length)) continue;
    if (a.every(p => p.series && p.series === a[0].series) && a.every(p => g.names.length / p.names.length > .6)) continue;
    const same = a.every(p => p.v && p.v === a[0].v);
    let text = same ? `Same venue, back to back: ${a.map(p => DAYS[p.di].dow + " " + fmtH(p.s)).join(", then ")} at ${place(a[0])}.` : `On the move: ${a.map(p => `${dl(p.di)} at ${place(p)}`).join(", then ")}.`;
    const so = a.find(p => /^sold out/i.test(p.status || "")), os = so && a.find(p => /on sale|from \$/i.test(p.status || "") && p.di > so.di);
    if (so && os) text += ` Missed ${DAYS[so.di].dow}? ${DAYS[os.di].dow} is still on sale.`;
    F.push({ type: same ? "Stalled front" : "Moving front", lvl: Math.max(...a.map(p => p.lvl)), title: andList(g.names), dis: a.map(p => p.di), when: a.map(p => dl(p.di)).join(" → "), text, ref: a[0].id, ids: a.map(p => p.id) });
  }
  const byV = {}; EV.forEach(p => { if (p.v) (byV[p.v] = byV[p.v] || []).push(p); });
  for (const k in byV) {
    const a = byV[k], nights = [...new Set(a.map(p => p.di))]; if (nights.length < 4) continue; if (a.every(p => p.series && p.series === a[0].series)) continue;
    F.push({ type: "High pressure", lvl: Math.max(...a.map(p => p.lvl)), title: VEN[k].n, dis: nights, when: `${dl(Math.min(...nights))} → ${dl(Math.max(...nights))}`,
      text: `${nights.length} nights on the board: ${andList([...new Set(a.map(p => p.series ? p.n.replace(/ · .*$/, "") : (p.names[0] || p.n)))].slice(0, 6))}.`, ref: a[0].id, ids: a.map(p => p.id) });
  }
  EV.forEach(p => {
    if (p.s != null && p.e != null && p.e - p.s >= 13 && DAYS[p.di + 1]) F.push({ type: "Long-duration storm", lvl: p.lvl, title: `${p.names[0] || p.n} at ${p.n.replace(/ Halloween$/, "")}`, dis: [p.di, p.di + 1], when: `${DAYS[p.di].dow} ${fmtH(p.s)} → ${DAYS[p.di + 1].dow} ${fmtH(p.e)}`, text: `${Math.round(p.e - p.s)} hours at ${place(p)}${p.names.length > 1 ? ` with ${andList(p.names.slice(1, 4))}` : ""}.${p.status ? " " + p.status + "." : ""}`, ref: p.id, ids: [p.id] });
    p.names.forEach(n => { if (/ b2b /i.test(n)) F.push({ type: "Cells merging", lvl: p.lvl, title: n, dis: [p.di], when: dl(p.di), text: `A back-to-back set inside ${p.n.replace(/ · .*$/, "")}${p.names.length > 1 ? `, alongside ${andList(p.names.filter(x => x !== n).slice(0, 3))}` : ""}.`, ref: p.id, ids: [p.id] }); });
    if (p.final) F.push({ type: "Dissipating", lvl: p.lvl, title: place(p), dis: [p.di], when: dl(p.di), text: `${p.n}${p.names.length ? ` with ${andList(p.names)}` : ""}. Billed as the venue’s final night.`, ref: p.id, ids: [p.id] });
  });
  F.sort((a, b) => b.lvl - a.lvl || Math.min(...a.dis) - Math.min(...b.dis)); return F;
})();

/* ---------- icons, after Isobar's set ---------- */
const CL = "M7 15h10a3.6 3.6 0 0 0 .4-7.18A5.2 5.2 0 0 0 7.5 8a3.5 3.5 0 0 0-.5 7z";
function icon(kind) {
  const s = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
  const cloud = `<g class="a-drift"><path d="${CL}"/></g>`; let g;
  switch (kind) {
    case "clear": g = '<g class="a-rock"><path d="M19.5 14.6A7.8 7.8 0 1 1 9.4 4.5a6.3 6.3 0 0 0 10.1 10.1z"/></g>'; break;
    case "drizzle": g = cloud + '<g stroke="var(--cool)"><path class="a-drop" d="M8.5 17.5l-1 3"/><path class="a-drop d2" d="M12.5 17.5l-1 3"/><path class="a-drop d3" d="M16.5 17.5l-1 3"/></g>'; break;
    case "storm": g = cloud + '<path class="a-bolt" d="M12.5 15.5l-2.5 3.5h3.5l-2 3.5" stroke="var(--warm)"/>'; break;
    case "severe": g = cloud + '<path class="a-bolt" d="M13.5 15.5l-2.5 3.5h3.5l-2 3.5" stroke="var(--l5)"/><path class="a-bolt d2" d="M8.6 15.5l-1.6 2.6h2.3l-1.3 2.4" stroke="var(--warm)"/>'; break;
    default: g = cloud;
  }
  return `<g ${s}>${g}</g>`;
}
const svgI = (kind, color) => `<svg viewBox="0 0 24 24" aria-hidden="true" style="color:${color}">${icon(kind)}</svg>`;
const pIcon = p => p.lvl >= 5 ? "severe" : p.lvl >= 4 ? "storm" : "drizzle";
const dColor = D => D.count ? lv(D.lvl) : "var(--muted)";

/* ---------- state ---------- */
function biggestSoon() { let b = 0; for (let i = 0; i < 3; i++) if (DAYS[i].count > DAYS[b].count) b = i; return b; }
const st = { di: biggestSoon(), mode: store.get("dw.mode", "radar"), strip: "nights", sel: null, cell: -1, ready: false, loop: 0, lastFocus: null,
  rdi: biggestSoon(), rsel: null, rloop: 0, mdi: 0, fcClosed: new Set(), page: "home", nav: 0, alerts: new Set(store.get("dw.alerts", [])) };
if (st.mode !== "radar" && st.mode !== "week") st.mode = "radar";
const topParty = i => { let b = null; DAYS[i].list.forEach(p => { if (p.v && (!b || p.lvl > b.lvl)) b = p; }); return b; };
const bestAt = (i, key) => { let b = null; DAYS[i].list.forEach(p => { if (p.v === key && (!b || p.lvl > b.lvl)) b = p; }); return b; };
const ageH = (Date.now() - Date.parse(DATA.updated || 0)) / 36e5;
const updatedLabel = !isFinite(ageH) ? "unknown" : ageH < 1 ? "under an hour ago" : ageH < 36 ? `${Math.round(ageH)} hours ago` : `${Math.round(ageH / 24)} days ago`;

/* ---------- shared pieces ---------- */
function showItem(p) { return `<a class="show" href="#party-${encodeURIComponent(p.id)}" style="--c:${lv(p.lvl)}"><span class="st mono">${p.s != null ? fmtH(p.s) : "Late"}</span><span class="sb"><b><i></i>${esc(p.n)}</b><span>${esc(namesShort(p))}</span><span class="sv">${esc(place(p))}${p.status ? ` · <em>${esc(p.status)}</em>` : ""}</span></span>${CHEV}</a>`; }
const pct = h => ((Math.min(38, Math.max(12, h)) - 12) / 26 * 100).toFixed(1) + "%";
function trk(D) {
  if (!D.bar) return `<span class="pend">Nothing listed</span>`; const b = D.bar;
  return `<span class="trk" style="--c:${lv(D.lvl)}"><i style="left:${pct(b.s)};width:calc(${pct(b.se)} - ${pct(b.s)})"></i>${b.de > b.se ? `<i class="est" style="left:${pct(b.se)};width:calc(${pct(b.de)} - ${pct(b.se)})"></i>` : ""}</span>`;
}

/* ---------- 3D type ---------- */
function x3d(el, html, n, step, cls, key) {
  if (el.dataset.v === key) return false; el.dataset.v = key;
  let s = `<span class="ly sh" aria-hidden="true" style="transform:translateZ(${(-(n + 3) * step).toFixed(1)}px) translate3d(3px,6px,0)">${html}</span>`;
  for (let k = n; k >= 1; k--) {
    const p = Math.round(50 + 42 * (1 - (k - 1) / Math.max(1, n - 1)));
    s += `<span class="ly${k > 4 ? " deep" : ""}" aria-hidden="true" style="transform:translateZ(${(-k * step).toFixed(1)}px);color:color-mix(in srgb,var(--tone) ${p}%,var(--shade))">${html}</span>`;
  }
  s += `<span class="face">${html}</span>`;
  el.innerHTML = `<span class="x3d ${cls}${st.ready && !reduce ? " in" : ""}">${s}</span>`;
  return true;
}
function fitCond() {
  const ce = $("#cond"), face = ce && ce.querySelector(".face"); if (!face) return;
  ce.style.fontSize = ""; let fs = parseFloat(getComputedStyle(ce).fontSize) || 24;
  while (face.scrollWidth > face.clientWidth + 1 && fs > 13) { fs -= 1; ce.style.fontSize = fs + "px"; }
}
addEventListener("resize", () => { clearTimeout(fitCond.t); fitCond.t = setTimeout(() => { fitCond(); FX.measure(); }, 120); });

/* ---------- storm effects behind and in front of the hero type ---------- */
const FX = (() => {
  const host = $("#hero"), cb = $("#fxb"), cf = $("#fxf");
  const bx = cb.getContext && cb.getContext("2d"), fx = cf.getContext && cf.getContext("2d");
  if (!bx || !fx || reduce) return { set() {}, measure() {}, recolor() {}, resume() {} };
  let W = 0, H = 0, mode = "", raf = 0, last = 0, tr = null, flash = 0, bolt = null, boltLife = 0, nextZap = 0;
  let drops = [], puffs = [], stars = [], splash = [], beams = [];
  const col = { ink: [19, 32, 42], light: true };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
  const hex = s => { s = String(s).trim(); if (s[0] !== "#") { const m = s.match(/[\d.]+/g); return m ? m.slice(0, 3).map(Number) : [0, 0, 0]; } if (s.length === 4) s = "#" + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]; return [1, 3, 5].map(k => parseInt(s.slice(k, k + 2), 16)); };
  function readColors() {
    const cs = getComputedStyle(host), bg = hex(cs.backgroundColor);
    col.light = (.2126 * bg[0] + .7152 * bg[1] + .0722 * bg[2]) / 255 > .5; col.ink = hex(cs.color);
    ["cool", "warm", "storm", "l3", "l5"].forEach(k => col[k] = hex(cs.getPropertyValue("--" + k)));
  }
  function measure() {
    const hr = host.getBoundingClientRect(); if (!hr.width) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (Math.round(hr.width * dpr) !== cb.width || Math.round(hr.height * dpr) !== cb.height) {
      W = hr.width; H = hr.height;
      for (const c of [cb, cf]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
      bx.setTransform(dpr, 0, 0, dpr, 0, 0); fx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    const f = host.querySelector("#num .face");
    if (f) { const r = f.getBoundingClientRect(); tr = { l: r.left - hr.left + 2, r: r.right - hr.left - 60, t: r.top - hr.top + r.height * .14 }; } else tr = null;
  }
  function seed() {
    const k = W / 330; drops = []; puffs = []; stars = []; splash = []; beams = []; bolt = null; flash = 0;
    const amt = { drizzle: .3, storm: .7, severe: 1 }[mode] || 0;
    if (amt) { const n = Math.round(k * (20 + 70 * amt)); for (let j = 0; j < n; j++) drops.push({ x: rnd(-20, W + 20), y: rnd(-H, H), l: rnd(8, 15) * (.7 + amt * .5), v: rnd(380, 560) * (.8 + amt * .4), a: rnd(.16, .36), s: .1 + amt * .12 }); }
    const np = { drizzle: 3, storm: 5, severe: 5 }[mode] || 0;
    for (let j = 0; j < np; j++) { const sc = rnd(.7, 1.3); puffs.push({ x: rnd(-60, W), y: rnd(-14, H * .35), sc, v: rnd(5, 11), b: [0, 1, 2, 3].map(q => ({ dx: (q - 1.5) * 26 * sc + rnd(-6, 6), dy: rnd(-10, 6) * sc, r: rnd(22, 34) * sc })) }); }
    if (mode === "night") for (let j = 0; j < Math.round(k * 34); j++) stars.push({ x: rnd(0, W), y: rnd(0, H * .85), r: rnd(.5, 1.5), ph: rnd(0, 6.3), sp: rnd(1, 3) });
    if (mode === "severe") [[.1, -1.15, "l5"], [.9, -1.99, "l3"], [.55, -1.57, "l5"]].forEach(([x, a, c]) => beams.push({ ox: x * W, base: a, sw: rnd(.24, .38), sp: rnd(.35, .6), ph: rnd(0, 6.3), c }));
    nextZap = performance.now() / 1000 + rnd(1, 3);
  }
  function makeBolt() { const pts = []; let x = rnd(.15, .85) * W, y = 0; const end = rnd(.45, .85) * H; pts.push([x, y]); while (y < end) { y += rnd(8, 18); x += rnd(-14, 14); pts.push([x, y]); } return pts; }
  function draw(dt, t) {
    bx.clearRect(0, 0, W, H); fx.clearRect(0, 0, W, H);
    const L = col.light, ink = col.ink, white = [255, 255, 255];
    for (const b of beams) {
      const a = b.base + Math.sin(t * b.sp + b.ph) * b.sw, len = Math.hypot(W, H) * 1.15, oy = H + 6, ex = b.ox + Math.cos(a) * len, ey = oy + Math.sin(a) * len, c = col[b.c];
      const g = bx.createLinearGradient(b.ox, oy, ex, ey); g.addColorStop(0, rgba(c, 0)); g.addColorStop(.22, rgba(c, L ? .4 : .55)); g.addColorStop(1, rgba(c, 0));
      bx.strokeStyle = g; bx.lineCap = "round"; bx.beginPath(); bx.moveTo(b.ox, oy); bx.lineTo(ex, ey); bx.globalAlpha = .22; bx.lineWidth = 12; bx.stroke(); bx.globalAlpha = 1; bx.lineWidth = 1.6; bx.stroke();
    }
    for (const s of stars) { const a = .35 + .65 * (.5 + .5 * Math.sin(t * s.sp + s.ph)); bx.fillStyle = rgba(L ? ink : white, a * (L ? .45 : .85)); bx.beginPath(); bx.arc(s.x, s.y, s.r, 0, 6.283); bx.fill(); }
    for (const p of puffs) {
      p.x += p.v * dt; if (p.x - 80 * p.sc > W) p.x = -90 * p.sc;
      for (const b of p.b) { const g = bx.createRadialGradient(p.x + b.dx, p.y + b.dy, 0, p.x + b.dx, p.y + b.dy, b.r); const c = L ? ink : [0, 0, 0], a = L ? .08 : .22;
        g.addColorStop(0, rgba(c, a)); g.addColorStop(1, rgba(c, 0)); bx.fillStyle = g; bx.beginPath(); bx.arc(p.x + b.dx, p.y + b.dy, b.r, 0, 6.283); bx.fill(); }
    }
    if (mode === "storm" || mode === "severe") {
      if (t > nextZap) {
        bolt = makeBolt(); boltLife = .26; flash = 1; nextZap = t + rnd(mode === "severe" ? 2 : 3, mode === "severe" ? 5 : 8);
        host.classList.remove("zap"); void host.offsetWidth; host.classList.add("zap"); setTimeout(() => host.classList.remove("zap"), 420);
        setTimeout(() => { flash = Math.max(flash, .55); }, 120);
      }
      if (flash > 0) { bx.fillStyle = rgba(white, flash * (L ? .5 : .24)); bx.fillRect(0, 0, W, H); flash = Math.max(0, flash - dt * 4); }
      if (bolt && boltLife > 0) { boltLife -= dt; const a = Math.min(1, boltLife * 5), bc = mode === "severe" ? col.l5 : col.storm;
        for (const [w, c, al] of [[7, bc, .35], [2, white, .95]]) { bx.strokeStyle = rgba(c, al * a); bx.lineWidth = w; bx.lineJoin = "round"; bx.beginPath(); bolt.forEach(([x, y], k) => k ? bx.lineTo(x, y) : bx.moveTo(x, y)); bx.stroke(); } }
    }
    if (drops.length) {
      bx.lineCap = "round"; bx.lineWidth = 1.2; const dc = L ? ink : [200, 222, 242];
      for (const d of drops) {
        d.y += d.v * dt; d.x += d.v * d.s * dt;
        const onT = tr && d.x > tr.l && d.x < tr.r && d.y >= tr.t && d.y - d.v * dt < tr.t;
        if (onT) { for (let q = 0; q < 3; q++) splash.push({ x: d.x, y: tr.t, vx: rnd(-60, 60), vy: rnd(-110, -50), life: rnd(.25, .45) }); d.y = rnd(-40, -10); d.x = rnd(-30, W); }
        else if (d.y > H + 20) { d.y = rnd(-40, -10); d.x = rnd(-30, W); }
        bx.strokeStyle = rgba(dc, d.a); bx.beginPath(); bx.moveTo(d.x, d.y); bx.lineTo(d.x - d.l * d.s, d.y - d.l); bx.stroke();
      }
    }
    for (let j = splash.length - 1; j >= 0; j--) { const s = splash[j]; s.life -= dt; if (s.life <= 0) { splash.splice(j, 1); continue; }
      s.vy += 420 * dt; s.x += s.vx * dt; s.y += s.vy * dt; fx.fillStyle = rgba(L ? ink : [220, 232, 245], s.life * 1.4); fx.beginPath(); fx.arc(s.x, s.y, 1.2, 0, 6.283); fx.fill(); }
  }
  function tick(ms) { if (document.hidden || !host.offsetParent) { raf = 0; return; } const t = ms / 1000, dt = last ? Math.min(.05, t - last) : .016; last = t; draw(dt, t); raf = requestAnimationFrame(tick); }
  function begin() { if (!raf) { last = 0; raf = requestAnimationFrame(tick); } }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) begin(); });
  return { set(m) { mode = m; readColors(); measure(); seed(); begin(); }, measure() { const w = W; measure(); if (W !== w) seed(); }, recolor() { readColors(); }, resume() { measure(); begin(); } };
})();
const reColor = () => FX.recolor();
if (window.matchMedia) matchMedia("(prefers-color-scheme: dark)").addEventListener("change", reColor);
new MutationObserver(reColor).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

/* ================= HOME ================= */
const MOOD = { clear: "--mood-night", drizzle: "--mood-rain", storm: "--mood-storm", severe: "--mood-severe" };
const TONE = { clear: "--accent", drizzle: "--cool", storm: "--storm", severe: "--l5" };
const fxName = k => k === "clear" ? "night" : k;
$("#rangeLbl").textContent = `${DAYS[0].short} – ${DAYS[FC - 1].short}`;
function renderHero() {
  const D = DAYS[st.di], hero = $("#hero");
  hero.dataset.fx = fxName(D.kind);
  hero.style.setProperty("--mood", `var(${MOOD[D.kind]})`);
  hero.style.setProperty("--tone", `var(${TONE[D.kind]})`);
  $("#whenTag").textContent = (st.di === 0 ? "Tonight · " : "") + D.full + (D.tag ? " · " + D.tag : "");
  $("#backNow").hidden = st.di === 0;
  x3d($("#num"), `${D.count || "–"}<sup>parties</sup>`, 7, 2.2, "txt", "n" + st.di + ":" + D.count);
  $("#num").setAttribute("aria-label", D.count ? `${D.count} parties listed` : "No listings yet");
  x3d($("#hicon"), `<svg viewBox="0 0 24 24" aria-hidden="true">${icon(D.kind)}</svg>`, 6, 1.6, "ic", "i" + D.kind);
  if (x3d($("#cond"), esc(D.cond), 5, 1.2, "txt", "c" + st.di + D.cond)) fitCond();
  $("#hmeta").innerHTML = D.meta;
  $("#hfeels").innerHTML = `<span class="label">Feels like</span>${esc(D.feels)}`;
  const sold = D.list.filter(p => /^sold out/i.test(p.status || "")).length, buzz = D.list.reduce((s, p) => s + (p.mentions || 0), 0);
  const fr = FRONTS.filter(f => f.dis.includes(st.di)).length, pk = D.peakIdx >= 0 ? GRID[D.peakIdx] : null;
  const M = [["hours", "Doors", D.doors || "–"], ["hours", "Last call", D.end || "–"], ["hours", "Peak", pk ? `${pk.list.length}<small>at ${fmtH(pk.h)}</small>` : "–"],
    ["sold", "Sold out", sold], ["buzz", "Mentions", buzz], ["fronts", "Fronts", fr]];
  $("#dock").innerHTML = M.map(([k, l, v]) => k === "fronts" ? `<a class="m" href="#fronts"><span class="label">${l}</span><span class="val">${v}</span></a>` : `<button type="button" class="m" data-sheet="${k}"><span class="label">${l}</span><span class="val">${v}</span></button>`).join("");
  requestAnimationFrame(() => FX.measure());
}
function renderStrip() {
  const row = $("#row"), D = DAYS[st.di];
  $("#tabN").setAttribute("aria-pressed", String(st.strip === "nights")); $("#tabT").setAttribute("aria-pressed", String(st.strip === "names"));
  if (st.strip === "nights") {
    row.className = "row nights"; $("#slabel").textContent = "Next 10 nights";
    row.innerHTML = DAYS.slice(0, FC).map((n, i) => `<button type="button" class="col${i === st.di ? " sel" : ""}${i === 0 ? " now" : ""}" data-di="${i}" aria-pressed="${i === st.di}" aria-label="${esc(n.full)}: ${n.count ? n.count + " parties, " + esc(n.cond) : "nothing listed yet"}"><span class="t">${i === 0 ? "Tdy" : n.dow}</span>${svgI(n.kind, dColor(n))}<span class="v">${n.count || "–"}</span><span class="lo">${n.d}</span></button>`).join("");
  } else {
    row.className = "row names"; $("#slabel").textContent = `${D.dow} · by doors`;
    row.innerHTML = D.count ? sortShows(D.list).map(p => `<a class="col w" href="#party-${encodeURIComponent(p.id)}"><span class="t mono">${p.s != null ? fmtH(p.s) : "Late"}</span>${svgI(pIcon(p), lv(p.lvl))}<span class="nm">${esc(p.names[0] || p.n)}</span><span class="vn">${esc(place(p))}</span></a>`).join("") : `<p class="empty">Nothing listed for ${esc(D.dow)} yet.</p>`;
  }
}
function renderRead() {
  const el = $("#fread"), D = DAYS[st.di];
  $("#loopBtn").hidden = st.mode !== "radar";
  $("#fhint").textContent = st.mode === "radar" ? "Drag to turn · tap a tower" : "Drag to turn · tap an hour";
  $$(".mchips button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode === st.mode)));
  if (st.mode === "radar") {
    const key = st.sel || (topParty(st.di) || {}).v, p = key ? bestAt(st.di, key) : null;
    if (!p) { el.innerHTML = `<span class="when">${esc(D.dow)} · Radar</span><div class="big"><b>Clear</b></div><div class="sub">Nothing on the map yet.</div>`; return; }
    el.innerHTML = `<span class="when">${esc(D.dow)} · ${esc(VEN[key].n)} · ${esc(VEN[key].a)}</span><div class="big"><b>${esc(p.n)}</b></div><div class="sub">${esc(namesShort(p))}</div><div class="sub"><span style="color:${lv(p.lvl)};font-weight:600">${LVL[p.lvl]} draw</span> · ${p.s != null ? "Doors " + fmtH(p.s) : "Doors not posted"} · <a href="#party-${encodeURIComponent(p.id)}">Details</a></div>`;
  } else {
    const g = GRID[st.cell];
    if (!g) { el.innerHTML = `<span class="when">${esc(D.dow)}</span><div class="big"><b>Nothing on</b></div><div class="sub">Tap any block to read that hour.</div>`; return; }
    const n = g.list.length, Dn = DAYS[g.di];
    el.innerHTML = `<span class="when">${esc(Dn.dow)} ${Dn.d} · ${fmtH(g.h)} to ${fmtH(g.h + 1)}</span><div class="big"><b>${n}<small>on</small></b><span style="color:${n ? lv(maxLvl(g.list)) : "var(--muted)"}">${n ? LVL[maxLvl(g.list)] : "Nothing on"}</span></div><div class="sub">${esc(g.list.slice(0, 3).map(p => p.names[0] || p.n).join(", "))}${n > 3 ? " +" + (n - 3) : ""}</div><div class="sub">Times not posted count as 11P to 4A</div>`;
  }
}
function setDay(i, why) {
  if (i < 0 || i >= FC) return;
  if (why !== "loop") stopLoop();
  st.di = i; st.sel = null; st.cell = DAYS[i].peakIdx;
  renderHero(); renderStrip();
  if (Field) { Field.setNight(i, DAYS[i]); const tp = topParty(i); Field.selectVenue(tp ? tp.v : null); Field.selectCell(st.cell); }
  renderRead(); FX.set(fxName(DAYS[i].kind));
}
function setMode(m) { stopLoop(); st.mode = m; store.set("dw.mode", m); if (Field) Field.setMode(m); renderRead(); }
const loopIcons = (btn, on) => { btn.setAttribute("aria-pressed", String(on)); btn.querySelector(".loopIco").setAttribute("d", on ? "M6 4h4v16H6zM14 4h4v16h-4z" : "M7 4.5v15l12-7.5z"); };
function startLoop() {
  if (st.loop) return; const nights = DAYS.slice(0, FC).map((n, i) => n.count ? i : -1).filter(i => i >= 0); if (!nights.length) return;
  st.loop = setInterval(() => { const k = nights.indexOf(st.di); setDay(nights[(k + 1) % nights.length], "loop"); }, 1700); loopIcons($("#loopBtn"), true);
}
function stopLoop() { if (!st.loop) return; clearInterval(st.loop); st.loop = 0; loopIcons($("#loopBtn"), false); }
if (Field) {
  Field.setGrid(GRID);
  const h = nyHour(); Field.setNow(h >= 12 ? h - 12 : null);
  Field.onPick = r => {
    stopLoop();
    if (r.type === "venue") { st.sel = r.key; Field.selectVenue(r.key); }
    else { const g = GRID[r.i]; if (g.di !== st.di) setDay(g.di, "cell"); st.cell = r.i; Field.selectCell(r.i); }
    renderRead();
  };
} else { $("#nogl").hidden = false; $("#fhint").hidden = true; }

/* ================= 10-DAY ================= */
function renderForecast() {
  const F = DAYS.slice(0, FC), tot = F.reduce((s, D) => s + D.count, 0);
  $("#fcSub").textContent = `${F[0].short} – ${F[FC - 1].short} · ${tot} parties · updated ${updatedLabel}`;
  $("#fcToggle").textContent = st.fcClosed.size >= FC ? "Expand all" : "Collapse all";
  $("#fcList").innerHTML = F.map((D, i) => {
    const open = !st.fcClosed.has(i);
    const head = `<button type="button" class="frow" data-fc="${i}" aria-expanded="${open}" aria-label="${esc(D.full)}, ${D.count ? D.count + " parties, " + esc(D.cond) : "nothing listed yet"}"><span class="dl"><b>${i === 0 ? "Today" : D.dow}</b><span>${D.short}</span></span>${svgI(D.kind, dColor(D))}<span class="ct">${D.count || "–"}</span><span class="dr">${D.doors}</span>${trk(D)}<span class="en">${D.end}</span></button>`;
    if (!open) return `<section class="fday">${head}<p class="fprev">${esc(D.count ? sortShows(D.list).slice(0, 3).map(p => p.names[0] || p.n).join(", ") + (D.count > 3 ? ` +${D.count - 3}` : "") : "Nothing listed yet")}</p></section>`;
    return `<section class="fday open">${head}<div class="fbody"><div class="fhead2"><p class="ffeel">${esc(D.feels)}</p><span class="fcond" style="--c:${dColor(D)}">${esc(D.cond)}</span></div>${D.count ? sortShows(D.list).map(showItem).join("") + `<a class="goday" href="#home" data-goday="${i}">See ${i ? D.dow + " " + D.d : "tonight"} on the 3D radar</a>` : `<p class="note" style="padding:0 4px 10px">Nothing listed yet. Listings land through the week.</p>`}</div></section>`;
  }).join("");
}

/* ================= MONTH ================= */
function renderMonth() {
  const w0 = DAYS[0].w, start = Date.UTC(ty, tm - 1, td - w0), cells = [];
  for (let k = 0; k < 42; k++) { const dt = new Date(start + k * 864e5), key = dt.toISOString().slice(0, 10); cells.push({ d: dt.getUTCDate(), m: dt.getUTCMonth(), i: DI[key] }); }
  const tot = DAYS.reduce((s, D) => s + D.count, 0);
  $("#moSub").textContent = `${tot} parties announced through ${DAYS[NDAYS - 1].short} · tap a day`;
  $("#cal").innerHTML = DOW.map(d => `<span class="hd">${d.slice(0, 2)}</span>`).join("") + cells.map(c => {
    if (c.i == null) return `<span class="cd off" aria-hidden="true"><span class="dn">${c.d === 1 ? MON[c.m] + " 1" : c.d}</span></span>`;
    const D = DAYS[c.i];
    return `<button type="button" class="cd${D.count ? " has" : ""}${c.i === 0 ? " today" : ""}${c.i === st.mdi ? " sel" : ""}" data-md="${c.i}" aria-pressed="${c.i === st.mdi}" style="--c:${dColor(D)}" aria-label="${esc(D.full)}: ${D.count ? D.count + " parties, " + esc(D.cond) : "nothing listed yet"}"><span class="dn">${D.d === 1 ? MON[D.m] + " 1" : D.d}</span>${D.count ? svgI(D.kind, dColor(D)) : `<span></span>`}<span class="cc">${D.count || ""}</span></button>`;
  }).join("");
  const D = DAYS[st.mdi];
  $("#mday").innerHTML = `<h3>${esc(D.full)}${D.tag ? " · " + esc(D.tag) : ""}</h3><p class="mm"><span style="color:${dColor(D)};font-weight:600">${esc(D.cond)}</span> · ${D.meta}</p>${D.count ? sortShows(D.list).map(showItem).join("") : `<p class="note" style="padding:0 4px 10px">Nothing announced yet.</p>`}${st.mdi < FC && D.count ? `<a class="goday" href="#home" data-goday="${st.mdi}">See it on the 3D radar</a>` : ""}`;
  const top = DAYS.filter(D => D.count).sort((a, b) => b.score - a.score).slice(0, 6);
  $("#rank").innerHTML = top.length ? top.map((D, k) => `<button type="button" class="rk" data-md="${D.i}"><span class="n">${k + 1}</span>${svgI(D.kind, dColor(D))}<span><b>${esc(D.full)}${D.tag ? " · " + esc(D.tag) : ""}</b><span>${esc(D.list.slice().sort((a, b) => b.lvl - a.lvl).slice(0, 3).map(p => p.names[0] || p.n).join(", "))}</span></span><span class="ct">${D.count}</span></button>`).join("") : `<p class="note" style="padding:12px">No listings yet.</p>`;
}

/* ================= FRONTS ================= */
function frontTrack(f) {
  const x = di => ((di + .5) / DAYS.length * 100).toFixed(2); const lo = Math.min(...f.dis), hi = Math.max(...f.dis);
  return `<div class="tlt" style="--c:${lv(f.lvl)}" aria-hidden="true"><span class="nowl" style="left:${x(0)}%"></span>${hi > lo ? `<span class="ln" style="left:${x(lo)}%;width:${(x(hi) - x(lo)).toFixed(2)}%"></span>` : ""}${f.dis.map(d => `<span class="dt" style="left:${x(d)}%"></span>`).join("")}</div>`;
}
function renderFronts() {
  const ticks = [0, 7, 14, 21, 28, 35].filter(i => i < DAYS.length).map(i => `<span style="left:${((i + .5) / DAYS.length * 100).toFixed(1)}%">${DAYS[i].short}</span>`).join("");
  if (!FRONTS.length) { $("#tl").innerHTML = `<p class="note">No crossovers in the current listings.</p>`; $("#fcards").innerHTML = ""; return; }
  $("#tl").innerHTML = `<div class="tlax" aria-hidden="true">${ticks}</div>` + FRONTS.map(f => `<a class="tlr" href="#party-${encodeURIComponent(f.ref)}" style="--c:${lv(f.lvl)}"><span class="tn"><em>${esc(f.type)}</em><b>${esc(f.title)}</b></span>${frontTrack(f)}</a>`).join("");
  $("#fcards").innerHTML = FRONTS.map(f => `<article class="fcard" style="--c:${lv(f.lvl)}"><div class="fhd"><span class="ftype">${esc(f.type)}</span><span class="fwhen mono">${esc(f.when)}</span></div><h3>${esc(f.title)}</h3><p>${esc(f.text)}</p>${frontTrack(f)}<a href="#party-${encodeURIComponent(f.ref)}">Open the party →</a></article>`).join("");
}

/* ================= RADAR ================= */
function cellBg(n) { const parts = [], step = 66 / n; for (let k = n; k >= 1; k--) parts.push(`color-mix(in srgb,var(--l${k}) 80%,transparent) ${Math.round((n - k + 1) * step)}%`); return `radial-gradient(circle,${parts.join(",")},transparent 72%)`; }
function renderRadar() {
  const D = DAYS[st.rdi];
  $("#rSub").textContent = `${D.full} · ${D.count ? D.count + " parties" : "nothing listed yet"}`;
  $("#rpills").innerHTML = DAYS.slice(0, FC).map((n, i) => `<button type="button" class="dp" data-rd="${i}" aria-pressed="${i === st.rdi}">${i === 0 ? "Today" : n.dow}<span>${n.short}</span></button>`).join("");
  const on = {}; D.list.forEach(p => { if (p.v && (!on[p.v] || p.lvl > on[p.v].lvl)) on[p.v] = p; });
  const keys = Object.keys(on).sort((a, b) => on[b].lvl - on[a].lvl);
  const sel = st.rsel && on[st.rsel] ? st.rsel : keys[0];
  const SZ = [0, 46, 56, 68, 86, 112];
  $("#rcells").innerHTML = keys.map((k, j) => { const v = VEN[k], p = on[k]; return `<button type="button" class="rc" data-rv="${esc(k)}" aria-label="${esc(p.n)} at ${esc(v.n)}, ${LVL[p.lvl]} draw" aria-pressed="${k === sel}" style="left:${(v.x / 390 * 100).toFixed(2)}%;top:${(v.y / 440 * 100).toFixed(2)}%;width:${(SZ[p.lvl] / 390 * 100).toFixed(2)}%;background:${cellBg(p.lvl)};animation-delay:${(j * .37).toFixed(2)}s"></button>`; }).join("")
    + keys.map(k => { const v = VEN[k]; return `<span class="rdot${k === sel ? " sel" : ""}" style="left:${(v.x / 390 * 100).toFixed(2)}%;top:${(v.y / 440 * 100).toFixed(2)}%"></span>`; }).join("")
    + keys.filter(k => on[k].lvl >= 4 || k === sel).map(k => { const v = VEN[k], right = v.x > 270; return `<span class="rlab" style="left:${((right ? v.x - 10 : v.x + 10) / 390 * 100).toFixed(2)}%;top:${((v.y - 30) / 440 * 100).toFixed(2)}%;transform:translateX(${right ? "-100%" : "0"})">${esc(v.n)}</span>`; }).join("");
  const p = sel ? on[sel] : null;
  $("#rsel").innerHTML = p ? `<span class="lvl" style="--c:${lv(p.lvl)}">${LVL[p.lvl]} draw</span><h3>${esc(p.n)}</h3><p>${esc(place(p))} · ${esc(areaOf(p))} · ${p.s != null ? "Doors " + fmtH(p.s) : "Doors not posted"}${p.status ? " · " + esc(p.status) : ""}</p><p>${esc(namesShort(p))}</p><a href="#party-${encodeURIComponent(p.id)}">Open the party →</a>` : `<span class="lvl" style="--c:var(--muted)">Clear</span><h3>Nothing on the map</h3><p>No parties with an address are listed for ${esc(D.full)} yet.</p>`;
  const un = D.list.filter(p => !p.v).length;
  $("#rListH").textContent = D.count ? `Every party ${D.dow} ${D.d}${un ? ` · ${un} not on the map yet` : ""}` : "Every party that night";
  $("#rlist").innerHTML = D.count ? sortShows(D.list).map(showItem).join("") : `<p class="note" style="padding:14px 6px">Nothing listed yet.</p>`;
}
function startRLoop() {
  if (st.rloop) return; const nights = DAYS.slice(0, FC).map((n, i) => n.count ? i : -1).filter(i => i >= 0); if (!nights.length) return;
  st.rloop = setInterval(() => { const k = nights.indexOf(st.rdi); st.rdi = nights[(k + 1) % nights.length]; st.rsel = null; renderRadar(); }, 1600); loopIcons($("#rLoop"), true);
}
function stopRLoop() { if (!st.rloop) return; clearInterval(st.rloop); st.rloop = 0; loopIcons($("#rLoop"), false); }

/* ================= PARTY ================= */
function renderParty(id) {
  const p = BYID[id], el = $("#party");
  const back = `<button type="button" class="back" data-back><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>Back</button>`;
  if (!p) { el.innerHTML = `<div class="ptop">${back}</div><p class="note" style="margin-top:20px">That party isn’t in the current listings. It may have already happened.</p>`; return; }
  const D = DAYS[p.di], c = lv(p.lvl), mood = p.lvl >= 5 ? "--mood-severe" : p.lvl >= 4 ? "--mood-storm" : p.lvl >= 2 ? "--mood-rain" : "--mood-night";
  const also = n => (ART[n.toLowerCase()] || []).filter(q => q.id !== p.id).map(q => DAYS[q.di].short);
  const fr = FRONTS.filter(f => f.ids.includes(p.id));
  const near = p.v ? D.list.filter(q => q !== p && q.v && q.v !== p.v && Math.hypot(VEN[q.v].x - VEN[p.v].x, VEN[q.v].y - VEN[p.v].y) < 70) : [];
  const others = [], seen = new Set([p.id]);
  p.names.forEach(n => (ART[n.toLowerCase()] || []).forEach(q => { if (!seen.has(q.id)) { seen.add(q.id); others.push(q); } }));
  EV.forEach(q => { if (p.series && q.series === p.series && !seen.has(q.id)) { seen.add(q.id); others.push(q); } });
  others.sort((a, b) => a.di - b.di);
  const on = st.alerts.has(p.id), big = p.names.slice(0, 4), rest = p.names.slice(4);
  const sold = /^sold out/i.test(p.status || ""), price = /\$/.test(p.status || "") ? p.status.replace(/ ·.*/, "") : null;
  const url = safeUrl(p.url), srcs = (p.srcs || [p.src]).filter(Boolean);
  const ch = p.chatter, chUrl = ch && safeUrl(ch.url);
  el.innerHTML = `
  <div class="ptop">${back}
    <button type="button" class="alertbtn" data-alert="${esc(p.id)}" aria-pressed="${on}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>${on ? "Saved" : "Save"}</button></div>
  <section class="phero" style="--mood:var(${mood});--c:${c}">
    <div class="badge">${svgI(pIcon(p), c)}${LVL[p.lvl]}${p.status ? " · " + esc(p.status) : ""}</div>
    <h1>${esc(p.n)}</h1>
    <p class="pw">${esc(D.full)} · ${p.s != null ? "Doors " + fmtH(p.s) : "Doors not posted"}</p>
    <p class="pp">${esc(place(p))} · ${esc(areaOf(p))}${p.by ? `<br>${esc(p.by)}` : ""}</p>
  </section>
  <div class="sec"><h2>Top names</h2><div class="names">${big.length ? `<ul>${big.map(n => { const a = also(n); return `<li><b>${esc(n)}</b>${a.length ? `<span>also ${esc(a.join(", "))}</span>` : ""}</li>`; }).join("")}</ul>${rest.length ? `<p>With ${esc(andList(rest))}.${rest.filter(n => also(n).length).map(n => ` ${esc(n)} also plays ${esc(also(n).join(", "))}.`).join("")}</p>` : ""}` : `<p>${esc(p.note || "Lineup not posted yet.")}</p>`}${p.note && big.length ? `<p>${esc(p.note)}</p>` : ""}</div></div>
  <div class="sec"><h2>Conditions</h2><div class="tiles">
    <div class="tile" style="--c:${sold ? c : "var(--ink)"}"><span class="k">Tickets</span><span class="v">${sold ? "Sold out" : price ? esc(price) : /on sale/i.test(p.status || "") ? "On sale" : "Check listing"}</span><span class="s">${sold ? "Waitlist only" : p.status && !price && !/on sale/i.test(p.status) ? esc(p.status) : srcs.length ? "Via " + esc(srcs[0]) : ""}</span></div>
    <div class="tile"><span class="k">Doors</span><span class="v">${p.s != null ? fmtH(p.s) : "Late"}</span><span class="s">${p.s != null ? "From the listing" : "Time not posted"}</span></div>
    <div class="tile"><span class="k">Ends</span><span class="v">${p.e != null ? fmtH(p.e) : "Late"}</span><span class="s">${p.e != null ? (p.e >= 36 ? "Next day" : "From the listing") : "End time not posted"}</span></div>
    <div class="tile" style="--c:${c}"><span class="k">Draw</span><span class="v">${LVL[p.lvl]}</span><span class="s">Scored from the listing</span></div>
    <div class="tile" style="--c:${fr.length ? lv(fr[0].lvl) : "var(--ink)"}"><span class="k">Front</span><span class="v">${fr.length ? esc(fr[0].type) : "None"}</span><span class="s">${fr.length ? esc(fr[0].when) : "No crossovers found"}</span></div>
    <div class="tile"><span class="k">Chatter</span><span class="v">${p.mentions || 0}</span><span class="s">${p.mentions ? "r/avesNYC mentions" : "No mentions yet"}</span></div>
    <div class="tile"><span class="k">Nearby cells</span><span class="v">${p.v ? near.length : "–"}</span><span class="s">${p.v ? (near.length ? esc(andList(near.slice(0, 2).map(q => place(q)))) : "Nothing close by") : "Address not posted"}</span></div>
    <div class="tile"><span class="k">Listed on</span><span class="v">${srcs.length}</span><span class="s">${esc(andList(srcs))}</span></div>
  </div></div>
  ${others.length ? `<div class="sec"><h2>Same storm, other nights</h2><div class="listcard">${others.map(showItem).join("")}</div></div>` : ""}
  ${fr.length ? `<div class="sec"><h2>Fronts</h2>${fr.map(f => `<article class="fcard" style="--c:${lv(f.lvl)};margin-top:0;margin-bottom:8px"><div class="fhd"><span class="ftype">${esc(f.type)}</span><span class="fwhen mono">${esc(f.when)}</span></div><p>${esc(f.text)}</p>${frontTrack(f)}</article>`).join("")}</div>` : ""}
  <div class="sec"><h2>What people are saying</h2>${ch ? `<blockquote class="q"><p>${esc(ch.text)}</p><footer><b>r/${esc(ch.sub || "avesNYC")}</b> · u/${esc(ch.author)} · ${+ch.score || 0} points${chUrl ? ` · <a href="${esc(chUrl)}" target="_blank" rel="noopener">Read the thread ↗</a>` : ""}</footer></blockquote>${p.mentions > 1 ? `<p class="note" style="margin-top:8px">${p.mentions} posts and comments in the last three weeks mention this party or its lineup.</p>` : ""}` : `<p class="note">No r/avesNYC posts mention this party or its lineup in the last three weeks.</p>`}</div>
  ${url ? `<a class="cta" href="${esc(url)}" target="_blank" rel="noopener">See it on ${esc(p.src || "the listing")} ↗</a>` : ""}`;
}

/* ================= sheets ================= */
const sheet = $("#sheet"), scrim = $("#scrim");
function openSheet(title, html) {
  st.lastFocus = document.activeElement;
  $("#stitle").textContent = title; $("#sbody").innerHTML = html; $("#sbody").scrollTop = 0;
  sheet.removeAttribute("inert"); sheet.setAttribute("aria-hidden", "false"); sheet.classList.add("on"); scrim.classList.add("on");
  setTimeout(() => $("#sclose").focus(), 30);
}
function closeSheet() {
  if (!sheet.classList.contains("on")) return;
  sheet.classList.remove("on"); scrim.classList.remove("on"); sheet.setAttribute("aria-hidden", "true"); sheet.setAttribute("inert", "");
  if (st.lastFocus && st.lastFocus.focus && document.contains(st.lastFocus)) try { st.lastFocus.focus(); } catch (_) {}
}
function hoursSheet() {
  const D = DAYS[st.di], items = sortShows(D.list);
  if (!items.length) { openSheet(`${D.dow} by the hour`, `<p class="note">Nothing listed for ${esc(D.full)} yet.</p>`); return; }
  openSheet(`${D.dow} by the hour`, `<p class="note">Bars run from noon to 2P the next day. Dashed bars are times the listing didn’t post, drawn as 11P to 4A.</p>
    <div class="hrs"><div class="hax"><span></span><div><span>12P</span><span>6P</span><span>12A</span><span>6A</span><span>12P</span></div></div>
    ${items.map(p => { const w = win(p); return `<a class="hr" href="#party-${encodeURIComponent(p.id)}"><span class="hn"><b>${esc(p.n)}</b><span>${p.s != null ? fmtH(p.s) : "Time TBA"} · ${esc(place(p))}</span></span><span class="trk" style="--c:${lv(p.lvl)}"><i class="${w.est ? "est" : ""}" style="left:${pct(w.s)};width:calc(${pct(w.e)} - ${pct(w.s)})"></i></span></a>`; }).join("")}</div>`);
}
function listSheet(kind) {
  const D = DAYS[st.di];
  const items = kind === "sold" ? D.list.filter(p => /^sold out/i.test(p.status || "")) : D.list.filter(p => p.mentions).sort((a, b) => b.mentions - a.mentions);
  const title = kind === "sold" ? `Sold out · ${D.dow}` : `Most mentioned · ${D.dow}`;
  openSheet(title, items.length ? `<div class="listcard">${items.map(showItem).join("")}</div>` : `<p class="note">${kind === "sold" ? "Nothing sold out" : "No r/avesNYC mentions"} for ${esc(D.full)} so far.</p>`);
}
function infoSheet() {
  const c = DATA.counts || {}, fmt = v => v === "error" ? "failed last run" : v == null ? "off" : v;
  openSheet("How DanceWeather works", `<div class="prose">
    <p>Each night reads like a forecast. The big number is how many parties are listed, and the condition says how heavy the night is, from clear to severe storms.</p>
    <div class="legend"><span>Light</span><span class="ramp" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span><span>Severe</span></div>
    <h3>Where the listings come from</h3><p>A scheduled job refreshes them every six hours with no AI involved. Last run: ${esc(updatedLabel)}. Hand-added listings: ${esc(fmt(c.manual))}. Edmtrain: ${esc(fmt(c.edmtrain))}. Ticketmaster: ${esc(fmt(c.ticketmaster))}. Venue pages: ${esc(fmt(c.feeds))}. r/avesNYC posts scanned: ${esc(fmt(c.reddit))}.</p>
    <h3>Draw</h3><p>Each party gets a score from 1 to 5: sold out, festival, RA Pick, a lineup of five or more, tickets over $60, a run of ten hours or more, the size of the room, how many sources list it, and how often r/avesNYC mentions it.</p>
    <h3>Conditions</h3><p>Severe storms means a severe-draw party plus ten or more listings, or a festival. Thunderstorms means at least one very heavy party. Showers are lighter nights.</p>
    <h3>Fronts</h3><p>Worked out from the lineups: artists billed on more than one night, multi-night runs, venues with four or more nights, parties that run 13 hours or longer, back-to-back sets and closing nights.</p>
    <h3>What people are saying</h3><p>The most upvoted r/avesNYC post or comment from the last three weeks that names the party or someone on its lineup.</p>
  </div>`);
}

/* ================= routing ================= */
const PAGES = ["home", "forecast", "month", "fronts", "radar"];
function route() {
  const h = decodeURIComponent(location.hash.slice(1)); let page = PAGES.includes(h) ? h : "home", id = null;
  if (h.indexOf("party-") === 0) { page = "party"; id = h.slice(6); }
  closeSheet();
  if (page !== "home") stopLoop();
  if (page !== "radar") stopRLoop();
  $$(".page").forEach(el => { el.hidden = el.dataset.page !== page; });
  $$(".tabs a").forEach(a => { if (a.dataset.tab === page) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  if (page === "home") { FX.resume(); requestAnimationFrame(fitCond); if (Field) Field.kick(); }
  else if (page === "forecast") renderForecast();
  else if (page === "month") renderMonth();
  else if (page === "fronts") renderFronts();
  else if (page === "radar") renderRadar();
  else if (page === "party") renderParty(id);
  const pg = $(`.page[data-page="${page}"]`); if (pg && page !== "home" && st.page !== page + (id || "")) pg.scrollTop = 0;
  st.page = page + (id || ""); st.nav++;
}
addEventListener("hashchange", route);

/* ================= wiring ================= */
document.addEventListener("click", e => {
  const gd = e.target.closest("[data-goday]"); if (gd) { const i = +gd.dataset.goday; if (i < FC) setDay(i); return; }
  const di = e.target.closest("[data-di]"); if (di) { setDay(+di.dataset.di); return; }
  const sb = e.target.closest("[data-sheet]"); if (sb) { const k = sb.dataset.sheet; if (k === "hours") hoursSheet(); else listSheet(k); return; }
  const mb = e.target.closest("[data-mode]"); if (mb) { setMode(mb.dataset.mode); return; }
  const fc = e.target.closest("[data-fc]"); if (fc) { const i = +fc.dataset.fc; if (st.fcClosed.has(i)) st.fcClosed.delete(i); else st.fcClosed.add(i); renderForecast(); return; }
  const md = e.target.closest("[data-md]"); if (md) { st.mdi = +md.dataset.md; renderMonth(); if (md.classList.contains("rk")) $("#mday").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); return; }
  const rd = e.target.closest("[data-rd]"); if (rd) { stopRLoop(); st.rdi = +rd.dataset.rd; st.rsel = null; renderRadar(); return; }
  const rv = e.target.closest("[data-rv]"); if (rv) { stopRLoop(); st.rsel = rv.dataset.rv; renderRadar(); return; }
  const al = e.target.closest("[data-alert]"); if (al) { const id = al.dataset.alert; if (st.alerts.has(id)) st.alerts.delete(id); else st.alerts.add(id); store.set("dw.alerts", [...st.alerts]); renderParty(id); return; }
  const bk = e.target.closest("[data-back]"); if (bk) { if (st.nav > 1) history.back(); else location.hash = "forecast"; return; }
  if (e.target.closest("[data-info]")) { infoSheet(); return; }
});
$("#fcToggle").addEventListener("click", () => { if (st.fcClosed.size >= FC) st.fcClosed.clear(); else for (let i = 0; i < FC; i++) st.fcClosed.add(i); renderForecast(); });
$("#infoBtn").addEventListener("click", infoSheet);
$("#backNow").addEventListener("click", () => setDay(0));
$("#loopBtn").addEventListener("click", () => st.loop ? stopLoop() : startLoop());
$("#rLoop").addEventListener("click", () => st.rloop ? stopRLoop() : startRLoop());
$("#tabN").addEventListener("click", () => { st.strip = "nights"; renderStrip(); });
$("#tabT").addEventListener("click", () => { st.strip = "names"; renderStrip(); });
$("#sclose").addEventListener("click", closeSheet);
scrim.addEventListener("click", closeSheet);
document.addEventListener("keydown", e => { if (e.key === "Escape") closeSheet(); });
$("#moreBtn").addEventListener("click", () => {
  const b = $("#moreBtn"), m = $("#more"), open = b.getAttribute("aria-expanded") !== "true";
  b.setAttribute("aria-expanded", String(open)); b.querySelector("span").textContent = open ? "See less" : "See more"; m.classList.toggle("open", open);
  if (open) m.removeAttribute("inert"); else m.setAttribute("inert", ""); setTimeout(() => FX.measure(), 340);
});
(function () {
  const el = $("#hero"); let down = null, relax = 0;
  el.addEventListener("pointerdown", e => { if (e.target.closest("button,a")) return; down = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId, start: st.di }; });
  el.addEventListener("pointermove", e => {
    if (!down || e.pointerId !== down.id) return; const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (!down.moved && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) { down.moved = true; try { el.setPointerCapture(e.pointerId); } catch (_) {} }
    if (down.moved) { const i = Math.max(0, Math.min(FC - 1, down.start - Math.round(dx / 60))); if (i !== st.di) setDay(i); }
  });
  el.addEventListener("pointerup", () => { down = null; }); el.addEventListener("pointercancel", () => { down = null; });
  const settle = ms => { clearTimeout(relax); relax = setTimeout(() => { el.classList.remove("touch"); el.style.removeProperty("--ry"); el.style.removeProperty("--rx"); }, ms); };
  const lean = e => { const rc = el.getBoundingClientRect(), px = (e.clientX - rc.left) / rc.width - .5, py = (e.clientY - rc.top) / rc.height - .5;
    clearTimeout(relax); el.classList.add("touch"); el.style.setProperty("--ry", (-16 + px * 30).toFixed(1) + "deg"); el.style.setProperty("--rx", (9 - py * 18).toFixed(1) + "deg"); };
  if (!reduce) {
    el.addEventListener("pointermove", lean); el.addEventListener("pointerdown", lean);
    el.addEventListener("pointerleave", () => settle(350)); el.addEventListener("pointerup", e => { if (e.pointerType !== "mouse") settle(500); }); el.addEventListener("pointercancel", () => settle(300));
  }
})();

/* ================= start ================= */
const sev = FRONTS.some(f => f.lvl >= 5 && f.dis.some(d => d < FC)), anyFront = FRONTS.some(f => f.dis.some(d => d < FC));
$("#alertPill").textContent = sev ? "Severe warning" : "Storm watch"; $("#alertPill").hidden = !anyFront;
if (Field) Field.setMode(st.mode);
setDay(st.di, "start");
st.ready = true;
route();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { fitCond(); FX.measure(); });
}

boot();
})();
