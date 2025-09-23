# Reese’s TV (Static Streaming Site)

This repo is a no‑backend streaming site for **GitHub Pages**. Videos are embedded from **Google Drive**.

## Quick start
1. Put this folder on GitHub in a public repo. Enable **GitHub Pages** (Settings → Pages → Deploy from branch → `main` or `docs/`).
2. Open `videos.json` and replace the sample entries with your own.
   - From a Drive share link like `https://drive.google.com/file/d/FILE_ID/view?usp=sharing`, copy the `FILE_ID`.
   - Set `"source": "drive"` and paste your ID.
3. (Optional) Drag your own square logo to `img/favicon.png` and wordmark to `img/logo-full.png`.
4. Visit your Pages URL. You can search, filter by tags, and click videos to watch.

## Video manifest format (`videos.json`)
```json
{
  "videos":[
    {
      "id": "FILE_ID",
      "title": "Title",
      "description": "Blurb",
      "tags": ["tag1","tag2"],
      "published": "2025-09-01",
      "source": "drive",
      "thumb": "https://drive.google.com/thumbnail?id=FILE_ID",      // optional
      "embed": "https://drive.google.com/file/d/FILE_ID/preview",    // optional
      "download": "https://drive.google.com/uc?export=download&id=FILE_ID" // optional
    }
  ]
}
```
(Comments above are just documentation—don’t include them inside JSON.)

## Thumbnails
Drive auto‑generates a thumbnail you can use via:  
`https://drive.google.com/thumbnail?id=FILE_ID`

## Known notes
- Drive previews cap bitrate and may require the viewer to be logged in if the file’s sharing is restricted. Set files to **Anyone with the link** for smooth playback.
- GitHub Pages is static hosting; there’s no auto‑indexing of your Drive folder. Keep `videos.json` updated when you add or remove videos.

## Customization
- Colors and layout live in `styles.css`.
- The app uses `app.js` to render grids and load watch pages.
- Add new pages by copying the HTML boilerplate and keeping the `<header>`.

---

Made for Reese’s playful brand 💙


## Auto-scan Google Drive (no backend)
This site can auto-list videos from public Drive folders using a **Drive API key**.

### Setup
1. In Google Cloud Console:
   - Create a project → **Enable APIs & Services** → enable **Google Drive API**.
   - Create **API key** (no OAuth needed). You can restrict it to HTTP referrers later.
2. Make your Drive folder(s) **Anyone with the link** (Viewer).
3. In the repo, create **config.json** like:
```json
{
  "apiKey": "YOUR_PUBLIC_API_KEY",
  "folders": ["YOUR_DRIVE_FOLDER_ID"]
}
```
4. Deploy. The site will scan those folders (recursively) on page load and render the videos. It caches the listing in `localStorage` for 5 minutes to save quota.
5. If `config.json` is missing or scanning fails, it falls back to `videos.json`.

### Notes
- Drive preview and thumbnail work only for items shared publicly.
- API key is okay to expose for this read-only listing use; restrict by **HTTP referrer** to your Pages domain for safety.
- For complex setups or private folders, consider the alternative below.

## Alternative: Apps Script JSON feed (private or more control)
If you don’t want an API key on the client, deploy a tiny **Google Apps Script** that lists a folder and returns JSON, then point the site at that endpoint instead of `config.json`. I can generate that script on request.


### Studios & Shows
- Put a **logo.png** or **logo.jpg** inside any studio/show folder (optional). The site will use it for the tile. If missing, it falls back to text.
- `browse.html` shows Studios → Shows → Videos navigation.
