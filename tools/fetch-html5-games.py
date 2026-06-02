#!/usr/bin/env python3
"""
fetch-html5-games.py — vendor open-source HTML5 games into games/<slug>/.

Why vendor (copy the files here) instead of embedding / linking out:
  The site runs on a locked-down Chromebook where itch.io and most game hosts
  are DNS-blocked, and itch's CDN refuses to be iframed cross-origin anyway. The
  ONLY thing guaranteed to run is content served from this site's own origin. So
  every game must physically live under games/<slug>/ and load same-origin — no
  external hosts, nothing for the school filter to block.

What this will and will NOT fetch:
  Only games whose license actually permits redistribution (MIT / GPL / CC0 /
  Apache / public-domain). "Free to play on itch" is NOT the same as "free to
  copy onto my server" — most indie games keep full copyright, and mass-mirroring
  them is piracy regardless of personal use. Those are excluded by design. Each
  manifest entry below records its license + source URL so attribution and (for
  GPL) the source-offer are preserved in games/<slug>/meta.json.

How it works:
  For each manifest entry it walks the upstream GitHub repo's file tree, downloads
  every runtime file (extension allow-list, so build junk / node_modules / .git
  are skipped) into games/<slug>/, keeping relative paths, then writes a meta.json
  with title/license/credit. build-games.py then picks the folder up automatically
  (it scans games/*/index.html and reads meta.json).

Usage:
  python3 tools/fetch-html5-games.py            # fetch all manifest entries
  python3 tools/fetch-html5-games.py slug ...   # fetch only the given slugs
  python3 tools/fetch-html5-games.py --force    # re-download even if present
  then: python3 tools/build-games.py            # regenerate web-games.json
"""
import json, os, sys, time, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAMES_DIR = os.path.join(ROOT, "games")

# Runtime files only. No-extension names handled separately (LICENSE/README).
ALLOW_EXT = {
    ".html", ".htm", ".js", ".mjs", ".css", ".json", ".wasm", ".map",
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico", ".bmp",
    ".wav", ".mp3", ".ogg", ".m4a", ".webm", ".mp4",
    ".ttf", ".otf", ".woff", ".woff2",
    ".glsl", ".frag", ".vert", ".txt", ".xml", ".csv", ".fnt", ".atlas",
}
# Never pull these (build tooling / repo cruft that isn't needed to run).
SKIP_DIRS = {".git", ".github", "node_modules", "src", "tools", "test", "tests",
             "docs", "doc", ".vscode", "dist-src"}
SKIP_NAMES = {"package.json", "package-lock.json", "yarn.lock", "tsconfig.json",
              "webpack.config.js", "rollup.config.js", "vite.config.js",
              ".gitignore", ".eslintrc", ".prettierrc"}
MAX_FILE = 8 * 1024 * 1024  # 8 MB per file safety cap

# --- The manifest: slug -> game. Every entry is redistribution-licensed. -------
# subdir: which folder inside the repo holds the game ("" = repo root).
# colors: cover gradient (used by build-games.py when the game has no own cover).
MANIFEST = {
    "spacehuggers": {
        "title": "Space Huggers",
        "repo": "KilledByAPixel/SpaceHuggers", "subdir": "",
        "license": "GPL-3.0", "credit": "Frank Force (KilledByAPixel)",
        "colors": ("#1a1030", "#3a1f5e"),
    },
    "huejumper": {
        "title": "Hue Jumper", "repo": "KilledByAPixel/HueJumper2k", "subdir": "",
        "license": "GPL-3.0", "credit": "Frank Force (KilledByAPixel)",
        "colors": ("#102a4d", "#1f566b"), "only": ["index.html", "favicon.ico"],
    },
    "bounceback": {
        "title": "Bounce Back", "repo": "KilledByAPixel/BounceBack", "subdir": "",
        "license": "GPL-2.0", "credit": "Frank Force (KilledByAPixel)",
        "colors": ("#1f4d3a", "#2b6b55"),
    },
    "1keys": {
        "title": "1 Keys", "repo": "KilledByAPixel/1Keys", "subdir": "",
        "license": "GPL-3.0", "credit": "Frank Force (KilledByAPixel)",
        "colors": ("#4d1f2a", "#6b2b3f"), "only": ["index.html"],
    },
}

UA = {"User-Agent": "gamesite-fetch/1.0"}
GH_TOKEN = os.environ.get("GITHUB_TOKEN", "").strip()


def gh_get(url):
    req = urllib.request.Request(url, headers=dict(UA))
    if GH_TOKEN:
        req.add_header("Authorization", "Bearer " + GH_TOKEN)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (403, 429) and attempt < 3:  # rate limit -> back off
                time.sleep(5 * (attempt + 1))
                continue
            raise
    raise RuntimeError("unreachable")


def default_branch(repo):
    info = json.loads(gh_get(f"https://api.github.com/repos/{repo}"))
    return info.get("default_branch", "main")


def list_tree(repo, branch):
    data = json.loads(gh_get(
        f"https://api.github.com/repos/{repo}/git/trees/{branch}?recursive=1"))
    if data.get("truncated"):
        print(f"  ! tree truncated for {repo} (very large repo)")
    return [(n["path"], n.get("size", 0)) for n in data.get("tree", [])
            if n.get("type") == "blob"]


def wanted(path, size, only):
    parts = path.split("/")
    if any(p in SKIP_DIRS for p in parts[:-1]):
        return False
    name = parts[-1]
    if name in SKIP_NAMES:
        return False
    if only is not None:
        return path in only
    _, ext = os.path.splitext(name)
    if ext.lower() not in ALLOW_EXT:
        return False
    if size > MAX_FILE:
        return False
    return True


def fetch_game(slug, g, force):
    repo = g["repo"]
    subdir = g.get("subdir", "").strip("/")
    only = None
    if g.get("only"):
        only = {(subdir + "/" + p).strip("/") for p in g["only"]}
    dest_root = os.path.join(GAMES_DIR, slug)
    entry = os.path.join(dest_root, "index.html")
    if os.path.isfile(entry) and not force:
        print(f"= {slug}: already present (use --force to refresh)")
        return True

    print(f"+ {slug}: {repo}")
    branch = default_branch(repo)
    tree = list_tree(repo, branch)
    prefix = (subdir + "/") if subdir else ""
    picked = []
    for path, size in tree:
        if subdir and not path.startswith(prefix):
            continue
        if wanted(path, size, only):
            picked.append(path)
    if not any(p.rsplit("/", 1)[-1] == "index.html" for p in picked):
        print(f"  ! no index.html found in {repo}/{subdir or '.'} — skipped")
        return False

    n = 0
    for path in picked:
        rel = path[len(prefix):] if prefix else path
        raw = f"https://raw.githubusercontent.com/{repo}/{branch}/{path}"
        try:
            blob = gh_get(raw)
        except urllib.error.HTTPError as e:
            print(f"  ! {rel}: HTTP {e.code} — skipped")
            continue
        out = os.path.join(dest_root, rel)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with open(out, "wb") as f:
            f.write(blob)
        n += 1

    meta = {
        "title": g["title"],
        "license": g["license"],
        "credit": g["credit"],
        "source": f"https://github.com/{repo}",
        "colors": list(g.get("colors", ("#1f4d4a", "#2b5e6b"))),
    }
    with open(os.path.join(dest_root, "meta.json"), "w") as f:
        json.dump(meta, f, indent=1)
    print(f"  -> {n} files  ({g['license']}, {g['credit']})")
    return True


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    force = "--force" in sys.argv
    slugs = args or list(MANIFEST.keys())
    ok = 0
    for slug in slugs:
        g = MANIFEST.get(slug)
        if not g:
            print(f"? unknown slug: {slug}")
            continue
        try:
            if fetch_game(slug, g, force):
                ok += 1
        except Exception as e:
            print(f"  ! {slug}: {e}")
    print(f"\nDone: {ok}/{len(slugs)} games vendored.")
    print("Next: python3 tools/build-games.py   # regenerate web-games.json")


if __name__ == "__main__":
    main()
