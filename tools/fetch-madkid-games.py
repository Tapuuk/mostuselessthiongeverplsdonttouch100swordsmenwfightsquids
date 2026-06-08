#!/usr/bin/env python3
"""
fetch-madkid-games.py — build madkid-games.json from madkid.games' sitemap.

madkid.games is an HTML5 game portal that self-hosts its games at
www.madkidgames.com. Each catalog page (/game/<slug>) embeds the bare game from
https://www.madkidgames.com/full/<slug>, with a thumbnail at
https://www.madkidgames.com/games/<slug>/thumb_2.jpg — so we embed that bare URL
directly (no portal chrome) and skip a per-game fetch.

The site lists every game in its sitemap.xml, so we just read that.

HEADS-UP (locked-down Chromebook): these load from the external domain
www.madkidgames.com. If the school filter blocks it, the games won't load — no
same-origin workaround. Test on the target device.

Usage:  python3 tools/fetch-madkid-games.py
"""
import json, os, re, sys, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "madkid-games.json")

SITEMAP = "https://madkid.games/sitemap.xml"
GAME_BASE = "https://www.madkidgames.com/full/"
THUMB = "https://www.madkidgames.com/games/{slug}/thumb_2.jpg"
CREDIT = "madkid.games"
UA = "Mozilla/5.0 (gamesite catalog builder)"


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read().decode("utf-8", "replace")


def title_from(slug):
    return re.sub(r"\b\w", lambda m: m.group().upper(), slug.replace("-", " ")).strip()


def main():
    xml = fetch(SITEMAP)
    slugs, seen = [], set()
    for loc in re.findall(r"<loc>([^<]+)</loc>", xml):
        m = re.search(r"/game/([A-Za-z0-9-]+)/?$", loc.strip())
        if m and m.group(1) not in seen:
            seen.add(m.group(1))
            slugs.append(m.group(1))

    out = [{
        "identifier": "madkid-" + s,
        "title": title_from(s),
        "url": GAME_BASE + s,
        "img": THUMB.format(slug=s),
        "credit": CREDIT,
    } for s in slugs]
    out.sort(key=lambda e: e["title"].lower())

    with open(OUT, "w") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Wrote {len(out)} games -> madkid-games.json")


if __name__ == "__main__":
    main()
