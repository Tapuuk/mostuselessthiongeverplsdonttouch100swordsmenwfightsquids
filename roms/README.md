# `roms/` — drop your own ROM files here

Put emulator ROM files in this folder, then run the builder. They show up in the
site's **Retro Console** tab and play in-browser (EmulatorJS), served from your own
site so they work on a locked-down Chromebook.

## How to add ROMs
1. Copy ROM files into this folder (subfolders are fine):
   ```
   roms/sonic.md
   roms/zelda.gba
   roms/sega/streets.bin
   ```
2. From the repo root, run:
   ```
   python3 tools/build-roms.py
   ```
   That writes `roms.json` (the catalog the site reads).
3. Commit + push. GitHub Pages serves them.

## Console auto-detection (by file extension)
| Ext | System | Ext | System |
|-----|--------|-----|--------|
| `.nes` `.fds` | NES | `.gb` `.gbc` | Game Boy / Color |
| `.sfc` `.smc` | SNES | `.gba` | GBA |
| `.md` `.gen` `.smd` `.bin` | Genesis | `.gg` | Game Gear |
| `.32x` | Sega 32X | `.pce` | PC Engine |
| `.a26` `.a78` | Atari 2600/7800 | `.lnx` | Lynx |
| `.n64` `.z64` `.v64` | N64 | `.nds` | DS |
| `.psx` `.cue` | PlayStation | | |

Unknown extensions, plus `README`/`.gitkeep`/images, are skipped.

## Heads-up
- **Only add files you're allowed to host.** This folder is published to the public
  internet via GitHub Pages — that's distribution, not private use. Use homebrew,
  public-domain, or ROMs you have the right to share.
- BIOS-required cores (PlayStation, etc.) may not boot without a BIOS file.
- Big ROMs (N64/PSX) load slower and eat repo space (GitHub ~1 GB soft limit).
