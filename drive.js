
const Drive = (()=>{
  const API = "https://www.googleapis.com/drive/v3/files";
  const FOLDER = "application/vnd.google-apps.folder";
  const FIELDS = "nextPageToken, files(id,name,mimeType,modifiedTime,parents,thumbnailLink)";
  const META_FIELDS = "id,name,mimeType";

  const isFolder = f => f.mimeType === FOLDER;
  const isVideo  = f => (f.mimeType||"").startsWith("video/");
  const isSeason = n => /^season\s*\d+$/i.test((n||"").trim());
  const isLogoName   = n => /^logo\.(png|jpg|jpeg|webp)$/i.test(n||"");
  const isBannerName = n => /^banner\.(png|jpg|jpeg|webp)$/i.test(n||"");

  const mediaUrl = (id, key) => `${API}/${id}?alt=media&key=${key}`;
  const thumbUrl = (id) => `https://drive.google.com/thumbnail?id=${id}`;

  async function listChildren(apiKey, folderId, pageToken=""){
    const url = new URL(API);
    url.searchParams.set("key", apiKey);
    url.searchParams.set("q", `'${folderId}' in parents and trashed=false`);
    url.searchParams.set("fields", FIELDS);
    if(pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url.toString());
    if(!res.ok) throw new Error("Drive list failed");
    return await res.json();
  }

  async function getMeta(apiKey, id){
    const url = new URL(`${API}/${id}`);
    url.searchParams.set("fields", META_FIELDS);
    url.searchParams.set("key", apiKey);
    const res = await fetch(url.toString());
    if(!res.ok) return {id, name: ""};
    return await res.json();
  }

  async function readFolder(apiKey, folderId){
    let pageToken = "", folders = [], videos = [], logo=null, banner=null;
    do{
      const data = await listChildren(apiKey, folderId, pageToken);
      for(const f of (data.files||[])){
        if(isFolder(f)){
          folders.push({ id:f.id, name:f.name });
        }else if(isVideo(f)){
          videos.push(f);
        }else if(isLogoName(f.name)){
          logo = mediaUrl(f.id, apiKey);
        }else if(isBannerName(f.name)){
          banner = mediaUrl(f.id, apiKey);
        }
      }
      pageToken = data.nextPageToken || "";
    }while(pageToken);
    return { folders, videos, logo, banner };
  }

  function mapEpisodes(vids, apiKey){
    return (vids||[]).map(v => ({
      id: v.id,
      name: (v.name||"").replace(/\.[^.]+$/,""),
      embed: `https://drive.google.com/file/d/${v.id}/preview`,
      src: mediaUrl(v.id, apiKey),
      thumb: v.thumbnailLink || thumbUrl(v.id),
      modified: v.modifiedTime
    }));
  }

  async function crawlHierarchy(apiKey, studioFolderIds){
    const studios = [];
    for(const studioId of studioFolderIds){
      const studioMeta = await getMeta(apiKey, studioId);
      const st = await readFolder(apiKey, studioId);
      const studio = { id: studioMeta.id, name: studioMeta.name || "", shows: [] };

      for(const showFolder of st.folders){
        const sh = await readFolder(apiKey, showFolder.id);
        const seasonFolders = (sh.folders||[]).filter(f => isSeason(f.name));
        const show = { id: showFolder.id, name: showFolder.name, logo: sh.logo, banner: sh.banner, seasons: [] };
        let total = 0;

        if(seasonFolders.length){
          // seasons by folder
          for(const sf of seasonFolders){
            const s = await readFolder(apiKey, sf.id);
            const eps = mapEpisodes(s.videos, apiKey);
            total += eps.length;
            show.seasons.push({ id: sf.id, name: sf.name, episodes: eps });
          }
        }else{
          // videos directly under show folder -> Season 1
          const eps = mapEpisodes(sh.videos, apiKey);
          total += eps.length;
          if(eps.length){
            show.seasons.push({ id: showFolder.id+":S1", name:"Season 1", episodes: eps });
          }
        }

        show.seasonCount = show.seasons.length;
        if(total > 0){
          studio.shows.push(show);
        }
      }

      studios.push(studio);
    }
    return { studios };
  }

  async function loadFromConfig(config){
    if(!config?.apiKey || !Array.isArray(config.folders)) throw new Error("Missing apiKey or folders");
    return await crawlHierarchy(config.apiKey, config.folders);
  }

  return { loadFromConfig };
})();