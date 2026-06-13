#!/usr/bin/env python3
"""
fetch-gamepix-games.py — build gamepix-games.json from GamePix's public feed.

GamePix (gamepix.com) is an HTML5 game portal that publishes a free JSON feed of
its whole catalog and serves every game from an embed-friendly subdomain
(play.gamepix.com/<slug>/embed). That embed URL sets NO X-Frame-Options and NO
restrictive frame-ancestors, so it iframes cleanly (unlike the main site). The
feed item already hands us the ready embed `url` and a cover `banner_image`, so we
just page through it.

HEADS-UP (locked-down Chromebook): these load from the external domain
play.gamepix.com. If the school filter blocks it, the games won't load — there's
no same-origin workaround. Test on the target device.

Usage:  python3 tools/fetch-gamepix-games.py [max_pages]
"""
import json, os, sys, time, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "gamepix-games.json")

FEED = "https://feeds.gamepix.com/v2/json/?sid=1&pagination=96&page={page}"
CREDIT = "gamepix.com"
UA = "Mozilla/5.0 (gamesite catalog builder)"


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def main():
    max_pages = int(sys.argv[1]) if len(sys.argv) > 1 else 0  # 0 = all
    out, seen, page = [], set(), 1
    while True:
        try:
            data = fetch(FEED.format(page=page))
        except (urllib.error.URLError, urllib.error.HTTPError) as e:
            print(f"  page {page} failed: {e}", file=sys.stderr)
            break
        items = data.get("items") or []
        if not items:
            break
        for it in items:
            slug = it.get("namespace")
            url = it.get("url")
            if not slug or not url or slug in seen:
                continue
            seen.add(slug)
            out.append({
                "identifier": "gamepix-" + slug,
                "title": (it.get("title") or slug).strip(),
                "url": url,
                "img": it.get("banner_image") or it.get("image") or "",
                "credit": CREDIT,
            })
        if page % 25 == 0:
            print(f"  page {page}, {len(out)} games so far")
        # stop at the feed's own last page
        if data.get("next_url") in (None, "") or data.get("home_page_url") and not data.get("next_url"):
            break
        last = data.get("last_page_url", "")
        if "page=" in last:
            try:
                if page >= int(last.split("page=")[1].split("&")[0]):
                    break
            except ValueError:
                pass
        page += 1
        if max_pages and page > max_pages:
            break
        time.sleep(0.15)

    out.sort(key=lambda e: e["title"].lower())
    with open(OUT, "w") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Wrote {len(out)} games -> gamepix-games.json ({page} pages)")


if __name__ == "__main__":
    main()
