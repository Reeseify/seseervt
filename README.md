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
