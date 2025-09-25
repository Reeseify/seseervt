
const API_BASE = "https://api.reeses.ca";

async function fetchJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.json();
}

// ===== Data loaders (matches your Worker API) =====
async function getCatalog() {
  // /api/catalog returns { studios: [...], videos: [...] }
  return await fetchJSON(`${API_BASE}/api/catalog`);
}

async function getStudios() {
  // /api/studios returns ["Pixar", "Lucasfilm", ...]
  return await fetchJSON(`${API_BASE}/api/studios`);
}

async function getShows(studio) {
  // /api/shows?studio=Reese_s
  return await fetchJSON(`${API_BASE}/api/shows?studio=${encodeURIComponent(studio)}`);
}

async function getShow(id) {
  // /api/show?id=Reese_s/The Pepperonis
  return await fetchJSON(`${API_BASE}/api/show?id=${encodeURIComponent(id)}`);
}

// ===== UI helpers =====
function cardTpl({ href, img, label }) {
  const safeImg = img || "img/logo-full.png";
  const safeLabel = label || "Untitled";
  return `<a class="card" href="${href}">
    <div class="thumb"><img loading="lazy" src="${safeImg}" alt=""></div>
    <div class="label">${safeLabel}</div>
  </a>`;
}

function grid(el, items) {
  el.innerHTML = items.map(cardTpl).join("");
}

// ===== Page routers =====
document.addEventListener("DOMContentLoaded", async () => {
  const here = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  try {
    if (here === "index.html") await bootHome();
    else if (here === "shows.html") await bootShows();
    else if (here === "movies.html") await bootMovies();
    else if (here === "mylist.html") await bootMyList();
    else if (here === "show.html") await bootShowDetail();
    else if (here === "watch.html") await bootWatch();
  } catch (err) {
    console.error(err);
  }
});

// ===== Booters =====
async function bootHome() {
  const cat = await getCatalog();
  // Build a row of "Popular Shows": one card per show
  const popularEl = document.getElementById("row-popular");
  if (popularEl) {
    const items = [];
    for (const studio of cat.studios || []) {
      for (const show of studio.shows || []) {
        const img = show.logo || firstSeasonThumb(show);
        items.push({
          href: `show.html?id=${encodeURIComponent(show.id)}`,
          img,
          label: show.name
        });
      }
    }
    grid(popularEl, items.slice(0, 16));
  }
}

async function bootShows() {
  const cat = await getCatalog();
  const target = document.getElementById("row-shows");
  if (!target) return;

  const items = [];
  for (const studio of cat.studios || []) {
    for (const show of studio.shows || []) {
      const img = show.logo || firstSeasonThumb(show);
      items.push({
        href: `show.html?id=${encodeURIComponent(show.id)}`,
        img,
        label: `${show.name}`
      });
    }
  }
  grid(target, items);
}

async function bootMovies() {
  // If you later model movies as specific studio/show combos,
  // you can filter here. For now, leave empty or reuse from catalog videos.
  const target = document.getElementById("row-movies");
  if (!target) return;
  target.innerHTML = `<p class="muted">Movies section coming soon.</p>`;
}

async function bootMyList() {
  const target = document.getElementById("row-mylist");
  if (!target) return;
  target.innerHTML = `<p class="muted">Sign in to see your saved items.</p>`;
}

async function bootShowDetail() {
  const p = new URLSearchParams(location.search);
  const id = p.get("id");
  if (!id) return;
  const data = await getShow(id);

  // header
  const titleEl = document.getElementById("show-title");
  if (titleEl) titleEl.textContent = data.name || "Show";

  // poster
  const poster = document.querySelector(".hero .hero-card");
  if (poster) {
    const bg = data.logo || firstSeasonThumb(data);
    if (bg) poster.style.background = `center/cover no-repeat url("${bg}")`;
  }

  // episodes (by season)
  const row = document.getElementById("row-episodes");
  if (row) {

  // Seasons UI
  const bar = document.getElementById("seasons-bar");
  const sel = document.getElementById("season-select");

  const urlSeason = new URLSearchParams(location.search).get("season");
  const seasons = (data.seasons || []).map((s, i) => ({ idx: i, id: s.id, name: s.name || `Season ${i+1}`, videos: s.videos || [] }));

  function renderSeasonEpisodes(si){
    const s = seasons[si] || seasons[0];
    if(!s) return;
    // highlight
    [...(bar?.children || [])].forEach((el, idx)=> el.classList.toggle('active', idx===si));
    if(sel) sel.selectedIndex = si;

    const items = s.videos.map(v => ({
      href: `watch.html?e=${encodeURIComponent(v.h || v.id)}`,
      img: v.thumb || data.logo,
      label: v.name
    }));
    grid(row, items);
    // update URL (no reload)
    const u = new URL(location.href);
    u.searchParams.set('season', s.name || String(si+1));
    history.replaceState(null, '', u.toString());
  }

  if(bar){
    bar.innerHTML = seasons.map((s, i) => `<button class="tab" data-i="${i}">${s.name || ('Season ' + (i+1))}</button>`).join('');
    bar.addEventListener('click', (e)=>{
      const b = e.target.closest('.tab');
      if(!b) return;
      renderSeasonEpisodes(parseInt(b.dataset.i,10));
    });
  }

  if(sel){
    sel.innerHTML = seasons.map((s, i) => `<option value="${i}">${s.name || ('Season ' + (i+1))}</option>`).join('');
    sel.addEventListener('change', ()=> renderSeasonEpisodes(parseInt(sel.value,10)));
  }

  // pick initial season
  let initialIndex = 0;
  if(urlSeason){
    const found = seasons.findIndex(s => (s.name||'').toLowerCase() === urlSeason.toLowerCase());
    if(found >= 0) initialIndex = found;
  }
  renderSeasonEpisodes(initialIndex);

  }
}


  const p = new URLSearchParams(location.search);
  const src = p.get("src");
  const title = p.get("title") || "Now Playing";

  // Set <source> and load
  const v = document.getElementById("player");
  if (v) {
    const s = v.querySelector("source");
    if (s && src) s.src = src;
    v.load();
    document.title = `Watch — ${title}`;
  }

  // Fullscreen button already wired inline in the page
}

// Helpers
function firstSeasonThumb(show) {
  const seasons = show.seasons || [];
  for (const s of seasons) {
    if (s && s.videos && s.videos.length) {
      const t = s.videos[0].thumb;
      if (t) return t;
    }
  }
  return null;
}
