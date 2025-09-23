
const Drive = (()=>{
  const API = "https://www.googleapis.com/drive/v3/files";
  const FIELDS = "nextPageToken, files(id,name,mimeType,modifiedTime,parents,thumbnailLink,fileExtension)";
  const FOLDER = "application/vnd.google-apps.folder";

  const isFolder = f => f.mimeType === FOLDER;
  const isVideo  = f => (f.mimeType||"").startsWith("video/");
  const isSeasonName = n => /^season\s*\d+$/i.test((n||"").trim());
  const isLogoName = n => /^logo\.(png|jpg|jpeg|webp)$/i.test(n||"");

  const mediaUrl = (id,key) => `https://www.googleapis.com/drive/v3/files/${id}?alt=media&key=${key}`;
  const thumbUrl = (id) => `https://drive.google.com/thumbnail?id=${id}`;

  async function listChildren(apiKey, folderId){
    let results = [];
    let pageToken = "";
    do{
      const url = new URL(API);
      url.searchParams.set("key", apiKey);
      url.searchParams.set("q", `'${folderId}' in parents and trashed=false`);
      url.searchParams.set("fields", FIELDS);
      if(pageToken) url.searchParams.set("pageToken", pageToken);
      const res = await fetch(url);
      if(!res.ok) throw new Error("Drive list failed");
      const data = await res.json();
      results.push(...(data.files||[]));
      pageToken = data.nextPageToken || "";
    } while(pageToken);
    return results;
  }

  async function crawl(apiKey, studioFolderIds){
    const studios = [];
    for(const studioRoot of studioFolderIds){
      const children = await listChildren(apiKey, studioRoot);
      // Only treat FOLDERS as Studios at root
      const studioFolders = children.filter(isFolder);
      for(const sf of studioFolders){
        const studio = { id: sf.id, name: sf.name, shows: [] };
        // shows = subfolders of a studio
        const showFolders = await listChildren(apiKey, sf.id);
        for(const sh of showFolders.filter(isFolder)){
          const files = await listChildren(apiKey, sh.id);
          const seasons = files.filter(isFolder).filter(f=>isSeasonName(f.name));
          // logo in show root
          let logo = null;
          for(const f of files){
            if(isLogoName(f.name)){
              logo = mediaUrl(f.id, apiKey);
              break;
            }
          }
          // Build episodes grouped by season (or "Season 1" implicit if no seasons)
          const show = { id: sh.id, name: sh.name, logo, seasons:[] };
          if(seasons.length){
            seasons.sort((a,b)=>a.name.localeCompare(b.name, undefined, {numeric:true, sensitivity:"base"}));
            for(const sn of seasons){
              const vids = (await listChildren(apiKey, sn.id)).filter(isVideo);
              const eps = vids.map(v=> ({
                id: v.id,
                name: v.name.replace(/\.[^.]+$/,""),
                embed: `https://drive.google.com/file/d/${v.id}/preview`,
                src: mediaUrl(v.id, apiKey),
                thumb: v.thumbnailLink || thumbUrl(v.id),
                modified: v.modifiedTime
              }));
              show.seasons.push({ id: sn.id, name: sn.name, episodes: eps });
            }
          } else {
            // No explicit season folders—treat videos in show root as Season 1
            const vids = files.filter(isVideo);
            const eps = vids.map(v=> ({
              id: v.id,
              name: v.name.replace(/\.[^.]+$/,""),
              embed: `https://drive.google.com/file/d/${v.id}/preview`,
              src: mediaUrl(v.id, apiKey),
              thumb: v.thumbnailLink || thumbUrl(v.id),
              modified: v.modifiedTime
            }));
            if(eps.length){
              show.seasons.push({ id: sh.id+"-s1", name: "Season 1", episodes: eps });
            }
          }
          show.seasonCount = show.seasons.length;
          studios.push(studio) && studio.shows.push(show);
        }
        // If studio had zero show folders, still include it (empty) to show chips
        studios.push(studio);
      }
    }
    // Flatten unique studios (avoid duplicates if multiple roots)
    const map = new Map();
    for(const s of studios){
      if(!map.has(s.id)) map.set(s.id, s);
      else{
        // merge shows
        const cur = map.get(s.id);
        cur.shows.push(...(s.shows||[]));
      }
    }
    return Array.from(map.values());
  }

  async function loadFromConfig(config){
    if(!config?.apiKey || !Array.isArray(config.folders)) throw new Error("Missing apiKey or folders in config.json");
    return await crawl(config.apiKey, config.folders);
  }

  return { loadFromConfig };
})();
