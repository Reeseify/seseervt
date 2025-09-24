const state = { data:null, page:document.body.dataset.page, q:"" };
// Convenience selectors
const $  = (sel, el=document) => el.querySelector(sel);
const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));

// === Disney+-style helpers ===
function tile(show){
  const logo = show.logo ? `<img src="${show.logo}" alt="${show.name} logo" />`
                         : `<div class="thumb" style="display:grid;place-items:center;font-weight:800">${show.name}</div>`;
  return `<a class="tile" href="show.html?show=${encodeURIComponent(show.id)}" title="${show.name}">
    ${logo}
    <div class="shim"></div>
    <div class="label"><span class="name">${show.name}</span><span class="badge">${show.seasons||0}s</span></div>
  </a>`;
}

function mountHero(shows){
  if(!shows.length) return;
  const hero = document.getElementById('hero') || document.getElementById('home-hero');
  const pick = shows[0];
  if(!hero) return;
  hero.style.backgroundImage = pick.logo ? `url(${pick.logo})` : "";
  const logoEl = document.getElementById('hero-logo');
  if(logoEl && pick.logo){ logoEl.src = pick.logo; logoEl.style.background = '#0f1327'; }
  document.getElementById('hero-title').textContent = pick.name;
  document.getElementById('hero-meta').textContent = (pick.studio||'') + (pick.seasons?` • ${pick.seasons} season${pick.seasons==1?'':'s'}`:'');
  const play = document.getElementById('hero-play');
  const det = document.getElementById('hero-details');
  if(play) play.href = `show.html?show=${encodeURIComponent(pick.id)}`;
  if(det) det.href = `show.html?show=${encodeURIComponent(pick.id)}`;
}

function scrollRow(id, dir){
  const el = document.querySelector(id);
  if(!el) return;
  el.scrollBy({left: dir * (el.clientWidth*0.9), behavior:'smooth'});
}

function paintChips(data){
  const wrap = document.getElementById('studio-chips');
  if(!wrap) return;
  const studios = (data.studios||[]).map(s=>s.name).filter(Boolean);
  const unique = [...new Set(studios)];
  const chips = ['All', ...unique].map(name=>`<button class="chip" data-studio="${name}">${name}</button>`).join('');
  wrap.innerHTML = chips;
  wrap.addEventListener('click', (e)=>{
    if(e.target.matches('.chip')){
      const sel = e.target.getAttribute('data-studio');
      $$('.chip').forEach(c=>c.removeAttribute('aria-current'));
      e.target.setAttribute('aria-current','true');
      filterByStudio(sel==='All'?null:sel);
    }
  });
}

function filterByStudio(studio){
  const shows = state.data.shows || deriveShows(state.data);
  const list = studio? shows.filter(s=> s.studio===studio) : shows;
  const allRow = document.getElementById('row-all');
  if(allRow) allRow.innerHTML = list.map(tile).join('');
}

function renderHome(data){
  // Always derive shows from studios
  const shows = deriveShows(data);
  if (!shows.length) {
    console.warn("No shows found in data:", data);
    return;
  }

  const latest = [...shows]
    .sort((a,b)=> (b.latestPublished||0) - (a.latestPublished||0))
    .slice(0, 12);

  mountHero(latest.length ? latest : shows);

  const latestRow = document.getElementById('row-latest') || document.getElementById('row-top');
  const allRow   = document.getElementById('row-all')    || document.getElementById('row-trend') || document.getElementById('row-because');

  if (latestRow) latestRow.innerHTML = latest.map(tile).join('');
  if (allRow) allRow.innerHTML = shows.map(tile).join('');

  paintChips(data);

  $$('.controls .prev')
    .forEach(b => b.onclick = () => scrollRow(b.dataset.target, -1));
  $$('.controls .next')
    .forEach(b => b.onclick = () => scrollRow(b.dataset.target, +1));
}


function deriveShows(data){
  const out=[];
  (data.studios||[]).forEach(st=>{
    (st.shows||[]).forEach(sh=>{
      const latest = (sh.seasons||[]).flatMap(s=>s.videos||[]).reduce((m,v)=>Math.max(m, Date.parse(v.published||'')||0),0);
      out.push({ id:sh.id, name:sh.name, studio:st.name||"", logo:sh.logo||null, seasons:(sh.seasons||[]).length, latestPublished:latest });
    });
  });
  return out;
}

function wireCommon(){
  const y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();
  const search = document.querySelector('#search');
  if (search){
    search.addEventListener('input', ()=>{
      state.q = search.value || '';
      if (state.page==='home' && state.data){
        const q = state.q.toLowerCase();
        const shows = state.data.shows || deriveShows(state.data);
        const list = shows.filter(s =>
          s.name.toLowerCase().includes(q) ||
          (s.studio||'').toLowerCase().includes(q)
        );
        const grid = document.getElementById('row-all');
        if (grid) grid.innerHTML = list.map(tile).join('');
      }
    });
  }
}

// ---- Automatic boot on page load ----
async function boot() {
  try {
    // 1) Load config.json (or window.APP_CONFIG if you prefer embedding)
    let cfg;
    try {
      cfg = await fetch('config.json', { cache: 'no-store' }).then(r => r.json());
    } catch (e) {
      if (window.APP_CONFIG) cfg = window.APP_CONFIG;
      else throw e;
    }

    // 2) Crawl Google Drive
    const data = await Drive.loadFromConfig(cfg);

    // 3) Save globally for other pages / search
    state.data = data;

    // 4) Render the current page
    switch (state.page) {
      case 'home':
        renderHome(data);
        break;
      case 'library':
      case 'browse':
        renderLibrary?.(data);
        break;
      case 'show':
        renderShow?.(data);
        break;
      case 'watch':
        renderWatch?.(data);
        break;
    }
  } catch (err) {
    console.error('Boot failed:', err);
  }
}

// Defer until DOM is ready (works with <script defer>)
document.addEventListener('DOMContentLoaded', boot);


async function renderShow(){
  const { show: showId } = parseQuery();
  const show = state.shows.find(s=>s.id === showId) || state.shows[0];
  state.show = show;

  const firstEp = show.seasons?.[0]?.episodes?.[0];
  const firstThumb = firstEp?.thumb || show.logo || 'img/favicon.png';
  const heroBg = show.banner || firstThumb;
  const posterImg = show.logo || firstThumb;

  // Fill hero elements
  const hero = document.getElementById("heroBg"); if(hero) hero.style.backgroundImage = `url('${heroBg}')`;
  const poster = document.getElementById("posterImg"); if(poster) poster.src = posterImg;
  const title = document.getElementById("showTitle"); if(title) title.textContent = show.name;
  const sc = document.getElementById("seasonCount"); if(sc) sc.textContent = `${show.seasonCount||0} season(s)`;

  // Resume progress
  const key = "progress:"+show.id;
  const saved = JSON.parse(localStorage.getItem(key) || "null");
  let cont = null;
  if(saved?.ep){
    for(const s of show.seasons||[]){ const i=(s.episodes||[]).findIndex(e=>e.id===saved.ep); if(i>=0){ cont={season:s,index:i}; break; } }
  }
  const first = show.seasons?.[0];
  const continueEp = cont ? cont.season.episodes[cont.index] : first?.episodes?.[0];
  const total = (cont?.season?.episodes?.length) || (first?.episodes?.length || 1);
  const idx = cont ? cont.index : 0;
  const pct = Math.max(0, Math.min(100, Math.round((idx/Math.max(1,total))*100)));
  const fill = document.getElementById("progressFill"); if(fill) fill.style.width = pct + "%";

  const btnC = document.getElementById("btnContinue"); if(btnC) btnC.href = `watch.html?ep=${encodeURIComponent(continueEp?.id||"")}&show=${encodeURIComponent(show.id)}`;
  const btnR = document.getElementById("btnRestart"); if(btnR) btnR.href = `watch.html?ep=${encodeURIComponent(first?.episodes?.[0]?.id||"")}&show=${encodeURIComponent(show.id)}`;

  // Season dropdown
  const sel = document.getElementById("seasonSelect"); if(sel){ sel.innerHTML = "";
    (show.seasons||[]).forEach((s,i)=>{
      const opt = document.createElement("option");
      opt.value = String(i); opt.textContent = s.name || `Season ${i+1}`;
      if(i===0) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function renderSeason(idxs){
    const season = show.seasons[idxs] || {episodes:[]};
    const grid = document.getElementById("episodeGrid");
    if(grid){
      grid.innerHTML = (season.episodes||[]).map(ep => `
        <a class="ep-card" href="watch.html?ep=${encodeURIComponent(ep.id)}&show=${encodeURIComponent(show.id)}">
          <img src="${ep.thumb}" alt="">
          <div class="body">
            <div style="font-weight:800">${ep.name}</div>
            <div class="muted">${new Date(ep.modified||Date.now()).toLocaleDateString()}</div>
          </div>
        </a>
      `).join("");
    }
  }
  renderSeason(0);
  if(sel) sel.addEventListener("change", e=> renderSeason(+e.target.value));

  // Suggested
  const studio = state.studios.find(s=> (s.shows||[]).some(x=>x.id===show.id));
  const pool = (studio?.shows || state.shows).filter(s=>s.id!==show.id).slice(0,8);
  const sgrid = document.getElementById("suggestGrid");
  if(sgrid){
    sgrid.innerHTML = pool.map(s=> `
      <a class="card" href="show.html?show=${encodeURIComponent(s.id)}">
        ${ s.logo ? `<img class="thumb" src="${s.logo}">` : `<div class="thumb"></div>`}
        <div class="card-body"><div>${s.name}</div></div>
      </a>
    `).join("");
  }

  // Details
  const details = document.getElementById("detailsBox");
  if(details) details.innerHTML = `<p><strong>${show.name}</strong> — ${show.seasonCount||0} season(s). Indexed from your Drive.</p>`;

  // Tabs
  const tabs = document.querySelector(".tabs");
  if(tabs){
    tabs.addEventListener("click", (e)=>{
      const btn = e.target.closest(".tab"); if(!btn) return;
      document.querySelectorAll(".tabs .tab").forEach(b=>b.setAttribute("aria-selected","false"));
      btn.setAttribute("aria-selected","true");
      const tab = btn.dataset.tab;
      ["episodes","suggested","details"].forEach(t => {
        const el = document.getElementById("tab-"+t);
        if(el){ if(t===tab) el.classList.remove("hidden"); else el.classList.add("hidden"); }
      });
    });
  }
}
