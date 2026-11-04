#!/usr/bin/env bash
# 一鍵產出 dist/：先把元件 SSR 成預渲染 HTML 寫回 index.html，再用 trunk 編譯 wasm、複製 img/ vendor/ scene.js。
# 需要：rustup target add wasm32-unknown-unknown；cargo install trunk --locked
set -euo pipefail
cd "$(dirname "$0")"
[ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"
cargo run -q --features ssr --bin prerender
trunk build --release
