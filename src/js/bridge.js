// Rust 與 3D 場景之間的橋。scene.js 由 trunk 複製到輸出根目錄，這裡用動態 import 載入，
// 讓 wasm 與躍遷開場不必等 three.js（約 1 MB）下載完。
let mod = null;
export function loadScene() {
  return import(new URL('scene.js', document.baseURI).href).then((m) => { mod = m; });
}
export function sceneIntro() { if (mod) mod.intro(); }
export function sceneScrollLock(on) { if (mod) mod.scrollLock(on); }
