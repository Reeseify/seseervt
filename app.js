// API-driven version (no Google Drive).
// Reads config.apiBase, calls /api/catalog, and renders pages.

var state = window.state || { data: null, page: (document.body && document.body.dataset.page) || 'home', q: "" };
window.state = state;

const $  = (sel, el=document) => el.querySelector(sel);
const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));

async function getConfig(){
  try { return await fetch("config.json").then(r=>r.json()); }
  catch { return {}; }
}

function tile(show){
  const logo = show.logo
    ? `<img src="${show.logo}" alt="${show.name} logo" />`
    : `<div class="thumb" style="display:grid;place-items:center;font-weight:800">${show.name}</div>`;
  return `<a class="tile" href="show.html?show=${encodeURIComponent(show.id)}" title="${show.name}">
    ${logo}
    <div class="shim"></div>
    <div class="label"><span class="name">${show.name}</span><span class="badge">${(show.seasons||[]).length || show.seasons || 0}s</span></div>
  </a>`;
}

function deriveShows(data){
  const out=[];
  (data.studios||[]).forEach(st=>{
    (st.shows||[]).forEach(sh=>{
      const all = (sh.seasons||[]).flatMap(s=>s.videos||[]);
      const latest = all.reduce((m,v)=>Math.max(m, Date.parse(v.modified||v.published||'')||0),0);
      out.push({ id: sh.id, name: sh.name, studio: st.name||"", logo: sh.logo||null, seasons: sh.seasons||[], latestPublished: latest });
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
      <div class="subtitle">${(pick.seasons||[]).length} season${(pick.seasons||[]).length===1?"":"s"} • ${pick.studio||""}</div>
      <div class="cta">
        <a class="primary" href="show.html?show=${encodeURIComponent(pick.id)}">Open</a>
        <a class="secondary" href="browse.html">Browse</a>
      </div>
    </div>`;
}

function fillScroller(el, items){ if(el) el.innerHTML = items.map(tile).join(""); }
function scrollRow(id, dir){ const el=document.querySelector(id); if(el) el.scrollBy({left:dir*(el.clientWidth*0.9), behavior:'smooth'}); }

function renderHome(data){
  const shows = deriveShows(data);
  if(!shows.length){ console.warn("No shows found in data:", data); return; }
  const latest = [...shows].sort((a,b)=>(b.latestPublished||0)-(a.latestPublished||0)).slice(0,12);
  mountHero(latest.length?latest:shows);
  fillScroller(document.getElementById('row-latest')||document.getElementById('row-top'), latest.length?latest:shows.slice(0,12));
  fillScroller(document.getElementById('row-all')||document.getElementById('row-trend'), shows.slice(0,18));
  fillScroller(document.getElementById('row-more')||document.getElementById('row-because'), shows.slice(18,36));
}

function renderBrowse(data){
  const wrap = document.getElementById('poster-grid') || document.querySelector('.poster-grid');
  if(!wrap) return;
  const shows = deriveShows(data);
  wrap.innerHTML = shows.map(tile).join("");
}

function renderLibrary(data){ renderBrowse(data); }

function parseQuery(){ const o={}; (location.search||"").replace(/^\?/,"").split("&").filter(Boolean).forEach(kv=>{const[k,v=""]=kv.split("=");o[decodeURIComponent(k)]=decodeURIComponent(v)}); return o; }
function findShowById(data, id){ for(const st of (data.studios||[])){ for(const sh of (st.shows||[])){ if(sh.id===id) return {show:sh, studio:st}; } } return null; }

async function renderShow(){
  const { show: showId } = parseQuery();
  if(!state.data || !showId) return;
  const found = findShowById(state.data, showId); if(!found) return;
  const { show, studio } = found;
  const title = document.getElementById('show-title'); if(title) title.textContent = show.name;
  const logo = document.getElementById('show-logo'); if(logo && show.logo) logo.src = show.logo;
  const sel = document.getElementById('seasonSelect');
  if(sel){ sel.innerHTML=""; (show.seasons||[]).forEach((s,i)=>{ const o=document.createElement('option'); o.value=String(i); o.textContent=s.name||`Season ${i+1}`; if(i===0) o.selected=true; sel.appendChild(o);}); }
  function paint(idx){ const season = show.seasons[idx]||{videos:[]}; const grid=document.getElementById('episodeGrid'); if(!grid) return;
    grid.innerHTML = (season.videos||[]).map(ep=>`
      <a class="ep-card" href="watch.html?show=${encodeURIComponent(show.id)}&vid=${encodeURIComponent(ep.id)}">
        <img src="${ep.thumb || show.logo || ''}" alt="">
        <div class="body">
          <div style="font-weight:800">${ep.name}</div>
          <div class="muted">${new Date(ep.modified||Date.now()).toLocaleDateString()}</div>
        </div>
      </a>`).join("");
  }
  paint(0); if(sel) sel.addEventListener('change', e=>paint(+e.target.value));
  const sugg = document.getElementById('suggest-grid');
  if(sugg){ const pool=(studio?.shows||[]).filter(s=>s.id!==show.id); sugg.innerHTML=pool.slice(0,12).map(s=>tile({id:s.id,name:s.name,logo:s.logo||null,seasons:s.seasons||[]})).join(""); }
}

async function renderWatch(){
  const { show: showId, vid: vidId } = parseQuery();
  if(!state.data) return;
  const found = findShowById(state.data, showId); if(!found) return;
  const { show } = found;
  let video=null; for(const sn of (show.seasons||[])){ for(const v of (sn.videos||[])){ if(v.id===vidId){ video=v; break; } } if(video) break; }
  const title = document.getElementById('watch-title'); if(title) title.textContent = video ? video.name : show.name;
  const frame = document.getElementById('watch-frame'); if(frame){ frame.src = (video && (video.embed || video.src)) || ""; }
}

async function boot(){
  try{
    const cfg = await getConfig();
    const base = (cfg.apiBase || "").replace(/\/$/,'');
    const res  = await fetch(base + '/api/catalog');
    const data = await res.json();
    state.data = data;
    switch(state.page){
      case 'home':    renderHome(data);    break;
      case 'browse':  renderBrowse(data);  break;
      case 'library': renderLibrary(data); break;
      case 'show':    renderShow();        break;
      case 'watch':   renderWatch();       break;
    }
  }catch(err){ console.error('Boot failed:', err); }
}
document.addEventListener('DOMContentLoaded', boot);
