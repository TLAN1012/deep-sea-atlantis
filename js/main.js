import * as THREE from './three.module.min.js';
import MANIFEST from '../assets/manifest.js';
import { U, spriteMaterial } from './shaders.js';
import { buildWorld, loadTex, groundHeight, floorHeight, zoneName, ATLANTIS, BOUNDS, PLAZA_Y } from './world.js';
import { Creatures, SPECIES } from './creatures.js';
import { Player } from './player.js';
import { Sound } from './sound.js';

THREE.ColorManagement.enabled = false;
const $ = id => document.getElementById(id);
const desktop = matchMedia('(pointer: fine)').matches && !('ontouchstart' in window && navigator.maxTouchPoints > 0 && !matchMedia('(hover: hover)').matches);
if (desktop) document.body.classList.add('desktop');

// ---------- save ----------
const SAVE_KEY = 'deep-sea-atlantis-v1';
let save = { found: [], relics: [] };
try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && Array.isArray(s.found)) save = { found: s.found, relics: s.relics || [] }; } catch { }
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { } };

// ---------- renderer ----------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setPixelRatio(Math.min(devicePixelRatio, desktop ? 1.75 : 1.5));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = camera.aspect < 0.8 ? 80 : 62;     // portrait phones: widen the view so the sub doesn't fill the screen
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

// lights for the toon-shaded player models
const hemi = new THREE.HemisphereLight(0xcff6ff, 0x1d4e6b, 1.2);
const sunL = new THREE.DirectionalLight(0xffffff, 1.2);
sunL.position.set(0.3, 1, 0.2);
const selfL = new THREE.PointLight(0xfff1c7, 0, 14, 1.5);
scene.add(hemi, sunL, selfL);
scene.fog = new THREE.FogExp2(0x2a8fb0, 0.01);

$('title').style.backgroundImage = `url(${MANIFEST.title_art.file})`;
$('codext').textContent = SPECIES.length;

// ---------- load ----------
const T = {};
let world, creatures, player, relics, sound;
async function load() {
  const names = Object.keys(MANIFEST);
  let done = 0;
  await Promise.all(names.map(async n => {
    T[n] = await loadTex(MANIFEST[n].file, n.startsWith('tex_'));
    $('start').textContent = `載入中… ${Math.round(++done / names.length * 100)}%`;
  }));
  world = await buildWorld(scene, T, MANIFEST);
  creatures = new Creatures(scene, T, MANIFEST);
  player = new Player(scene);
  relics = buildRelics();
  buildProps();
  buildMap();
  if (save.relics.length >= 5) awaken(true);
  updateCounters();
  $('start').disabled = false;
  $('start').textContent = save.found.length || save.relics.length ? '繼續探險' : '開始探險';
  $('reset').hidden = !(save.found.length || save.relics.length);
  if (save.found.length || save.relics.length) {
    $('progress').hidden = false;
    $('progress').textContent = `目前成績：🐠 生物 ${save.found.length}/${SPECIES.length} 種　🔷 石板 ${save.relics.length}/5 塊`;
  }
  renderer.compile(scene, camera);
}

// ---------- relics (5 Atlantis tablet pieces) ----------
function buildRelics() {
  const spots = [[62, -42], [-214, -78], [112, 206], [258, 386], null];
  const pos = spots.map(s => s ? new THREE.Vector3(s[0], groundHeight(s[0], s[1]) + 2.2, s[1])
    : new THREE.Vector3(ATLANTIS.x, PLAZA_Y + 6 + 2 + 1.3, ATLANTIS.z + 20));
  const info = MANIFEST.relic;
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array([0, .2, .4, .6, .8]), 1));
  const mesh = new THREE.InstancedMesh(geo, spriteMaterial(T.relic, { mode: 1, wiggle: 0.03, selfLit: 0.85, glow: [0.8, 0, 0] }), 5);
  mesh.frustumCulled = false;
  scene.add(mesh);
  const halo = haloTexture();
  const glows = pos.map(p => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo, color: 0x6ee7d8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    s.scale.setScalar(7); s.position.copy(p); scene.add(s); return s;
  });
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uTime: U.uTime },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform float uTime; void main(){ float a = (1.0 - vUv.y) * 0.18 * (0.7 + 0.3 * sin(uTime * 2.0 + vUv.y * 10.0));
      gl_FragColor = vec4(vec3(0.43, 0.9, 0.85) * a, 1.0); }`,
  });
  const beams = pos.map(p => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 60, 12, 1, true), beamMat);
    b.position.copy(p).add(new THREE.Vector3(0, 30, 0)); scene.add(b); return b;
  });
  const m4 = new THREE.Matrix4();
  const r = {
    pos, mesh, glows, beams,
    refresh() {
      pos.forEach((p, i) => {
        const got = save.relics.includes(i);
        mesh.setMatrixAt(i, got ? m4.makeScale(0, 0, 0) : m4.makeScale(1.8, 1.8, 1).setPosition(p));
        glows[i].visible = beams[i].visible = !got;
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
  r.refresh();
  return r;
}

function haloTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// statues and treasure chests
function buildProps() {
  const place = (name, spots, size) => {
    const info = MANIFEST[name], a = info.w / info.h;
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array(spots.length), 1));
    const mesh = new THREE.InstancedMesh(geo, spriteMaterial(T[name], { mode: 1, wiggle: 0, selfLit: name === 'statue' ? 0.25 : 0 }), spots.length);
    const m4 = new THREE.Matrix4();
    spots.forEach(([x, z, y], i) => {
      const sy = a >= 1 ? size / a : size, sx = a >= 1 ? size : size * a;
      mesh.setMatrixAt(i, m4.makeScale(sx, sy, 1).setPosition(x, (y ?? groundHeight(x, z)) + sy / 2 - 0.1, z));
    });
    mesh.frustumCulled = false;
    scene.add(mesh);
  };
  const A = ATLANTIS;
  place('statue', [[A.x - 22, A.z - 30], [A.x + 22, A.z - 30], [A.x - 40, A.z + 30], [A.x + 40, A.z + 30]], 9);
  place('chest', [[-30, 38], [-230, -20], [140, 260], [A.x + 50, A.z - 5]], 2.2);
}

// ---------- minimap ----------
let mapBase;
function buildMap() {
  const c = document.createElement('canvas'); c.width = 380; c.height = 405;
  const g = c.getContext('2d'), img = g.createImageData(380, 405);
  for (let j = 0; j < 405; j++) for (let i = 0; i < 380; i++) {
    const x = BOUNDS.x0 + (i / 380) * (BOUNDS.x1 - BOUNDS.x0), z = BOUNDS.z0 + (j / 405) * (BOUNDS.z1 - BOUNDS.z0);
    const h = groundHeight(x, z), t = Math.min(1, -h / 300);
    const k = (j * 380 + i) * 4;
    const shade = 0.85 + 0.15 * Math.sin(h * 0.6);
    img.data[k] = (120 * (1 - t) ** 3 + 5) * shade;
    img.data[k + 1] = (220 * (1 - t) ** 1.6 + 15) * shade;
    img.data[k + 2] = (230 * (1 - t) ** 0.9 + 35) * shade;
    img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const A = ATLANTIS;
  g.strokeStyle = 'rgba(255,230,150,.9)'; g.lineWidth = 2; g.setLineDash([4, 3]);
  const mp = (x, z) => [(x - BOUNDS.x0) / (BOUNDS.x1 - BOUNDS.x0) * 380, (z - BOUNDS.z0) / (BOUNDS.z1 - BOUNDS.z0) * 405];
  g.beginPath(); g.arc(...mp(A.x, A.z), 36, 0, 7); g.stroke();
  g.font = 'bold 13px sans-serif'; g.fillStyle = '#fff'; g.textAlign = 'center'; g.shadowColor = '#000'; g.shadowBlur = 3;
  const label = (t, x, z) => g.fillText(t, ...mp(x, z));
  label('珊瑚礁', 0, -10); label('巨藻森林', -200, -90); label('暮光層', 90, 170); label('亞特蘭提斯', A.x, A.z - 50); label('深淵海溝', 255, 200);
  mapBase = { c, mp };
}
// heading-up round minimap in the HUD corner
function drawMini() {
  const c = $('mini'), g = c.getContext('2d'), R = c.width / 2, k = 2.4;   // k: minimap px per full-map px
  const [px, pz] = mapBase.mp(player.pos.x, player.pos.z);
  g.save();
  g.clearRect(0, 0, c.width, c.height);
  g.beginPath(); g.arc(R, R, R, 0, 7); g.clip();
  g.fillStyle = '#021628'; g.fillRect(0, 0, c.width, c.height);
  g.translate(R, R); g.rotate(player.camYaw);
  g.drawImage(mapBase.c, -px * k, -pz * k, mapBase.c.width * k, mapBase.c.height * k);
  const mark = (x, z, col, r, clampEdge) => {
    const [a, b] = mapBase.mp(x, z);
    let dx = (a - px) * k, dy = (b - pz) * k;
    const d = Math.hypot(dx, dy), lim = R - r - 3;
    if (d > lim) { if (!clampEdge) return; dx *= lim / d; dy *= lim / d; }
    g.beginPath(); g.arc(dx, dy, r, 0, 7); g.fillStyle = col; g.fill(); g.lineWidth = 3; g.strokeStyle = '#0d2238'; g.stroke();
  };
  relics.pos.forEach((p, i) => { if (!save.relics.includes(i)) mark(p.x, p.z, '#6ee7d8', 9, true); });
  if (!player.inSub) mark(player.subPos.x, player.subPos.z, '#ff8c42', 9, true);
  g.fillStyle = '#fff'; g.font = 'bold 26px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('N', 0, -R + 22);
  g.restore();
  // the player: always centred, pointing up
  g.beginPath(); g.moveTo(R, R - 18); g.lineTo(R + 13, R + 14); g.lineTo(R, R + 7); g.lineTo(R - 13, R + 14); g.closePath();
  g.fillStyle = '#ffc93c'; g.fill(); g.lineWidth = 4; g.strokeStyle = '#0d2238'; g.stroke();
}

function drawMap() {
  const mc = $('mapc'), g = mc.getContext('2d');
  g.drawImage(mapBase.c, 0, 0);
  const dot = (x, z, col, r) => { const [a, b] = mapBase.mp(x, z); g.beginPath(); g.arc(a, b, r, 0, 7); g.fillStyle = col; g.fill(); g.lineWidth = 2; g.strokeStyle = '#0d2238'; g.stroke(); };
  relics.pos.forEach((p, i) => { if (!save.relics.includes(i)) dot(p.x, p.z, '#6ee7d8', 6); });
  if (!player.inSub) dot(player.subPos.x, player.subPos.z, '#ff8c42', 6);
  const [px, pz] = mapBase.mp(player.pos.x, player.pos.z);
  g.save(); g.translate(px, pz); g.rotate(-player.camYaw + Math.PI);
  g.beginPath(); g.moveTo(0, 10); g.lineTo(7, -7); g.lineTo(0, -3); g.lineTo(-7, -7); g.closePath();
  g.fillStyle = '#ffc93c'; g.fill(); g.strokeStyle = '#0d2238'; g.lineWidth = 2; g.stroke(); g.restore();
}

// ---------- UI helpers ----------
let toastTimer;
function toast(msg, ms = 2200) {
  const t = $('toast'); t.innerHTML = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}
function updateCounters() {
  $('codexn').textContent = save.found.length;
  $('relicn').textContent = save.relics.length;
}
const ZONES = [
  ['珊瑚礁', ['reef']], ['開闊海域與巨藻森林', ['open', 'kelp', 'surface']], ['暮光層（水深 70 公尺以下）', ['twilight']],
  ['深淵海溝', ['abyss', 'vents']], ['亞特蘭提斯', ['atlantis']],
];
const isDeep = sp => ['twilight', 'abyss', 'vents', 'atlantis'].includes(sp.zone);
const zoneLabel = sp => ZONES.find(z => z[1].includes(sp.zone))[0];
function openPanel(id) { paused = true; $(id).hidden = false; }
function closePanels() { for (const o of document.querySelectorAll('.overlay')) o.hidden = true; $('moviev').pause(); paused = false; }
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', e => {
  const ov = b.closest('.overlay'); ov.hidden = true;
  if (ov.id === 'detailov') return;          // back to the grid
  closePanels();
}));

function openCodex() {
  const grid = $('grid'); grid.innerHTML = '';
  $('codexsum').textContent = `${save.found.length} / ${SPECIES.length}`;
  $('replay').hidden = save.relics.length < 5;
  for (const [label, zs] of ZONES) {
    const h = document.createElement('div'); h.className = 'zoneh'; h.textContent = label; grid.append(h);
    for (const sp of SPECIES.filter(s => zs.includes(s.zone))) {
      const known = save.found.includes(sp.id);
      const c = document.createElement('button');
      c.className = 'card' + (known ? '' : ' unknown') + (isDeep(sp) ? ' deep' : '');
      c.innerHTML = `<img src="${MANIFEST[sp.id].file}" alt=""><b>${known ? sp.name : '？？？'}</b>`;
      if (known) c.addEventListener('click', () => showDetail(sp));
      grid.append(c);
    }
  }
  openPanel('codex');
}
function showDetail(sp) {
  $('dzone').textContent = zoneLabel(sp);
  $('detail').innerHTML = `<div class="art ${isDeep(sp) ? 'deep' : ''}"><img src="${MANIFEST[sp.id].file}" alt=""></div>
    <div class="txt"><h3>${sp.name}</h3><span class="tag">${zoneLabel(sp)}</span><p>${sp.desc}</p></div>`;
  $('detailov').hidden = false;
}
function showNewFind(sp) {
  $('nfimg').src = MANIFEST[sp.id].file;
  $('nfart').className = 'art' + (isDeep(sp) ? ' deep' : '');
  $('nfname').textContent = sp.name;
  $('nfdesc').textContent = sp.desc;
  openPanel('newfind');
}

// ---------- actions ----------
function takePhoto() {
  if (paused) return;
  const f = $('flash'); f.style.transition = 'none'; f.style.opacity = 0.85;
  requestAnimationFrame(() => { f.style.transition = 'opacity .5s'; f.style.opacity = 0; });
  sound?.shutter();
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  const hit = creatures.findTarget(camera.position, dir);
  if (!hit) { toast('沒拍到生物～把牠們放進中間的框框再拍！'); return; }
  if (save.found.includes(hit.sp.id)) { toast(`📷 ${hit.sp.name}（圖鑑裡已經有了）`); return; }
  save.found.push(hit.sp.id); persist(); updateCounters();
  sound?.chime();
  setTimeout(() => showNewFind(hit.sp), 350);
  if (save.found.length === SPECIES.length) setTimeout(() => toast('🏆 恭喜！圖鑑全部收集完成！', 5000), 1500);
}
function toggleLamp() {
  player.lampOn = !player.lampOn;
  $('bLamp').classList.toggle('on', player.lampOn);
  sound?.click();
}
function toggleSub() {
  const r = player.toggleSub();
  if (r === 'far') toast('要游回潛艇旁邊才能登艇（看地圖上的 🟠）');
  else if (r === 'out') toast('出艙！潛水員可以鑽進小地方，注意氧氣 🫧');
  else toast('回到潛艇，氧氣補滿了');
  $('exitLbl').textContent = player.inSub ? '出艙' : '登艇';
  $('o2wrap').hidden = player.inSub;
  sound?.bubbles();
}
function playMovie(src, caption) {
  closePanels();
  const v = $('moviev');
  $('moviecap').textContent = caption;
  v.src = src; v.currentTime = 0;
  openPanel('movie');
  v.play().catch(() => { v.muted = true; v.play().catch(() => { }); });
}
$('replay').addEventListener('click', () => playMovie('assets/video/awaken.mp4', '🎬 亞特蘭提斯甦醒'));
let awakeT = -1;
function awaken(instant) {
  creatures.setAwake(true);
  if (instant) { U.uAwake.value = 1; return; }
  awakeT = 0;
  sound?.fanfare();
  setTimeout(() => playMovie('assets/video/awaken.mp4', '🎬 五塊石板合而為一……亞特蘭提斯甦醒了！'), 1800);
  toast('✨ 五塊石板合而為一……<br>亞特蘭提斯甦醒了！海龍守護神出現了！', 6000);
}

// ---------- input ----------
let paused = true, started = false;
const keys = {};
addEventListener('keydown', e => {
  if (!started) return;
  const k = e.key.toLowerCase();
  if (k === 'escape') { closePanels(); return; }
  if (e.repeat) return;
  keys[e.code] = true;
  if (k === 'b' || k === 'tab') { e.preventDefault(); $('codex').hidden ? (closePanels(), openCodex()) : closePanels(); }
  if (k === 'm') { if ($('mapov').hidden) { closePanels(); drawMap(); openPanel('mapov'); } else closePanels(); }
  if (paused) return;
  if (k === 'r' || k === 'enter') takePhoto();
  if (k === 'f') toggleLamp();
  if (k === 'q' || k === 'e') toggleSub();
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

const look = { id: null, x: 0, y: 0 }, joy = { id: null, x: 0, y: 0, dx: 0, dy: 0 };
canvas.addEventListener('pointerdown', e => {
  sound?.resume();
  if (e.pointerType !== 'mouse' && e.clientX < innerWidth * 0.45 && joy.id === null) {
    Object.assign(joy, { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0 });
    const j = $('joy'); j.style.display = 'block'; j.style.left = e.clientX - 60 + 'px'; j.style.top = e.clientY - 60 + 'px';
    j.firstElementChild.style.transform = '';
  } else if (look.id === null) Object.assign(look, { id: e.pointerId, x: e.clientX, y: e.clientY });
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (e.pointerId === look.id) {
    const s = e.pointerType === 'mouse' ? 0.0045 : 0.0065;
    player.camYaw -= (e.clientX - look.x) * s;
    player.camPitch = Math.max(-1.25, Math.min(1.0, player.camPitch - (e.clientY - look.y) * s));
    look.x = e.clientX; look.y = e.clientY;
  } else if (e.pointerId === joy.id) {
    let dx = e.clientX - joy.x, dy = e.clientY - joy.y;
    const d = Math.hypot(dx, dy), m = 50;
    if (d > m) { dx *= m / d; dy *= m / d; }
    joy.dx = dx / m; joy.dy = dy / m;
    $('joy').firstElementChild.style.transform = `translate(${dx}px,${dy}px)`;
  }
});
const endPtr = e => {
  if (e.pointerId === look.id) look.id = null;
  if (e.pointerId === joy.id) { joy.id = null; joy.dx = joy.dy = 0; $('joy').style.display = 'none'; }
};
canvas.addEventListener('pointerup', endPtr);
canvas.addEventListener('pointercancel', endPtr);
canvas.addEventListener('wheel', e => {
  if (!player) return;
  const base = player.inSub ? 9 : 4.5;
  player.camDist = Math.max(base * 0.5, Math.min(base * 2.5, player.camDist * (1 + Math.sign(e.deltaY) * 0.1)));
}, { passive: true });

const hold = { up: false, down: false };
for (const [id, k] of [['bUp', 'up'], ['bDown', 'down']]) {
  const b = $(id);
  b.addEventListener('pointerdown', e => { e.preventDefault(); hold[k] = true; b.setPointerCapture(e.pointerId); });
  const off = () => { hold[k] = false; };
  b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off);
}
$('bShot').addEventListener('click', takePhoto);
$('bLamp').addEventListener('click', toggleLamp);
$('bExit').addEventListener('click', toggleSub);
$('bCodex').addEventListener('click', openCodex);
$('bMap').addEventListener('click', () => { drawMap(); openPanel('mapov'); });
$('mini').addEventListener('click', () => { if (!started || paused) return; drawMap(); openPanel('mapov'); });
document.addEventListener('contextmenu', e => e.preventDefault());

$('start').addEventListener('click', () => {
  sound = new Sound(); sound.resume();
  $('title').hidden = true;
  $('title').style.display = 'none';
  $('hud').hidden = false; $('btns').hidden = false; $('topbtns').hidden = false;
  started = true; paused = false;
  toast(save.found.length ? '歡迎回來！繼續探險吧 🐠' : '先拍拍珊瑚礁的魚，然後跟著 ▲ 箭頭去找石板！', 4000);
});
$('reset').addEventListener('click', () => {
  if ($('reset').dataset.sure) { save = { found: [], relics: [] }; persist(); location.reload(); return; }
  $('reset').dataset.sure = 1; $('reset').textContent = '再按一次確定清除';
});

// ---------- environment by depth ----------
const FOG = [
  [0, [0.30, 0.74, 0.88], 0.0085], [25, [0.12, 0.52, 0.72], 0.0095], [70, [0.04, 0.24, 0.42], 0.012],
  [140, [0.012, 0.08, 0.18], 0.014], [250, [0.0, 0.018, 0.045], 0.016],
];
const fogCol = new THREE.Color();
function envAt(depth) {
  let i = 0; while (i < FOG.length - 2 && depth > FOG[i + 1][0]) i++;
  const [d0, c0, f0] = FOG[i], [d1, c1, f1] = FOG[i + 1];
  const t = Math.min(1, Math.max(0, (depth - d0) / (d1 - d0)));
  fogCol.setRGB(c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t);
  return f0 + (f1 - f0) * t;
}

// ---------- main loop ----------
const clock = new THREE.Clock();
const lampOut = { pos: U.uLampPos.value, dir: U.uLampDir.value };
let lockT = 0, miniT = 0, darkHintShown = false, lastZone = '', o2Warned = false, relicCheckT = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  if (!player) return;
  const t = clock.elapsedTime;
  U.uTime.value = t;

  if (!paused) {
    const inp = player.input;
    inp.x = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + joy.dx;
    inp.y = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) - joy.dy;
    inp.up = (keys.Space || hold.up) ? 1 : 0;
    inp.down = (keys.ShiftLeft || keys.ShiftRight || keys.KeyC || hold.down) ? 1 : 0;
  } else Object.assign(player.input, { x: 0, y: 0, up: 0, down: 0 });
  player.update(paused ? 0 : dt, camera);
  creatures.update(dt, t, player.pos);

  // environment
  const depth = Math.max(0, -camera.position.y);
  U.uFogDensity.value = envAt(depth);
  U.uFogColor.value.copy(fogCol);
  scene.fog.color.copy(fogCol); scene.fog.density = U.uFogDensity.value * 0.8;
  renderer.setClearColor(fogCol);
  U.uCamPos.value.copy(camera.position);
  const sun = Math.exp(-depth / 40);
  hemi.intensity = 0.6 + 1.0 * sun; sunL.intensity = 1.3 * sun;
  player.lamp(lampOut);
  U.uLampOn.value += ((player.lampOn ? 1 : 0) - U.uLampOn.value) * Math.min(1, dt * 8);
  selfL.position.copy(player.pos).add(new THREE.Vector3(0, 3, 2));
  selfL.intensity = (player.lampOn ? 2.5 : 0.8) * (1 - sun * 0.8);
  world.rays.update(camera.position, Math.max(0, 1 - depth / 60), t);
  if (awakeT >= 0 && awakeT < 1) { awakeT = Math.min(1, awakeT + dt / 4); U.uAwake.value = awakeT; }

  // relics
  relics.glows.forEach((g, i) => { g.material.opacity = 0.6 + 0.4 * Math.sin(t * 2 + i); });
  if (!paused) {
    relics.pos.forEach((p, i) => {
      if (save.relics.includes(i) || p.distanceTo(player.pos) > player.radius + 2.2) return;
      save.relics.push(i); persist(); relics.refresh(); updateCounters();
      sound?.chime(true);
      if (save.relics.length === 5) awaken(false);
      else toast(`🔷 找到亞特蘭提斯石板！（${save.relics.length}/5）`, 3000);
    });
    if (player.inSub && player.pos.distanceTo(relics.pos[4]) < 16 && !save.relics.includes(4) && (relicCheckT -= dt) < 0) {
      relicCheckT = 8; toast('神殿的門太窄了，潛艇進不去……<br>按「出艙」讓潛水員游進去！', 4000);
    }
  }

  // HUD
  if (started) {
    $('depthv').textContent = Math.round(Math.max(0, -player.pos.y));
    const zn = zoneName(player.pos);
    if (zn !== lastZone) { $('zone').textContent = zn; if (lastZone) toast(`— ${zn} —`, 1800); lastZone = zn; sound?.setZone(zn); }
    if (!darkHintShown && depth > 75 && !player.lampOn) { darkHintShown = true; toast('越來越暗了……按 💡 打開探照燈', 3500); }
    // compass to the nearest remaining relic
    let best = null, bd = Infinity;
    relics.pos.forEach((p, i) => { if (save.relics.includes(i)) return; const d = p.distanceTo(player.pos); if (d < bd) { bd = d; best = p; } });
    $('compass').style.display = best ? '' : 'none';
    if (best) {
      const a = Math.atan2(best.x - player.pos.x, best.z - player.pos.z);
      const rel = -(a - (player.camYaw + Math.PI));
      $('arrow').style.transform = `rotate(${rel}rad)`;
      const dy = best.y - player.pos.y;
      $('relicdist').textContent = `${Math.round(bd)} m ${dy < -8 ? '↓' : dy > 8 ? '↑' : ''}`;
    }
    // oxygen
    if (!player.inSub) {
      $('o2fill').style.width = Math.max(0, player.oxygen * 100) + '%';
      $('o2wrap').classList.toggle('low', player.oxygen < 0.25);
      if (player.oxygen < 0.25 && !o2Warned) { o2Warned = true; toast('氧氣不夠了！快回潛艇 🟠', 3000); }
      if (player.oxygen <= 0) {
        const f = $('fade'); f.style.opacity = 1; paused = true;
        setTimeout(() => { player.returnToSub(); $('exitLbl').textContent = '出艙'; $('o2wrap').hidden = true; f.style.opacity = 0; paused = false; toast('氧氣用完了，被拉回潛艇～'); }, 700);
        player.oxygen = 1;
      }
    } else o2Warned = false;
    if ((miniT -= dt) < 0) { miniT = 0.08; drawMini(); }
    // target lock on the reticle
    if ((lockT -= dt) < 0) {
      lockT = 0.15;
      const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
      const hit = creatures.findTarget(camera.position, dir);
      $('reticle').classList.toggle('lock', !!hit);
      $('lockname').textContent = hit ? (save.found.includes(hit.sp.id) ? hit.sp.name : '？？？ 拍拍看！') : '';
    }
    sound?.update(player, depth, dt);
  }
  renderer.render(scene, camera);
}

load().then(() => { player.update(0.016, camera); frame(); }).catch(err => {
  console.error(err);
  $('start').textContent = '載入失敗：' + err.message;
});

// debug hook for automated screenshots
window.__game = { get player() { return player; }, get creatures() { return creatures; }, camera, U, save: () => save, takePhoto, awaken, toggleSub, toggleLamp };
