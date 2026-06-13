# Project: Games (a.k.a. gamesite)

## What this is
A static games site that boots behind a **decoy math page** ("Daily Math - Grade 9")
so it reads as a school site in history/bookmarks. Typing `61` into question 4 (or
the right shortcut) reveals the game library. Built to run on a **locked-down school
Chromebook** where most game hosts are DNS-blocked and dropping files into Downloads
is a giveaway — so everything is served **same-origin** and all state lives in
**browser storage only** (never Downloads).

Live on GitHub Pages at a custom domain (see `CNAME`).

## Library — three tabs
One search bar sits under the tabs (global on Home, scoped to the tab otherwise).

- **Home** — popular Flash + mixed favorites/recently-played.
- **Flash Archive** — `.swf` games from the Internet Archive `softwarelibrary_flash`
  collection, played with **Ruffle** (WASM, lazy-loaded from unpkg). Browsed via the
  Archive search API with `sort[]=random`; fetched through `/cors/` URLs.
- **Web Games** — one tab, multiple sources merged into a single list so the search
  bar covers them all at once. Each game's `credit` (source name) shows under its
  title.
  - **Self-hosted** (Chromebook-proof): built-from-scratch canvas games +
    license-verified open-source titles (GPL/MIT), served same-origin from `games/`.
  - **External embedded catalogs** (`EXTRA_WEB_CATALOGS` in `app.js`):
    **madkid.games** (~449, plays from `madkidgames.com/full/<slug>`) and
    **GamePix** (~13k, plays from `play.gamepix.com/<slug>/embed`). Iframe-embedded,
    so they only load if those external domains aren't blocked on the device (NOT
    Chromebook-proof — must be tested on-device). `renderWeb` draws cards in
    `WEB_BATCH` chunks and auto-loads more on scroll (IntersectionObserver on
    `#web-sentinel`).

*(idev.games was dropped — `X-Frame-Options: SAMEORIGIN`, refuses embedding.
GameDistribution too — its catalog needs full Google Ad Manager/ads onboarding +
domain whitelist. Portals that gate on ads/whitelist or block framing are out.)*

*(A Retro Console tab — EmulatorJS + ROMs — was removed: hosting commercial ROMs
publicly = copyright distribution + blows the GitHub Pages size cap.)*

## Drop-in folder (add your own content)
- `games/<slug>/index.html` (+ assets, self-contained, no external CDNs) → HTML5 games.
- Folds into the catalog at build time, served same-origin so it works on the
  blocked device. **Anything committed is published publicly via GitHub Pages — only
  add content you're allowed to host** (your own / open-source / public-domain).

## Build tools (`tools/`)
- `build-games.py` — scans `games/` → `web-games.json` (reads per-game `meta.json`:
  title/license/credit/colors; uses screenshot cover or generates an SVG).
- `build.py` — runs the build.
- `fetch-html5-games.py` — vendors **license-verified** open-source HTML5 games from
  GitHub into `games/<slug>/` (manifest-gated; refuses anything not redistributable).
- `fetch-madkid-games.py` — reads madkid.games' sitemap → `madkid-games.json`.
- `fetch-gamepix-games.py` — pages GamePix's public JSON feed → `gamepix-games.json`
  (~13k games; embed URLs on `play.gamepix.com/<slug>/embed`, which sets no
  `X-Frame-Options`, so it frames where the main `gamepix.com` site would not).

Run a builder after changing the folder, then commit. Site loads `web-games.json`
(`loadWebGames`) + the `EXTRA_WEB_CATALOGS` (`loadExtraCatalogs`) at runtime.

## Saves & state (browser-only)
- localStorage: favorites, history, Flash SharedObject backups.
- Flash has no VM snapshot API → Save/Load is "Backup/Restore" of SharedObjects.
  Web games keep their own progress in their own origin's storage (no Save buttons).
- Export/Import all saves as a JSON file (portable across devices).

## Shortcuts
`Ctrl+L` panic → math page · `Ctrl+F` fullscreen · `Ctrl+Y`/`Ctrl+U` back up/restore
Flash save · `Ctrl+M` mute · `Esc` close. Type `61` or `33` in math question 4 to
enter the games.

## Stack & dev
- Pure HTML/CSS/JS, no framework. `index.html` + `styles.css` + `app.js`.
- Ruffle from CDN (lazy). GitHub Pages hosting.
- Dev on Arch Linux; test on the Chromebook; Live Server / `python3 -m http.server`
  for local preview. Validate JS with `node --check app.js`.

## Content policy (firm)
Only **legal homebrew / open-source / public-domain**, or content the **user supplies
themselves**. No sourcing, curating, or mass-mirroring of pirated commercial ROMs or
copyrighted itch.io games — "personal use" framing doesn't apply once it's published
to a public site, which is distribution.
