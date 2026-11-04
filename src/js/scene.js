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
/* 解析度上限 1.5：Retina 的 2x 要畫 4 倍像素，GPU 吃不消會整頁掉幀；實際值再由 tick 裡的自適應畫質往下調 */
const DPR = Math.min(devicePixelRatio, 1.5);
const DPR_MIN = 0.75;

/* ── WebGL 偵測 ── */
function hasWebGL(){ try { const c = document.createElement('canvas'); const gl = c.getContext('webgl2') || c.getContext('webgl'); return !!gl; } catch(e){ return false; } }
const webgl = hasWebGL();
if (!webgl) document.body.classList.add('no-webgl');

/* ── 場景 ── */
let composer, renderer, camera, scene, planet, atmo, ring, sat, stars, grainPass, planetMat, skyDome, clouds, galaxy, galaxyStars, running = true, rafId = 0;
let solar, solarBodies, solarOnOrbit, orbitLines, belt, earthDot, sunPos, sysCam, sysLook;
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
  zoom:   { current: 0, target: 0, ease: 0.05 },   /* 0 = 地球附近；1 = 拉遠到整個太陽系 */
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

  /* 雲層：高度 0.02。兩種尺度——
     大尺度：渦旋扭曲的天氣系統＋緯度雲帶，從軌道上看得出氣旋與雲帶；
     小尺度：只在鏡頭靠近地面時計算，從下往上看是一團團的雲。
     受光：白天側亮白、晨昏線偏暖、夜晚側是月光藍灰；從地面往上看則被城市燈從下方打亮。 */
  const sunDir = sun.position.clone().normalize();
  clouds = new THREE.Mesh(new THREE.SphereGeometry(1.02, mobile ? 192 : 320, mobile ? 96 : 160), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uCamR: { value: 1 }, uAmt: { value: 1 }, uSun: { value: sunDir } },
    vertexShader: `varying vec3 vPos; varying vec3 vN; varying vec3 vW;
      void main(){ vPos = position; vN = normalize(mat3(modelMatrix) * position); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `precision highp float; uniform float uTime; uniform float uCamR; uniform float uAmt; uniform vec3 uSun; varying vec3 vPos; varying vec3 vN; varying vec3 vW;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
      float n(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
      void main(){
        vec3 d = normalize(vPos);
        /* 大尺度天氣系統：用兩個雜訊扭曲座標，做出捲曲的氣旋 */
        vec3 q = d * 4.6 + vec3(uTime * 0.004, 0.0, 0.0);
        vec2 w = vec2(n(q * 1.3 + 11.0), n(q * 1.3 + 37.0)) - 0.5;
        q += vec3(w.x, w.y * 0.6, -w.x) * 0.9;
        float big = n(q) * 0.48 + n(q * 2.03) * 0.26 + n(q * 4.1) * 0.16 + n(q * 8.3) * 0.1;
        big += 0.1 * cos(d.y * 9.0);                                  /* 赤道與中緯度雲帶 */
        float f = big;
        /* 小尺度細節：鏡頭在雲層附近才算（uniform 分支，不浪費） */
        if (uCamR < 1.35){ vec3 p = vPos * 110.0 + vec3(uTime * 0.02, 0.0, 0.0); f = big * 0.62 + (n(p) * 0.6 + n(p * 2.3) * 0.4) * 0.38; }
        float a = smoothstep(0.46, 0.66, f);
        float core = smoothstep(0.55, 0.78, f);                        /* 厚的地方更亮、更不透明 */
        float below = step(uCamR, 1.02);
        vec3 N = normalize(vN);
        float ndl = dot(N, uSun);
        float day = smoothstep(-0.12, 0.3, ndl);
        vec3 dayCol = mix(vec3(0.7, 0.74, 0.8), vec3(1.0, 0.99, 0.97), core) * (0.45 + 0.55 * max(ndl, 0.0));
        vec3 nightCol = mix(vec3(0.2, 0.23, 0.29), vec3(0.34, 0.38, 0.45), core);    /* 背光側：比地表亮一階的灰白，才讀得出是雲 */
        vec3 dusk = vec3(1.0, 0.6, 0.38) * exp(-pow((ndl - 0.02) * 12.0, 2.0)) * 0.22;  /* 晨昏線只留一條細暖邊 */
        vec3 above = mix(nightCol, dayCol, day) + dusk;
        vec3 fromBelow = mix(vec3(0.12, 0.10, 0.10), vec3(0.22, 0.16, 0.13), core);
        vec3 col = mix(above, fromBelow, below);
        /* 斜看地球邊緣時，視線穿過的雲比較多，看起來更厚 */
        vec3 V = normalize(cameraPosition - vW);
        float limb = 1.0 - abs(dot(N, V));
        float alpha = a * (0.78 + 0.22 * core) * mix(1.0, 1.3, limb * (1.0 - below)) * mix(0.95, 0.8, below);
        alpha *= smoothstep(0.0015, 0.008, abs(uCamR - 1.02));         /* 穿過時改由後製霧接手，不會整片跳出來 */
        gl_FragColor = vec4(col, min(alpha, 0.97) * uAmt);
      }` }));
  scene.add(clouds);

  /* 銀河與遠方星系：用 GPU 把全天空烘焙成一張等距長方貼圖（只算一次），之後每幀只讀貼圖。
     烘焙在開場結束後分 48 條、每幀一條做完（約 0.8 秒），不會卡住開場；靠近地面時本來就看不到銀河。
     銀河核心放在最後一章「對接」鏡頭仰望的方向。 */
  const gC = new THREE.Vector3(-0.38, 0.46, -0.8).normalize();             /* 銀河核心 */
  const gN = new THREE.Vector3().crossVectors(gC, new THREE.Vector3(1, 0.62, 0.1).normalize()).normalize();  /* 銀河盤面的法線 */
  const gT = new THREE.Vector3().crossVectors(gN, gC).normalize();
  const andro = new THREE.Vector3(0.52, 0.58, -0.63).normalize();           /* 仙女座星系 */
  const SKY_W = mobile ? 2048 : 3072, SKY_ROWS = 48;
  const skyRT = new THREE.WebGLRenderTarget(SKY_W, SKY_W / 2, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
  const bakeJob = (() => {
    const bake = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ depthTest: false, depthWrite: false,
      uniforms: { uC: { value: gC }, uN: { value: gN }, uT: { value: gT }, uA: { value: andro } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `precision highp float; uniform vec3 uC; uniform vec3 uN; uniform vec3 uT; uniform vec3 uA; varying vec2 vUv;
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
        float n(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
        float fbm(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++){ s += n(p) * a; p = p * 2.03 + 17.0; a *= 0.5; } return s; }
        void main(){
          /* 與 SphereGeometry 的 uv 對應：u → phi、v → theta */
          float phi = vUv.x * 6.2831853, th = (1.0 - vUv.y) * 3.1415927;
          vec3 d = vec3(-cos(phi) * sin(th), cos(th), sin(phi) * sin(th));
          float lat = asin(clamp(dot(d, uN), -1.0, 1.0));
          float lon = atan(dot(d, uT), dot(d, uC));
          float width = 0.04 + 0.06 * exp(-lon * lon / 0.2);                   /* 越接近核心越寬 */
          float clump = fbm(d * 7.0);
          float band = exp(-pow(lat / width, 2.0)) * (0.2 + 1.1 * clump * clump);
          float bulge = exp(-(lat * lat * 110.0 + lon * lon * 22.0));          /* 核心隆起：亮但集中 */
          float dust = smoothstep(0.42, 0.68, fbm(d * 13.0 + vec3(3.1))) * exp(-pow(lat / (width * 0.45), 2.0));  /* 暗色塵埃帶 */
          vec3 col = vec3(0.42, 0.5, 0.72) * band * 0.2 + vec3(1.0, 0.8, 0.56) * bulge * 0.55;
          col *= 1.0 - dust * 0.9;
          /* 星雲：銀河帶上的發射星雲（紅紫）與反射星雲（青藍） */
          float neb1 = exp(-(pow(lon - 0.55, 2.0) * 60.0 + pow(lat + 0.03, 2.0) * 300.0)) * fbm(d * 22.0);
          float neb2 = exp(-(pow(lon + 0.9, 2.0) * 40.0 + pow(lat - 0.06, 2.0) * 250.0)) * fbm(d * 18.0 + 5.0);
          col += vec3(0.9, 0.25, 0.42) * neb1 * 0.42 + vec3(0.2, 0.55, 0.85) * neb2 * 0.3;
          /* 仙女座星系：傾斜的橢圓盤＋亮核 */
          vec3 ax = normalize(cross(uA, vec3(0.3, 1.0, 0.2))); vec3 ay = cross(uA, ax);
          vec2 g = vec2(dot(d - uA, ax), dot(d - uA, ay)); float ca = cos(0.6), sa = sin(0.6);
          g = vec2(ca * g.x - sa * g.y, sa * g.x + ca * g.y);
          float gal = exp(-(g.x * g.x * 900.0 + g.y * g.y * 9000.0)) * step(0.0, dot(d, uA));
          col += vec3(0.85, 0.82, 1.0) * gal * 0.25 + vec3(1.0, 0.9, 0.75) * exp(-dot(g, g) * 40000.0) * step(0.0, dot(d, uA)) * 0.4;
          /* 宇宙背景的極淡雲氣 */
          col += vec3(0.05, 0.06, 0.1) * smoothstep(0.5, 0.8, fbm(d * 3.0 + 9.0)) * 0.2;
          gl_FragColor = vec4(col, 1.0);
        }` }));
    const bs = new THREE.Scene(); bs.add(bake);
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), rowH = Math.ceil(SKY_W / 2 / SKY_ROWS);
    let row = 0;
    return { done: () => row >= SKY_ROWS, step(){
      if (row >= SKY_ROWS) return;
      skyRT.scissor.set(0, row * rowH, SKY_W, rowH); skyRT.scissorTest = true;   /* render target 用自己的 scissor */
      renderer.setRenderTarget(skyRT); renderer.render(bs, cam); renderer.setRenderTarget(null);
      skyRT.scissorTest = false;
      if (++row >= SKY_ROWS){ bake.geometry.dispose(); bake.material.dispose(); }
    } };
  })();
  galaxy = new THREE.Mesh(new THREE.SphereGeometry(95, 64, 32), new THREE.ShaderMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide,
    uniforms: { uMap: { value: skyRT.texture }, uAmt: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `precision mediump float; uniform sampler2D uMap; uniform float uAmt; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(uMap, vUv).rgb * uAmt, 1.0); }` }));
  galaxy.renderOrder = -2; scene.add(galaxy);

  /* 銀河帶上的星：沿盤面高斯分布，越近核心越密 */
  {
    const GN = mobile ? 5000 : 11000, gp = new Float32Array(GN * 3), gs = new Float32Array(GN), gcol = new Float32Array(GN * 3);
    const v = new THREE.Vector3();
    const gauss = () => { let u = 0, w = 0; while (u === 0) u = Math.random(); while (w === 0) w = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * w); };
    for (let i = 0; i < GN; i++){
      const lon = gauss() * (Math.random() < 0.55 ? 0.7 : 2.2), lat = gauss() * (0.05 + 0.1 * Math.exp(-lon * lon / 0.5));
      v.copy(gC).multiplyScalar(Math.cos(lon) * Math.cos(lat)).addScaledVector(gT, Math.sin(lon) * Math.cos(lat)).addScaledVector(gN, Math.sin(lat)).multiplyScalar(85);
      gp[i*3] = v.x; gp[i*3+1] = v.y; gp[i*3+2] = v.z; gs[i] = 0.35 + Math.random() * Math.random() * 1.4;
      const warm = Math.random() < 0.35 + 0.4 * Math.exp(-lon * lon); gcol[i*3] = warm ? 1.0 : 0.75; gcol[i*3+1] = warm ? 0.88 : 0.85; gcol[i*3+2] = warm ? 0.72 : 1.0;
    }
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(gp, 3)); gg.setAttribute('size', new THREE.BufferAttribute(gs, 1)); gg.setAttribute('color', new THREE.BufferAttribute(gcol, 3));
    galaxyStars = new THREE.Points(gg, new THREE.ShaderMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      uniforms: { uPR: { value: DPR }, uA: { value: 0 }, uTime: { value: 0 } },
      vertexShader: `attribute float size; attribute vec3 color; uniform float uPR; uniform float uA; uniform float uTime; varying float vA; varying vec3 vC;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = size * uPR * 1.6; vC = color;
          vA = uA * (0.55 + 0.45 * sin(uTime * 0.8 + position.x * 1.7 + position.z)); }`,
      fragmentShader: `precision mediump float; varying float vA; varying vec3 vC; void main(){ float d = length(gl_PointCoord - 0.5); float c = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vC * c * vA, c * vA); }` }));
    galaxyStars.renderOrder = -1; scene.add(galaxyStars);
  }

  /* 太陽系：最後一章鏡頭拉遠時才出現。比例刻意誇大（真實比例下行星小到看不見）。
     太陽放在原本平行光的方向，地球（原點）在第三條軌道上；鏡頭最後停在太陽系斜下方，
     視線穿過太陽正對銀河核心，所以銀河在太陽系正後方。 */
  const SUN_D = 55;
  sunPos = sunDir.clone().multiplyScalar(SUN_D);
  const ecl = new THREE.Vector3(0, 1, 0).addScaledVector(sunDir, -sunDir.y).normalize();   /* 黃道面法線 */
  const e1 = sunDir.clone().negate(), e2 = new THREE.Vector3().crossVectors(ecl, e1).normalize();
  const onOrbit = (r, ang, out) => out.copy(sunPos).addScaledVector(e1, Math.cos(ang) * r).addScaledVector(e2, Math.sin(ang) * r);
  /* 視線稍微偏開銀河核心，讓核心落在畫面一側、太陽在中間 */
  sysCam = sunPos.clone().addScaledVector(gC.clone().addScaledVector(e2, 0.55).addScaledVector(ecl, -0.15).normalize(), -720);
  sysLook = sunPos.clone();
  solar = new THREE.Group(); solar.visible = false; scene.add(solar);
  const NOISE = `float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
      float n(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }`;
  /* 太陽：會翻騰的表面＋邊緣變暗，HDR 亮度交給 bloom 做出光暈 */
  const sunMat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normalMatrix * normal); vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `precision highp float; uniform float uTime; varying vec3 vN; varying vec3 vP; ${NOISE}
      void main(){ float g = n(vP * 1.4 + uTime * 0.12) * 0.6 + n(vP * 3.6 - uTime * 0.18) * 0.4; float limb = pow(max(normalize(vN).z, 0.0), 0.45);
        gl_FragColor = vec4(mix(vec3(2.6, 1.0, 0.28), vec3(4.2, 2.9, 1.4), g) * (0.5 + 0.5 * limb), 1.0); }` });
  solar.add(new THREE.Mesh(new THREE.SphereGeometry(7, 48, 32), sunMat).translateX(sunPos.x).translateY(sunPos.y).translateZ(sunPos.z));
  {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128); gr.addColorStop(0, 'rgba(255,220,170,1)'); gr.addColorStop(0.15, 'rgba(255,170,90,0.55)'); gr.addColorStop(0.45, 'rgba(255,120,60,0.12)'); gr.addColorStop(1, 'rgba(255,100,40,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    glow.scale.setScalar(110); glow.position.copy(sunPos); solar.add(glow);
  }
  /* 行星：受太陽方向照亮；木星、土星有雲帶 */
  const planetShader = (c1, c2, band) => new THREE.ShaderMaterial({ uniforms: { uSun: { value: sunPos }, uC1: { value: new THREE.Color(...c1) }, uC2: { value: new THREE.Color(...c2) }, uBand: { value: band } },
    vertexShader: `varying vec3 vN; varying vec3 vW; varying vec3 vP; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vP = position; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `precision highp float; uniform vec3 uSun; uniform vec3 uC1; uniform vec3 uC2; uniform float uBand; varying vec3 vN; varying vec3 vW; varying vec3 vP;
      void main(){ float d = max(dot(normalize(vN), normalize(uSun - vW)), 0.0); float y = normalize(vP).y;
        vec3 base = mix(uC1, mix(uC1, uC2, 0.5 + 0.5 * sin(y * 26.0 + sin(y * 7.0) * 1.6)), uBand);
        gl_FragColor = vec4(base * (0.05 + 1.25 * d), 1.0); }` });
  const PLANETS = [ /* 軌道半徑, 大小, 顏色, 雲帶顏色, 雲帶, 起始角度 */
    [22, 1.0, [0.62, 0.6, 0.57], [0, 0, 0], 0, 1.2],      /* 水星 */
    [37, 1.6, [0.95, 0.83, 0.58], [0, 0, 0], 0, 2.7],     /* 金星 */
    [78, 1.2, [0.86, 0.4, 0.24], [0, 0, 0], 0, 0.55],     /* 火星 */
    [128, 6.5, [0.86, 0.74, 0.58], [0.6, 0.43, 0.3], 1, 3.7],   /* 木星 */
    [178, 5.4, [0.93, 0.85, 0.62], [0.74, 0.64, 0.44], 1, 5.1], /* 土星 */
    [226, 3.2, [0.62, 0.86, 0.9], [0, 0, 0], 0, 2.1],     /* 天王星 */
    [270, 3.0, [0.32, 0.47, 0.96], [0, 0, 0], 0, 4.4],    /* 海王星 */
  ];
  solarBodies = PLANETS.map(([r, size, c1, c2, band, a0]) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(size, 32, 24), planetShader(c1, c2, band)); solar.add(m);
    if (r === 178){ const ringM = new THREE.Mesh(new THREE.RingGeometry(size * 1.35, size * 2.3, 96), new THREE.MeshBasicMaterial({ color: 0xd9c49a, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
      ringM.lookAt(ecl); ringM.rotateX(0.45); m.add(ringM); }
    return { m, r, a0, w: 0.05 * Math.pow(SUN_D / r, 1.5) };
  });
  solarOnOrbit = onOrbit;
  /* 公轉軌道：地球那條亮一點 */
  orbitLines = [22, 37, SUN_D, 78, 128, 178, 226, 270].map((r) => {
    const pts = []; const v = new THREE.Vector3(); for (let i = 0; i <= 256; i++){ onOrbit(r, (i / 256) * Math.PI * 2, v); pts.push(v.clone()); }
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: r === SUN_D ? 0x7fc4ff : 0x9fb4cc, transparent: true, opacity: 0, depthWrite: false }));
    l.userData.max = r === SUN_D ? 0.85 : 0.38; solar.add(l); return l;
  });
  /* 小行星帶 */
  {
    const N = mobile ? 1500 : 3500, pos = new Float32Array(N * 3), v = new THREE.Vector3();
    for (let i = 0; i < N; i++){ onOrbit(96 + Math.random() * 18, Math.random() * Math.PI * 2, v); v.addScaledVector(ecl, (Math.random() - 0.5) * 3); pos.set([v.x, v.y, v.z], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    belt = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xb8ab98, size: 1.8, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false })); solar.add(belt);
  }
  /* 「你在這裡」：拉遠後地球只剩一個亮藍點 */
  {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(220,240,255,1)'); gr.addColorStop(0.3, 'rgba(127,196,255,0.9)'); gr.addColorStop(1, 'rgba(127,196,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    earthDot = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), sizeAttenuation: false, depthTest: false, depthWrite: false, transparent: true, opacity: 0 }));
    earthDot.scale.setScalar(0.022); scene.add(earthDot);
  }

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

  /* 自適應畫質：以「每秒慢幀比例」判斷，單一偶發長幀（例如捲動觸發重算）不會誤降。
     - 一秒內超過 20% 的幀慢於 24 ms（約 40 fps）→ 降 0.25 倍解析度
     - 從 1.25 倍起跑；連續 5 秒慢幀都低於 5% → 試著升 0.25（最高 1.5）；升級後 3 秒內又被降回來，就把該等級當作這次瀏覽的上限
     文字是 DOM，不受影響，只有背景的 3D 變柔一點。 */
  let curDPR = Math.min(DPR, 1.25), ceil = DPR, winStart = 0, frames = 0, slow = 0, goodSecs = 0, lastUp = -99;
  function setDPR(d){
    curDPR = d;
    renderer.setPixelRatio(d); composer.setPixelRatio(d);
    renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
    stars.material.uniforms.uPR.value = d; galaxyStars.material.uniforms.uPR.value = d;
  }
  function adapt(rawMs, t){
    if (t < 2.5) { winStart = t; return; }   /* 剛開場還在編譯 shader，不算 */
    frames++; if (rawMs > 24) slow++;
    if (t - winStart < 1) return;
    const ratio = slow / frames; frames = 0; slow = 0; winStart = t;
    if (ratio > 0.2 && curDPR > DPR_MIN){
      if (t - lastUp < 3) ceil = curDPR - 0.25;  /* 剛升上來就撐不住：這一級不再嘗試 */
      setDPR(Math.max(DPR_MIN, curDPR - 0.25)); goodSecs = 0;
    } else if (ratio < 0.05){
      if (++goodSecs >= 5 && curDPR < ceil){ setDPR(Math.min(ceil, curDPR + 0.25)); lastUp = t; goodSecs = 0; }
    } else goodSecs = 0;
  }

  function tick(){
    if (!running) return;
    const raw = clock.getDelta(), dt = Math.min(raw, 0.1), t = clock.elapsedTime;
    adapt(raw * 1000, t);
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
    /* 拉遠到太陽系：位置先慢後快，視線從地球逐漸轉向太陽 */
    const zt = state.zoom.current, ze = zt * zt * (3 - 2 * zt), zp = Math.pow(ze, 1.7);
    if (ze > 0.0005){
      px += (sysCam.x - px) * zp; py += (sysCam.y - py) * zp; pz += (sysCam.z - pz) * zp;
      lx += (sysLook.x - lx) * zp; ly += (sysLook.y - ly) * zp; lz += (sysLook.z - lz) * zp;
    }
    const low = Math.min(1, alt * 12) * (1 - ze);
    const sh = (shake.a + burn.v * burn.v * 0.7 + Math.sin(t * 23.0) * burn.v * 0.15) * 0.035 * low;
    camera.position.set(px + state.mouseX.current * 0.12 * low + (Math.random() - 0.5) * sh, py + state.mouseY.current * 0.06 * low + (Math.random() - 0.5) * sh, pz);
    const nr = Math.min(0.05, Math.max(0.0008, alt * 0.2)) + zp * 2, fr = 200 + zp * 2800;
    if (Math.abs(camera.near - nr) > 1e-5 || Math.abs(camera.far - fr) > 0.5){ camera.near = nr; camera.far = fr; camera.updateProjectionMatrix(); }
    const skyAmt = 1 - Math.min(1, Math.max(0, (alt - 0.004) / 0.09));
    skyDome.position.copy(camera.position); skyDome.material.uniforms.uUp.value.copy(camera.position).normalize(); skyDome.material.uniforms.uAmt.value = skyAmt; skyDome.material.uniforms.uDip.value = Math.sin(Math.acos(1 / (1 + alt)));
    const cr = camera.position.length();
    clouds.material.uniforms.uCamR.value = cr; clouds.material.uniforms.uTime.value = t; clouds.material.uniforms.uAmt.value = 1;  /* 在太空中也看得到雲 */
    clouds.rotation.y = rotY * 1.15;   /* 雲比地表轉得快一點，看得出在流動 */
    { /* 銀河：鏡頭離地球越遠越明顯；地面的天空還亮時不顯示 */
      const k = Math.min(1, Math.max(0, (cr - 3.4) / 5.6)), milky = k * k * (3 - 2 * k) * (1 - skyAmt);
      if (t > 2.5 && !bakeJob.done()) bakeJob.step();             /* 開場後才分批烘焙銀河貼圖 */
      galaxy.position.copy(camera.position); galaxy.material.uniforms.uAmt.value = milky * (1 + 0.2 * ze); galaxy.visible = skyAmt < 0.98 && bakeJob.done();
      galaxyStars.position.copy(camera.position); galaxyStars.material.uniforms.uA.value = milky * (1 + 0.3 * ze); galaxyStars.material.uniforms.uTime.value = t; galaxyStars.visible = galaxy.visible;
    }
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
    stars.rotation.y = t * 0.004; stars.material.uniforms.uTime.value = t; stars.position.copy(camera.position);   /* 星空跟著鏡頭，拉遠時不會變成一團 */
    solar.visible = ze > 0.002;
    if (solar.visible){
      sunMat.uniforms.uTime.value = t;
      for (const b of solarBodies) solarOnOrbit(b.r, b.a0 + t * b.w, b.m.position);
      for (const l of orbitLines) l.material.opacity = l.userData.max * ze;
      belt.material.opacity = 0.8 * ze;
    }
    earthDot.material.opacity = Math.max(0, (ze - 0.35) / 0.65); earthDot.visible = earthDot.material.opacity > 0.01;
    const a = state.ringA.current + t * 0.12, rr = 1.62;
    sat.position.set(Math.cos(a) * rr, 0, Math.sin(a) * rr).applyEuler(ring.rotation);
    sat.visible = u < 0.12; ring.material.opacity = 0.16 * Math.max(0, 1 - u * 1.3);
    if (planetMat.userData.sh) planetMat.userData.sh.uniforms.uTime.value = t;
    if (grainPass) grainPass.uniforms.uTime.value = t;
    composer.render();
    rafId = requestAnimationFrame(tick);
  }
  setDPR(curDPR);
  renderer.compile(scene, camera);
  tick();
  window.__quality = () => ({ dpr: curDPR, ceil });
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
  /* 對接章到頁尾：鏡頭一路拉遠，看見整個太陽系與後方的銀河 */
  ScrollTrigger.create({ trigger: '#dock', start: 'top 55%', endTrigger: 'footer', end: 'bottom bottom', scrub: true, onUpdate: (self) => { state.zoom.target = self.progress; } });
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
  /* 小點在 pointermove 當下就定位，不等下一幀，畫面再忙也跟手；外圈用與幀率無關的緩動追上。
     用 CSS 的 translate 屬性移動，不佔 transform，外圈 hover 放大的 scale 不受影響。 */
  const cur = document.getElementById('cursor'), dot = cur.querySelector('.dot'), ringEl = cur.querySelector('.ring');
  const c = { x: innerWidth / 2, y: innerHeight / 2, tx: innerWidth / 2, ty: innerHeight / 2 };
  addEventListener('pointermove', (e) => { c.tx = e.clientX; c.ty = e.clientY; dot.style.translate = `${c.tx}px ${c.ty}px`; }, { passive: true });
  gsap.ticker.add((time, deltaMs) => { const f = 1 - Math.pow(1 - 0.25, Math.min(deltaMs, 100) / 16.7); c.x += (c.tx - c.x) * f; c.y += (c.ty - c.y) * f; ringEl.style.translate = `${c.x}px ${c.y}px`; });
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
