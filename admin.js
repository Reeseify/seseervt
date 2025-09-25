// Admin browser/uploader for Cloudflare R2 via Worker (uploads proxied through Worker)
const API_BASE = "https://api.reeses.ca";
const els = (id) => document.getElementById(id);

// --- Session handling (JWT stored in localStorage) ---
const tokenKey = "admin_token";
function getToken() { return localStorage.getItem(tokenKey); }
function setToken(t) { localStorage.setItem(tokenKey, t); }
function clearToken() { localStorage.removeItem(tokenKey); }
function authHeaders() {
  const t = getToken();
  return t ? { Authorization: "Bearer " + t } : {};
}

// --- UI wiring ---
document.addEventListener("DOMContentLoaded", () => {
  const drop = els("drop");
  ["dragenter", "dragover"].forEach((ev) =>
    drop?.addEventListener(ev, (e) => {
      e.preventDefault(); e.stopPropagation();
      drop.style.background = "rgba(255,255,255,.06)";
    })
  );
  ["dragleave", "drop"].forEach((ev) =>
    drop?.addEventListener(ev, (e) => {
      e.preventDefault(); e.stopPropagation();
      drop.style.background = "transparent";
    })
  );
  drop?.addEventListener("drop", (e) => queueFiles(e.dataTransfer.files));

  els("loginBtn")?.addEventListener("click", doLogin);
  els("logoutBtn")?.addEventListener("click", () => { clearToken(); location.reload(); });
  els("loadBtn")?.addEventListener("click", loadList);
  els("refreshBtn")?.addEventListener("click", loadList);
  els("filePick")?.addEventListener("change", (e) => queueFiles(e.target.files));

  if (getToken()) {
    showApp();
    loadList();
  } else {
    showLogin();
  }
});

function showLogin() {
  els("login").style.display = "";
  els("controls").style.display = "none";
  els("listing").style.display = "none";
  els("uploader").style.display = "none";
}
function showApp() {
  els("login").style.display = "none";
  els("controls").style.display = "";
  els("listing").style.display = "";
  els("uploader").style.display = "";
}

// --- Login ---
async function doLogin() {
  const username = els("adminUser").value.trim();
  const password = els("adminPass").value;
  els("loginMsg").textContent = "...";
  try {
    const res = await fetch(API_BASE + "/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) throw new Error("Login failed");
    const data = await res.json();
    setToken(data.token);
    els("whoami").textContent = username;
    els("loginMsg").textContent = "Signed in.";
    showApp();
    loadList();
  } catch (e) {
    console.error(e);
    els("loginMsg").textContent = "Invalid credentials.";
  }
}

// --- List current path ---
async function loadList() {
  const path = els("path").value.trim();
  const res = await fetch(
    API_BASE + "/api/admin/list?prefix=" + encodeURIComponent(path),
    { headers: authHeaders() }
  );
  if (!res.ok) { alert("List failed"); return; }
  const data = await res.json(); // { prefixes:[], objects:[{key,size,uploaded}] }
  const list = els("list");
  list.innerHTML = "";

  // Folders
  for (const p of data.prefixes) {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `<div class="path">📁 ${p}</div>
      <div class="rowx"><button class="btn secondary">Open</button></div>`;
    div.querySelector("button").onclick = () => {
      els("path").value =
        (path ? (path.endsWith("/") ? path : path + "/") : "") + p + "/";
      loadList();
    };
    list.appendChild(div);
  }

  // Files
  for (const o of data.objects) {
    const div = document.createElement("div");
    div.className = "item monosmall";
    const sizeMB = (o.size / 1024 / 1024).toFixed(2);
    div.innerHTML = `<div>📄 ${o.key}</div><div class="muted">${sizeMB} MB</div>
      <div class="rowx"><button class="btn secondary del">Delete</button></div>`;
    div.querySelector(".del").onclick = () => delObject(o.key);
    list.appendChild(div);
  }
}

// --- Delete ---
async function delObject(key) {
  if (!confirm("Delete " + key + "?")) return;
  const res = await fetch(API_BASE + "/api/admin/delete", {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify({ key }),
  });
  if (!res.ok) { alert("Delete failed"); return; }
  loadList();
}

// --- Upload queue ---
function queueFiles(fileList) {
  const path = els("path").value.trim();
  [...fileList].forEach((f) => startMultipartUpload(path, f));
}

// --- Multipart upload flow (via Worker) ---
async function startMultipartUpload(prefix, file) {
  const base = prefix && !prefix.endsWith("/") ? prefix + "/" : (prefix || "");
  const key = base + file.name;
  const container = document.createElement("div");
  container.className = "item";
  container.innerHTML = `<div><b>${file.name}</b> — ${(file.size / 1024 / 1024).toFixed(2)} MB</div>
    <div class="progressbar"><span></span></div>`;
  els("uploads").appendChild(container);
  const bar = container.querySelector(".progressbar > span");

  // 1) start
  const startRes = await fetch(API_BASE + "/api/admin/multipart/start", {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify({ key }),
  });
  if (!startRes.ok) { container.innerHTML += '<div class="muted">Start failed</div>'; return; }
  const { uploadId, partSize } = await startRes.json();

  // 2) upload parts (no presigned URL; POST to Worker)
  const etags = [];
  const chunkSize = partSize || 8 * 1024 * 1024;
  const totalParts = Math.ceil(file.size / chunkSize);
  for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
    const start = (partNumber - 1) * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const blob = file.slice(start, end);

    const putRes = await fetch(
      API_BASE +
        "/api/admin/multipart/put" +
        "?key=" + encodeURIComponent(key) +
        "&uploadId=" + encodeURIComponent(uploadId) +
        "&partNumber=" + encodeURIComponent(partNumber),
      { method: "POST", headers: authHeaders(), body: blob }
    );
    if (!putRes.ok) { container.innerHTML += '<div class="muted">PUT failed</div>'; return; }
    const { etag } = await putRes.json();

    etags.push({ partNumber, etag: String(etag || "").replace(/"/g, "") });
    bar.style.width = Math.round((partNumber / totalParts) * 100) + "%";
  }

  // 3) complete
  const compRes = await fetch(API_BASE + "/api/admin/multipart/complete", {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify({ key, uploadId, parts: etags }),
  });
  if (!compRes.ok) { container.innerHTML += '<div class="muted">Complete failed</div>'; return; }
  bar.style.width = "100%";
  container.innerHTML += "<div>✅ Uploaded</div>";
  loadList();
}
