
/**
 * Drive scanner for Reese's TV (hierarchical)
 * - Root folders from config.folders are considered "Networks/Studios"
 * - Each studio's subfolders are "Shows".
 * - Any folder may contain a 'logo.png' or 'logo.jpg' used for branding.
 * - Recursively finds all video/* files.
 */
const Drive = (()=>{
  const API = "https://www.googleapis.com/drive/v3/files";
  const FIELDS = "nextPageToken, files(id,name,mimeType,modifiedTime,parents,thumbnailLink,webViewLink)";
  const isFolder = mt => mt === "application/vnd.google-apps.folder";
  const isVideo  = mt => mt && mt.startsWith("video/");
  const isLogoName = n => /^(logo)(\.(png|jpg|jpeg|webp))$/i.test(n||"");

  async function listChildren(apiKey, folderId, pageToken=""){
    const params = new URLSearchParams({
      key: apiKey,
      q: `'${folderId}' in parents and trashed = false`,
      fields: FIELDS,
      pageSize: "1000",
      orderBy: "name_natural"
    });
    if(pageToken) params.set("pageToken", pageToken);
    const res = await fetch(`${API}?${params.toString()}`);
    if(!res.ok) throw new Error("Drive list error: "+res.status);
    return res.json();
  }

  async function readFolder(apiKey, folderId){
    // return { folders:[{id,name,logo,children...}], videos:[...] }
    let pageToken=""; const folders=[]; const videos=[]; let logo=null;
    do{
      const data = await listChildren(apiKey, folderId, pageToken);
      for(const f of (data.files||[])){
        if(isFolder(f.mimeType)){
          folders.push({ id:f.id, name:f.name });
        }else if(isVideo(f.mimeType)){
          videos.push(f);
        }else if(isLogoName(f.name)){
          logo = `https://drive.google.com/uc?export=view&id=${f.id}`;
        }
      }
      pageToken = data.nextPageToken || "";
    }while(pageToken);
    return {folders, videos, logo};
  }

  async function crawlHierarchy(apiKey, rootIds){
    const studios = [];
    for(const root of rootIds){
      // Each child folder under the root is a "studio"
      const {folders: studioFolders} = await readFolder(apiKey, root);
      for(const s of studioFolders){
        const studioNode = { id:s.id, name:s.name, logo:null, shows:[], videos:[] };
        const sdata = await readFolder(apiKey, s.id);
        studioNode.logo = sdata.logo || null;

        // Each child folder of a studio is a "show"
        for(const sh of sdata.folders){
          const showNode = { id:sh.id, name:sh.name, logo:null, seasons:[], videos:[] };
          const shdata = await readFolder(apiKey, sh.id);
          showNode.logo = shdata.logo || null;

          // Treat each child folder as season/collection, collect videos recursively (one level deep for speed)
          for(const ss of shdata.folders){
            const ssdata = await readFolder(apiKey, ss.id);
            const vids = ssdata.videos.map(v => mapVideo(v, [s.name, sh.name, ss.name]));
            showNode.videos.push(...vids);
            if(ssdata.logo){ /* could store per-season logo if needed */ }
          }
          // Also include any videos directly under the show folder
          showNode.videos.push(...shdata.videos.map(v => mapVideo(v, [s.name, sh.name])));

          studioNode.shows.push(showNode);
          studioNode.videos.push(...showNode.videos);
        }

        // Also include any videos directly under the studio folder
        studioNode.videos.push(...sdata.videos.map(v => mapVideo(v, [s.name])));
        studios.push(studioNode);
      }
    }
    // Flatten all videos for global pages
    const allVideos = studios.flatMap(st => st.videos);
    allVideos.sort((a,b)=> (b.published||"").localeCompare(a.published||""));
    return { studios, videos: allVideos };
  }

  function mapVideo(f, path=[]){
    return {
      id: f.id,
      title: f.name.replace(/\.[^/.]+$/, ""),
      description: "",
      tags: path,
      published: (f.modifiedTime||"").slice(0,10),
      source: "drive",
      thumb: f.thumbnailLink || `https://drive.google.com/thumbnail?id=${f.id}`,
      embed: `https://drive.google.com/file/d/${f.id}/preview`,
      path
    };
  }

  async function loadFromConfig(config){
    if(!config?.apiKey || !Array.isArray(config.folders)) return null;
    return await crawlHierarchy(config.apiKey, config.folders);
  }

  return { loadFromConfig, readFolder };
})();
