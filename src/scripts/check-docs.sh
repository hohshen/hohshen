#!/usr/bin/env bash
# 文件地圖不能過期：AGENTS.md 與 README-dev.md 裡用反引號寫的 repo 路徑，檔案或資料夾都必須存在。
# 路徑一律從 repo 根目錄算起（例如 `src/rust/lib.rs`）。
# 失敗時：把文件裡的路徑改成現在的位置，或補回被刪掉的檔案。
set -euo pipefail
cd "$(dirname "$0")/../.."
fail=0
for doc in AGENTS.md README-dev.md; do
  [ -f "$doc" ] || { echo "::error::找不到 $doc"; fail=1; continue; }
  while read -r p; do
    if [ ! -e "$p" ]; then
      echo "::error file=$doc::$doc 提到 \`$p\`，但這個路徑不存在。請改成現在的位置，或補回檔案。"
      fail=1
    fi
  done < <(grep -oE '`[^` ]+`' "$doc" | tr -d '`' | sed -E 's/:[0-9]+$//' \
    | grep -E '^(src|\.github)/|^(AGENTS\.md|README(-dev)?\.md)$' | sort -u)
done
[ "$fail" = 0 ] && echo "文件路徑檢查：通過" || exit 1
