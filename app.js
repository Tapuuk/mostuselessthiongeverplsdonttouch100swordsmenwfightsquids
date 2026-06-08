"use strict";

/* =========================================================================
 * Gamesite — Flash games via Ruffle + the Internet Archive.
 *
 * Storage model (works on ANY device/OS/browser, no custom paths):
 *   - Favorites & history  -> browser localStorage (keys below)
 *   - Game progress         -> Flash SharedObjects, which Ruffle persists into
 *                              localStorage automatically, keyed by the .swf URL.
 *   - Export/Import         -> dumps/restores the whole localStorage as JSON so
 *                              you can carry saves between devices (e.g. Chromebook).
 * ========================================================================= */

const COLLECTION = "softwarelibrary_flash";
const ROWS_PER_PAGE = 24;
const LS_FAVORITES = "gamesite.favorites";
const LS_HISTORY = "gamesite.history";
const LS_FLASHSAVE = "gamesite.flashsave."; // + identifier -> JSON of the game's Ruffle SharedObject keys
const LS_USERWEB = "gamesite.userweb";   // user-added web games  [{identifier,title,url,img}]
const WEB_GAMES_URL = "web-games.json";  // self-hosted HTML5 games catalog (built by tools/build-games.py from games/)
// External HTML5 game catalogs (iframe-embedded). Each is a JSON array of
// {identifier,title,url,img,credit} built by a tools/fetch-*-games.py crawler.
// They load from external domains, so they only play if those domains aren't
// blocked on the device (unlike the self-hosted games/ catalog).
const EXTRA_WEB_CATALOGS = ["madkid-games.json"];
const WEB_BATCH = 80;                     // web-game cards drawn per batch (rest auto-load on scroll)
const LS_UPDATE_SEEN = "gamesite.update.seen";
const UPDATE_ID = "2026-06-tabs-web"; // bump this to show a fresh "What's new" once per device
const HISTORY_LIMIT = 12;

// Tag a catalog entry so the card/player route to the right engine.
function makeWebGame(g) { return { ...g, kind: "web" }; }

// Minimal storable reference for favorites/history (keeps the fields a saved
// favorite needs so it can still be launched later: the web game's url).
function gameRef(g) {
  const ref = { identifier: g.identifier, title: g.title };
  if (g.kind === "web") {
    ref.kind = "web"; ref.url = g.url; ref.img = g.img;
    if (g.credit) ref.credit = g.credit;
    if (g.license) ref.license = g.license;
    if (g.source) ref.source = g.source;
  }
  return ref;
}

/* ---------- tiny localStorage helpers ---------- */
function loadList(key) {
  try { return JSON.parse(localStorage.getItem(key)) || []; }
  catch { return []; }
}
function saveList(key, list) {
  localStorage.setItem(key, JSON.stringify(list));
}

let favorites = loadList(LS_FAVORITES);   // [{ identifier, title }]
let history = loadList(LS_HISTORY);       // [{ identifier, title }] most-recent first
let webGames = [];                        // self-hosted HTML5 catalog, loaded from web-games.json
let extraWeb = [];                         // external embedded catalogs (madkid.games, …), merged
let userWeb = loadList(LS_USERWEB);       // web games the user added by URL

function isFavorite(id) { return favorites.some(g => g.identifier === id); }

function toggleFavorite(game) {
  if (isFavorite(game.identifier)) {
    favorites = favorites.filter(g => g.identifier !== game.identifier);
  } else {
    favorites.unshift(gameRef(game));
  }
  saveList(LS_FAVORITES, favorites);
  renderFavorites();
  refreshFavButtons();
}

function pushHistory(game) {
  history = history.filter(g => g.identifier !== game.identifier);
  history.unshift(gameRef(game));
  history = history.slice(0, HISTORY_LIMIT);
  saveList(LS_HISTORY, history);
  renderHistory();
}

// Wipe the whole recently-played list (favorites + game saves stay).
function clearHistory() {
  if (history.length === 0) return;
  if (!confirm("Clear your recently-played history?")) return;
  history = [];
  saveList(LS_HISTORY, history);
  renderHistory();
}

/* ---------- DOM refs ---------- */
const el = id => document.getElementById(id);
const resultsGrid = el("results-grid");
const resultsStatus = el("results-status");
const resultsTitle = el("results-title");
const loadMoreBtn = el("load-more");

/* ---------- Archive.org search ---------- */
let currentQuery = "";   // user text ("" = browse popular)
let currentPage = 1;
let isLoading = false;

function buildQuery(text) {
  const base = `collection:(${COLLECTION}) AND mediatype:(software)`;
  return text ? `${base} AND (${text})` : base;
}

async function fetchGames(text, page) {
  const q = buildQuery(text);
  // Browsing (no search text) returns a fresh random shuffle every request, so
  // the Home/Flash listing is never the same twice. Random sort happens
  // server-side and we still pull only ROWS_PER_PAGE at a time, so it adds no
  // load cost — the page stays fast.
  const sort = text ? "" : "&sort[]=random";
  const url =
    `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}` +
    `&fl[]=identifier&fl[]=title&rows=${ROWS_PER_PAGE}&page=${page}${sort}&output=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Archive search failed (${res.status})`);
  const data = await res.json();
  return data.response.docs.map(d => ({
    identifier: d.identifier,
    title: d.title || d.identifier,
  }));
}

async function runSearch(text, { append = false } = {}) {
  if (isLoading) return;
  isLoading = true;

  if (!append) {
    currentQuery = text;
    currentPage = 1;
    resultsGrid.innerHTML = "";
    resultsTitle.textContent = text ? `Results for “${text}”` : "Browse games (random)";
  }
  resultsStatus.textContent = "Loading…";
  loadMoreBtn.hidden = true;

  try {
    const games = await fetchGames(currentQuery, currentPage);
    games.forEach(g => resultsGrid.appendChild(makeCard(g)));
    resultsStatus.textContent = resultsGrid.children.length === 0
      ? "No results found."
      : "";
    loadMoreBtn.hidden = games.length < ROWS_PER_PAGE; // probably no more pages
  } catch (err) {
    resultsStatus.textContent = `Couldn’t reach the Internet Archive: ${err.message}`;
  } finally {
    isLoading = false;
  }
}

/* ---------- card rendering ---------- */
function thumbUrl(id) {
  return `https://archive.org/services/img/${encodeURIComponent(id)}`;
}

function makeCard(game) {
  const card = document.createElement("div");
  card.className = "card";
  card.dataset.id = game.identifier;

  let thumb;
  if (game.kind === "web") {
    // Web games carry their own cover image (screenshot/generated); fall back to a tile.
    thumb = document.createElement("img");
    thumb.className = "card-thumb";
    thumb.loading = "lazy";
    thumb.decoding = "async";
    thumb.alt = game.title;
    if (game.img) thumb.src = game.img;
    thumb.onerror = () => {
      const tile = document.createElement("div");
      tile.className = "card-thumb rom-thumb web-thumb";
      tile.textContent = "WEB";
      thumb.replaceWith(tile);
    };
  } else {
    thumb = document.createElement("img");
    thumb.className = "card-thumb";
    thumb.loading = "lazy";
    thumb.decoding = "async";
    thumb.alt = game.title;
    thumb.src = thumbUrl(game.identifier);
    thumb.onerror = () => { thumb.style.visibility = "hidden"; };
  }

  const title = document.createElement("div");
  title.className = "card-title";
  title.textContent = game.title;

  // Open-source web games show a tiny attribution line (keeps GPL/MIT credit visible).
  let credit = null;
  if (game.kind === "web" && game.credit) {
    credit = document.createElement("div");
    credit.className = "card-credit";
    credit.textContent = (game.license ? game.license + " · " : "") + game.credit;
  }

  const fav = document.createElement("button");
  fav.className = "fav-toggle" + (isFavorite(game.identifier) ? " active" : "");
  fav.textContent = isFavorite(game.identifier) ? "♥" : "♡";
  fav.title = "Toggle favorite";
  fav.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleFavorite(game);
  });

  card.append(thumb, fav, title);
  if (credit) card.append(credit);
  card.addEventListener("click", () => openPlayer(game));
  return card;
}

/* ---------- Web games (self-hosted HTML5 + external embedded catalogs) ---------- */
// Self-hosted games/ catalog + the external embedded catalogs + user-pasted games.
// One list, so the Web tab's search bar covers every source at once. Each entry's
// `credit` (source site name) shows under its title — see makeCard.
function allWebGames() { return webGames.concat(extraWeb, userWeb); }

// Load the self-hosted HTML5 catalog once. Static-site friendly: it's just a JSON
// file generated by tools/build-games.py from the games/ folder, served alongside.
async function loadWebGames() {
  try {
    const res = await fetch(WEB_GAMES_URL, { cache: "no-cache" });
    if (res.ok) webGames = await res.json();
  } catch { /* offline / not generated yet — userWeb still works */ }
}

// Load the external embedded catalogs (madkid.games, …) and merge
// them into one list. Each is independent — a missing/failed one is just skipped.
async function loadExtraCatalogs() {
  const lists = await Promise.all(EXTRA_WEB_CATALOGS.map(async (u) => {
    try {
      const res = await fetch(u, { cache: "no-cache" });
      return res.ok ? await res.json() : [];
    } catch { return []; }
  }));
  extraWeb = lists.flat();
}

// Current Web tab view, drawn in batches and auto-extended on scroll so the big
// catalogs don't render thousands of cards at once.
let webViewList = [];
let webViewShown = 0;

function renderWeb(query) {
  const grid = el("web-grid");
  grid.innerHTML = "";
  const q = (query || "").trim().toLowerCase();
  const all = allWebGames();
  webViewList = q ? all.filter(g => g.title.toLowerCase().includes(q)) : all;
  webViewShown = 0;
  el("web-section").hidden = false;
  if (all.length === 0) {
    el("web-status").textContent = "No games yet — drop one in games/ and run tools/build-games.py, or add one with “➕ Add game”.";
  } else if (webViewList.length === 0) {
    el("web-status").textContent = "No results found.";
  }
  appendWebBatch(); // draws the first batch + sets the count
}

// Append the next WEB_BATCH cards from webViewList; the scroll sentinel calls this
// again as it nears the viewport until the whole list is drawn.
function appendWebBatch() {
  const grid = el("web-grid");
  const next = webViewList.slice(webViewShown, webViewShown + WEB_BATCH);
  next.forEach(g => grid.appendChild(makeCard(makeWebGame(g))));
  webViewShown += next.length;
  const more = webViewShown < webViewList.length;
  const sentinel = el("web-sentinel");
  if (sentinel) sentinel.hidden = !more;
  if (webViewList.length) {
    el("web-status").textContent = more
      ? `${webViewShown} of ${webViewList.length} games`
      : `${webViewList.length} game${webViewList.length === 1 ? "" : "s"}`;
  }
}

function parseWebLine(line) {
  const parts = line.split("|").map(s => s.trim());
  let title, url;
  if (parts.length >= 2) { url = parts.pop(); title = parts.join(" | "); }
  else { url = parts[0]; }
  // Accept absolute URLs OR same-origin relative paths (e.g. games/x/index.html).
  if (!url || /\s/.test(url) || !(/^https?:\/\//i.test(url) || /^[\w./-]+$/.test(url))) return null;
  if (!title) {
    const segs = url.replace(/\/+$/, "").split("/");
    title = decodeURIComponent(segs[segs.length - 1] || segs[segs.length - 2] || "Web game")
      .replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim();
  }
  const identifier = "webu-" + Math.abs([...url].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)).toString(36);
  return { identifier, title: title || "Web game", url, img: "" };
}

function addUserWeb(text) {
  const known = new Set(allWebGames().map(g => g.url));
  let added = 0, skipped = 0;
  text.split(/\r?\n/).forEach(raw => {
    const line = raw.trim();
    if (!line) return;
    const g = parseWebLine(line);
    if (!g || known.has(g.url)) { if (line) skipped++; return; }
    known.add(g.url);
    userWeb.push(g);
    added++;
  });
  saveList(LS_USERWEB, userWeb);
  return { added, skipped };
}

function renderShelf(sectionId, gridId, list) {
  const section = el(sectionId);
  const grid = el(gridId);
  grid.innerHTML = "";
  if (list.length === 0) { section.hidden = true; return; }
  section.hidden = false;
  list.forEach(g => grid.appendChild(makeCard(g)));
}

// Active library tab. "home" shows Flash; the others are scoped to one kind.
let currentTab = "home"; // "home" | "flash" | "web"

// Favorites/history can hold any kind; on a scoped tab show only that kind.
// (Flash games have no `kind`; web = "web".)
function scopeToTab(list) {
  if (currentTab === "flash") return list.filter(g => !g.kind);
  if (currentTab === "web") return list.filter(g => g.kind === "web");
  return list; // home: everything
}

function renderFavorites() { renderShelf("favorites-section", "favorites-grid", scopeToTab(favorites)); }
function renderHistory() { renderShelf("history-section", "history-grid", scopeToTab(history)); }

// Show the sections that belong to the current tab, filtered by `query`.
//   home  -> popular Flash games (favorites/history mixed); others are own tabs
//   flash -> Flash results only (Internet Archive search), Flash-only fav/history
//   web   -> HTML5 catalog (local filter), web-only fav/history
// One search bar (under the tabs) serves whatever tab is active.
function tabQuery() { return el("search-input").value.trim(); }

function applyTabView() {
  const query = tabQuery();
  // While searching, hide favorites + recently-played; restore them when the
  // search box is emptied (i.e. you leave the search).
  if (query) {
    el("favorites-section").hidden = true;
    el("history-section").hidden = true;
  } else {
    renderFavorites();
    renderHistory();
  }
  // Hide every specialty shelf; each branch re-shows just what it needs.
  el("web-section").hidden = true;
  el("results-section").hidden = true;
  if (currentTab === "web") {
    renderWeb(query);
  } else { // home or flash: Flash results
    el("results-section").hidden = false;
    runSearch(query);
  }
}

// Switch tabs: highlight the button, clear the search bar, retarget placeholder.
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll(".tab-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.tab === tab));
  const input = el("search-input");
  input.value = "";
  const clearBtn = el("search-clear");
  if (clearBtn) clearBtn.hidden = true;
  input.placeholder =
    tab === "web" ? "Search web games…" :
    tab === "flash" ? "Search Flash games on the Internet Archive…" :
    "Search all games…";
  applyTabView();
}

// Keep all visible ♥/♡ buttons in sync with current favorites state.
function refreshFavButtons() {
  document.querySelectorAll(".card").forEach(card => {
    const active = isFavorite(card.dataset.id);
    const btn = card.querySelector(".fav-toggle");
    if (btn) {
      btn.classList.toggle("active", active);
      btn.textContent = active ? "♥" : "♡";
    }
  });
}

/* ---------- Ruffle player ---------- */
const overlay = el("player-overlay");
const playerStage = el("player-stage");
const playerStatus = el("player-status");
const playerTitle = el("player-title");
const playerFavBtn = el("player-fav");
const playerFullscreenBtn = el("player-fullscreen");
const playerSaveBtn = el("player-save");
const playerLoadBtn = el("player-load");
const muteBtn = el("mute-btn");
let currentGame = null;
let rufflePlayer = null;
let rufflePromise = null;
let webFrame = null;       // <iframe> running an HTML5 web game
let flashBaseline = {};    // Flash SharedObject keys as they were when the SWF opened

// Remove whatever is currently playing (Ruffle or a web game).
function clearStage() {
  if (rufflePlayer) { rufflePlayer.remove(); rufflePlayer = null; }
  if (webFrame) { webFrame.remove(); webFrame = null; }
}

// Save/Load buttons back up/restore a Flash game's own SharedObject
// ("Backup"/"Restore") — Ruffle has no VM-snapshot API, so we don't pretend
// otherwise. Hidden for web games (we can't snapshot a cross-origin iframe).
function setSaveControls(show) {
  playerSaveBtn.hidden = !show;
  playerLoadBtn.hidden = !show;
  if (!show) return;
  playerSaveBtn.textContent = "⤓ Backup save";
  playerLoadBtn.textContent = "⤒ Restore save";
  playerSaveBtn.title = "Back up this game's save data (overwrites your last backup)";
  playerLoadBtn.title = "Restore your backed-up save";
}

// Mute applies to every game (Ruffle is the only audio source). Persisted so
// it stays muted across games, refreshes, and sessions.
let isMuted = localStorage.getItem("gamesite.muted") === "1";

function applyMute() {
  if (rufflePlayer) rufflePlayer.volume = isMuted ? 0 : 1;
  muteBtn.textContent = isMuted ? "🔇 Muted" : "🔊 Sound";
  muteBtn.classList.toggle("active", isMuted);
}

function toggleMute() {
  isMuted = !isMuted;
  localStorage.setItem("gamesite.muted", isMuted ? "1" : "0");
  applyMute();
}

// Load the Ruffle bundle once, on first use, instead of on every page load.
function ensureRuffle() {
  if (window.RufflePlayer) return Promise.resolve();
  if (rufflePromise) return rufflePromise;
  rufflePromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://unpkg.com/@ruffle-rs/ruffle";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("couldn’t load the Ruffle player"));
    document.head.appendChild(s);
  });
  return rufflePromise;
}

// Find the playable .swf inside an Archive item and return its absolute URL.
async function resolveSwfUrl(identifier) {
  const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(identifier)}`);
  if (!res.ok) throw new Error(`metadata ${res.status}`);
  const meta = await res.json();
  const files = meta.files || [];
  const swf =
    files.find(f => /shockwave flash/i.test(f.format || "")) ||
    files.find(f => /\.swf$/i.test(f.name || ""));
  if (!swf) throw new Error("no .swf file in this item");
  // Use /cors/ (not /download/): it serves the file directly with an
  // `Access-Control-Allow-Origin: *` header, so Ruffle's fetch isn't blocked.
  // /download/ 302-redirects to a storage node that sends no CORS header.
  return `https://archive.org/cors/${encodeURIComponent(identifier)}/${swf.name
    .split("/").map(encodeURIComponent).join("/")}`;
}

async function openPlayer(game) {
  if (game.kind === "web") return openWebPlayer(game);

  currentGame = game;
  overlay.hidden = false;
  document.body.style.overflow = "hidden";
  playerTitle.textContent = game.title;
  playerStatus.textContent = "Loading game…";
  playerStatus.style.display = "";
  updatePlayerFavBtn();
  setSaveControls(true);
  // Remember the game's SharedObject state as it stands now, so flashSave can
  // tell which localStorage keys this game writes during the session.
  flashBaseline = snapshotForeignKeys();

  // tear down any previous instance
  clearStage();

  pushHistory(game);

  try {
    await ensureRuffle();
    const swfUrl = await resolveSwfUrl(game.identifier);
    const ruffle = window.RufflePlayer.newest();
    rufflePlayer = ruffle.createPlayer();
    playerStage.appendChild(rufflePlayer);
    // Same URL every time => Ruffle reuses the same saved SharedObject (progress).
    await rufflePlayer.load({ url: swfUrl, autoplay: "on", letterbox: "on", volume: isMuted ? 0 : 1 });
    applyMute();
    playerStatus.style.display = "none";
  } catch (err) {
    playerStatus.style.display = "";
    playerStatus.textContent = `Sorry, this game wouldn’t load (${err.message}).`;
  }
}

// Web games (itch.io HTML5/WebGL) just load their play URL in an iframe. They
// keep their own progress in their own origin's storage, so there are no
// Save/Load buttons (we can't snapshot a cross-origin iframe anyway).
function openWebPlayer(game) {
  currentGame = game;
  overlay.hidden = false;
  document.body.style.overflow = "hidden";
  playerTitle.textContent = game.title;
  playerStatus.textContent = "Loading game…";
  playerStatus.style.display = "";
  updatePlayerFavBtn();
  setSaveControls(false);

  clearStage();
  pushHistory(game);

  webFrame = document.createElement("iframe");
  webFrame.className = "rom-frame";
  webFrame.allow = "autoplay; fullscreen; gamepad; clipboard-write; cross-origin-isolated";
  webFrame.src = game.url;
  webFrame.addEventListener("load", () => { playerStatus.style.display = "none"; });
  playerStage.appendChild(webFrame);
}

function closePlayer() {
  overlay.hidden = true;
  document.body.style.overflow = "";
  clearStage();
  setSaveControls(false);
  currentGame = null;
}

/* ---------- Flash save/load (snapshots the game's Ruffle SharedObject) ----------
 * Ruffle has no arbitrary "save state anywhere" API, but it DOES persist a
 * Flash game's own save data (SharedObject) into localStorage.
 * So our Save copies the keys this game wrote during the session into one slot
 * (overwriting the previous slot), and Load restores them and reloads the SWF so
 * Ruffle reads the restored save. It works for games that have an in-game save;
 * it can't snapshot pure mid-action RAM that the game never persisted. The slot
 * lives in localStorage (browser data, included in Export) — never Downloads.
 */

// All localStorage keys that aren't ours (i.e. Ruffle's SharedObject entries).
function snapshotForeignKeys() {
  const snap = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && !k.startsWith("gamesite.")) snap[k] = localStorage.getItem(k);
  }
  return snap;
}

function flashSave() {
  if (!currentGame) return;
  const now = snapshotForeignKeys();
  // Keys this game created or changed since it opened = its save data.
  const changed = {};
  for (const k in now) if (now[k] !== flashBaseline[k]) changed[k] = now[k];
  const prevRaw = localStorage.getItem(LS_FLASHSAVE + currentGame.identifier);
  const slot = Object.assign(prevRaw ? JSON.parse(prevRaw) : {}, changed);
  if (Object.keys(slot).length === 0) { toast("Use the game's own save first"); return; }
  try {
    localStorage.setItem(LS_FLASHSAVE + currentGame.identifier, JSON.stringify(slot));
    toast("Backed up ✓");
  } catch {
    toast("Backup failed (storage full)");
  }
}

function flashLoad() {
  if (!currentGame) return;
  const raw = localStorage.getItem(LS_FLASHSAVE + currentGame.identifier);
  if (!raw) { toast("No save yet — press Save first."); return; }
  try {
    const slot = JSON.parse(raw);
    Object.entries(slot).forEach(([k, v]) => localStorage.setItem(k, v));
    toast("Restored ✓");
    openPlayer(currentGame); // reload so Ruffle re-reads the restored SharedObject
  } catch {
    toast("Couldn’t restore this save");
  }
}

// Player Save/Load buttons + shortcuts back up / restore the Flash save.
function playerSave() {
  if (!currentGame) return;
  flashSave();
}
function playerLoad() {
  if (!currentGame) return;
  flashLoad();
}

// Small transient message inside the player (e.g. "Saved ✓").
let toastTimer = null;
function toast(text) {
  let t = el("player-toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "player-toast";
    t.className = "player-toast";
    overlay.querySelector(".player-shell").appendChild(t);
  }
  t.textContent = text;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 1500);
}

// Fullscreen the game stage. Ruffle re-scales the SWF to fill the screen
// (letterboxed) on fullscreenchange.
function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen();
    return;
  }
  const target = rufflePlayer || playerStage;
  if (target && target.requestFullscreen) target.requestFullscreen();
}

function updatePlayerFavBtn() {
  if (!currentGame) return;
  const active = isFavorite(currentGame.identifier);
  playerFavBtn.textContent = active ? "♥ Favorited" : "♡ Favorite";
  playerFavBtn.classList.toggle("active", active);
}

/* ---------- Export / Import (cross-device backup) ---------- */
function exportSaves() {
  const dump = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    dump[key] = localStorage.getItem(key);
  }
  const payload = {
    type: "gamesite-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: dump,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `gamesite-saves-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importSaves(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const data = parsed && parsed.data;
      if (!data || parsed.type !== "gamesite-backup") {
        throw new Error("not a Gamesite backup file");
      }
      Object.entries(data).forEach(([k, v]) => localStorage.setItem(k, v));
      favorites = loadList(LS_FAVORITES);
      history = loadList(LS_HISTORY);
      renderFavorites();
      renderHistory();
      refreshFavButtons();
      alert("Saves imported. Reopen a game to continue where you left off.");
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    }
  };
  reader.readAsText(file);
}

/* =========================================================================
 * Math cover page — shown on every load/reload until "Back" is clicked.
 * Wordle-style daily questions: the set is derived from the calendar day, so
 * everyone visiting on the same (UTC) day gets the exact same 5 questions, and
 * a brand-new set appears at 00:00 UTC. No backend needed — the date is the seed.
 * ========================================================================= */

// Day index since 2026-01-01 (UTC). It's the same value worldwide at any given
// instant, so it makes a perfect shared seed and rolls over exactly at UTC midnight.
function daySeed() {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const now = new Date();
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((todayUTC - Date.UTC(2026, 0, 1)) / DAY_MS);
}

// mulberry32: a tiny deterministic PRNG. The same seed always yields the same
// stream of numbers, so a given day's questions are fully reproducible.
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The active PRNG used by the generators. Reseeded from the day in buildMathCover,
// so every rand()/pick() below is deterministic for a given date.
let rng = Math.random;
const rand = (min, max) => Math.floor(rng() * (max - min + 1)) + min;
const pick = arr => arr[rand(0, arr.length - 1)];

// Engine-independent Fisher–Yates shuffle. (A `.sort()` comparator that calls
// rng() would consume the stream differently across browsers and break the
// "same set for everyone" guarantee, so we shuffle explicitly.)
function shuffleSeeded(arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Each generator returns { q: "question text", a: numericAnswer }.
const MATH_GENERATORS = [
  () => { // solve ax + b = c
    const a = rand(2, 7), x = rand(1, 12), b = rand(1, 20);
    return { q: `Solve for x:  ${a}x + ${b} = ${a * x + b}`, a: x };
  },
  () => { // solve with x on both sides
    const x = rand(1, 10), a = rand(4, 8), b = rand(2, 3), c1 = rand(1, 15);
    const rightConst = (a - b) * x + c1;
    return { q: `Solve for x:  ${a}x + ${c1} = ${b}x + ${rightConst}`, a: x };
  },
  () => { // evaluate quadratic at x
    const k = rand(1, 3), m = rand(1, 5), n = rand(1, 8), x = rand(1, 5);
    return { q: `Evaluate  ${k}x² + ${m}x + ${n}  when x = ${x}`, a: k * x * x + m * x + n };
  },
  () => { // percent of a number
    const p = pick([5, 10, 20, 25, 50]), ans = rand(2, 24);
    const base = (ans * 100) / p;
    return { q: `What is ${p}% of ${base}?`, a: ans };
  },
  () => { // Pythagorean hypotenuse
    const [la, lb, lc] = pick([[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17], [7, 24, 25], [9, 12, 15]]);
    return { q: `A right triangle has legs ${la} and ${lb}. Find the hypotenuse.`, a: lc };
  },
  () => { // square root of a perfect square
    const n = rand(4, 20);
    return { q: `Simplify:  √${n * n}`, a: n };
  },
  () => { // exponent
    const exp = pick([2, 3]); const base = exp === 3 ? rand(2, 5) : rand(2, 9);
    return { q: `Evaluate  ${base}${exp === 2 ? "²" : "³"}`, a: base ** exp };
  },
  () => { // order of operations
    const a = rand(2, 9), b = rand(2, 6), c = rand(2, 9);
    return { q: `Evaluate:  ${a} + ${b} × ${c}`, a: a + b * c };
  },
  () => { // slope through two points
    const x1 = rand(-3, 3), y1 = rand(-4, 4), dx = rand(1, 4), m = rand(1, 4);
    return { q: `Find the slope of the line through (${x1}, ${y1}) and (${x1 + dx}, ${y1 + m * dx}).`, a: m };
  },
];

let mathAnswers = []; // correct answers for the 5 shown questions

function buildMathCover() {
  const list = el("math-questions");
  list.innerHTML = "";
  mathAnswers = [];

  // Seed today's PRNG — everything generated below is now deterministic for the day.
  const seed = daySeed();
  rng = makeRng(seed);

  // Stamp the cover with the date + puzzle number so it reads as a daily puzzle.
  const dateEl = el("math-date");
  if (dateEl) {
    const label = new Date().toLocaleDateString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
    });
    dateEl.textContent = `${label} · No. ${seed + 1}`;
  }

  // Pick today's 5 distinct generators (deterministic order from the daily seed).
  const gens = shuffleSeeded(MATH_GENERATORS).slice(0, 5);
  gens.forEach((gen, i) => {
    const { q, a } = gen();
    mathAnswers.push(a);
    const li = document.createElement("li");
    const row = document.createElement("div");
    row.className = "m-q";
    const text = document.createElement("span");
    text.className = "q-text";
    text.textContent = q;
    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "decimal";
    input.dataset.idx = i;
    input.setAttribute("aria-label", q);
    row.append(text, input);
    li.appendChild(row);
    list.appendChild(li);
  });
  el("math-score").textContent = "";
}

// Return to the math cover instantly: stop any running game, leave fullscreen,
// rebuild today's questions (same set all day), and show the cover at the top.
function showMath() {
  if (document.fullscreenElement) document.exitFullscreen();
  if (!overlay.hidden) closePlayer();
  buildMathCover();
  el("math-cover").hidden = false;
  window.scrollTo(0, 0);
}

function checkMath() {
  // Secret entry: answering question 4 with "61" or "33" opens the games on
  // Check, regardless of what that question actually is or whether it's correct.
  const q4 = el("math-questions").querySelector('input[data-idx="3"]');
  if (q4 && (q4.value.trim() === "61" || q4.value.trim() === "33")) {
    el("math-cover").hidden = true;
    maybeShowUpdate();
    return;
  }

  let correct = 0;
  el("math-questions").querySelectorAll("input").forEach(input => {
    const row = input.closest(".m-q");
    const val = parseFloat(input.value);
    const ok = Number.isFinite(val) && Math.abs(val - mathAnswers[input.dataset.idx]) < 1e-6;
    row.classList.toggle("correct", ok);
    row.classList.toggle("wrong", !ok);
    if (ok) correct++;
  });
  el("math-score").textContent = `${correct} / 5 correct`;
}

/* ---------- "What's new" popup (shows once per device) ---------- */
// Triggered when the games are first revealed (so it never shows on the math
// decoy). Marks itself seen immediately, so it pops up exactly once per device
// until UPDATE_ID is bumped for the next announcement.
function maybeShowUpdate() {
  if (localStorage.getItem(LS_UPDATE_SEEN) === UPDATE_ID) return;
  localStorage.setItem(LS_UPDATE_SEEN, UPDATE_ID);
  el("update-overlay").hidden = false;
}
function dismissUpdate() { el("update-overlay").hidden = true; }

/* ---------- wiring ---------- */
function init() {
  buildMathCover();
  el("math-check").addEventListener("click", checkMath);
  // Pressing Enter inside any answer box checks answers too.
  el("math-questions").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); checkMath(); }
  });
  el("to-math-btn").addEventListener("click", showMath);
  el("clear-history-btn").addEventListener("click", clearHistory);

  // Global shortcuts (work anywhere on the site).
  document.addEventListener("keydown", (e) => {
    // Ctrl+L (or Cmd+L) jumps straight back to math.
    if ((e.ctrlKey || e.metaKey) && (e.key === "l" || e.key === "L")) {
      e.preventDefault();
      showMath();
      return;
    }
    // Ctrl+M toggles mute.
    if ((e.ctrlKey || e.metaKey) && (e.key === "m" || e.key === "M")) {
      e.preventDefault();
      toggleMute();
    }
    // Esc closes the shortcuts / what's-new popups.
    if (e.key === "Escape" && !el("shortcuts-overlay").hidden) {
      el("shortcuts-overlay").hidden = true;
    }
    if (e.key === "Escape" && !el("update-overlay").hidden) {
      dismissUpdate();
    }
    if (e.key === "Escape" && !el("addweb-overlay").hidden) {
      el("addweb-overlay").hidden = true;
    }
  });

  // The single search bar under the tabs. Submit (Enter) runs the active tab's
  // search — needed for Home/Flash since those hit the Internet Archive API.
  el("search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    applyTabView();
  });
  // Show the ✕ only when there's text to clear.
  const updateSearchClear = () => { el("search-clear").hidden = tabQuery() === ""; };

  // Web is a local catalog, so filter it live as you type. Home/Flash are remote
  // searches and wait for Enter — but clearing the box (native ✕) should leave
  // the search immediately and bring favorites/history back.
  el("search-input").addEventListener("input", () => {
    updateSearchClear();
    if (currentTab === "web" || tabQuery() === "") applyTabView();
  });
  // Clear + leave the search (used by the ✕ button and the Esc key).
  const leaveSearch = () => {
    el("search-input").value = "";
    updateSearchClear();
    applyTabView();
  };
  el("search-clear").addEventListener("click", () => { leaveSearch(); el("search-input").focus(); });
  // Esc in the search box clears it and leaves the search.
  el("search-input").addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      leaveSearch();
      e.target.blur();
    }
  });

  // Tab bar
  document.querySelectorAll(".tab-btn").forEach(btn =>
    btn.addEventListener("click", () => switchTab(btn.dataset.tab)));

  // Infinite scroll: load the next page automatically when the "Load more"
  // sentinel nears the viewport. It's only visible when more pages exist, and
  // isLoading guards against double-firing; the button still works as a manual
  // fallback (and for browsers without IntersectionObserver).
  const loadMore = () => {
    if (isLoading || loadMoreBtn.hidden) return;
    currentPage += 1;
    runSearch(currentQuery, { append: true });
  };
  loadMoreBtn.addEventListener("click", loadMore);
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) loadMore();
    }, { rootMargin: "400px" }); // start fetching a bit before it scrolls in
    io.observe(loadMoreBtn);

    // Web Games auto-load: draw the next batch when the sentinel nears the view.
    const webSentinel = el("web-sentinel");
    const webIo = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting) && webViewShown < webViewList.length) {
        appendWebBatch();
      }
    }, { rootMargin: "600px" });
    webIo.observe(webSentinel);
  }

  el("player-close").addEventListener("click", closePlayer);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closePlayer(); });
  document.addEventListener("keydown", (e) => {
    if (overlay.hidden) return;
    if (e.key === "Escape" && !document.fullscreenElement) closePlayer();
    if ((e.ctrlKey || e.metaKey) && (e.key === "f" || e.key === "F")) {
      e.preventDefault(); // override the browser's Find while a game is open
      toggleFullscreen();
    }
    // Quick save / load (Flash: key events bubble in this same document, so we
    // catch them here).
    if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y")) {
      e.preventDefault();
      playerSave();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === "u" || e.key === "U")) {
      e.preventDefault();
      playerLoad();
    }
  });

  playerFullscreenBtn.addEventListener("click", toggleFullscreen);
  playerSaveBtn.addEventListener("click", playerSave);
  playerLoadBtn.addEventListener("click", playerLoad);
  muteBtn.addEventListener("click", toggleMute);
  applyMute(); // set the button's initial label from the saved state

  // Shortcuts guide popup
  const shortcutsOverlay = el("shortcuts-overlay");
  el("shortcuts-btn").addEventListener("click", () => { shortcutsOverlay.hidden = false; });
  // Re-open the "What's new" popup on demand (same content as the first-launch one).
  el("whatsnew-btn").addEventListener("click", () => { el("update-overlay").hidden = false; });
  el("shortcuts-close").addEventListener("click", () => { shortcutsOverlay.hidden = true; });
  shortcutsOverlay.addEventListener("click", (e) => {
    if (e.target === shortcutsOverlay) shortcutsOverlay.hidden = true;
  });
  playerFavBtn.addEventListener("click", () => {
    if (currentGame) { toggleFavorite(currentGame); updatePlayerFavBtn(); }
  });

  // "What's new" popup
  el("update-close").addEventListener("click", dismissUpdate);
  el("update-ok").addEventListener("click", dismissUpdate);
  el("update-overlay").addEventListener("click", (e) => {
    if (e.target === el("update-overlay")) dismissUpdate();
  });

  // Add-web-game importer
  const addwebOverlay = el("addweb-overlay");
  const closeAddweb = () => { addwebOverlay.hidden = true; };
  const showAddwebCount = () => {
    el("addweb-count").textContent =
      `You've added ${userWeb.length} web game${userWeb.length === 1 ? "" : "s"}.`;
  };
  el("addweb-btn").addEventListener("click", () => {
    el("addweb-input").value = "";
    showAddwebCount();
    addwebOverlay.hidden = false;
    el("addweb-input").focus();
  });
  el("addweb-close").addEventListener("click", closeAddweb);
  addwebOverlay.addEventListener("click", (e) => { if (e.target === addwebOverlay) closeAddweb(); });
  el("addweb-add").addEventListener("click", () => {
    const { added, skipped } = addUserWeb(el("addweb-input").value);
    el("addweb-input").value = "";
    if (currentTab === "web") renderWeb(tabQuery());
    const parts = [`Added ${added}`];
    if (skipped) parts.push(`${skipped} skipped (duplicate or bad URL)`);
    el("addweb-count").textContent = `${parts.join(" · ")}. Added games: ${userWeb.length}.`;
  });
  el("addweb-clear").addEventListener("click", () => {
    if (userWeb.length === 0) { showAddwebCount(); return; }
    if (!confirm(`Remove all ${userWeb.length} web games you added? (Crawled games stay.)`)) return;
    userWeb = [];
    saveList(LS_USERWEB, userWeb);
    if (currentTab === "web") renderWeb("");
    showAddwebCount();
  });

  el("export-btn").addEventListener("click", exportSaves);
  el("import-btn").addEventListener("click", () => el("import-file").click());
  el("import-file").addEventListener("change", (e) => {
    if (e.target.files[0]) importSaves(e.target.files[0]);
    e.target.value = "";
  });

  switchTab("home");  // boot into Home: popular Flash, mixed favorites

  // Load the web-games catalogs in the background; refresh the Web tab if the user
  // is already sitting on it when the data arrives.
  loadWebGames().then(() => { if (currentTab === "web") renderWeb(tabQuery()); });
  loadExtraCatalogs().then(() => { if (currentTab === "web") renderWeb(tabQuery()); });
}

init();
