// 真實背景的文字對比檢查。Lighthouse 只看 CSS 背景色（純黑），看不到 3D 畫出來的地球、銀河、太陽，
// 所以這裡直接量畫面：在幾個捲動位置，把文字設成透明後截圖，取得每段文字背後「真正的」背景，
// 文字的暗色光暈（text-shadow）保留，因為它就是讀者實際看到的底色。
// 再用 WCAG 公式算文字與背景的對比。背景取文字範圍內第 90 百分位的亮度：大片亮背景一定抓得到，
// 1px 的軌道線、零星星點不會誤判。
//
//   cd src && ./build.sh && node tests/e2e/contrast.mjs
//
// 門檻：WCAG AA，一般字 4.5:1，大字（≥ 24px，或 ≥ 18.66px 且粗體）3:1。
// 失敗時：調暗那個位置的 3D 背景（src/js/scene.js 的銀河亮度、構圖），或在 src/style/site.css 加深文字後方的遮罩。

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(import.meta.dirname, 'out');
const BASE = '/hohshen/';
const STOPS = [['hero', 0], ['record', 0.12], ['how', 0.27], ['decisions', 0.36], ['writing', 0.55], ['talks', 0.7], ['about', 0.86], ['dock', 0.94], ['end', 1]];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── PNG 解碼（CDP 截圖是 8-bit RGBA，非交錯）──
function decodePNG(buf) {
  let pos = 8, w = 0, h = 0, ct = 6; const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; }
    if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const bpp = ct === 6 ? 4 : 3, raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, row = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[row + x - bpp] : 0, b = y ? px[row - stride + x] : 0, c = x >= bpp && y ? px[row - stride + x - bpp] : 0;
      let v = raw[src + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[row + x] = v & 255;
    }
  }
  return { w, h, bpp, px };
}
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

// ── 伺服 dist/ ──
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = path.join(DIST, url.slice(BASE.length));
  if (!url.startsWith(BASE) || !file.startsWith(DIST)) { res.writeHead(404).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404).end(); return; }
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.jpg': 'image/jpeg' };
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PAGE = process.env.SMOKE_URL || `http://127.0.0.1:${server.address().port}${BASE}`;
const CHROME = process.env.CHROME || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
fs.mkdirSync(OUT, { recursive: true });

const W = 1440, H = 900, port = 9200 + Math.floor(Math.random() * 90);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'contrast-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${W},${H}`, '--use-angle=swiftshader', '--enable-unsafe-swiftshader', ...(process.env.CI ? ['--no-sandbox'] : []), 'about:blank'], { stdio: 'ignore' });
let target; for (let i = 0; i < 80 && !target; i++) { try { target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json(); } catch { await sleep(250); } }
const ws = new WebSocket(target.webSocketDebuggerUrl); let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }))?.result?.value;
await new Promise((r) => (ws.onopen = r));
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: PAGE });
for (let i = 0; i < 300; i++) { if (await ev(`document.body?.classList.contains('intro-done')`)) break; await sleep(200); }
await sleep(3000);

const failures = [];
let worst = Infinity;
for (const [name, frac] of STOPS) {
  await ev(`window.scrollTo(0, Math.round((document.documentElement.scrollHeight - innerHeight) * ${frac})); dispatchEvent(new Event('scroll'))`);
  await sleep(2800);
  // 收集畫面內的文字區塊與它們的顏色、字級
  const items = await ev(`(() => {
    const out = [];
    const opac = (el) => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) o *= +getComputedStyle(e).opacity; return o; };
    const walker = document.createTreeWalker(document.getElementById('app'), NodeFilter.SHOW_TEXT);
    const seen = new Set();
    while (walker.nextNode()) {
      const t = walker.currentNode; if (!t.textContent.trim()) continue;
      const el = t.parentElement; if (seen.has(el)) continue; seen.add(el);
      if (el.closest('.nav, .hud, #menu, .kline, .btn, .cursor, figcaption')) continue;   /* 導覽與讀數用 mix-blend-mode，按鈕與圖說有自己的底 */
      if (el.closest('.manifest') && !el.classList.contains('on')) continue;              /* 標語未亮起是刻意的暗 */
      if (el.closest('details:not([open]) > :not(summary)')) continue;                 /* 收合中的常見問題答案看不到 */
      const range = document.createRange(); range.selectNodeContents(t);
      for (const r of range.getClientRects()) {
        if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
        const cs = getComputedStyle(el), m = cs.color.match(/[\\d.]+/g).map(Number);
        out.push({ text: t.textContent.trim().slice(0, 18), x: r.left, y: r.top, w: r.width, h: r.height, rgb: m.slice(0, 3), a: (m[3] ?? 1) * opac(el), size: parseFloat(cs.fontSize), bold: +cs.fontWeight >= 700 });
      }
    }
    return out;
  })()`);
  // 文字透明後截圖，得到文字背後的真實背景
  await ev(`(() => { const s = document.createElement('style'); s.id = '__hide'; s.textContent = '#app *{color:transparent!important;-webkit-text-fill-color:transparent!important;caret-color:transparent!important}'; document.head.appendChild(s); })()`);
  await sleep(250);
  const png = decodePNG(Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await ev(`document.getElementById('__hide').remove()`);
  fs.writeFileSync(path.join(OUT, `contrast-${name}.png`), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  let n = 0;
  for (const it of items) {
    const ls = [];
    for (let y = Math.max(0, Math.floor(it.y)); y < Math.min(png.h, it.y + it.h); y += 2)
      for (let x = Math.max(0, Math.floor(it.x)); x < Math.min(png.w, it.x + it.w); x += 2) {
        const o = (y * png.w + x) * png.bpp; ls.push([lum(png.px[o], png.px[o + 1], png.px[o + 2]), o]);
      }
    if (!ls.length) continue;
    ls.sort((a, b) => a[0] - b[0]);
    const [bgL, o] = ls[Math.floor(ls.length * 0.9)];
    const bg = [png.px[o], png.px[o + 1], png.px[o + 2]];
    const fg = it.rgb.map((c, i) => c * it.a + bg[i] * (1 - it.a));        /* 半透明文字疊在背景上的實際顏色 */
    const fL = lum(...fg), ratio = (Math.max(fL, bgL) + 0.05) / (Math.min(fL, bgL) + 0.05);
    const large = it.size >= 24 || (it.size >= 18.66 && it.bold), need = large ? 3 : 4.5;
    worst = Math.min(worst, ratio / need);
    if (ratio < need) { n++; failures.push(`${name}：「${it.text}」對比 ${ratio.toFixed(2)}:1（需要 ${need}:1，${it.size}px）`); }
  }
  console.log(`${n ? '✗' : '✓'} ${name}：${items.length} 段文字${n ? `，${n} 段對比不足` : ''}`);
}
ws.close(); chrome.kill(); server.close();
try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3 }); } catch { /* 忽略 */ }
const uniq = [...new Set(failures)];
uniq.slice(0, 30).forEach((f) => console.log('  - ' + f));
console.log(`\n結果：${uniq.length} 段文字對比不足；最差的一段是門檻的 ${(worst * 100).toFixed(0)}%。截圖在 ${path.relative(ROOT, OUT)}/contrast-*.png`);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### 真實背景對比\n\n- 不足：${uniq.length} 段\n${uniq.slice(0, 30).map((f) => `- ${f}`).join('\n')}\n`);
process.exit(uniq.length ? 1 : 0);
