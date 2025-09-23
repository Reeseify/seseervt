
const state = { page: document.body.dataset.page, studios: [], shows: [], show: null, search: "" };

const $ = (s,el=document)=>el.querySelector(s);
const $$ = (s,el=document)=>Array.from(el.querySelectorAll(s));

function showTile(show){
  const art = show.logo ? `<img src="${show.logo}" alt="${show.name} logo">`
                        : `<div class="thumb" style="display:grid;place-items:center;font-weight:800">${show.name}</div>`;
  return `<a class="tile" href="show.html?show=${encodeURIComponent(show.id)}" title="${show.name}">
    ${art}
    <div class="shim"></div>
    <div class="label"><span class="name">${show.name}</span><span class="badge">${show.seasonCount||0}s</span></div>
  </a>`;
}

function card(ep){
  return `<a class="card" href="watch.html?ep=${encodeURIComponent(ep.id)}&show=${encodeURIComponent(state.show?.id||"")}">
    <img class="thumb" src="${ep.thumb}" alt="">
    <div class="card-body">
      <div>${ep.name}</div>
      <div class="muted">${new Date(ep.modified||Date.now()).toLocaleDateString()}</div>
    </div>
  </a>`;
}

function allShows(){
  return state.studios.flatMap(s=>s.shows||[]);
}

function parseQuery(){
  const q = new URL(location.href).searchParams;
  return Object.fromEntries(q.entries());
}

async function boot(){
  try{
    const config = await (await fetch("config.json")).json();
    const studios = await Drive.loadFromConfig(config);
    state.studios = studios;
    state.shows = allShows();

    // search bind
    const searchBox = $("#q");
    if(searchBox){
      searchBox.addEventListener("input", e=>{
        state.search = e.target.value.toLowerCase().trim();
        if(state.page === "browse") renderBrowse();
        if(state.page === "library") renderLibrary();
      });
    }

    switch(state.page){
      case "home": renderHome(); break;
      case "browse": renderBrowse(); break;
      case "library": renderLibrary(); break;
      case "show": await renderShow(); break;
      case "watch": await renderWatch(); break;
    }
  } catch (e){
    console.error(e);
  }
}

function renderHome(){
  // Top picks: first 10 shows
  $("#row-top").innerHTML = state.shows.slice(0,10).map(showTile).join("");
  // Studios row
  $("#studios").innerHTML = state.studios.map(s=>{
    const count = (s.shows||[]).length;
    return `<span class="chip" data-studio="${s.id}" title="${count} show(s)">${s.name}</span>`;
  }).join("");
  // Latest shows (by latest episode date)
  const ranked = [...state.shows].sort((a,b)=>{
    const ad = new Date((a.seasons?.[0]?.episodes?.[0]?.modified)||0).getTime();
    const bd = new Date((b.seasons?.[0]?.episodes?.[0]?.modified)||0).getTime();
    return bd-ad;
  });
  $("#row-latest").innerHTML = ranked.slice(0,12).map(showTile).join("");

  // Click a studio chip -> browse filtered
  $("#studios").addEventListener("click", (e)=>{
    const chip = e.target.closest(".chip");
    if(!chip) return;
    const id = chip.dataset.studio;
    localStorage.setItem("browseStudio", id);
    location.href = "browse.html";
  });
}

function renderBrowse(){
  const grid = $("#browse-grid");
  const chips = $("#studio-chips");
  chips.innerHTML = state.studios.map(s=>`<button class="chip" data-id="${s.id}">${s.name}</button>`).join("");
  const cur = localStorage.getItem("browseStudio");
  if(cur) {
    const btn = chips.querySelector(`[data-id="${CSS.escape(cur)}"]`);
    if(btn) btn.setAttribute("aria-current","true");
  }
  function currentFilter(s){
    if(!cur) return true;
    return s.studioId === cur || s.parentStudioId === cur; // in case we annotate later
  }
  const q = state.search;
  const shows = state.shows
    .filter(sh => (!q || sh.name.toLowerCase().includes(q)))
    .filter(sh => !cur || (state.studios.find(s=>s.id===cur)?.shows||[]).some(it=>it.id===sh.id));

  grid.innerHTML = shows.map(showTile).join("");

  chips.addEventListener("click", (e)=>{
    const b = e.target.closest(".chip");
    if(!b) return;
    if(cur === b.dataset.id) localStorage.removeItem("browseStudio");
    else localStorage.setItem("browseStudio", b.dataset.id);
    renderBrowse();
  });
}

function renderLibrary(){
  const grid = $("#library-grid");
  const q = state.search;
  const shows = state.shows.filter(sh => !q || sh.name.toLowerCase().includes(q));
  grid.innerHTML = shows.map(showTile).join("");
}

async function renderShow(){
  const { show: showId } = parseQuery();
  const show = state.shows.find(s=>s.id === showId) || state.shows[0];
  state.show = show;
  // hero
  $("#show-hero").innerHTML = `
    <img src="${show.logo || 'img/favicon.png'}" alt="" style="width:160px;height:160px;object-fit:cover;border-radius:18px; border:1px solid rgba(255,255,255,.1)">
    <div>
      <h1 class="h1" style="margin:.25rem 0">${show.name}</h1>
      <p class="sub">${show.seasonCount||0} season(s)</p>
    </div>`;

  // season chips
  const chips = $("#season-chips");
  chips.innerHTML = (show.seasons||[]).map((s,i)=>`<button class="chip" data-idx="${i}" ${i===0?'aria-current="true"':''}>${s.name}</button>`).join("");

  function renderSeason(idx){
    const season = show.seasons[idx] || {episodes:[]};
    $("#episode-grid").innerHTML = season.episodes.map(card).join("");
  }
  renderSeason(0);

  chips.addEventListener("click", (e)=>{
    const b = e.target.closest(".chip");
    if(!b) return;
    chips.querySelectorAll(".chip").forEach(c=>c.removeAttribute("aria-current"));
    b.setAttribute("aria-current","true");
    renderSeason(+b.dataset.idx);
  });
}

async function renderWatch(){
  const { ep, show: showId } = parseQuery();
  const show = state.shows.find(s=>s.id===showId) || state.shows[0];
  state.show = show;
  let current = null;
  for(const s of show.seasons||[]){
    for(const e of s.episodes||[]){
      if(e.id === ep){ current = e; break; }
    }
  }
  if(!current) current = show.seasons?.[0]?.episodes?.[0];
  $("#player").innerHTML = `<iframe src="${current.embed}" style="width:100%; aspect-ratio:16/9; border:0" allow="autoplay" allowfullscreen></iframe>`;
  // Up next: rest of season
  const season = (show.seasons||[]).find(sn=>(sn.episodes||[]).some(e=>e.id===current.id)) || show.seasons?.[0];
  const upnext = (season.episodes||[]).filter(e=>e.id!==current.id).slice(0,8);
  $("#upnext").innerHTML = upnext.map(card).join("");
}

document.addEventListener("DOMContentLoaded", boot);
