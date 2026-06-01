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
const HISTORY_LIMIT = 12;

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

function isFavorite(id) { return favorites.some(g => g.identifier === id); }

function toggleFavorite(game) {
  if (isFavorite(game.identifier)) {
    favorites = favorites.filter(g => g.identifier !== game.identifier);
  } else {
    favorites.unshift({ identifier: game.identifier, title: game.title });
  }
  saveList(LS_FAVORITES, favorites);
  renderFavorites();
  refreshFavButtons();
}

function pushHistory(game) {
  history = history.filter(g => g.identifier !== game.identifier);
  history.unshift({ identifier: game.identifier, title: game.title });
  history = history.slice(0, HISTORY_LIMIT);
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
  const sort = text ? "" : "&sort[]=downloads+desc"; // popular first when browsing
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
    resultsTitle.textContent = text ? `Results for “${text}”` : "Popular games";
  }
  resultsStatus.textContent = "Loading…";
  loadMoreBtn.hidden = true;

  try {
    const games = await fetchGames(currentQuery, currentPage);
    games.forEach(g => resultsGrid.appendChild(makeCard(g)));
    resultsStatus.textContent = resultsGrid.children.length === 0
      ? "No games found. Try another search."
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

  const img = document.createElement("img");
  img.className = "card-thumb";
  img.loading = "lazy";
  img.decoding = "async";
  img.alt = game.title;
  img.src = thumbUrl(game.identifier);
  img.onerror = () => { img.style.visibility = "hidden"; };

  const title = document.createElement("div");
  title.className = "card-title";
  title.textContent = game.title;

  const fav = document.createElement("button");
  fav.className = "fav-toggle" + (isFavorite(game.identifier) ? " active" : "");
  fav.textContent = isFavorite(game.identifier) ? "♥" : "♡";
  fav.title = "Toggle favorite";
  fav.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleFavorite(game);
  });

  card.append(img, fav, title);
  card.addEventListener("click", () => openPlayer(game));
  return card;
}

function renderShelf(sectionId, gridId, list) {
  const section = el(sectionId);
  const grid = el(gridId);
  grid.innerHTML = "";
  if (list.length === 0) { section.hidden = true; return; }
  section.hidden = false;
  list.forEach(g => grid.appendChild(makeCard(g)));
}

function renderFavorites() { renderShelf("favorites-section", "favorites-grid", favorites); }
function renderHistory() { renderShelf("history-section", "history-grid", history); }

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
const muteBtn = el("mute-btn");
let currentGame = null;
let rufflePlayer = null;
let rufflePromise = null;

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
  currentGame = game;
  overlay.hidden = false;
  document.body.style.overflow = "hidden";
  playerTitle.textContent = game.title;
  playerStatus.textContent = "Loading game…";
  playerStatus.style.display = "";
  updatePlayerFavBtn();

  // tear down any previous instance
  if (rufflePlayer) { rufflePlayer.remove(); rufflePlayer = null; }

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

function closePlayer() {
  overlay.hidden = true;
  document.body.style.overflow = "";
  if (rufflePlayer) { rufflePlayer.remove(); rufflePlayer = null; }
  currentGame = null;
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
  // Secret entry: answering question 4 with "61" opens the games on Check,
  // regardless of what that question actually is or whether 61 is correct.
  const q4 = el("math-questions").querySelector('input[data-idx="3"]');
  if (q4 && q4.value.trim() === "61") {
    el("math-cover").hidden = true;
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

/* ---------- wiring ---------- */
function init() {
  buildMathCover();
  el("math-check").addEventListener("click", checkMath);
  // Pressing Enter inside any answer box checks answers too.
  el("math-questions").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); checkMath(); }
  });
  el("to-math-btn").addEventListener("click", showMath);

  // Global shortcuts (work anywhere on the site).
  document.addEventListener("keydown", (e) => {
    // Ctrl+L (or Cmd+L) jumps straight back to math.
    if ((e.ctrlKey || e.metaKey) && (e.key === "l" || e.key === "L")) {
      e.preventDefault();
      showMath();
      return;
    }
    // M toggles mute — but not while typing in a field.
    const typing = /^(INPUT|TEXTAREA)$/.test(e.target.tagName);
    if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === "m" || e.key === "M")) {
      toggleMute();
    }
    // Esc closes the shortcuts popup.
    if (e.key === "Escape" && !el("shortcuts-overlay").hidden) {
      el("shortcuts-overlay").hidden = true;
    }
  });

  el("search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    runSearch(el("search-input").value.trim());
  });

  loadMoreBtn.addEventListener("click", () => {
    currentPage += 1;
    runSearch(currentQuery, { append: true });
  });

  el("player-close").addEventListener("click", closePlayer);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closePlayer(); });
  document.addEventListener("keydown", (e) => {
    if (overlay.hidden) return;
    if (e.key === "Escape" && !document.fullscreenElement) closePlayer();
    if ((e.ctrlKey || e.metaKey) && (e.key === "f" || e.key === "F")) {
      e.preventDefault(); // override the browser's Find while a game is open
      toggleFullscreen();
    }
  });

  playerFullscreenBtn.addEventListener("click", toggleFullscreen);
  muteBtn.addEventListener("click", toggleMute);
  applyMute(); // set the button's initial label from the saved state

  // Shortcuts guide popup
  const shortcutsOverlay = el("shortcuts-overlay");
  el("shortcuts-btn").addEventListener("click", () => { shortcutsOverlay.hidden = false; });
  el("shortcuts-close").addEventListener("click", () => { shortcutsOverlay.hidden = true; });
  shortcutsOverlay.addEventListener("click", (e) => {
    if (e.target === shortcutsOverlay) shortcutsOverlay.hidden = true;
  });
  playerFavBtn.addEventListener("click", () => {
    if (currentGame) { toggleFavorite(currentGame); updatePlayerFavBtn(); }
  });

  el("export-btn").addEventListener("click", exportSaves);
  el("import-btn").addEventListener("click", () => el("import-file").click());
  el("import-file").addEventListener("change", (e) => {
    if (e.target.files[0]) importSaves(e.target.files[0]);
    e.target.value = "";
  });

  renderFavorites();
  renderHistory();
  runSearch("");   // load popular games on first visit
}

init();
