# Reese Media API (Node/Express)

Serves:
- `GET /api/catalog` — full studios → shows → seasons → videos JSON
- `GET /api/studios`, `GET /api/shows?studio=Name`, `GET /api/show?id=Studio/Show`
- Static files at `/media/*` from `MEDIA_ROOT`

## Deploy (Railway / VPS)

1. Copy your media folder to the server (mirror your Drive layout), e.g. `/data/media/Reese Network`.
2. Create `.env` from `.env.example` and set:
```
MEDIA_ROOT=/data/media/Reese Network
PUBLIC_MEDIA_BASE=https://api.reeses.ca/media
HOST=0.0.0.0
PORT=8080
CORS_ORIGINS=https://reeses.ca,https://www.reeses.ca
```
3. Install & run:
```
npm i
npm run start
```
4. Put API behind your domain **api.reeses.ca** (Cloudflare DNS CNAME/Proxy → your host).

## Notes
- Season folders must match `Season 1`, `Season 2`, etc. (case-insensitive; spaces allowed).
- Add `logo.png`/`logo.jpg` in Studio and Show folders if you want nice tiles.
- If a Show has videos directly (no Season folders), they'll appear as **Season 1**.
