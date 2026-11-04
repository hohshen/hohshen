# AGENTS.md

給在這個 repo 工作的 agent 與人看的地圖。細節在連過去的檔案，這裡只放「去哪裡找、什麼不能做」。

## 這是什麼

後端里長伯 Hohshen 的個人網站，發佈在 https://hohshen.github.io/hohshen/ 。
`README.md` 是 GitHub 個人頁的自介，不是網站說明，不要改成開發文件。

## 去哪裡改

| 想改 | 改這裡 |
|---|---|
| 站上的文字、數字、連結、圖片說明 | `src/content.rs` |
| 頁面結構與元件 | `src/lib.rs` |
| 導覽、高度讀數、標題揭示、開場收尾 | `src/dom.rs` |
| 躍遷開場動畫 | `src/warp.rs` |
| 3D 場景、捲動動畫 | `js/scene.js`（Three.js、GSAP、Lenis） |
| 樣式 | `style/site.css` |
| head 的 meta、og、字體、importmap | `index.html`（`#app` 內是自動產生的，不要手改） |

架構與開機順序見 `README-dev.md`。

## 規則（CI 會擋）

- Rust 與 JS 的接點只有 DOM 的 id／class 和 `js/bridge.js`。`js/scene.js` 用到的選擇器必須存在於 Rust 頁面，契約由 `tests/site_rules.rs` 檢查。
- 改了 `src/` 之後要跑 `./build.sh`，讓 `index.html` 的預渲染內容更新，再一起 commit。
- 改了 `vendor/` 或 `js/` 要跑 `./scripts/vendor-sums.sh` 更新雜湊。
- 開新分頁的連結要有 `rel="noopener"`；圖片要有 `alt`、`width`、`height`。
- 禁用詞：公開清單在 `tests/forbidden-public.txt`。不公開清單（真名等）只放在 GitHub secret `FORBIDDEN_TERMS` 與本機被 ignore 的 `docs/forbidden.txt`，**不要寫進任何會 commit 的檔案，也不要在 log、issue、PR 裡寫出來**。
- `docs/` 被 gitignore：裡面的 PRD 有不公開的個資，不要加進版控。

## 本機驗證

```sh
./build.sh                                        # 預渲染 → trunk build → dist/
cargo test --features ssr --test site_rules       # 結構測試與內容規則
node tests/e2e/smoke.mjs                          # E2E 冒煙測試＋效能預算（需要 Chrome）
cargo deny check advisories bans sources          # 依賴漏洞
./scripts/check-docs.sh                           # 本檔與 README-dev.md 提到的路徑都存在
```

## CI（`.github/workflows/pages.yml`）

| job | 擋什麼 | 失敗怎麼修 |
|---|---|---|
| 依賴漏洞 | RustSec 公告、非 crates.io 來源、yanked 版本 | `cargo update -p <crate>`；確定不影響才在 `deny.toml` 的 ignore 加一筆並寫理由 |
| workflow 安全 | 權限過寬、模板注入、未釘 SHA 的 action | 照 zizmor 訊息改 `.github/workflows/` |
| 金鑰外洩 | commit 裡的 token、金鑰 | 撤銷那把金鑰，再從歷史移除 |
| 結構與內容規則 | vendor 雜湊、預渲染過期、Rust↔JS／CSS 契約、連結、圖片、禁用詞、文件路徑 | 錯誤訊息會寫修法 |
| 建置＋E2E | wasm gzip ≤ 130 KB、頁面開得起來、console 零錯誤、高度讀數、目錄開關 | 看 log 與 artifact 的截圖 |
| 發佈 | 只在 push 到 main 或手動觸發時跑 | |

`.github/workflows/maintenance.yml` 是手動觸發的定期清理：重掃依賴漏洞與外部連結，有問題會開 issue。
Dependabot（`.github/dependabot.yml`）每週開依賴更新 PR。
