#!/usr/bin/env bash
# 本機預覽：建置 dist/，在 http://localhost:8765/ 伺服並打開瀏覽器。Ctrl+C 結束。
# 不要直接用瀏覽器開 index.html：那是 trunk 範本，沒有 CSS，wasm 在 file:// 下也跑不起來。
set -euo pipefail
cd "$(dirname "$0")"
PORT="${PORT:-8765}"
./build.sh
URL="http://localhost:$PORT/"
echo "預覽：${URL}（Ctrl+C 結束）"
( sleep 1; command -v open >/dev/null && open "$URL" || xdg-open "$URL" >/dev/null 2>&1 || true ) &
cd dist && exec python3 -m http.server "$PORT" --bind 127.0.0.1
