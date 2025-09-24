// Robust app bootstrap (safe if included twice)
var state = window.state || { data: null, page: (document.body && document.body.dataset.page) || 'home', q: "" };
window.state = state;

// Shorthands
const $  = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

// ---------- UI helpers ----------
function tile(show){
  const logo = show.logo
    ? `<img src="${show.logo}" alt="${show.name} logo" />`
    : `<div class="thumb" style="display:grid;place-items:center;font-weight:800">${show.name}</div>`;
  return `<a class="tile" href="show.html?show=${encodeURIComponent(show.id)}" title="${show.name}">
    ${logo}
    <div class="shim"></div>
    <div class="label"><span class="name">${show.name}</span><span class="badge">${show.seasons||0}s</span></div>
  </a>`;
}

function deriveShows(data){
  const out = [];
  (data.studios || []).forEach(st => {
    (st.shows || []).forEach(sh => {
      const latest = (sh.seasons || [])
        .flatMap(s => s.videos || [])
        .reduce((m, v) => Math.max(m, Date.parse(v.published || "") || 0), 0);
      out.push({
        id: sh.id,
        name: sh.name,
        studio: st.name || "",
        logo: sh.logo || null,
        seasons: (sh.seasons || []).length,
        latestPublished: latest
      });
    });
  });
  return out;
}

function mountHero(shows){
  const hero = document.getElementById('hero') || document.getElementById('home-hero');
  if (!hero || !shows.length) return;
  const pick = shows[0];

  hero.innerHTML = `
    <div class="content">
      <h1 class="title">${pick.name}</h1>
      <div class="subtitle">${pick.seasons||0} season${(pick.seasons||0)===1?"":"s"} • ${pick.studio || ""}</div>
      <div class="cta">
        <a class="primary" href="show.html?show=${encodeURIComponent(pick.id)}">Open</a>
        <a class="secondary" href="browse.html">Browse</a>
      </div>
    </div>
  `;
}

function fillScroller(el, items){
  if (!el) return;
  el.innerHTML = items.map(tile).join("");
}

function scrollRow(id, dir){
  const el = document.querySelector(id);
  if (!el) return;
  el.scrollBy({ left: dir * (el.clientWidth * 0.9), behavior: 'smooth' });
}

// ---------- Pages ----------
function renderHome(data){
  const shows = deriveShows(data);
  if (!shows.length){
    console.warn("No shows found in data:", data);
    return;
  }

  const latest = [...shows].sort((a,b) => (b.latestPublished||0)-(a.latestPublished||0)).slice(0, 12);
  mountHero(latest.length ? latest : shows);

  const rowLatest = document.getElementById('row-latest') || document.getElementById('row-top');
  const rowAll    = document.getElementById('row-all')    || document.getElementById('row-trend');
  const rowMore   = document.getElementById('row-more')   || document.getElementById('row-because');

  fillScroller(rowLatest, latest.length ? latest : shows.slice(0,12));
  fillScroller(rowAll, shows.slice(0, 18));
  fillScroller(rowMore, shows.slice(18, 36));
}

function renderBrowse(data){
  const wrap = document.getElementById('poster-grid') || document.querySelector('.poster-grid');
  if (!wrap) return;
  const shows = deriveShows(data);
  wrap.innerHTML = shows.map(tile).join("");
}

function renderLibrary(data){
  // Simple library = all shows
  renderBrowse(data);
}

function parseQuery(){
  const out = {};
  const qs = (location.search || "").replace(/^\?/, "").split("&").filter(Boolean);
  for (const kv of qs){
    const [k, v] = kv.split("=");
    out[decodeURIComponent(k)] = decodeURIComponent(v || "");
  }
  return out;
}

function findShowById(data, id){
  for (const st of (data.studios||[])){
    for (const sh of (st.shows||[])){
      if (sh.id === id) return { show: sh, studio: st };
    }
  }
  return null;
}

async function renderShow(){
  const { show: showId } = parseQuery();
  if (!state.data || !showId) return;

  const found = findShowById(state.data, showId);
  if (!found){ console.warn("Show not found:", showId); return; }
  const { show, studio } = found;

  // Header info
  const titleEl = document.getElementById('show-title');
  if (titleEl) titleEl.textContent = show.name;

  const logoEl = document.getElementById('show-logo');
  if (logoEl && show.logo) logoEl.src = show.logo;

  // Seasons dropdown
  const sel = document.getElementById('seasonSelect');
  if (sel){
    sel.innerHTML = "";
    (show.seasons || []).forEach((s, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = s.name || `Season ${i+1}`;
      if (i === 0) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function renderSeason(idx){
    const season = show.seasons[idx] || { videos: [] };
    const grid = document.getElementById('episodeGrid');
    if (!grid) return;
    grid.innerHTML = (season.videos || []).map(ep => `
      <a class="ep-card" href="watch.html?show=${encodeURIComponent(show.id)}&vid=${encodeURIComponent(ep.id)}">
        <img src="${ep.thumb || show.logo || ''}" alt="">
        <div class="body">
          <div style="font-weight:800">${ep.name}</div>
          <div class="muted">${new Date(ep.modified || Date.now()).toLocaleDateString()}</div>
        </div>
      </a>
    `).join("");
  }

  renderSeason(0);
  if (sel) sel.addEventListener("change", (e) => renderSeason(+e.target.value));

  // Suggested from same studio
  const suggestWrap = document.getElementById('suggest-grid');
  if (suggestWrap){
    const pool = (studio?.shows || []).filter(s => s.id !== show.id);
    suggestWrap.innerHTML = pool.slice(0, 12).map(s => tile({
      id: s.id, name: s.name, logo: s.logo || null, seasons: (s.seasons||[]).length
    })).join("");
  }
}

async function renderWatch(){
  const { show: showId, vid: vidId } = parseQuery();
  if (!state.data) return;
  const found = findShowById(state.data, showId);
  if (!found) return;
  const { show } = found;
  let video = null;
  for (const sn of (show.seasons || [])){
    for (const v of (sn.videos || [])){
      if (v.id === vidId){ video = v; break; }
    }
    if (video) break;
  }
  const title = document.getElementById('watch-title');
  if (title) title.textContent = video ? video.name : show.name;

  const frame = document.getElementById('watch-frame');
  if (frame){
    // Use Drive embed if present, else attempt direct src
    frame.src = (video && (video.embed || video.src)) || "";
  }
}

// ---------- Boot ----------
async function boot(){
  try {
    // If DriveBoot already populated data (OAuth button path), just render
    if (state.data && (state.data.studios || []).length){
      routeRender();
      return;
    }

    // Otherwise try config.json (works if you put accessToken or apiKey there)
    let cfg = null;
    try { cfg = await fetch("config.json").then(r => r.json()); } catch (_) {}

    if (window.Drive && cfg && Array.isArray(cfg.folders)) {
      const data = await Drive.loadFromConfig(cfg);
      state.data = data || { studios: [], videos: [] };
    } else {
      state.data = state.data || { studios: [], videos: [] };
    }

    routeRender();
  } catch (err) {
    console.error("Boot failed:", err);
  }
}

function routeRender(){
  switch (state.page) {
    case 'home':    renderHome(state.data);    break;
    case 'browse':  renderBrowse(state.data);  break;
    case 'library': renderLibrary(state.data); break;
    case 'show':    renderShow();              break;
    case 'watch':   renderWatch();             break;
  }
}

document.addEventListener('DOMContentLoaded', boot);
