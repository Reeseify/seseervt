
import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import morgan from 'morgan';
import cors from 'cors';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MEDIA_ROOT = process.env.MEDIA_ROOT || path.join(__dirname, 'media'); // fallback ./media for local dev
const PUBLIC_MEDIA_BASE = (process.env.PUBLIC_MEDIA_BASE || 'http://localhost:8080/media').replace(/\/$/,''); // no trailing slash
const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';

// CORS
const allowlist = (process.env.CORS_ORIGINS || '').split(',').map(s=>s.trim()).filter(Boolean);
const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowlist.length === 0 || allowlist.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS: ' + origin));
  },
  credentials: false
};

const app = express();
app.use(morgan('dev'));
app.use(cors(corsOptions));

// serve static media: /media/<path-to-file>
app.use('/media', express.static(MEDIA_ROOT, {
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
}));

const IMG_REGEX = /\.(png|jpg|jpeg|webp)$/i;
const VIDEO_REGEX = /\.(mp4|mkv|mov|webm|m4v)$/i;
const SEASON_REGEX = /^season\s*\d+$/i;

async function listDirNames(base){
  const ents = await fs.readdir(base, { withFileTypes: true });
  return ents.filter(e=>e.isDirectory()).map(e=>e.name);
}
async function listFileNames(base){
  const ents = await fs.readdir(base, { withFileTypes: true });
  return ents.filter(e=>e.isFile()).map(e=>e.name);
}
async function exists(p){
  try{ await fs.access(p); return true; } catch { return false; }
}
async function findLogo(dir){
  for (const n of ['logo.png','logo.jpg','logo.jpeg','logo.webp']){
    const p = path.join(dir, n);
    if (await exists(p)) return p;
  }
  return null;
}
function urlFor(absPath){
  // absPath within MEDIA_ROOT -> map to /media route
  const rel = path.relative(MEDIA_ROOT, absPath).split(path.sep).map(encodeURIComponent).join('/');
  return `${PUBLIC_MEDIA_BASE}/${rel}`;
}

async function showDetail(studioName, showName){
  const base = path.join(MEDIA_ROOT, studioName, showName);
  const subdirs = await listDirNames(base);
  const seasonNames = subdirs.filter(n => SEASON_REGEX.test(n));
  const seasons = [];
  for (const s of seasonNames){
    const seasonDir = path.join(base, s);
    const files = await listFileNames(seasonDir);
    const firstImg = files.find(f=>IMG_REGEX.test(f));
    const thumb = firstImg ? urlFor(path.join(seasonDir, firstImg)) : (await findLogo(base)) ? urlFor(path.join(base, (await listFileNames(base)).find(f=>/^logo\./i.test(f)))) : null;
    const videos = files.filter(f=>VIDEO_REGEX.test(f)).map(v => ({
      id: `${studioName}/${showName}/${s}/${v}`,
      name: v.replace(VIDEO_REGEX,'').replace(/[_-]+/g,' ').trim(),
      src: urlFor(path.join(seasonDir, v)),
      thumb
    }));
    seasons.push({ id: `${studioName}/${showName}/${s}`, name: s, videos });
  }

  // If no Season folders, treat videos in show root as Season 1
  if (seasons.length === 0){
    const files = await listFileNames(base);
    const firstImg = files.find(f=>IMG_REGEX.test(f));
    const thumb = firstImg ? urlFor(path.join(base, firstImg)) : null;
    const vids = files.filter(f=>VIDEO_REGEX.test(f)).map(v => ({
      id: `${studioName}/${showName}/Season 1/${v}`,
      name: v.replace(VIDEO_REGEX,'').replace(/[_-]+/g,' ').trim(),
      src: urlFor(path.join(base, v)),
      thumb
    }));
    if (vids.length) seasons.push({ id: `${studioName}/${showName}/Season 1`, name: 'Season 1', videos: vids });
  }

  const logoPath = await findLogo(base);
  const logo = logoPath ? urlFor(logoPath) : null;
  return { id: `${studioName}/${showName}`, name: showName, logo, seasons };
}

async function buildCatalog(){
  const studios = [];
  const studioNames = await listDirNames(MEDIA_ROOT);
  for (const st of studioNames){
    const stBase = path.join(MEDIA_ROOT, st);
    const stLogoPath = await findLogo(stBase);
    const showNames = (await listDirNames(stBase)).filter(d => d.toLowerCase() !== 'logo'); // ignore any 'logo' dir
    const shows = [];
    for (const sh of showNames){
      const det = await showDetail(st, sh);
      if ((det.seasons||[]).some(s => (s.videos||[]).length)) shows.push(det);
    }
    studios.push({ name: st, logo: stLogoPath ? urlFor(stLogoPath) : null, shows });
  }
  // Flat "videos" list (optional)
  const videos = [];
  for (const st of studios)
    for (const sh of st.shows)
      for (const sn of sh.seasons)
        for (const v of sn.videos) videos.push(v);
  return { studios, videos };
}

// Cache catalog in memory for 30s to avoid heavy disk scans
let cache = { t: 0, data: null };
async function getCatalog(){
  const now = Date.now();
  if (cache.data && (now - cache.t) < 30000) return cache.data;
  const data = await buildCatalog();
  cache = { t: now, data };
  return data;
}

// --------- Routes ---------
app.get('/api/catalog', async (req, res) => {
  try{
    const data = await getCatalog();
    res.set('Cache-Control', 'no-store');
    res.json(data);
  }catch(err){
    console.error(err);
    res.status(500).json({ error: 'Failed to build catalog' });
  }
});

app.get('/api/studios', async (req, res) => {
  const data = await getCatalog();
  res.json(data.studios.map(s => s.name));
});

app.get('/api/shows', async (req, res) => {
  const studio = req.query.studio;
  if (!studio) return res.status(400).json({ error: 'Missing ?studio' });
  const data = await getCatalog();
  const st = data.studios.find(s => s.name === studio);
  res.json(st ? st.shows.map(s => s.name) : []);
});

app.get('/api/show', async (req, res) => {
  const id = req.query.id; // "Reese_s/The Pepperonis"
  if (!id) return res.status(400).json({ error: 'Missing ?id' });
  const [studio, ...rest] = id.split('/');
  const show = rest.join('/');
  try{
    const detail = await showDetail(studio, show);
    res.json(detail);
  }catch(err){
    console.error(err);
    res.status(404).json({ error: 'Show not found' });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`API listening on http://${HOST}:${PORT}`);
  console.log(`Serving media from ${MEDIA_ROOT} at ${PUBLIC_MEDIA_BASE}`);
});
