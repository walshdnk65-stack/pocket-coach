#!/usr/bin/env sh
# Assembles src/ into one self-contained index.html you can open directly in a browser.
set -e
cd "$(dirname "$0")"
{
  printf '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
  printf '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
  cat src/head.html
  printf '</head>\n<body>\n'
  cat src/body.html
  printf '<script>\n'
  cat src/engine.js src/game.js src/coach.js src/ui.js
  printf '</script>\n</body>\n</html>\n'
} > index.html
echo "Built index.html"
