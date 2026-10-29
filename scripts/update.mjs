#!/usr/bin/env node
/*
  DanceWeather updater. No AI: every step is plain rules.

  Pulls upcoming NYC electronic listings from
    - data/manual.json        hand-added parties (RA, Dice, Shotgun and Posh exclusives)
    - Edmtrain API            needs EDMTRAIN_KEY
    - Ticketmaster Discovery  needs TICKETMASTER_KEY
    - venue pages             any URLs in config.json "feeds" that publish schema.org Event JSON-LD
  and counts mentions in r/avesNYC through Reddit's API (needs REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET).

  Merges duplicates, links multi-night runs, scores each party's draw from 1 to 5,
  and writes data/events.json for the app. Any source without a key is skipped.

  Run locally:  node scripts/update.mjs
  Test a date:  DW_TODAY=2026-10-29 node scripts/update.mjs
  Node 20 or newer, no packages needed.
*/
import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const load = async (p) => JSON.parse(await readFile(new URL(p, root), "utf8"));
const CFG = await load("data/config.json");
const VENUES = await load("data/venues.json");
const MANUAL = await load("data/manual.json");
const env = process.env;
const UA = CFG.userAgent || "DanceWeather/1.0";
const log = (...a) => console.log("[update]", ...a);
const warn = (...a) => console.warn("[update] warning:", ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- dates in New York time ---------- */
const TZ = CFG.timezone || "America/New_York";
const isoDay = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const addDays = (iso, n) => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const TODAY = env.DW_TODAY || isoDay(new Date());
const LAST = addDays(TODAY, CFG.daysAhead || 42);
const inWindow = (d) => d && d >= TODAY && d <= LAST;

/* ---------- text helpers ---------- */
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\bthe\b/g, " ").replace(/\s+/g, " ").trim();
const slug = (s) => norm(s).replace(/ /g, "-").slice(0, 48) || "x";
const hours = (t) => { const m = String(t || "").match(/(\d{1,2}):(\d{2})/); return m ? +m[1] + +m[2] / 60 : null; };
const endHours = (s, e) => (e == null ? null : s != null && e <= s ? e + 24 : s == null && e < 12 ? e + 24 : e);
const priceOf = (txt) => { const m = String(txt || "").match(/\$\s?(\d+(?:\.\d+)?)/g); return m ? Math.max(...m.map((x) => +x.replace(/[^\d.]/g, ""))) : 0; };
const uniq = (arr) => { const seen = new Set(); return arr.filter((x) => { const k = norm(x); if (!k || seen.has(k)) return false; seen.add(k); return true; }); };

async function getJSON(url, opts = {}, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { ...opts, headers: { "user-agent": UA, accept: "application/json", ...(opts.headers || {}) } });
      if (r.status === 429 || r.status >= 500) { await sleep(1500 * (i + 1)); continue; }
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return await r.json();
    } catch (e) { if (i === tries - 1) throw e; await sleep(1000 * (i + 1)); }
  }
  throw new Error("gave up after retries");
}

/* ---------- venues: known rooms from venues.json, others placed from their coordinates ---------- */
const VLIST = Object.entries(VENUES).map(([name, v]) => ({ name, ...v, keys: [name, ...(v.aliases || [])].map(norm) }));
function knownVenue(name) {
  const n = norm(name);
  if (!n) return null;
  return VLIST.find((v) => v.keys.includes(n))
    || VLIST.find((v) => v.keys.some((k) => k.length >= 5 && (` ${n} `.includes(` ${k} `) || (n.length >= 5 && ` ${k} `.includes(` ${n} `)))))
    || null;
}
/* the app's map: x 0-390 runs from longitude -74.02 east, y 0-440 runs from latitude 40.76 south */
const project = (lat, lon) => ({ x: Math.round((lon + 74.02) * 3000), y: Math.round((40.76 - lat) * 3706.6) });
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function resolveVenue(name, lat, lon, area) {
  const k = knownVenue(name);
  if (k) return { key: slug(k.name), n: k.name, a: k.area, x: k.x, y: k.y, w: k.weight || 0 };
  if (lat != null && lon != null && !isNaN(+lat) && !isNaN(+lon)) {
    const p = project(+lat, +lon);
    if (p.x >= -30 && p.x <= 420 && p.y >= -50 && p.y <= 470)
      return { key: slug(name), n: name, a: area || CFG.city, x: clamp(p.x, 6, 384), y: clamp(p.y, 6, 434), w: 0 };
  }
  return null;
}

/* ---------- one shape for every source ---------- */
function make(o) {
  const v = o.venue ? resolveVenue(o.venue, o.lat, o.lon, o.area) : null;
  return {
    d: o.date, n: String(o.name || "").trim(), v, where: v ? null : [o.venue || o.where, !o.venue || !o.area ? null : o.area].filter(Boolean).join(", ") || null,
    names: uniq(o.artists || []), s: o.s ?? null, e: o.e ?? null,
    status: o.status || null, by: o.promoter || null, note: o.note || null, url: o.url || null,
    src: o.source, srcs: [o.source], series: o.series || null, fest: !!o.festival, raPick: !!o.raPick, final: !!o.final,
    soldOut: !!o.soldOut || /^\s*sold out/i.test(o.status || ""), price: o.price || priceOf(o.status), lvl: o.lvl || null,
  };
}

/* ---------- sources ---------- */
function fromManual() {
  return (MANUAL.events || []).map((m) => {
    const s = hours(m.start);
    return make({ ...m, artists: m.artists, s, e: endHours(s, hours(m.end)), source: m.source || "Hand-added" });
  });
}

async function fromEdmtrain() {
  const key = env.EDMTRAIN_KEY;
  if (!key) { log("Edmtrain: no EDMTRAIN_KEY, skipped"); return []; }
  const base = "https://edmtrain.com/api";
  const locs = await getJSON(`${base}/locations?state=${encodeURIComponent(CFG.edmtrain.state)}&client=${key}`);
  if (!locs.success) throw new Error(locs.message || "locations failed");
  const want = new Set(CFG.edmtrain.cities.map(norm));
  const ids = (locs.data || []).filter((l) => want.has(norm(l.city))).map((l) => l.id);
  if (!ids.length) { warn("Edmtrain: no matching locations; check config.edmtrain.cities"); return []; }
  const res = await getJSON(`${base}/events?locationIds=${ids.join(",")}&startDate=${TODAY}&endDate=${LAST}&client=${key}`);
  if (!res.success) throw new Error(res.message || "events failed");
  return (res.data || []).filter((ev) => !ev.livestreamInd).map((ev) => {
    /* Edmtrain marks an artist who plays back-to-back with the one before it */
    const names = [];
    for (const a of ev.artistList || []) {
      if (a.b2bInd && names.length) names[names.length - 1] += " b2b " + a.name; else names.push(a.name);
    }
    const s = hours(ev.startTime);
    const vn = ev.venue || {};
    return make({
      date: ev.date, name: ev.name || names.slice(0, 2).join(", ") || "Untitled", venue: vn.name, lat: vn.latitude, lon: vn.longitude,
      area: (vn.location || "").split(",")[0], artists: names, s, e: endHours(s, hours(ev.endTime)),
      festival: !!ev.festivalInd, note: ev.ages || null, url: ev.link, source: "Edmtrain",
    });
  });
}

async function fromTicketmaster() {
  const key = env.TICKETMASTER_KEY;
  if (!key) { log("Ticketmaster: no TICKETMASTER_KEY, skipped"); return []; }
  const t = CFG.ticketmaster, out = [];
  for (let page = 0; page < (t.maxPages || 5); page++) {
    const q = new URLSearchParams({
      apikey: key, dmaId: t.dmaId, segmentId: t.segmentId, classificationName: t.classificationName,
      startDateTime: `${TODAY}T00:00:00Z`, endDateTime: `${LAST}T23:59:59Z`, size: "200", page: String(page), sort: "date,asc",
    });
    const j = await getJSON(`https://app.ticketmaster.com/discovery/v2/events.json?${q}`);
    const evs = (j._embedded && j._embedded.events) || [];
    for (const ev of evs) {
      const code = ev.dates?.status?.code || "";
      if (/cancel/i.test(code)) continue;
      const genre = (ev.classifications || []).map((c) => `${c.genre?.name || ""} ${c.subGenre?.name || ""}`).join(" ");
      if (!/dance|electronic|house|techno|edm|trance|dubstep|drum|bass/i.test(genre)) continue;
      const vn = ev._embedded?.venues?.[0] || {};
      const pr = ev.priceRanges || [];
      const min = pr.length ? Math.min(...pr.map((p) => p.min ?? Infinity)) : null;
      const max = pr.length ? Math.max(...pr.map((p) => p.max ?? 0)) : 0;
      const status = /offsale/i.test(code) ? "Off sale" : /postpone|reschedul/i.test(code) ? "Rescheduled" : min && isFinite(min) ? `From $${Math.round(min)}` : "On sale";
      const s = hours(ev.dates?.start?.localTime);
      out.push(make({
        date: ev.dates?.start?.localDate, name: ev.name, venue: vn.name, lat: vn.location?.latitude, lon: vn.location?.longitude,
        area: vn.city?.name, artists: (ev._embedded?.attractions || []).map((a) => a.name), s, e: null,
        status, price: max, url: ev.url, source: "Ticketmaster",
      }));
    }
    const pages = j.page?.totalPages ?? 1;
    if (page + 1 >= pages) break;
    await sleep(300);
  }
  return out;
}

/* venue pages that publish schema.org Event data (JSON-LD) */
async function fromFeeds() {
  const out = [];
  for (const url of CFG.feeds || []) {
    try {
      const r = await fetch(url, { headers: { "user-agent": UA } });
      if (!r.ok) throw new Error(`${r.status}`);
      const html = await r.text();
      const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
      const items = [];
      const walk = (x) => { if (!x) return; if (Array.isArray(x)) return x.forEach(walk); if (typeof x !== "object") return;
        const ty = [].concat(x["@type"] || []).join(" "); if (/Event/.test(ty)) items.push(x); if (x["@graph"]) walk(x["@graph"]); };
      for (const b of blocks) { try { walk(JSON.parse(b.trim())); } catch { /* skip broken block */ } }
      for (const ev of items) {
        const sd = String(ev.startDate || ""), ed = String(ev.endDate || "");
        const loc = Array.isArray(ev.location) ? ev.location[0] : ev.location || {};
        const perf = [].concat(ev.performer || []).map((p) => (typeof p === "string" ? p : p.name)).filter(Boolean);
        const offers = [].concat(ev.offers || []);
        const sold = offers.some((o) => /SoldOut/i.test(o.availability || ""));
        const price = Math.max(0, ...offers.map((o) => +o.price || +o.highPrice || 0));
        const s = hours(sd.slice(11));
        out.push(make({
          date: sd.slice(0, 10), name: ev.name, venue: loc.name, lat: loc.geo?.latitude, lon: loc.geo?.longitude,
          area: loc.address?.addressLocality, artists: perf, s, e: endHours(s, hours(ed.slice(11))),
          status: sold ? "Sold out" : price ? `From $${Math.round(Math.min(...offers.map((o) => +o.price || Infinity)))}` : null,
          soldOut: sold, price, url: ev.url || url, source: new URL(url).hostname.replace(/^www\./, ""),
        }));
      }
      log(`feed ${url}: ${items.length} events`);
    } catch (e) { warn(`feed ${url} failed: ${e.message}`); }
  }
  return out;
}

async function fromReddit() {
  const id = env.REDDIT_CLIENT_ID, secret = env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) { log("Reddit: no REDDIT_CLIENT_ID/SECRET, skipped"); return []; }
  const tok = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: { authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"), "content-type": "application/x-www-form-urlencoded", "user-agent": UA },
    body: "grant_type=client_credentials",
  }).then((r) => r.json());
  if (!tok.access_token) throw new Error("no access token: " + JSON.stringify(tok).slice(0, 120));
  const H = { authorization: `Bearer ${tok.access_token}` };
  const R = CFG.reddit, since = Date.now() - (R.days || 21) * 864e5, items = [];
  for (const sub of R.subreddits) {
    for (const kind of ["new", "comments"]) {
      let after = "";
      for (let p = 0; p < (R.pages || 3); p++) {
        const j = await getJSON(`https://oauth.reddit.com/r/${sub}/${kind}?limit=100&raw_json=1${after ? `&after=${after}` : ""}`, { headers: H });
        for (const c of j.data?.children || []) {
          const d = c.data, t = d.created_utc * 1000;
          if (t < since) continue;
          const text = [d.title, d.selftext, d.body].filter(Boolean).join("\n").trim();
          if (text) items.push({ text, score: d.score || 0, url: "https://www.reddit.com" + d.permalink, author: d.author, sub, at: new Date(t).toISOString() });
        }
        after = j.data?.after;
        if (!after) break;
        await sleep(700);
      }
    }
  }
  return items;
}

/* ---------- merge duplicates across sources ---------- */
const PRIORITY = (src) => (src === "Ticketmaster" ? 2 : src === "Edmtrain" ? 3 : 0);
function similar(a, b) {
  if (a.d !== b.d) return false;
  const sameRoom = a.v && b.v ? a.v.key === b.v.key : norm(a.where) && norm(a.where) === norm(b.where);
  const wa = new Set(norm(a.n).split(" ").filter((w) => w.length > 2)), wb = new Set(norm(b.n).split(" ").filter((w) => w.length > 2));
  const inter = [...wa].filter((w) => wb.has(w)).length, jac = inter / Math.max(1, new Set([...wa, ...wb]).size);
  const na = new Set(a.names.map(norm)), shared = b.names.some((n) => na.has(norm(n)));
  return (sameRoom && (jac >= 0.34 || shared || !a.names.length || !b.names.length)) || (!a.v && !b.v && jac >= 0.6) || (jac >= 0.8 && shared);
}
function merge(list) {
  list.sort((x, y) => PRIORITY(x.src) - PRIORITY(y.src));
  const out = [];
  for (const e of list) {
    const hit = out.find((o) => similar(o, e));
    if (!hit) { out.push(e); continue; }
    hit.names = uniq([...hit.names, ...e.names]);
    for (const k of ["s", "e", "status", "by", "note", "url", "v", "series", "lvl"]) if (hit[k] == null && e[k] != null) hit[k] = e[k];
    if (hit.v) hit.where = null;
    hit.fest ||= e.fest; hit.raPick ||= e.raPick; hit.final ||= e.final; hit.soldOut ||= e.soldOut;
    hit.price = Math.max(hit.price || 0, e.price || 0);
    hit.srcs = uniq([...hit.srcs, ...e.srcs]);
  }
  return out;
}

/* ---------- multi-night runs: same room, same base name, nights no more than two days apart ---------- */
function linkSeries(list) {
  const base = (n) => norm(n).replace(/\b(day|night|nights|pt|part|vol)\b( [a-z0-9]+)?/g, " ")
    .replace(/\b(closing|opening|friday|saturday|sunday|fri|sat|sun|one|two|three|four|five|six|seven|of)\b/g, " ").replace(/\s+/g, " ").trim();
  const groups = {};
  for (const e of list) if (!e.series) (groups[`${e.v ? e.v.key : norm(e.where)}|${base(e.n)}`] ||= []).push(e);
  for (const [k, g] of Object.entries(groups)) {
    if (g.length < 2 || k.endsWith("|")) continue;
    g.sort((a, b) => (a.d < b.d ? -1 : 1));
    let run = [g[0]];
    const flush = () => { if (run.length > 1) run.forEach((e) => (e.series = slug(k) + "-" + run[0].d)); };
    for (let i = 1; i < g.length; i++) {
      const gap = (Date.parse(g[i].d) - Date.parse(run[run.length - 1].d)) / 864e5;
      if (gap > 0 && gap <= 2) run.push(g[i]); else { flush(); run = [g[i]]; }
    }
    flush();
  }
}

/* ---------- r/avesNYC mentions: whole-word matches on lineup names and distinctive party names ---------- */
const GENERIC = new Set(["halloween", "rooftop halloween", "day of the dead", "halloween party", "costume party", "new years eve", "nye"]);
function matcher(e) {
  const terms = [];
  const add = (t) => {
    const s = String(t || "").replace(/\s*\((live|dj set)\)\s*/gi, " ").trim();
    if (s.length < 4) return;
    const esc = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    terms.push(/\s/.test(s) ? new RegExp(`(^|\\W)${esc}(\\W|$)`, "i") : new RegExp(`(^|\\W)${esc}(\\W|$)`));
  };
  e.names.forEach(add);
  const nb = e.n.replace(/ · .*$/, "");
  if (norm(nb).length >= 8 && !GENERIC.has(norm(nb))) add(nb);
  return (text) => terms.some((re) => re.test(text));
}
function chatter(events, items) {
  for (const e of events) {
    const m = matcher(e), hits = items.filter((it) => m(it.text));
    e.mentions = hits.length;
    const top = hits.sort((a, b) => b.score - a.score)[0];
    if (top) {
      let t = top.text.replace(/\s+/g, " ").trim();
      if (t.length > 240) t = t.slice(0, 240).replace(/\s+\S*$/, "") + "…";
      e.chatter = { text: t, url: top.url, author: top.author, score: top.score, sub: top.sub, at: top.at };
    }
  }
}

/* ---------- draw score, 1 to 5, from plain signals ---------- */
function score(e) {
  if (e.lvl) return Math.max(1, Math.min(5, +e.lvl));
  let s = 1;
  if (e.soldOut) s += 2;
  if (e.fest) s += 2;
  if (e.raPick) s += 1;
  if (e.names.length >= 5) s += 1;
  if ((e.price || 0) >= 60) s += 1;
  if (e.s != null && e.e != null && e.e - e.s >= 10) s += 1;
  s += e.v ? e.v.w || 0 : 0;
  if ((e.mentions || 0) >= 1) s += 1;
  if ((e.mentions || 0) >= 5) s += 1;
  if (e.srcs.length >= 2) s += 1;
  return Math.max(1, Math.min(5, s));
}

/* ---------- run ---------- */
const counts = {};
const all = [];
async function take(name, fn) {
  try { const r = await fn(); counts[name] = r.length; all.push(...r); log(`${name}: ${r.length}`); }
  catch (e) { counts[name] = "error"; warn(`${name} failed: ${e.message}`); }
}
await take("manual", async () => fromManual());
await take("edmtrain", fromEdmtrain);
await take("ticketmaster", fromTicketmaster);
await take("feeds", fromFeeds);
let redditItems = [];
try { redditItems = await fromReddit(); counts.reddit = redditItems.length; log(`reddit posts and comments: ${redditItems.length}`); }
catch (e) { counts.reddit = "error"; warn(`reddit failed: ${e.message}`); }

const upcoming = all.filter((e) => inWindow(e.d) && e.n);
const events = merge(upcoming);
linkSeries(events);
chatter(events, redditItems);

const venues = {};
const used = new Set();
const out = events.map((e) => {
  if (e.v) venues[e.v.key] = { n: e.v.n, a: e.v.a, x: e.v.x, y: e.v.y };
  let id = `${e.d.slice(5).replace("-", "")}-${slug(e.n).slice(0, 40)}`;
  while (used.has(id)) id += "-2";
  used.add(id);
  const rec = {
    id, d: e.d, n: e.n, v: e.v ? e.v.key : null, where: e.v ? null : e.where || "Address not posted",
    names: e.names, s: e.s, e: e.e, lvl: score(e), status: e.status, by: e.by, note: e.note, url: e.url,
    src: e.srcs[0], srcs: e.srcs, series: e.series, fest: e.fest || undefined, raPick: e.raPick || undefined, final: e.final || undefined,
    mentions: e.mentions || 0, chatter: e.chatter || undefined,
  };
  for (const k of Object.keys(rec)) if (rec[k] == null) delete rec[k];
  return rec;
}).sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : (a.s ?? 30) - (b.s ?? 30)));

const data = { updated: new Date().toISOString(), today: TODAY, through: LAST, city: CFG.city, counts, venues, events: out };
await writeFile(new URL("data/events.json", root), JSON.stringify(data, null, 1) + "\n");
log(`wrote ${out.length} events across ${Object.keys(venues).length} venues (${TODAY} to ${LAST})`);
