#!/usr/bin/env python3
"""
build-games.py — generate web-games.json from the self-hosted games/ folder.

Why self-hosted (not itch.io):
  itch.io HTML5 games can't be embedded on another domain — itch's CDN serves a
  "You should be using itch.io" anti-hotlink page when framed elsewhere, and on a
  locked-down Chromebook itch.io is DNS-blocked anyway. The only thing guaranteed
  to run is content served from THIS site's own origin. So games live in games/<slug>/
  and load same-origin — no external hosts, nothing to block.

How to add a game:
  1. Drop a self-contained game into  games/<slug>/index.html  (no external CDNs:
     everything must be in that folder so it works offline / DNS-blocked).
  2. Add a line to GAMES below (title + a couple of cover colors), or just let it
     fall back to defaults.
  3. Run:  python3 tools/build-games.py
     -> writes a cover.svg per game and regenerates web-games.json.

Vendored games (added by fetch-html5-games.py) carry a games/<slug>/meta.json
with title/license/credit/colors + sometimes a screenshot.png cover; this script
reads that when present and falls back to the GAMES table / defaults otherwise.

The site loads web-games.json at runtime (see loadWebGames in app.js).
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAMES_DIR = os.path.join(ROOT, "games")

# slug -> (Title, color A, color B)
GAMES = {
    "snake":    ("Snake",    "#1f4d2e", "#2b6b45"),
    "breakout": ("Breakout", "#1f3a4d", "#2b566b"),
    "2048":     ("2048",     "#4d3a1f", "#6b552b"),
    "tetris":   ("Tetris",   "#3a1f4d", "#562b6b"),
}


def cover_svg(title, a, b):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240">'
        f'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
        f'<stop offset="0" stop-color="{a}"/><stop offset="1" stop-color="{b}"/></linearGradient></defs>'
        f'<rect width="320" height="240" fill="url(#g)"/>'
        f'<text x="160" y="128" font-family="system-ui,Segoe UI,sans-serif" font-size="34" '
        f'font-weight="800" fill="#ffffff" text-anchor="middle">{title}</text>'
        f'<text x="160" y="162" font-family="system-ui,sans-serif" font-size="13" '
        f'fill="#ffffffcc" text-anchor="middle" letter-spacing="2">PLAY</text></svg>'
    )


# Cover image candidates a vendored game may already ship (used as-is if found).
COVER_FILES = ("cover.png", "screenshot.png", "screenshot.jpg", "thumb.png", ".c.jpg")


def find_cover(slug, gdir):
    for name in COVER_FILES:
        if os.path.isfile(os.path.join(gdir, name)):
            return f"games/{slug}/{name}"
    return None


def main():
    out = []
    for slug in sorted(os.listdir(GAMES_DIR)):
        gdir = os.path.join(GAMES_DIR, slug)
        index = os.path.join(gdir, "index.html")
        if not os.path.isfile(index):
            continue

        # meta.json (from fetch-html5-games.py) wins; then GAMES table; then defaults.
        meta = {}
        meta_path = os.path.join(gdir, "meta.json")
        if os.path.isfile(meta_path):
            with open(meta_path) as f:
                meta = json.load(f)
        d_title, d_a, d_b = GAMES.get(
            slug, (slug.replace("-", " ").title(), "#1f4d4a", "#2b5e6b"))
        title = meta.get("title", d_title)
        a, b = meta.get("colors", [d_a, d_b])[:2] if meta.get("colors") else (d_a, d_b)

        # Prefer the game's own cover art; otherwise generate a gradient SVG.
        img = find_cover(slug, gdir)
        if not img:
            with open(os.path.join(gdir, "cover.svg"), "w") as f:
                f.write(cover_svg(title, a, b))
            img = f"games/{slug}/cover.svg"

        entry = {
            "identifier": "local-" + slug,
            "title": title,
            "url": f"games/{slug}/index.html",
            "img": img,
        }
        if meta.get("license"):
            entry["license"] = meta["license"]
        if meta.get("credit"):
            entry["credit"] = meta["credit"]
        if meta.get("source"):
            entry["source"] = meta["source"]
        out.append(entry)
    out.sort(key=lambda g: g["title"].lower())
    with open(os.path.join(ROOT, "web-games.json"), "w") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"Wrote {len(out)} games -> web-games.json")
    for g in out:
        print("  ", g["title"], "->", g["url"])


if __name__ == "__main__":
    main()
