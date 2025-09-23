
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
