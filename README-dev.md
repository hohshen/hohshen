# 開發說明

`README.md` 是 GitHub 個人頁的自介，網站本身的說明在這裡。

網站：https://hohshen.github.io/hohshen/

## 架構

| 部分 | 技術 | 位置 |
|---|---|---|
| 頁面結構、導覽、手機目錄、高度讀數、標題揭示、標語逐句亮起 | Rust（Leptos CSR → wasm） | `src/lib.rs`、`src/dom.rs` |
| 站上所有文字與連結 | Rust 常數 | `src/content.rs` |
| 躍遷開場動畫（2D canvas） | Rust | `src/warp.rs` |
| 3D 場景、捲動動畫、平滑捲動 | JS（Three.js、GSAP、Lenis，vendor 在 `vendor/`） | `js/scene.js` |
| Rust 與 3D 場景之間的橋 | JS | `js/bridge.js` |
| 樣式 | CSS | `style/site.css` |
| 預渲染（給不跑 JS 的爬蟲） | Leptos SSR | `src/bin/prerender.rs` 寫進 `index.html` 的 `#app` |

開機順序：wasm 載入 → 清掉預渲染、掛上頁面 → 同時開始躍遷動畫與動態載入 `scene.js` → 兩者都好了才收尾開場（`body.intro-done`）。

## 本機建置與預覽

```sh
rustup target add wasm32-unknown-unknown
cargo install trunk --locked     # 0.22.1

./build.sh                       # 預渲染寫回 index.html → trunk build --release → dist/
cd dist && python3 -m http.server 8765    # http://localhost:8765/
```

開發時可用 `trunk serve`（不會更新預渲染）。

## 上線

push 到 `main` 就會由 `.github/workflows/pages.yml` 建置並發佈到 GitHub Pages。
CI 會先重跑預渲染，`index.html` 跟元件對不上就失敗；改了 `src/` 的內容，記得先跑 `./build.sh` 再一起 commit。

## CI 檢查

每個 job 擋什麼、失敗怎麼修，見 `AGENTS.md` 的「CI」一節。

定期清理（依賴漏洞、外部連結）不設排程，要手動到 Actions → Maintenance → Run workflow。
