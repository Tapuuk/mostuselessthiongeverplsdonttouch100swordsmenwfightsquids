#!/usr/bin/env python3
"""
build.py — regenerate the catalog.

Runs build-games.py (HTML5 games in games/ -> web-games.json). Run this after
dropping new games into games/, before committing.

  python3 tools/build.py
"""
import os, runpy

HERE = os.path.dirname(os.path.abspath(__file__))

for script in ("build-games.py",):
    print(f"=== {script} ===")
    runpy.run_path(os.path.join(HERE, script), run_name="__main__")
    print()
