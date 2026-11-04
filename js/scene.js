/* 3D 場景與捲動動畫（Three.js、GSAP、Lenis）。
   頁面由 Rust（Leptos）畫好之後才動態載入本檔；載入即初始化。
   頁面結構、導覽、目錄、高度讀數、標題揭示、躍遷開場都在 src/ 的 Rust 端。 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(pointer: fine)').matches;
const mobile = matchMedia('(max-width: 720px)').matches;
const DPR = Math.min(devicePixelRatio, mobile ? 1.5 : 2);

/* ── WebGL 偵測 ── */
function hasWebGL(){ try { const c = document.createElement('canvas'); const gl = c.getContext('webgl2') || c.getContext('webgl'); return !!gl; } catch(e){ return false; } }
const webgl = hasWebGL();
if (!webgl) document.body.classList.add('no-webgl');

/* ── 場景 ── */
let composer, renderer, camera, scene, planet, atmo, ring, sat, stars, grainPass, planetMat, skyDome, clouds, running = true, rafId = 0;
const state = {
  camY:   { current: 0.15, target: 0.15, ease: 0.06 },
  camZ:   { current: mobile ? 4.2 : 3.4,  target: mobile ? 4.2 : 3.4,  ease: 0.06 },
  lookY:  { current: mobile ? 1.4 : 1.05, target: mobile ? 1.4 : 1.05, ease: 0.06 },
  lookX:  { current: 0, target: 0, ease: 0.06 },
  mouseX: { current: 0, target: 0, ease: 0.1 },
  mouseY: { current: 0, target: 0, ease: 0.1 },
  ringA:  { current: 0, target: 0, ease: 0.08 },
  haze:   { current: 0.34, target: 0.34, ease: 0.07 },
  starA:  { current: 0.25, target: 0.25, ease: 0.07 },
  atmoI:  { current: 1.35, target: 1.35, ease: 0.05 },
  ground: { current: 1, target: 1, ease: 0.06 },
};
const shake = { a: 0 };
let rotY = 0;
const pScreen = { x: 0.5, y: 0.5 };
const burn = { v: 0 }, shock = { v: 0 }, aber = { v: 0 }, fovP = { v: 0 };
function damp(s, dt){ const f = 1 - Math.pow(1 - s.ease, dt * 60); s.current += (s.target - s.current) * f; }

if (webgl){
  const canvas = document.getElementById('webgl');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(DPR); renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;

  scene = new THREE.Scene(); scene.background = new THREE.Color(0x06080f);
  camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.05, 200);
  camera.position.set(0, state.camY.current, state.camZ.current);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; pmrem.dispose();

  const sun = new THREE.DirectionalLight(0xffd9a8, 1.9); sun.position.set(4, 1.2, -2.5);
  var fill = new THREE.DirectionalLight(0x7fc4ff, 0.35); fill.position.set(-4, 2, 3);
  scene.add(sun, fill);

  const stage = new THREE.Group(); scene.add(stage);

  planetMat = new THREE.MeshStandardMaterial({ color: 0x070c16, roughness: 0.94, metalness: 0.0, envMapIntensity: 0.22 });
  planetMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = { value: 0 }; sh.uniforms.uNear = { value: 1 }; planetMat.userData.sh = sh;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vPos;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvPos = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPos;\nuniform float uNear;\nfloat hash3(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }\nfloat vnoise(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x),mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z); }')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n float land = smoothstep(0.52, 0.62, vnoise(vPos * 3.1) * 0.6 + vnoise(vPos * 7.3) * 0.4);\n float city = smoothstep(0.86, 0.995, vnoise(vPos * 320.0)) * land * smoothstep(0.3, 0.7, vnoise(vPos * 24.0));\n totalEmissiveRadiance += vec3(1.0, 0.74, 0.45) * city * 1.4;\n float near = smoothstep(0.82, 0.97, vnoise(vPos * 2600.0)) * smoothstep(0.35, 0.75, vnoise(vPos * 90.0)) * uNear;\n totalEmissiveRadiance += vec3(1.0, 0.7, 0.42) * near * 2.2;\n diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.035, 0.05, 0.075), land * 0.55);');
  };
  planet = new THREE.Mesh(new THREE.SphereGeometry(1, mobile ? 256 : 384, mobile ? 128 : 192), planetMat); stage.add(planet);

  const atmoMat = new THREE.ShaderMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide,
    uniforms: { uColor: { value: new THREE.Color(0x7fc4ff) }, uPower: { value: 3.2 }, uIntensity: { value: 1.35 } },
    vertexShader: `varying vec3 vNormal; varying vec3 vViewPosition; void main(){ vNormal = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vViewPosition = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `precision mediump float; uniform vec3 uColor; uniform float uPower; uniform float uIntensity; varying vec3 vNormal; varying vec3 vViewPosition; void main(){ vec3 N = normalize(vNormal); vec3 V = normalize(vViewPosition); float rim = pow(1.0 - max(dot(N, V), 0.0), uPower); gl_FragColor = vec4(uColor * rim * uIntensity, rim); }` });
  atmo = new THREE.Mesh(new THREE.SphereGeometry(1.028, 96, 96), atmoMat); stage.add(atmo);

  ring = new THREE.Mesh(new THREE.TorusGeometry(1.62, 0.0022, 8, 360), new THREE.MeshBasicMaterial({ color: 0xdce8f5, transparent: true, opacity: 0.16 }));
  ring.rotation.x = Math.PI * 0.5 + 0.28; ring.rotation.y = 0.35; stage.add(ring);
  sat = new THREE.Mesh(new THREE.SphereGeometry(0.014, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffffff })); stage.add(sat);
  sat.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 16), new THREE.MeshBasicMaterial({ color: 0x7fc4ff, transparent: true, opacity: 0.22 })));

  const COUNT = mobile ? 1800 : 4200, pos = new Float32Array(COUNT * 3), sz = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++){ const r = 22 + Math.random() * 60, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1); pos[i*3] = r * Math.sin(ph) * Math.cos(th); pos[i*3+1] = r * Math.sin(ph) * Math.sin(th); pos[i*3+2] = r * Math.cos(ph); sz[i] = 0.6 + Math.random() * 1.6; }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); sg.setAttribute('size', new THREE.BufferAttribute(sz, 1));
  stars = new THREE.Points(sg, new THREE.ShaderMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uPR: { value: DPR }, uA: { value: 0.25 } },
    vertexShader: `attribute float size; uniform float uTime; uniform float uPR; uniform float uA; varying float vA; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = size * uPR * (90.0 / -mv.z); vA = uA * (0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * 0.6 + position.x * 3.0 + position.y))); }`,
    fragmentShader: `precision mediump float; varying float vA; void main(){ vec2 uv = gl_PointCoord - 0.5; float d = length(uv); float c = smoothstep(0.5, 0.05, d); gl_FragColor = vec4(vec3(0.86, 0.91, 0.96) * c, c * vA); }` }));
  scene.add(stars);

  /* 地面天空：以相機所在位置的「上方」決定顏色，地平線一抹藍光、頭頂深藍；離地越高越淡 */
  skyDome = new THREE.Mesh(new THREE.SphereGeometry(100, 48, 24), new THREE.ShaderMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide,
    uniforms: { uUp: { value: new THREE.Vector3(0, 1, 0) }, uAmt: { value: 1 }, uDip: { value: 0.09 } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `precision mediump float; uniform vec3 uUp; uniform float uAmt; uniform float uDip; varying vec3 vDir;
      void main(){
        float e = dot(normalize(vDir), uUp) + uDip;
        vec3 zen = vec3(0.003, 0.008, 0.022);
        vec3 hor = vec3(0.022, 0.055, 0.13);
        vec3 c = mix(hor, zen, smoothstep(-0.02, 0.35, e));
        c += vec3(0.6, 0.32, 0.12) * exp(-abs(e) * 60.0) * 0.22;   /* 地平線上一線城市暖光 */
        gl_FragColor = vec4(c * uAmt, 1.0);
      }` }));
  skyDome.renderOrder = -1; scene.add(skyDome);

  /* 雲層：高度 0.012，從下方被城市燈打亮，從上方蓋住部分燈火 */
  clouds = new THREE.Mesh(new THREE.SphereGeometry(1.02, mobile ? 192 : 320, mobile ? 96 : 160), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uCamR: { value: 1 }, uAmt: { value: 1 } },
    vertexShader: `varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `precision mediump float; uniform float uTime; uniform float uCamR; uniform float uAmt; varying vec3 vPos;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
      float n(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
      void main(){
        vec3 p = vPos * 110.0 + vec3(uTime * 0.02, 0.0, 0.0);
        float f = n(p) * 0.55 + n(p * 2.3) * 0.3 + n(p * 5.1) * 0.15;
        float a = smoothstep(0.58, 0.8, f);
        float below = step(uCamR, 1.02);
        vec3 col = mix(vec3(0.07, 0.08, 0.11), vec3(0.1, 0.08, 0.08), below);
        a *= smoothstep(0.0015, 0.008, abs(uCamR - 1.02));        /* 穿過時改由後製霧接手，不會整片跳出來 */
        gl_FragColor = vec4(col, a * mix(0.75, 0.55, below) * uAmt);
      }` }));
  scene.add(clouds);

  const hdr = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType });
  composer = new EffectComposer(renderer, hdr); composer.setPixelRatio(DPR); composer.setSize(innerWidth, innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), mobile ? 0.3 : 0.55, 0.45, 0.78));
  const vigPass = new ShaderPass({ uniforms: { tDiffuse: { value: null }, uHaze: { value: 0.34 }, uMist: { value: 0 }, uBurn: { value: 0 }, uShock: { value: 0 }, uAber: { value: 0 }, uTime: { value: 0 }, uCenter: { value: new THREE.Vector2(0.5, 0.22) } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uHaze; uniform float uMist; uniform float uBurn; uniform float uShock; uniform float uAber; uniform float uTime; uniform vec2 uCenter; varying vec2 vUv;
      float rnd(float x){ return fract(sin(x * 12.9898) * 43758.5453); }
      void main(){
        vec2 uv = vUv;
        /* 震波：一圈由行星地平線往外推的折射環 */
        float d = distance(uv, uCenter);
        float r = uShock * 1.6;
        float ring = smoothstep(0.12, 0.0, abs(d - r)) * step(0.001, uShock) * (1.0 - uShock);
        uv += normalize(uv - uCenter + 1e-4) * ring * 0.16;
        /* 色散：穿越瞬間 RGB 分離 */
        vec2 dir = (uv - 0.5) * uAber;
        vec3 c = vec3(texture2D(tDiffuse, uv + dir).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - dir).b);
        /* 大氣霧：藍 → 升空時轉成灼熱的橘白 */
        vec3 hazeCol = mix(vec3(0.30, 0.52, 0.78), vec3(1.0, 0.56, 0.22), uBurn);
        float h = pow(1.0 - uv.y, 3.0) * (uHaze + uBurn * 0.5);
        c += hazeCol * h;
        /* 流光：越接近卡門線越多、越快的向上流線 */
        vec2 o = vec2(0.5, 1.35);
        float rad = length(uv - o);
        float ang = atan(uv.x - 0.5, uv.y - 1.35);
        float bin = floor(ang * 420.0);
        float k = rnd(bin);
        float speed = 2.5 + 5.0 * uBurn;
        float dash = pow(fract(rad * 1.6 - uTime * speed + k * 7.0), 18.0);
        float s = step(1.0 - 0.05 * uBurn, k) * dash * smoothstep(0.1, 0.75, 1.0 - uv.y);
        c += mix(hazeCol, vec3(1.0), 0.5) * s * 1.1 * uBurn;
        c += vec3(0.75, 0.9, 1.0) * ring * 1.8;
        c = mix(c, vec3(0.13, 0.16, 0.23), uMist * 0.5);
        float v = smoothstep(0.95, 0.35, length(uv - 0.5));
        gl_FragColor = vec4(mix(c * 0.45, c, v), 1.0);
      }` });
  composer.addPass(vigPass);
  composer.addPass(new OutputPass());
  if (!mobile){ grainPass = new ShaderPass({ uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uI: { value: 0.045 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; uniform float uI; varying vec2 vUv; float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); } void main(){ vec4 c = texture2D(tDiffuse, vUv); gl_FragColor = vec4(c.rgb + (rnd(vUv + fract(uTime)) - 0.5) * uI, c.a); }` }); composer.addPass(grainPass); }

  addEventListener('mousemove', (e) => { state.mouseX.target = (e.clientX / innerWidth) * 2 - 1; state.mouseY.target = -((e.clientY / innerHeight) * 2 - 1); }, { passive: true });
  let rp = false; addEventListener('resize', () => { if (rp) return; rp = true; requestAnimationFrame(() => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); rp = false; }); });
  const clock = new THREE.Clock();
  document.addEventListener('visibilitychange', () => { if (document.hidden){ running = false; cancelAnimationFrame(rafId); } else if (!running){ running = true; clock.getDelta(); tick(); } });

  function tick(){
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.1), t = clock.elapsedTime;
    for (const k in state) damp(state[k], dt);
    /* 起點：地表上方 0.004、緯度 0.6 rad；終點：原本的軌道視角。高度用指數爬升，像真的火箭 */
    const u = state.ground.current;
    const by = state.camY.current, bz = state.camZ.current;
    const r0 = Math.hypot(by, bz), ph0 = Math.atan2(by, bz);
    let px, py, pz, lx = state.lookX.current, ly = state.lookY.current, lz = 0, alt = r0 - 1;
    if (u > 0.0005){
      const g = 1 - u, A1 = 0.004, PH1 = 0.6;
      alt = A1 * Math.exp(Math.log(Math.max(r0 - 1, A1 * 1.01) / A1) * g);
      const sp = g < 0.15 ? 0 : Math.min(1, (g - 0.15) / 0.85), s2 = sp * sp * (3 - 2 * sp);
      const ph = PH1 + (ph0 - PH1) * s2, r = 1 + alt;
      py = r * Math.sin(ph); pz = r * Math.cos(ph); px = 0;
      const gx = 0, tl = 0.07 - Math.sqrt(2 * alt) * 0.9, gy = py + Math.cos(ph) + Math.sin(ph) * tl, gz = pz - Math.sin(ph) + Math.cos(ph) * tl;
      const lb = g < 0.3 ? 0 : Math.min(1, (g - 0.3) / 0.7), l2 = lb * lb * (3 - 2 * lb);
      lx = gx + (lx - gx) * l2; ly = gy + (ly - gy) * l2; lz = gz + (0 - gz) * l2;
    } else { px = 0; py = by; pz = bz; }
    const low = Math.min(1, alt * 12);
    const sh = (shake.a + burn.v * burn.v * 0.7 + Math.sin(t * 23.0) * burn.v * 0.15) * 0.035 * low;
    camera.position.set(px + state.mouseX.current * 0.12 * low + (Math.random() - 0.5) * sh, py + state.mouseY.current * 0.06 * low + (Math.random() - 0.5) * sh, pz);
    const nr = Math.min(0.05, Math.max(0.0008, alt * 0.2)); if (Math.abs(camera.near - nr) > 1e-5){ camera.near = nr; camera.updateProjectionMatrix(); }
    const skyAmt = 1 - Math.min(1, Math.max(0, (alt - 0.004) / 0.09));
    skyDome.position.copy(camera.position); skyDome.material.uniforms.uUp.value.copy(camera.position).normalize(); skyDome.material.uniforms.uAmt.value = skyAmt; skyDome.material.uniforms.uDip.value = Math.sin(Math.acos(1 / (1 + alt)));
    const cr = camera.position.length();
    clouds.material.uniforms.uCamR.value = cr; clouds.material.uniforms.uTime.value = t; clouds.material.uniforms.uAmt.value = 1 - Math.min(1, Math.max(0, (alt - 0.2) / 0.6));
    vigPass.uniforms.uMist.value = Math.max(0, 1 - Math.abs(cr - 1.02) / 0.004);
    vigPass.uniforms.uHaze.value = state.haze.current * (1 - skyAmt);
    vigPass.uniforms.uBurn.value = burn.v; vigPass.uniforms.uShock.value = shock.v; vigPass.uniforms.uAber.value = aber.v; vigPass.uniforms.uTime.value = t;
    { const pv = new THREE.Vector3(0, 0, 0).project(camera); pScreen.x = (pv.x + 1) / 2; pScreen.y = (pv.y + 1) / 2; vigPass.uniforms.uCenter.value.set(pScreen.x, pScreen.y); }
    const fv = 32 - fovP.v * 7; if (camera.fov !== fv){ camera.fov = fv; camera.updateProjectionMatrix(); }
    stars.material.uniforms.uA.value = state.starA.current * (1 - skyAmt * 0.55);
    { const k = Math.min(1, Math.max(0, (alt - 0.03) / 0.77)); atmoMat.uniforms.uIntensity.value = state.atmoI.current * k * k * (3 - 2 * k); }
    camera.lookAt(lx, ly, lz);
    rotY += dt * 0.02 * (1 - u); planet.rotation.y = rotY; fill.intensity = 0.35 * Math.pow(1 - u, 4); scene.environmentIntensity = Math.pow(1 - u, 6);
    if (planetMat.userData.sh) planetMat.userData.sh.uniforms.uNear.value = Math.max(0, 1 - alt / 0.05); atmo.rotation.copy(planet.rotation);
    stars.rotation.y = t * 0.004; stars.material.uniforms.uTime.value = t;
    const a = state.ringA.current + t * 0.12, rr = 1.62;
    sat.position.set(Math.cos(a) * rr, 0, Math.sin(a) * rr).applyEuler(ring.rotation);
    sat.visible = u < 0.12; ring.material.opacity = 0.16 * Math.max(0, 1 - u * 1.3);
    if (planetMat.userData.sh) planetMat.userData.sh.uniforms.uTime.value = t;
    if (grainPass) grainPass.uniforms.uTime.value = t;
    composer.render();
    rafId = requestAnimationFrame(tick);
  }
  renderer.compile(scene, camera);
  tick();
  window.__scene = { state, camera, burn, shock, aber, fovP, shake, gsap, clouds, composer, planetMat };
}

/* ── Lenis + ScrollTrigger ── */
let lenis = null;
if (!reduce){
  lenis = new Lenis({ duration: 1.15, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true, prevent: () => false });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000)); gsap.ticker.lagSmoothing(0);
}
document.querySelectorAll('a[href^="#"]').forEach(a => a.addEventListener('click', (e) => { const el = document.querySelector(a.getAttribute('href')); if (!el) return; e.preventDefault(); if (lenis) lenis.scrollTo(el, { offset: 0 }); else el.scrollIntoView(); }));

/* 相機隨捲動升軌 */
if (webgl){
  const prog = { p: 0 };
  function applyProg(p){
    state.camZ.target = (mobile ? 4.2 : 3.4) + p * 5.6;
    state.camY.target = 0.15 + p * 0.45;
    state.lookY.target = (mobile ? 1.4 : 1.05) * (1 - p);
    state.lookX.target = mobile ? 0 : -Math.min(1, p * 3) * 2.6 * (camera.aspect / 1.6);
    state.ringA.target = p * 2.2;
  }
  gsap.to(prog, { p: 1, ease: 'none', scrollTrigger: { trigger: '#manifest', endTrigger: '#talks', start: 'top bottom', end: 'bottom bottom', scrub: true, onUpdate: () => applyProg(prog.p) } });
  ScrollTrigger.create({ trigger: '#about', start: 'top bottom', end: 'bottom bottom', scrub: true, onUpdate: (self) => { state.camZ.target = 9 + self.progress * 1.5; state.camY.target = 0.6 - self.progress * 0.9; state.lookY.target = 0; state.lookX.target = mobile ? 0 : -2.6 * (1 - self.progress) * (camera.aspect / 1.6); } });
  if (reduce){ applyProg(0.5); state.haze.target = 0; state.starA.target = 1; state.ground.current = state.ground.target = 0; }
}

/* 升空：從地面一路爬到軌道視角 */
if (webgl && !reduce){
  ScrollTrigger.create({ trigger: '#top', start: 'top top', endTrigger: '#how', end: 'top 50%', scrub: true, onUpdate: (self) => { state.ground.target = 1 - self.progress; } });
}

/* 升空灼燒：從平流層頂到卡門線，霧轉橘白、流光加速、亂流加劇 */
if (webgl && !reduce){
  ScrollTrigger.create({ trigger: '#how', endTrigger: '#decisions', start: 'top 85%', end: 'top 50%', scrub: true, onUpdate: (self) => { if (!crossed) burn.v = Math.pow(self.progress, 1.6); } });
}

/* 卡門線穿越事件：到 100 km 那一刻 */
let crossed = false;
function crossing(up){
  if (up === crossed) return; crossed = up;
  const hud = document.querySelector('.hud');
  if (up){
    if (webgl){
      state.atmoI.current = 4.2; state.atmoI.target = 1.0;
      state.haze.current = 0; state.haze.target = 0;          /* 霧是被撕掉的，不是慢慢散的 */
      state.starA.current = 2.4; state.starA.target = 1;       /* 星星瞬間炸亮再落定 */
      state.camZ.current -= 0.35;                              /* 鏡頭往前衝一下再回位 */
    }
    if (!reduce){
      if (webgl){ const ki = document.querySelector('#kline i'); ki.style.left = (pScreen.x * 100) + '%'; ki.style.top = ((1 - pScreen.y) * 100) + '%'; }
      gsap.killTweensOf([burn, shock, aber, fovP, shake]);
      gsap.to(burn, { v: 0, duration: 0.25, ease: 'power4.out' });                        /* 熱流瞬間消失 */
      gsap.fromTo(shake, { a: 1.6 }, { a: 0, duration: 1.6, ease: 'power4.out' });        /* 最後一記重震，然後死寂 */
      gsap.fromTo(shock, { v: 0 }, { v: 1, duration: 1.4, ease: 'power2.out' });          /* 震波環推出去 */
      gsap.fromTo(aber, { v: 0.07 }, { v: 0, duration: 0.9, ease: 'power3.out' });       /* RGB 分離收回 */
      gsap.fromTo(fovP, { v: 1 }, { v: 0, duration: 0.7, ease: 'expo.out' });             /* 視角衝擊 */
      gsap.fromTo('#wash', { opacity: 1 }, { opacity: 0, duration: 0.55, ease: 'power3.out', overwrite: true });
      gsap.fromTo('#flash', { y: '-2vh', opacity: 1, scaleY: 1 }, { y: '102vh', opacity: 0.1, scaleY: 3, duration: 0.6, ease: 'power3.in', overwrite: true });
      const kl = gsap.timeline({ overwrite: true });
      kl.fromTo('#kline', { opacity: 0 }, { opacity: 1, duration: 0.12 }, 0.08)
        .fromTo('#kline b', { scale: 1.6, filter: 'blur(14px)' }, { scale: 1, filter: 'blur(0px)', duration: 0.55, ease: 'expo.out' }, 0.08)
        .fromTo('#kline span', { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out' }, 0.3)
        .fromTo('#kline i', { width: 1, height: 1, opacity: 0.9 }, { width: '160vmax', height: '160vmax', opacity: 0, duration: 1.3, ease: 'power2.out' }, 0.05)
        .to('#kline', { opacity: 0, duration: 0.45, ease: 'power2.in' }, 1.5);
    }
    hud.classList.add('cross');
  } else {
    if (webgl){ state.atmoI.target = 1.35; state.haze.target = 0.34; state.starA.target = 0.25; }
    if (!reduce){ gsap.killTweensOf([shock, aber, fovP]); shock.v = 0; aber.v = 0; fovP.v = 0; gsap.to('#kline', { opacity: 0, duration: 0.2, overwrite: true }); }
    hud.classList.remove('cross');
  }
}
ScrollTrigger.create({ trigger: '#decisions', start: 'top 50%', onEnter: () => crossing(true), onLeaveBack: () => crossing(false) });

/* 取捨：釘住橫向捲 */
if (!mobile && !reduce){
  const track = document.getElementById('track');
  const dist = () => track.scrollWidth - innerWidth;
  gsap.to(track, { x: () => -dist(), ease: 'none', scrollTrigger: { trigger: '#decisions', start: 'top top', end: () => '+=' + dist(), pin: true, scrub: 1, invalidateOnRefresh: true, anticipatePin: 1 } });
}

/* 照片輕微視差 */
if (!mobile && !reduce){
  document.querySelectorAll('.plates figure').forEach((f) => { const s = parseFloat(f.dataset.speed || 0); gsap.fromTo(f, { y: () => -s * 400 }, { y: () => s * 400, ease: 'none', scrollTrigger: { trigger: '.plates', start: 'top bottom', end: 'bottom top', scrub: true } }); });
}

/* 游標與磁吸 */
if (fine && !reduce){
  document.body.classList.add('has-cursor');
  const cur = document.getElementById('cursor'); const c = { x: innerWidth / 2, y: innerHeight / 2, tx: innerWidth / 2, ty: innerHeight / 2 };
  addEventListener('mousemove', (e) => { c.tx = e.clientX; c.ty = e.clientY; }, { passive: true });
  gsap.ticker.add(() => { c.x += (c.tx - c.x) * 0.18; c.y += (c.ty - c.y) * 0.18; cur.style.transform = `translate3d(${c.x}px,${c.y}px,0)`; });
  document.querySelectorAll('a, button, summary').forEach(el => { el.addEventListener('mouseenter', () => cur.classList.add('on')); el.addEventListener('mouseleave', () => cur.classList.remove('on')); });
  document.querySelectorAll('.magnet').forEach(b => { b.addEventListener('mousemove', (e) => { const r = b.getBoundingClientRect(); gsap.to(b, { x: (e.clientX - r.left - r.width / 2) * 0.22, y: (e.clientY - r.top - r.height / 2) * 0.22, duration: 0.5, ease: 'power3.out' }); }); b.addEventListener('mouseleave', () => gsap.to(b, { x: 0, y: 0, duration: 0.6, ease: 'power3.out' })); });
}

/* 開場收尾：由 Rust 端在躍遷動畫結束、場景載好之後呼叫 */
export function intro(){
  if (webgl && !reduce){ state.camZ.current = 5.2; state.camY.current = -0.4; state.lookY.current = 1.6; }
  ScrollTrigger.refresh();
}

/* 手機目錄開啟時鎖住平滑捲動 */
export function scrollLock(on){ if (lenis) on ? lenis.stop() : lenis.start(); }
