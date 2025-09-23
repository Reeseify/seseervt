
/**
 * Drive scanner for Reese's TV (client-only)
 * Requires: public Drive folders + API key with Drive API enabled.
 * Put your config in config.json:
 * {
 *   "apiKey": "AIza...",
 *   "folders": ["<FOLDER_ID_1>", "<FOLDER_ID_2>"]
 * }
 */

const Drive = (()=>{
  const API = "https://www.googleapis.com/drive/v3/files";
  const FIELDS = "nextPageToken, files(id, name, mimeType, modifiedTime, parents, thumbnailLink, webViewLink)";
  const VIDEO_MIME_PREFIX = "video/";
  const isVideo = (mt)=> mt && mt.startsWith(VIDEO_MIME_PREFIX);

  async function listFolder(apiKey, folderId, pageToken=""){
    const params = new URLSearchParams({
      key: apiKey,
      q: `'${folderId}' in parents and trashed = false`,
      fields: FIELDS,
      pageSize: "1000"
    });
    if(pageToken) params.set("pageToken", pageToken);
    const url = `${API}?${params.toString()}`;
    const res = await fetch(url);
    if(!res.ok) throw new Error("Drive list error: "+res.status);
    return res.json();
  }

  async function crawl(apiKey, folderId){
    const items = [];
    let pageToken = "";
    do {
      const data = await listFolder(apiKey, folderId, pageToken);
      for(const f of (data.files||[])){
        if(f.mimeType === "application/vnd.google-apps.folder"){
          const sub = await crawl(apiKey, f.id);
          items.push(...sub);
        }else if(isVideo(f.mimeType)){
          items.push(f);
        }
      }
      pageToken = data.nextPageToken || "";
    }while(pageToken);
    return items;
  }

  async function loadFromConfig(config){
    if(!config?.apiKey || !Array.isArray(config.folders)) return null;
    const all = [];
    for(const fid of config.folders){
      const vids = await crawl(config.apiKey, fid);
      all.push(...vids);
    }
    // Map to site format
    const videos = all.map(f => ({
      id: f.id,
      title: f.name.replace(/\.[^/.]+$/, ""),
      description: "",
      tags: [],
      published: (f.modifiedTime||"").slice(0,10),
      source: "drive",
      thumb: f.thumbnailLink || `https://drive.google.com/thumbnail?id=${f.id}`,
      embed: `https://drive.google.com/file/d/${f.id}/preview`
    }));
    // Sort newest first
    videos.sort((a,b)=> (b.published||"").localeCompare(a.published||""));
    return { videos };
  }

  return { loadFromConfig };
})();
