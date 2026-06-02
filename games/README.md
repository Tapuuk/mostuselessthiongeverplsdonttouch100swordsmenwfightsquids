# `games/` — drop your own HTML5 games here

Each game is one self-contained folder that the site serves from its own origin
(works on a locked-down Chromebook). They show up in the **Web Games** tab.

## How to add an HTML5 game
1. Make a folder `games/<slug>/` with the game's `index.html` and **all** its assets
   inside (no external CDN/`<script src="https://...">` — those get DNS-blocked):
   ```
   games/my-game/index.html
   games/my-game/game.js
   games/my-game/sprites.png
   ```
2. (Optional) drop a `cover.png`/`screenshot.png` in the folder for the card art,
   and/or a `meta.json`:
   ```json
   { "title": "My Game", "license": "MIT", "credit": "Author Name",
     "source": "https://github.com/...", "colors": ["#1f4d2e", "#2b6b45"] }
   ```
3. From the repo root, run:
   ```
   python3 tools/build-games.py
   ```
   That writes `web-games.json` (the catalog the site reads) and a `cover.svg`
   fallback for games without their own art.
4. Commit + push.

## Heads-up
- Must be **HTML5** (runs in a browser). `.exe`/installer games won't work.
- Keep everything **inside the folder** and same-origin, or it breaks on the
  blocked device.
- This folder is published publicly via GitHub Pages — only add games you're
  allowed to host (your own / open-source / public-domain).

See `tools/fetch-html5-games.py` for vendoring license-verified open-source games
automatically.
