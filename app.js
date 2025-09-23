// app.js snippet
function wireCommon(){
  // footer year
  const y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();

  // live search (home page only)
  const search = document.querySelector('#search');
  if (search){
    search.addEventListener('input', ()=>{
      state.q = search.value || '';
      if (state.page === 'home' && state.data){
        const q = state.q.toLowerCase();
        const shows = state.data.shows || deriveShows(state.data);
        const list = shows.filter(s =>
          s.name.toLowerCase().includes(q) ||
          (s.studio || '').toLowerCase().includes(q)
        );
        const grid = document.getElementById('row-all');
        if (grid) grid.innerHTML = list.map(tile).join('');
      }
    });
  }
}
