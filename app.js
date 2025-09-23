
/* Reese's TV static app (Drive auto-scan enabled) */
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const state = { data:null, page:document.body.dataset.page, q:"" };

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
  const hero = document.getElementById('hero');
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



async function loadLocalVideosJson(){
  try{
    const res = await fetch('videos.json', {cache:'no-store'});
    if(!res.ok) throw new Error('no local manifest');
    return await res.json();
  }catch(e){ return null; }
}

async function loadConfig(){
  try{
    const res = await fetch('config.json', {cache:'no-store'});
    if(!res.ok) throw new Error('no config');
    return await res.json();
  }catch(e){ return null; }
}

async function loadData(){
  if(state.data) return state.data;

  // Prefer Drive auto-scan if config exists
  const cfg = await loadConfig();
  if(cfg && typeof Drive !== "undefined"){
    try{
      // Basic cache (5 minutes) to avoid API quota spikes
      const now = Date.now();
      const cached = localStorage.getItem('rtv_cache');
      if(cached){
        const obj = JSON.parse(cached);
        if(now - (obj.ts||0) < 5*60*1000){
          state.data = obj.data;
          return state.data;
        }
      }
      const fromDrive = await Drive.loadFromConfig(cfg);
      if(fromDrive){
        state.data = fromDrive;
        localStorage.setItem('rtv_cache', JSON.stringify({ts:now, data:state.data}));
        return state.data;
      }
    }catch(e){
      console.warn("Drive scan failed, falling back to videos.json", e);
    }
  }

  // Fallback to static manifest
  const local = await loadLocalVideosJson();
  if(local){ state.data = local; return state.data; }

  // Final fallback: empty
  state.data = { videos: [] };
  return state.data;
}

function thumbFor(v){
  if(v.thumb) return v.thumb;
  if(v.source==='drive' && v.id) return `https://drive.google.com/thumbnail?id=${v.id}`;
  return 'img/favicon.png';
}
function embedFor(v){
  if(v.embed) return v.embed;
  if(v.source==='drive' && v.id) return `https://drive.google.com/file/d/${v.id}/preview`;
  return '';
}
function downloadFor(v){
  if(v.download) return v.download;
  if(v.source==='drive' && v.id) return `https://drive.google.com/uc?export=download&id=${v.id}`;
  return '#';
}
function driveLink(v){
  if(v.source==='drive' && v.id) return `https://drive.google.com/file/d/${v.id}/view`;
  return '#';
}

function card(v){
  return `<a class="card" href="watch.html?vid=${encodeURIComponent(v.id)}" aria-label="${v.title}">
    <img class="thumb" src="${thumbFor(v)}" alt="Thumbnail for ${v.title}">
    <div class="card-body">
      <h3>${v.title}</h3>
      <div class="badge">${(v.published||'').slice(0,10)}</div>
    </div>
  </a>`;
}

function item(v){
  return `<a class="item" href="watch.html?vid=${encodeURIComponent(v.id)}">
    <img src="${thumbFor(v)}" alt="">
    <div class="meta">
      <strong>${v.title}</strong>
      <span class="muted">${(v.description||'').slice(0,90)}${(v.description||'').length>90?'…':''}</span>
    </div>
  </a>`;
}

function renderHome(data){
  const shows = data.shows || deriveShows(data);
  const latest = [...shows].sort((a,b)=> (b.latestPublished||0)-(a.latestPublished||0)).slice(0,12);
  mountHero(latest.length?latest:shows);
  const latestRow = document.getElementById('row-latest');
  const allRow = document.getElementById('row-all');
  if(latestRow) latestRow.innerHTML = latest.map(tile).join('');
  if(allRow) allRow.innerHTML = shows.map(tile).join('');
  paintChips(data);
  // wire row controls
  $$('.controls .prev').forEach(b=> b.onclick = ()=> scrollRow(b.dataset.target, -1));
  $$('.controls .next').forEach(b=> b.onclick = ()=> scrollRow(b.dataset.target, +1));
}

function renderWatch(data){
  const params = new URLSearchParams(location.search);
  const id = params.get('vid');
  const v = data.videos.find(x => String(x.id)===String(id)) || data.videos[0];
  if(!v) return;
  $('#player').src = embedFor(v);
  $('#video-title').textContent = v.title;
  $('#video-desc').textContent = v.description||'';
  $('#download').href = downloadFor(v);
  $('#open-drive').href = driveLink(v);
  const tagsWrap = $('#video-tags');
  tagsWrap.innerHTML = (v.tags||[]).map(t=>`<span class="tag">${t}</span>`).join('');
  const others = data.videos.filter(x=>x.id!==v.id).slice(0,10);
  $('#upnext').innerHTML = others.map(item).join('');
}

function renderLibrary(data){
  const shows = data.shows || deriveShows(data);
  const grid = document.getElementById('row-all') || document.getElementById('library-grid') || document.getElementById('videos');
  if(!grid) return;
  grid.innerHTML = shows.map(tile).join('');
}
  applyFilters();
  $('#search')?.addEventListener('input', applyFilters);
}

function wireCommon(){
  const y = document.getElementById('year'); if(y) y.textContent = new Date().getFullYear();
  const search = $('#search');
  if(search){
    search.addEventListener('input', ()=>{
      state.q = search.value;
      if(state.page==='home'){
        const q = state.q.toLowerCase();
        const shows = state.data.shows || deriveShows(state.data);
        const list = shows.filter(s => s.name.toLowerCase().includes(q) || s.studio.toLowerCase().includes(q));
        const grid = document.getElementById('row-all');
        if(grid) grid.innerHTML = list.map(showCard).join('');
      };
  wrap.querySelector('#prevSlide').onclick = ()=> show(idx-1);
  wrap.querySelector('#nextSlide').onclick = ()=> show(idx+1);
  let timer = setInterval(()=> show(idx+1), 6000);
  wrap.addEventListener('mouseenter', ()=> clearInterval(timer));
  wrap.addEventListener('mouseleave', ()=> timer = setInterval(()=> show(idx+1), 6000));
}

// ---- Channel buttons + rows
function renderChannelsBar(data){
  const bar = document.getElementById('channel-buttons');
  if(!bar || !data.studios) return;
  const btn = (st)=> `<button class="channel-btn" data-studio="${st.name}" aria-pressed="false">${st.logo?`<img src="${st.logo}" alt="">`:''}<span>${st.name}</span></button>`;
  bar.innerHTML = `<button class="channel-btn" data-studio="__ALL__" aria-pressed="true">All</button>` + data.studios.map(btn).join('');
  bar.addEventListener('click', ev=>{
    const b = ev.target.closest('.channel-btn'); if(!b) return;
    bar.querySelectorAll('.channel-btn').forEach(x=>x.setAttribute('aria-pressed','false'));
    b.setAttribute('aria-pressed','true');
    const studio = b.dataset.studio;
    filterHomeByStudio(studio);
  });
}

function filterHomeByStudio(studio){
  const videos = state.data.videos;
  const grid = document.getElementById('row-all');
  if(!grid) return;
  if(!studio || studio==='__ALL__'){
    grid.innerHTML = videos.map(card).join('');
    return;
  }
  const list = videos.filter(v => (v.tags||[]).includes(studio));
  grid.innerHTML = list.map(card).join('');
}



// ---- Build a 'shows' collection from hierarchy (studios->shows), with poster/hero
function deriveShows(data){
  const shows = [];
  (data.studios||[]).forEach(st=>{
    (st.shows||[]).forEach(sh=>{
      // Poster: show logo if available; else try first video's thumb
      const poster = sh.logo || (sh.videos && sh.videos[0] ? thumbFor(sh.videos[0]) : null) || 'img/logo-full.png';
      const latest = (sh.videos||[]).reduce((m,v)=> Math.max(m, Date.parse(v.published||'')||0), 0);
      shows.push({
        id: sh.id,
        name: sh.name,
        studio: st.name,
        logo: sh.logo || null,
        poster,
        count: (sh.videos||[]).length,
        seasons: (sh.seasons||[]).length,
        latestPublished: latest
      });
    });
  });
  shows.sort((a,b)=> b.count - a.count || a.name.localeCompare(b.name));
  data.shows = shows;
  return shows;
}
// ---- Home enhancements
function enhanceHome(data){
  renderTopPicks(data);
  renderChannelsBar(data);
}

// sticky topbar effect
window.addEventListener('scroll', ()=>{
  const tb = document.querySelector('.topbar');
  if(!tb) return;
  if(window.scrollY>10) tb.classList.add('scrolled'); else tb.classList.remove('scrolled');
});


function renderShowsSearchBar(){
  const search = document.getElementById('search');
  if(!search || !state.data?.shows) return;
  const grid = document.getElementById('row-all');
  grid.innerHTML = state.data.videos.map(card).join(''); // initial keep
  search.placeholder = "Search shows…";
  const makeTile = (s)=> `<a class="logo-card" href="show.html?show=${encodeURIComponent(s.id)}" title="${s.name}">
    ${s.logo?`<img src="${s.logo}" alt="${s.name} logo">`:`<div class="fallback">${s.name}</div>`}
  </a>`;
  const injectShows = (list)=>{
    // Render shows above all-grid for clarity
    let holder = document.getElementById('shows-search-results');
    if(!holder){
      const sec = document.createElement('section');
      sec.className = 'section';
      sec.innerHTML = `<h2><span class="dot"></span> Shows</h2><div id="shows-search-results" class="logo-grid"></div>`;
      document.querySelector('.container').insertBefore(sec, document.getElementById('latest'));
      holder = sec.querySelector('#shows-search-results');
    }
    holder.innerHTML = list.map(makeTile).join('');
  };
  // initial render
  injectShows(state.data.shows);
  search.addEventListener('input', ()=>{
    const q = search.value.toLowerCase();
    const list = state.data.shows.filter(s => s.name.toLowerCase().includes(q) || s.studio.toLowerCase().includes(q));
    injectShows(list);
  });
}

// Library page: show the shows
(function(){
  if(document.body.dataset.page!=='library') return;
  const grid = document.getElementById('library-grid');
  const filters = document.getElementById('filters');

  function renderLibraryShows(){
    const shows = state.data.shows || deriveShows(state.data);
    const studios = [...new Set(shows.map(s=>s.studio))];
    filters.innerHTML = '';
    studios.forEach(st=>{
      const b = document.createElement('button');
      b.className='filter'; b.textContent=st; b.setAttribute('aria-pressed','false');
      b.onclick=()=>{ b.setAttribute('aria-pressed', b.getAttribute('aria-pressed')==='true'?'false':'true'); apply(); };
      filters.appendChild(b);
    });
    const tile = (s)=> `<a class="logo-card" href="show.html?show=${encodeURIComponent(s.id)}">${s.logo?`<img src="${s.logo}" alt="${s.name} logo">`:`<div class="fallback">${s.name}</div>`}</a>`;
    function apply(){
      const active = Array.from(filters.querySelectorAll('.filter[aria-pressed="true"]')).map(x=>x.textContent);
      const q = (document.getElementById('search')?.value||'').toLowerCase();
      const list = shows.filter(s => (!active.length || active.includes(s.studio)) && (!q || s.name.toLowerCase().includes(q) || s.studio.toLowerCase().includes(q)));
      grid.innerHTML = list.map(tile).join('');
    }
    apply();
    document.getElementById('search')?.addEventListener('input', apply);
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    setTimeout(()=>{
      if(state.data) renderLibraryShows();
    }, 0);
  });
})();

// Rewire Top Picks to use shows when available
(function(){
  const orig = renderTopPicks;
  renderTopPicks = (data)=>{
    deriveShows(data);
    const featuredShows = data.shows.filter(s => (s.name||'').toLowerCase().includes('[featured]')).slice(0,5); // optional convention
    const wrap = document.getElementById('top-picks');
    if(featuredShows.length && wrap){
      wrap.innerHTML = featuredShows.map((s,i)=>`
        <div class="slide ${i===0?'active':''}">
          <img class="media" src="${s.poster}" alt="">
          <div class="content">
            <h3>${s.name}</h3>
            <p class="muted">${s.studio}</p>
            <a class="btn primary" href="show.html?show=${encodeURIComponent(s.id)}">Open Show</a>
          </div>
        </div>
      `).join('') + `
      <div class="controls">
        <button class="ctrl" id="prevSlide" aria-label="Previous">‹</button>
        <button class="ctrl" id="nextSlide" aria-label="Next">›</button>
      </div>
      <div class="dots">${featuredShows.map((_,i)=>`<span class="${i===0?'active':''}"></span>`).join('')}</div>`;
      // same slider wiring
      let idx = 0;
      const slides = Array.from(wrap.querySelectorAll('.slide'));
      const dots = Array.from(wrap.querySelectorAll('.dots span'));
      const show = (n)=>{ idx=(n+slides.length)%slides.length; slides.forEach((s,i)=>s.classList.toggle('active', i===idx)); dots.forEach((d,i)=>d.classList.toggle('active', i===idx)); };
      wrap.querySelector('#prevSlide').onclick = ()=> show(idx-1);
      wrap.querySelector('#nextSlide').onclick = ()=> show(idx+1);
      let timer = setInterval(()=> show(idx+1), 6000);
      wrap.addEventListener('mouseenter', ()=> clearInterval(timer));
      wrap.addEventListener('mouseleave', ()=> timer = setInterval(()=> show(idx+1), 6000));
    }else{
      orig(data);
    }
  };
})();


// ===== Show page renderer =====
async function renderShowPage(data){
  const params = new URLSearchParams(location.search);
  const showId = params.get('show');
  if(!showId) return;
  let studio=null, show=null;
  for(const s of (data.studios||[])){
    const found = (s.shows||[]).find(x=>x.id===showId);
    if(found){ show=found; studio=s; break; }
  }
  if(!show) return;

  // Hero
  const hero = document.getElementById('show-hero');
  const poster = show.logo || (show.videos[0] ? thumbFor(show.videos[0]) : 'img/logo-full.png');
  hero.style.background = `center/cover no-repeat url('${poster}')`;
  const logoEl = document.getElementById('show-logo');
  if(show.logo){ logoEl.src = show.logo; logoEl.alt = `${show.name} logo`; } else { logoEl.remove(); }
  document.getElementById('show-desc').textContent = `${studio.name} • ${show.videos.length} episode${show.videos.length===1?'':'s'}`;

  // Continue/Restart
  const first = show.videos[0];
  if(first){
    document.getElementById('btn-continue').href = `watch.html?vid=${encodeURIComponent(first.id)}`;
    document.getElementById('btn-restart').href = `watch.html?vid=${encodeURIComponent(first.id)}`;
  }

  // Tabs
  const tabs = Array.from(document.querySelectorAll('.tab'));
  const panels = Array.from(document.querySelectorAll('.tab-panel'));
  tabs.forEach(t => t.addEventListener('click', ()=>{
    tabs.forEach(x=>x.classList.remove('active')); t.classList.add('active');
    panels.forEach(p=>p.classList.remove('active'));
    document.getElementById('tab-'+t.dataset.tab).classList.add('active');
  }));

  // Episodes tab with season dropdown
  const seasonBtn = document.getElementById('seasonBtn');
  const seasonMenu = document.getElementById('seasonMenu');
  const grid = document.getElementById('episodes-grid');
  const seasons = show.seasons.length ? show.seasons : [{name:'All', videos:show.videos}];
  function renderEpisodes(list){ grid.innerHTML = list.map(card).join(''); }
  function pickSeason(s){
    seasonBtn.textContent = s.name || 'Season';
    renderEpisodes(s.videos || show.videos);
    seasonMenu.hidden = true;
  }
  seasonMenu.innerHTML = seasons.map((s,i)=>`<button data-i="${i}">${s.name}</button>`).join('');
  seasonMenu.addEventListener('click', e=>{
    const b = e.target.closest('button'); if(!b) return;
    pickSeason(seasons[parseInt(b.dataset.i,10)]);
  });
  seasonBtn.onclick = ()=> { seasonMenu.hidden = !seasonMenu.hidden; };
  pickSeason(seasons[0]);

  // Suggested tab: other shows from same studio
  const row = document.getElementById('suggested-row');
  const others = (studio.shows||[]).filter(x=>x.id!==show.id).slice(0,10);
  row.innerHTML = others.map(s=>`<a class="logo-card" href="show.html?show=${encodeURIComponent(s.id)}">${s.logo?`<img src="${s.logo}" alt="${s.name} logo">`:`<div class="fallback">${s.name}</div>`}</a>`).join('');

  // Details tab
  document.getElementById('details-title').textContent = show.name;
  document.getElementById('details-plot').textContent = `Episodes curated from ${studio.name}.`;
  document.getElementById('details-studio').textContent = studio.name;
  document.getElementById('details-seasons').textContent = show.seasons.length || '-';
  document.getElementById('details-episodes').textContent = show.videos.length;
}

(function(){
  if(document.body.dataset.page==='show'){
    (async()=>{
      const data = await loadData();
      renderShowPage(data);
    })();
  }
})();


function showCard(s){
  // Fallback text tile if logo missing
  const img = s.logo ? `<img class="thumb" src="${s.logo}" alt="${s.name} logo" style="object-fit:contain;background:#0b1140">`
                     : `<div class="thumb" style="display:grid;place-items:center;font-weight:700">${s.name}</div>`;
  return `<a class="card" href="show.html?show=${encodeURIComponent(s.id)}">
    ${img}
    <div class="card-body">
      <h3>${s.name}</h3>
      <div class="badge">${s.seasons||0} season${(s.seasons||0)==1?'':'s'}</div>
    </div>
  </a>`;
}
