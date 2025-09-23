
/* Reese's TV static app (Drive auto-scan enabled) */
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const state = { data:null, page:document.body.dataset.page, q:"" };

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
  const latest = data.videos.slice(0,8);
  $('#latest-grid').innerHTML = latest.map(card).join('');
  $('#all-grid').innerHTML = data.videos.map(card).join('');
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
  const tags = [...new Set(data.videos.flatMap(v=>v.tags||[]))];
  const filters = $('#filters');
  tags.forEach(t=>{
    const el = document.createElement('button');
    el.className='filter'; el.textContent=t; el.setAttribute('aria-pressed','false');
    el.onclick=()=>{
      const on = el.getAttribute('aria-pressed')==='true' ? 'false':'true';
      el.setAttribute('aria-pressed', on);
      applyFilters();
    };
    filters.appendChild(el);
  });
  const grid = $('#library-grid');
  function applyFilters(){
    const active = $$('.filter[aria-pressed="true"]').map(b=>b.textContent);
    const q = ($('#search')?.value||'').toLowerCase().trim();
    const list = data.videos.filter(v=>{
      const qok = !q || v.title.toLowerCase().includes(q) || (v.description||'').toLowerCase().includes(q);
      const tok = active.length===0 || (v.tags||[]).some(t=>active.includes(t));
      return qok && tok;
    });
    grid.innerHTML = list.map(card).join('');
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
        const all = state.data.videos.filter(v => v.title.toLowerCase().includes(q) || (v.description||'').toLowerCase().includes(q));
        $('#all-grid').innerHTML = all.map(card).join('');
      }
    });
  }
}

(async function init(){
  wireCommon();
  const data = await loadData();
  if(state.page==='home') renderHome(data);
  if(state.page==='watch') renderWatch(data);
  if(state.page==='library') renderLibrary(data);
})();


// --- Extra rendering for Studios and hierarchical browse ---
function studioTile(st){
  const logo = st.logo || 'img/logo-full.png';
  return `<a class="logo-card" href="browse.html?folder=${encodeURIComponent(st.id)}" title="${st.name}">
    <img src="${logo}" alt="${st.name} logo" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'fallback',textContent:'${st.name}'}))">
  </a>`;
}
function showTile(sh){
  const logo = sh.logo || 'img/logo-full.png';
  return `<a class="logo-card" href="browse.html?folder=${encodeURIComponent(sh.id)}" title="${sh.name}">
    <img src="${logo}" alt="${sh.name} logo" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'fallback',textContent:'${sh.name}'}))">
  </a>`;
}

function renderStudiosHome(data){
  if(!data.studios) return;
  const sec = document.createElement('section');
  sec.className='section carousel';
  sec.innerHTML = `<h3>Studios</h3><div class="row" id="studios-row"></div>`;
  document.querySelector('.container').insertBefore(sec, document.querySelector('#latest'));
  const row = document.getElementById('studios-row');
  row.innerHTML = data.studios.map(studioTile).join('');
}

async function renderBrowsePage(data){
  const params = new URLSearchParams(location.search);
  const folder = params.get('folder'); // if null, show studios
  const crumbs = document.getElementById('crumbs');
  const foldersWrap = document.getElementById('folders');
  const videosWrap = document.getElementById('videos');
  const makeCrumb = (label, href) => `<a ${href?`href="${href}"`:''}>${label}</a>`;

  if(!folder){
    crumbs.innerHTML = makeCrumb('Studios');
    foldersWrap.innerHTML = data.studios.map(studioTile).join('');
    videosWrap.innerHTML = '';
    return;
  }
  // Try to match studio or show
  const studio = (data.studios||[]).find(s=> s.id===folder);
  if(studio){
    crumbs.innerHTML = makeCrumb('Studios','browse.html') + ' / ' + makeCrumb(studio.name);
    foldersWrap.innerHTML = studio.shows.map(showTile).join('');
    videosWrap.innerHTML = studio.videos.map(card).join('');
    return;
  }
  // maybe it's a show id; find in all studios
  let show=null, parentStudio=null;
  for(const s of (data.studios||[])){
    const found = s.shows.find(x=>x.id===folder);
    if(found){ show=found; parentStudio=s; break; }
  }
  if(show){
    crumbs.innerHTML = makeCrumb('Studios','browse.html') + ' / ' + makeCrumb(parentStudio.name, `browse.html?folder=${parentStudio.id}`) + ' / ' + makeCrumb(show.name);
    foldersWrap.innerHTML = '';
    videosWrap.innerHTML = show.videos.map(card).join('');
    return;
  }
  // Fallback: list folder children generically
  const cfg = await (await fetch('config.json')).json().catch(()=>null);
  if(cfg){
    try{
      const fdata = await Drive.readFolder(cfg.apiKey, folder);
      const fakeShows = (fdata.folders||[]).map(f => ({id:f.id, name:f.name, logo:null}));
      crumbs.innerHTML = makeCrumb('Browse');
      foldersWrap.innerHTML = fakeShows.map(showTile).join('');
      videosWrap.innerHTML = (fdata.videos||[]).map(v=>card({id:v.id,title:v.name, published:(v.modifiedTime||'').slice(0,10), thumb:v.thumbnailLink, source:'drive'})).join('');
    }catch(e){ console.warn(e); }
  }
}

// Hook into existing init
(async function extraInit(){
  if(!state?.data) return;
})();

// Patch main init to insert Studios on home and support browse page
(async function init2(){
  // Wait a microtask for previous init to populate
  setTimeout(async ()=>{
    const data = await loadData();
    if(document.body.dataset.page==='home'){ renderStudiosHome(data); enhanceHome(data);}
    if(document.body.dataset.page==='browse') renderBrowsePage(data);
  }, 0);
})();


// ---- Top Picks banner (uses tag 'featured' or first 3 latest)
function renderTopPicks(data){
  const picks = data.videos.filter(v => (v.tags||[]).map(t=>t.toLowerCase()).includes('featured')).slice(0,5);
  const list = picks.length ? picks : data.videos.slice(0,5);
  const wrap = document.getElementById('top-picks');
  if(!wrap) return;
  wrap.innerHTML = `
    ${list.map((v,i)=>`
      <div class="slide ${i===0?'active':''}">
        <img class="media" src="${thumbFor(v)}" alt="">
        <div class="content">
          <h3>${v.title}</h3>
          <p class="muted">${(v.description||'').slice(0,120)}${(v.description||'').length>120?'…':''}</p>
          <a class="btn primary" href="watch.html?vid=${encodeURIComponent(v.id)}">Watch</a>
        </div>
      </div>
    `).join('')}
    <div class="controls">
      <button class="ctrl" id="prevSlide" aria-label="Previous">‹</button>
      <button class="ctrl" id="nextSlide" aria-label="Next">›</button>
    </div>
    <div class="dots">${list.map((_,i)=>`<span class="${i===0?'active':''}"></span>`).join('')}</div>
  `;
  let idx = 0;
  const slides = Array.from(wrap.querySelectorAll('.slide'));
  const dots = Array.from(wrap.querySelectorAll('.dots span'));
  const show = (n)=>{ idx=(n+slides.length)%slides.length; slides.forEach((s,i)=>s.classList.toggle('active', i===idx)); dots.forEach((d,i)=>d.classList.toggle('active', i===idx)); };
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
  const grid = document.getElementById('all-grid');
  if(!grid) return;
  if(!studio || studio==='__ALL__'){
    grid.innerHTML = videos.map(card).join('');
    return;
  }
  const list = videos.filter(v => (v.tags||[]).includes(studio));
  grid.innerHTML = list.map(card).join('');
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
