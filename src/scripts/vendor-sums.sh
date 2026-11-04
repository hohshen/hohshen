#!/usr/bin/env bash
# 重算 vendor/ 與 js/ 的 SHA-256。只有在「刻意」升級 vendor 或修改 js/ 之後才跑，並把 vendor/SHA256SUMS 一起 commit。
# CI 的 checks job 會跑 `sha256sum -c vendor/SHA256SUMS`，檔案被改動但雜湊沒更新就會失敗。
set -euo pipefail
cd "$(dirname "$0")/.."
SUM=$(command -v sha256sum >/dev/null && echo "sha256sum" || echo "shasum -a 256")
find vendor js -type f ! -name SHA256SUMS ! -name .DS_Store | LC_ALL=C sort | xargs $SUM > vendor/SHA256SUMS
echo "已更新 vendor/SHA256SUMS（$(wc -l < vendor/SHA256SUMS | tr -d ' ') 個檔案）"
