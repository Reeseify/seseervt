
const Drive = (()=>{
  function getAuth(config){
    // Prefer OAuth accessToken when provided; fallback to apiKey
    const accessToken = (config && config.accessToken) || null;
    const apiKey = (config && config.apiKey) || null;
    return { accessToken, apiKey };
  }
  const API = "https://www.googleapis.com/drive/v3/files";
  const FIELDS = "nextPageToken, files(id,name,mimeType,modifiedTime,parents,thumbnailLink)";

  const isFolder = mt => mt === "application/vnd.google-apps.folder";
  const isVideo  = mt => mt && mt.startsWith("video/");
  const logoName = n => /^(logo)(\.(png|jpg|jpeg|webp))$/i.test(n||"");
  const isSeason = n => /^season\s*\d+$/i.test((n||"").trim());
  const mediaUrl = (id, key) =>
  `https://www.googleapis.com/drive/v3/files/${id}?alt=media&key=${key}`;

  async function listChildren(config, folderId, pageToken=""){
    const { accessToken, apiKey } = getAuth(config);
    const url = new URL(API);
    if (apiKey && !accessToken) {
      url.searchParams.set("key", apiKey);
    }
    url.searchParams.set("q", `'${folderId}' in parents and trashed=false`);
    url.searchParams.set("fields", FIELDS);
    if(pageToken) url.searchParams.set("pageToken", pageToken);

    const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
    const res = await fetch(url.toString(), { headers });
    if(!res.ok) throw new Error("Drive list failed: " + res.status);
    return await res.json();
  }' in parents and trashed=false`);
    url.searchParams.set("fields", FIELDS);
    if(pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url.toString());
    if(!res.ok) throw new Error("Drive list failed");
    return await res.json();
  }

  async function readLevel(config, folderId){
    let pageToken = "", folders = [], files = [], logo = null;
    do{
      const data = await listChildren(config, folderId, pageToken);
      for(const f of (data.files||[])){
        if(isFolder(f.mimeType)){
          folders.push({ id:f.id, name:f.name });
        }else if(isVideo(f.mimeType)){
          files.push(f);
        }else if(logoName(f.name)){
          logo = mediaUrl(f.id, (config && config.apiKey));
        }
      }
      pageToken = data.nextPageToken || "";
    }while(pageToken);
    return {folders, files, logo};
  }

  async function crawlHierarchy(config, rootIds){
    const studios = [];
    for(const studioId of rootIds){
      const stLevel = await readLevel(config, studioId);
      const studio = { id: studioId, name: stLevel.name || "", shows: [] };
      for(const showFolder of stLevel.folders){
        const shLevel = await readLevel(config, showFolder.id);
        const seasons = [];
        const seasonFolders = shLevel.folders.filter(f => isSeason(f.name));
        if(seasonFolders.length){
          for(const sf of seasonFolders){
            const sLevel = await readLevel(config, sf.id);
            const videos = sLevel.files.map(v => toVideoRecord(v, [studio.name, showFolder.name, sf.name]));
            seasons.push({ id: sf.id, name: sf.name, videos });
          }
        }else{
          const videos = shLevel.files.map(v => toVideoRecord(v, [studio.name, showFolder.name, "Season 1"]));
          if(videos.length) seasons.push({ id: showFolder.id+":S1", name: "Season 1", videos });
        }
        const show = { id: showFolder.id, name: showFolder.name, logo: shLevel.logo || null, seasons };
        if (seasons.length) studio.shows.push(show);
      }
      studios.push(studio);
    }
    const videos = [];
    for(const st of studios){
      for(const sh of st.shows){
        for(const sn of (sh.seasons||[])){
          for(const v of (sn.videos||[])) videos.push(v);
        }
      }
    }
    return { studios, videos };
  }

  function toVideoRecord(f, path=[]){
    return {
      id: f.id,
      name: f.name,
      published: f.modifiedTime,
      source: "drive",
      thumb: f.thumbnailLink || `https://drive.google.com/thumbnail?id=${f.id}`,
      embed: `https://drive.google.com/file/d/${f.id}/preview`,
      path
    };
  }

  async function loadFromConfig(config){
    if(!config?.apiKey || !Array.isArray(config.folders)) return null;
    return await crawlHierarchy(config, config.folders);
  }

  return { loadFromConfig };
})();
