#!/usr/bin/env python3
"""
build-roms.py — generate roms.json from the self-hosted roms/ folder.

Drop your own legally-obtained ROM files into roms/ (subfolders OK), then run this
script. It walks the folder, detects the console from each file's extension, and
writes roms.json — the catalog the site loads at runtime (see loadRomFiles in app.js).

Each ROM is served SAME-ORIGIN (path like "roms/sonic.md"), so it plays on a
locked-down Chromebook where external hosts are DNS-blocked. EmulatorJS runs it in
the same-origin emulator.html iframe.

How to add ROMs:
  1. Copy ROM files into roms/  (e.g. roms/sonic.md, roms/zelda.gba). Subfolders fine.
  2. Run:  python3 tools/build-roms.py
     -> writes roms.json.
  3. Commit + push. The Retro Console tab shows them.

Notes:
  - Console is auto-detected from the extension (table below; same map as app.js).
  - Files with unknown extensions, plus README/.gitkeep/images, are skipped.
  - BIOS-required cores (PSX, etc.) may not boot without a BIOS file; big ROMs
    (N64/PSX) load slower. Homebrew/public-domain ROMs are the safe choice.
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROMS_DIR = os.path.join(ROOT, "roms")

# extension -> (EmulatorJS core, display system).  Mirror of EXT_CORE in app.js.
EXT_CORE = {
    "nes": ("nes", "NES"), "fds": ("nes", "FDS"),
    "sfc": ("snes", "SNES"), "smc": ("snes", "SNES"),
    "md": ("segaMD", "Genesis"), "gen": ("segaMD", "Genesis"),
    "smd": ("segaMD", "Genesis"), "bin": ("segaMD", "Genesis"),
    "32x": ("sega32x", "Sega 32X"),
    "gg": ("segaGG", "Game Gear"),
    "gba": ("gba", "GBA"), "gbc": ("gb", "GB Color"), "gb": ("gb", "Game Boy"),
    "n64": ("n64", "N64"), "z64": ("n64", "N64"), "v64": ("n64", "N64"),
    "pce": ("pce", "PC Engine"), "ngp": ("ngp", "Neo Geo Pocket"),
    "ngc": ("ngp", "Neo Geo Pocket"),
    "ws": ("ws", "WonderSwan"), "wsc": ("ws", "WonderSwan"),
    "vb": ("vb", "Virtual Boy"),
    "a26": ("atari2600", "Atari 2600"), "a78": ("atari7800", "Atari 7800"),
    "lnx": ("lynx", "Lynx"), "col": ("coleco", "ColecoVision"),
    "nds": ("nds", "DS"), "psx": ("psx", "PlayStation"), "cue": ("psx", "PlayStation"),
}


# Names to never treat as ROMs. Needed because ".md" is BOTH Markdown and a
# Genesis ROM extension — so README.md must be excluded by name, not extension.
SKIP_NAMES = {"readme.md", "readme", "license", "license.md", "license.txt", "changelog.md"}


def is_doc_or_meta(name):
    low = name.lower()
    return name.startswith(".") or low in SKIP_NAMES


def title_from(name):
    base = os.path.splitext(name)[0]
    return base.replace("_", " ").replace("-", " ").strip() or name


def slugify(path):
    s = "".join(c.lower() if c.isalnum() else "-" for c in path)
    return "-".join(p for p in s.split("-") if p)


def main():
    if not os.path.isdir(ROMS_DIR):
        print("No roms/ folder — create it and drop ROM files in.")
        return
    out = []
    for dirpath, _dirs, files in os.walk(ROMS_DIR):
        for fn in sorted(files):
            if is_doc_or_meta(fn):
                continue
            ext = fn.rsplit(".", 1)[-1].lower() if "." in fn else ""
            inf = EXT_CORE.get(ext)
            if not inf:
                continue  # README, .gitkeep, images, unknown formats
            core, system = inf
            rel = os.path.relpath(os.path.join(dirpath, fn), ROOT).replace(os.sep, "/")
            out.append({
                "identifier": "rom-" + slugify(os.path.relpath(
                    os.path.join(dirpath, fn), ROMS_DIR).replace(os.sep, "/")),
                "title": title_from(fn),
                "system": system,
                "core": core,
                "rom": rel,
            })
    out.sort(key=lambda g: g["title"].lower())
    with open(os.path.join(ROOT, "roms.json"), "w") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"Wrote {len(out)} ROMs -> roms.json")
    for g in out:
        print("  ", g["system"].ljust(14), g["title"], "->", g["rom"])
    if not out:
        print("  (roms/ is empty — drop ROM files in and re-run)")


if __name__ == "__main__":
    main()
