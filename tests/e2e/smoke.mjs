// E2E 冒煙測試＋效能預算。零依賴：Node 內建 http／zlib／WebSocket，直接走 Chrome DevTools Protocol。
//
//   ./build.sh && node tests/e2e/smoke.mjs            # 測 dist/
//   CHROME=/path/to/chrome node tests/e2e/smoke.mjs    # 指定 Chrome
//
// 在 /hohshen/ 子路徑伺服 dist/（模擬 GitHub Pages），用無頭 Chrome 跑三種設定：
// 桌面 1440×900、手機 390×844、減少動態效果。截圖存到 tests/e2e/out/。
// 擋下發佈的條件寫在 HARD，只警告的寫在 SOFT（CI 是軟體 GPU，動畫時間不穩定）。

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';
import os from 'node:os';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(import.meta.dirname, 'out');
const BASE = '/hohshen/';

const HARD = {
  wasmGzipKB: 130, // wasm gzip 後的上限；目前約 99 KB
  introMs: 60000, // body.intro-done 出現的上限（CI 軟體 GPU 初始化 3D 很慢）
};
const SOFT = {
  warpGoneMs: 3500, // 開場 canvas 淡出完成；主執行緒被 3D 初始化卡住時會超過，只警告
};

const errors = [];
const warnings = [];
const fail = (msg) => { errors.push(msg); console.log(`  ✗ ${msg}`); };
const warn = (msg) => { warnings.push(msg); console.log(`  ! ${msg}`); };
const pass = (msg) => console.log(`  ✓ ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 預算：wasm 體積 ──
if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('找不到 dist/index.html：請先跑 ./build.sh');
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });
console.log('預算');
const wasm = fs.readdirSync(DIST).find((f) => f.endsWith('_bg.wasm'));
const gz = zlib.gzipSync(fs.readFileSync(path.join(DIST, wasm)), { level: 9 }).length / 1024;
gz <= HARD.wasmGzipKB
  ? pass(`wasm gzip ${gz.toFixed(1)} KB ≤ ${HARD.wasmGzipKB} KB`)
  : fail(`wasm gzip ${gz.toFixed(1)} KB 超過 ${HARD.wasmGzipKB} KB：檢查是否新增了大型依賴（cargo tree），或確認 Cargo.toml 的 release profile 仍是 opt-level="z"、lto=true`);

// ── 靜態伺服器：/hohshen/ → dist/ ──
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (!url.startsWith(BASE)) { res.writeHead(404).end(); return; }
  let file = path.join(DIST, url.slice(BASE.length));
  if (!file.startsWith(DIST)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PAGE = `http://127.0.0.1:${server.address().port}${BASE}`;

// ── Chrome ──
const CHROME = process.env.CHROME || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find((p) => fs.existsSync(p));
if (!CHROME) { console.error('找不到 Chrome：請設定環境變數 CHROME'); process.exit(1); }

async function run({ tag, width, height, reduce }) {
  console.log(`\n${tag}（${width}×${height}${reduce ? '，減少動態效果' : ''}）`);
  const port = 9300 + Math.floor(Math.random() * 600);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-'));
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${width},${height}`,
    '--no-first-run', '--no-default-browser-check', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', ...(process.env.CI ? ['--no-sandbox'] : []), 'about:blank'], { stdio: 'ignore' });
  try {
    let target;
    for (let i = 0; i < 80 && !target; i++) {
      try { target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json(); } catch { await sleep(250); }
    }
    if (!target) { fail(`${tag}：Chrome 沒有啟動`); return; }
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    let id = 0; const pending = new Map(); const pageErrors = []; const httpErrors = [];
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
      if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') pageErrors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
      if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) httpErrors.push(`${m.params.response.status} ${m.params.response.url}`);
      if (m.method === 'Network.loadingFailed' && !m.params.canceled) httpErrors.push(`${m.params.errorText} ${m.params.requestId}`);
    };
    const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }))?.result?.value;
    const shot = async (name) => fs.writeFileSync(path.join(OUT, `${tag}-${name}.png`), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    await new Promise((r) => (ws.onopen = r));
    await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 720 });
    if (reduce) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

    const t0 = Date.now();
    await send('Page.navigate', { url: PAGE });
    // 頁面自己記錄開場 canvas 淡出完成的時間（合成器的 animationend／transitionend 不受主執行緒卡住影響太多）
    let introAt = null, warpGoneAt = null, sawWarp = false, state = null;
    while (Date.now() - t0 < HARD.introMs) {
      state = await ev(`({ intro: document.body?.classList.contains('intro-done'), warp: !!document.getElementById('warp'), sections: document.querySelectorAll('#app section').length })`).catch(() => null);
      if (state?.warp) sawWarp = true;
      if (state && !state.warp && sawWarp && warpGoneAt === null) warpGoneAt = Date.now() - t0;
      if (state?.intro) { introAt = Date.now() - t0; break; }
      await sleep(200);
    }
    introAt !== null ? pass(`開場收尾（body.intro-done）${introAt} ms`) : fail(`${tag}：${HARD.introMs / 1000} 秒內沒有出現 body.intro-done。看 console 錯誤；常見原因是 scene.js 載入失敗（檢查 js/bridge.js 的路徑與 Trunk 的 copy-file）`);
    state?.sections === 9 ? pass('#app 有 9 個 section') : fail(`${tag}：#app 的 section 數是 ${state?.sections}，應為 9。Leptos 沒掛上或元件少了一章，看 console 的 panic 訊息`);
    if (reduce) {
      state && !state.warp ? pass('減少動態效果：沒有開場動畫') : fail(`${tag}：減少動態效果時不該有 #warp。檢查 src/warp.rs 的 reduce 分支`);
    } else if (warpGoneAt !== null) {
      warpGoneAt <= SOFT.warpGoneMs ? pass(`開場 canvas 移除 ${warpGoneAt} ms`) : warn(`${tag}：開場 canvas ${warpGoneAt} ms 才移除（目標 ≤ ${SOFT.warpGoneMs} ms）。CI 是軟體 GPU，僅供參考；實機請用手機確認`);
    }
    await sleep(500);
    await shot('hero');

    const r = await ev(`(async () => {
      const s = (ms) => new Promise((r) => setTimeout(r, ms));
      document.getElementById('writing').scrollIntoView(); dispatchEvent(new Event('scroll')); await s(1500);
      const out = {
        hud: document.getElementById('hudKm').textContent + ' / ' + document.getElementById('hudName').textContent,
        nav: [...document.querySelectorAll('.nav ul a')].filter((a) => a.getAttribute('aria-current') === 'true').map((a) => a.textContent).join(','),
      };
      const mb = document.querySelector('.menu-btn'); mb.click(); await s(100);
      out.open = document.getElementById('menu').classList.contains('open') && mb.getAttribute('aria-expanded') === 'true';
      document.querySelector('#menu .close').click(); await s(100);
      out.closed = !document.getElementById('menu').classList.contains('open') && mb.getAttribute('aria-expanded') === 'false';
      return out;
    })()`);
    await shot('writing');
    r?.hud === '400 km / 低地軌道' ? pass('高度讀數：400 km / 低地軌道') : fail(`${tag}：寫作章的高度讀數是「${r?.hud}」，應為「400 km / 低地軌道」。檢查 src/dom.rs 的 watch_hud 與各 section 的 data-km`);
    r?.nav === '寫作' ? pass('導覽標示目前章：寫作') : fail(`${tag}：導覽標示的是「${r?.nav}」，應為「寫作」。檢查 src/dom.rs 的 watch_nav`);
    r?.open && r?.closed ? pass('手機目錄可開可關') : fail(`${tag}：手機目錄開關異常（open=${r?.open}, closed=${r?.closed}）。檢查 src/lib.rs 的 Nav`);
    pageErrors.length === 0 ? pass('console 零錯誤') : fail(`${tag}：console 錯誤 ${pageErrors.length} 則：${pageErrors.slice(0, 3).join(' | ')}`);
    httpErrors.length === 0 ? pass('HTTP 零失敗') : fail(`${tag}：資源載入失敗：${httpErrors.slice(0, 3).join(' | ')}。檢查 index.html 的 data-trunk 複製設定與相對路徑`);
    ws.close();
  } finally {
    const exited = new Promise((r) => chrome.once('exit', r));
    chrome.kill();
    await Promise.race([exited, sleep(5000)]);
    // Chrome 的子行程可能還在寫入；清不掉不影響測試結果
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* 忽略 */ }
  }
}

for (const cfg of [
  { tag: 'desktop', width: 1440, height: 900 },
  { tag: 'mobile', width: 390, height: 844 },
  { tag: 'reduced', width: 1440, height: 900, reduce: true },
]) await run(cfg);

server.close();
console.log(`\n結果：${errors.length} 個失敗、${warnings.length} 個警告。截圖在 ${path.relative(ROOT, OUT)}/`);
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### E2E 冒煙測試\n\n- 失敗：${errors.length}\n- 警告：${warnings.length}\n${[...errors, ...warnings].map((m) => `- ${m}`).join('\n')}\n`);
}
process.exit(errors.length ? 1 : 0);
