// The sea floor, rocks, plants, Atlantis ruins, water surface and ambient particles.
import * as THREE from './three.module.min.js';
import { U, COMMON, worldMaterial, spriteMaterial } from './shaders.js';
import { fbm, noise2, rng, smooth, lerp } from './noise.js';

export const BOUNDS = { x0: -380, x1: 380, z0: -330, z1: 480 };
export const ATLANTIS = new THREE.Vector3(0, -137, 330);
export const PLAZA_Y = -137;
export const VENTS = [[238, 300], [262, 360], [245, 410], [270, 250]];

// ---------- height field ----------
export function floorHeight(x, z) {
  const n = fbm(x * 0.012, z * 0.012, 4);
  const d = fbm(x * 0.06 + 11, z * 0.06 - 7, 3);
  let h = -18 + n * 7 + d * 1.2;
  // reef outcrops: ridged bumps
  const ridge = 1 - Math.abs(noise2(x * 0.035 + 40, z * 0.035));
  h += Math.pow(ridge, 6) * 7 * (1 - smooth(120, 170, Math.hypot(x, z)));
  // kelp forest basin to the west
  h -= 12 * smooth(-90, -170, x) * (1 - smooth(60, 160, z));
  // the long slope down to the twilight plain in the north
  const s = smooth(90, 250, z);
  h = lerp(h, -130 + n * 10 + d * 2, s);
  // the abyss trench in the north-east
  const tx = (x - 255) / 55;
  const tr = Math.exp(-tx * tx) * smooth(90, 210, z);
  h = lerp(h, -305 + d * 6 + n * 12, Math.min(1, tr * 1.25));
  // flatten the Atlantis plaza
  const ad = Math.hypot(x - ATLANTIS.x, z - ATLANTIS.z);
  h = lerp(h, PLAZA_Y - 2, 1 - smooth(75, 110, ad));
  // rising walls at the map edges
  const e = Math.max(smooth(320, 395, Math.abs(x)), smooth(-270, -345, z), smooth(430, 495, z));
  h = lerp(h, -6 + n * 8, e);
  return h;
}

// floor including the raised Atlantis plaza
export function groundHeight(x, z) {
  const h = floorHeight(x, z);
  return Math.hypot(x - ATLANTIS.x, z - ATLANTIS.z) < 73 ? Math.max(h, PLAZA_Y) : h;
}

export function zoneName(p) {
  const y = p.y;
  if (Math.hypot(p.x - ATLANTIS.x, p.z - ATLANTIS.z) < 110 && y < -80) return '亞特蘭提斯遺跡';
  if (y < -200) return '深淵海溝';
  if (y < -70) return '暮光層';
  if (p.x < -110 && p.z < 90) return '巨藻森林';
  if (Math.hypot(p.x, p.z) < 150) return '珊瑚礁';
  return '開闊海域';
}

// ---------- helpers ----------
const texLoader = new THREE.TextureLoader();
export function loadTex(url, repeat = false) {
  return new Promise((res, rej) => texLoader.load(url, t => {
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    t.anisotropy = 4;
    res(t);
  }, undefined, rej));
}

function phases(geo, count, r) {
  const a = new Float32Array(count);
  for (let i = 0; i < count; i++) a[i] = r();
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(a, 1));
}

const crossGeo = (() => {
  const a = new THREE.PlaneGeometry(1, 1, 1, 4);
  const b = a.clone().rotateY(Math.PI / 2);
  const g = new THREE.BufferGeometry();
  const pos = [...a.attributes.position.array, ...b.attributes.position.array];
  const uv = [...a.attributes.uv.array, ...b.attributes.uv.array];
  const n = a.attributes.position.count;
  const idx = [...a.index.array, ...Array.from(b.index.array, i => i + n)];
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
})();

// colliders used by the player (and to keep plants off the ruins)
export const colliders = []; // {type:'box', c:Vector3, h:Vector3 half-size, yaw} | {type:'cyl', c, r, y0, y1}

export function pushOut(pos, radius) {
  for (const k of colliders) {
    if (k.type === 'cyl') {
      if (pos.y < k.y0 - radius || pos.y > k.y1 + radius) continue;
      const dx = pos.x - k.c.x, dz = pos.z - k.c.z;
      const d = Math.hypot(dx, dz), m = k.r + radius;
      if (d < m) {
        const up = k.y1 + radius - pos.y;
        if (up < m - d && up < 1.5) { pos.y += up; continue; }
        const s = (m - d) / Math.max(d, 1e-3);
        pos.x += dx * s; pos.z += dz * s;
      }
    } else {
      const c = Math.cos(k.yaw), s = Math.sin(k.yaw);
      const dx = pos.x - k.c.x, dz = pos.z - k.c.z;
      const lx = dx * c - dz * s, lz = dx * s + dz * c, ly = pos.y - k.c.y;
      const ex = k.h.x + radius, ey = k.h.y + radius, ez = k.h.z + radius;
      if (Math.abs(lx) < ex && Math.abs(ly) < ey && Math.abs(lz) < ez) {
        const px = ex - Math.abs(lx), py = ey - Math.abs(ly), pz = ez - Math.abs(lz);
        let nx = lx, ny = ly, nz = lz;
        if (px < py && px < pz) nx = Math.sign(lx) * ex;
        else if (py < pz) ny = Math.sign(ly) * ey;
        else nz = Math.sign(lz) * ez;
        pos.x = k.c.x + nx * c + nz * s;
        pos.z = k.c.z - nx * s + nz * c;
        pos.y = k.c.y + ny;
      }
    }
  }
}

function insideRuins(x, z, pad = 1) {
  for (const k of colliders) {
    const r = k.type === 'cyl' ? k.r : Math.hypot(k.h.x, k.h.z);
    if (Math.hypot(x - k.c.x, z - k.c.z) < r + pad) return true;
  }
  return false;
}

// ---------- build ----------
export async function buildWorld(scene, T, man) {
  const r = rng(1234);

  // terrain
  const W = BOUNDS.x1 - BOUNDS.x0 + 60, D = BOUNDS.z1 - BOUNDS.z0 + 60;
  const tg = new THREE.PlaneGeometry(W, D, 220, 230).rotateX(-Math.PI / 2);
  tg.translate((BOUNDS.x0 + BOUNDS.x1) / 2, 0, (BOUNDS.z0 + BOUNDS.z1) / 2);
  const tp = tg.attributes.position;
  for (let i = 0; i < tp.count; i++) tp.setY(i, floorHeight(tp.getX(i), tp.getZ(i)));
  tg.computeVertexNormals();
  const terrain = new THREE.Mesh(tg, worldMaterial({ top: T.tex_sand, side: T.tex_rock, blendByHeight: T.tex_mud, scale: 0.07 }));
  scene.add(terrain);

  // Atlantis first so plants avoid it
  buildAtlantis(scene, T, r);

  // rocks: displaced icosahedra
  const rockGeo = new THREE.IcosahedronGeometry(1, 3);
  const rp = rockGeo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < rp.count; i++) {
    v.fromBufferAttribute(rp, i);
    const k = 1 + 0.35 * noise2(v.x * 1.7 + 3, v.y * 1.7 + v.z * 1.3) + 0.12 * noise2(v.x * 5, v.z * 5 - v.y * 3);
    v.multiplyScalar(k); v.y *= 0.7;
    rp.setXYZ(i, v.x, v.y, v.z);
  }
  rockGeo.computeVertexNormals();
  const rocks = [];
  const place = (n, fn) => { for (let i = 0; i < n * 6 && n > 0; i++) { const p = fn(); if (p) { rocks.push(p); n--; } } };
  place(420, () => {
    const x = lerp(BOUNDS.x0, BOUNDS.x1, r()), z = lerp(BOUNDS.z0, BOUNDS.z1, r());
    if (Math.hypot(x - ATLANTIS.x, z - ATLANTIS.z) < 100 || Math.hypot(x, z) < 12) return null;
    const s = 1.5 + Math.pow(r(), 3) * 12;
    return [x, floorHeight(x, z) + s * 0.1, z, s];
  });
  const rockMesh = new THREE.InstancedMesh(rockGeo, worldMaterial({ top: T.tex_rock, side: T.tex_rock, scale: 0.18, tint: [0.95, 0.95, 1] }), rocks.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  rocks.forEach(([x, y, z, s], i) => {
    e.set((r() - 0.5) * 0.4, r() * 6.28, (r() - 0.5) * 0.4);
    m4.compose(new THREE.Vector3(x, y, z), q.setFromEuler(e), new THREE.Vector3(s * (0.8 + r() * 0.6), s, s * (0.8 + r() * 0.6)));
    rockMesh.setMatrixAt(i, m4);
    if (s > 4) colliders.push({ type: 'cyl', c: new THREE.Vector3(x, y, z), r: s * 0.8, y0: y - s, y1: y + s * 0.55 });
  });
  scene.add(rockMesh);

  // plants: [texture, count, sampler(x,z,h) -> weight, height range, sway]
  const reefW = (x, z, h) => (1 - smooth(110, 150, Math.hypot(x, z))) * (h > -32 ? 1 : 0);
  const kelpW = (x, z, h) => smooth(-100, -140, x) * (1 - smooth(40, 110, z)) * (h < -22 ? 1 : 0);
  const deepW = (x, z, h) => (h < -180 ? 1 : 0);
  const twiW = (x, z, h) => (h < -60 && h > -170 ? 1 : 0);
  const atlW = (x, z, h) => { const d = Math.hypot(x - ATLANTIS.x, z - ATLANTIS.z); return d > 20 && d < 110 ? 1 : 0; };
  const ventW = (x, z) => VENTS.some(([vx, vz]) => Math.hypot(x - vx, z - vz) < 18) ? 1 : 0;
  const plantDefs = [
    ['coral_branch', 380, reefW, [2, 4.5], 0.05],
    ['coral_brain', 220, reefW, [1.5, 3.5], 0.0],
    ['coral_fan', 200, (x, z, h) => reefW(x, z, h) + twiW(x, z, h) * 0.2, [2, 4.5], 0.12],
    ['coral_table', 180, reefW, [2, 4], 0.02],
    ['anemone', 260, reefW, [1.2, 2.5], 0.25],
    ['sponge', 220, (x, z, h) => reefW(x, z, h) * 0.6 + twiW(x, z, h) * 0.4, [1.5, 4], 0.02],
    ['seagrass', 700, (x, z, h) => reefW(x, z, h) + kelpW(x, z, h) * 0.6, [1.2, 2.6], 0.3],
    ['kelp', 420, kelpW, [16, 28], 1.6],
    ['glow_plant', 300, (x, z, h) => deepW(x, z, h) + atlW(x, z, h) * 0.5, [1.5, 3.5], 0.2],
    ['tube_worms', 160, ventW, [1.5, 3.5], 0.1],
    ['crystal', 130, (x, z, h) => atlW(x, z, h) + deepW(x, z, h) * 0.3, [1.5, 5], 0.0],
  ];
  const plantMeshes = [];
  for (const [name, count, weight, [h0, h1], sway] of plantDefs) {
    const info = man[name];
    const aspect = info.w / info.h;
    const list = [];
    for (let tries = 0; list.length < count && tries < count * 60; tries++) {
      let x, z;
      if (name === 'tube_worms') {
        const [vx, vz] = VENTS[Math.floor(r() * VENTS.length)];
        const a = r() * 6.28, d = 3 + r() * 14;
        x = vx + Math.cos(a) * d; z = vz + Math.sin(a) * d;
      } else { x = lerp(BOUNDS.x0, BOUNDS.x1, r()); z = lerp(BOUNDS.z0, BOUNDS.z1, r()); }
      const h = groundHeight(x, z);
      if (r() > weight(x, z, h) || insideRuins(x, z, 1.5)) continue;
      // cluster: denser where a low-frequency noise is high
      if (name !== 'kelp' && name !== 'tube_worms' && noise2(x * 0.05 + name.length * 13, z * 0.05) < -0.2) continue;
      list.push([x, h, z]);
    }
    const glowy = name === 'glow_plant' || name === 'crystal';
    const mat = spriteMaterial(T[name], { mode: 3, wiggle: sway, selfLit: glowy ? 0.55 : 0, glow: glowy ? [1.4, 0, 0] : [0, 0, 0] });
    const geo = crossGeo.clone();
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    phases(geo, list.length, r);
    list.forEach(([x, h, z], i) => {
      const H = lerp(h0, h1, r());
      const Wd = H * aspect;
      m4.compose(new THREE.Vector3(x, h + H * 0.5 - 0.15, z), q.setFromEuler(e.set(0, r() * 3.14, 0)), new THREE.Vector3(Wd, H, Wd));
      mesh.setMatrixAt(i, m4);
    });
    mesh.frustumCulled = false;
    scene.add(mesh);
    plantMeshes.push(mesh);
  }

  const surface = buildSurface(scene);
  const rays = buildRays(scene);
  const snow = buildSnow(scene);
  const vents = buildVents(scene);
  return { terrain, surface, rays, snow, vents };
}

// ---------- Atlantis ----------
function buildAtlantis(scene, T, r) {
  const A = ATLANTIS;
  const boxes = [], cols = [], glowBoxes = [];
  const box = (x, y, z, w, h, d, yaw = 0, list = boxes) => {
    list.push({ x: A.x + x, y, z: A.z + z, w, h, d, yaw });
    colliders.push({ type: 'box', c: new THREE.Vector3(A.x + x, y, A.z + z), h: new THREE.Vector3(w / 2, h / 2, d / 2), yaw });
  };
  const col = (x, z, h, rad = 1.3, y0 = PLAZA_Y) => {
    cols.push({ x: A.x + x, y: y0 + h / 2, z: A.z + z, r: rad, h });
    colliders.push({ type: 'cyl', c: new THREE.Vector3(A.x + x, y0 + h / 2, A.z + z), r: rad * 1.15, y0, y1: y0 + h });
    box(x, y0 + 0.4, z, rad * 2.8, 0.8, rad * 2.8);                     // plinth
    if (h > 9) box(x, y0 + h + 0.4, z, rad * 2.8, 0.8, rad * 2.8);      // capital (only on intact columns)
  };

  // plaza disc
  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(72, 76, 3, 64),
    worldMaterial({ top: T.tex_mosaic, side: T.tex_marble, scale: 0.08 }));
  plaza.position.set(A.x, PLAZA_Y - 1.5, A.z);
  scene.add(plaza);

  // outer ring of columns (some broken)
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    if (Math.abs(a - Math.PI * 1.5) < 0.2) continue; // gap in the ring for the avenue (south)
    const broken = r() < 0.35;
    col(Math.cos(a) * 64, Math.sin(a) * 64, broken ? 3 + r() * 6 : 14 + r() * 2, 1.4);
  }
  // avenue from the gate to the temple
  for (let z = -52; z <= -18; z += 8) { col(-9, z, r() < 0.3 ? 4 + r() * 4 : 11, 1.1); col(9, z, r() < 0.3 ? 4 + r() * 4 : 11, 1.1); }
  // great gate
  col(-8, -66, 22, 2.2); col(8, -66, 22, 2.2);
  box(0, PLAZA_Y + 23.5, -66, 22, 3, 5);
  box(0, PLAZA_Y + 26, -66, 12, 2, 4, 0, glowBoxes);

  // temple: stepped base
  const TZ = 18;
  box(0, PLAZA_Y + 1, TZ, 44, 2, 34);
  box(0, PLAZA_Y + 3, TZ, 38, 2, 28);
  box(0, PLAZA_Y + 5, TZ, 32, 2, 22);
  const fy = PLAZA_Y + 6;       // temple floor
  // inner chamber walls (door gap 3m on the south side -> only the diver fits)
  const cw = 16, cd = 12, ch = 10, t = 1.2;
  box(0, fy + ch / 2, TZ + cd / 2, cw, ch, t);                     // back
  box(-cw / 2, fy + ch / 2, TZ, t, ch, cd);                        // left
  box(cw / 2, fy + ch / 2, TZ, t, ch, cd);                         // right
  box(-(cw / 4 + 0.75), fy + ch / 2, TZ - cd / 2, cw / 2 - 1.5, ch, t); // front-left
  box((cw / 4 + 0.75), fy + ch / 2, TZ - cd / 2, cw / 2 - 1.5, ch, t);  // front-right
  box(0, fy + ch - 1.5, TZ - cd / 2, 3.2, 3, t);                   // lintel over the door
  box(0, fy + ch + 0.8, TZ, cw + 6, 1.6, cd + 8);                  // roof slab
  box(0, fy + ch + 2.4, TZ, cw + 2, 1.6, cd + 4, 0, glowBoxes);    // upper roof (glows when awake)
  box(0, fy + 1, TZ + 2, 3, 2, 3, 0, glowBoxes);                   // altar for the last relic
  // portico columns in front of the chamber
  for (let i = 0; i < 6; i++) col(-12.5 + i * 5, TZ - 10, ch + 1.6, 1.0, fy);
  // fallen columns and blocks scattered on the plaza
  for (let i = 0; i < 14; i++) {
    const a = r() * 6.28, d = 25 + r() * 40;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (Math.abs(x) < 14 && z < -10) continue;
    if (Math.abs(x) < 26 && Math.abs(z - TZ) < 22) continue;
    if (r() < 0.5) box(x, PLAZA_Y + 1.2, z, 9 + r() * 5, 2.4, 2.4, r() * 3.14);   // lying column drum
    else box(x, PLAZA_Y + 1.5, z, 3 + r() * 3, 3, 3 + r() * 3, r() * 3.14);
  }
  // outlying ruined houses around the plaza
  for (let i = 0; i < 10; i++) {
    const a = r() * 6.28, d = 82 + r() * 25;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const y = floorHeight(A.x + x, A.z + z);
    const yaw = r() * 3.14, w = 8 + r() * 6;
    box(x, y + 2.5, z, w, 5 + r() * 3, 1.2, yaw);
    box(x + Math.cos(yaw + 1.57) * w * 0.4, y + 2, z - Math.sin(yaw + 1.57) * w * 0.4, 1.2, 4, w * 0.8, yaw);
  }

  const marble = worldMaterial({ top: T.tex_marble, side: T.tex_marble, scale: 0.16 });
  const rune = worldMaterial({ top: T.tex_marble, side: T.tex_marble, scale: 0.16, tint: [0.75, 0.95, 1.1], emissive: 0.35 });
  const addBoxes = (list, mat) => {
    const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, list.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    list.forEach((b, i) => { m.setMatrixAt(i, m4.compose(new THREE.Vector3(b.x, b.y, b.z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.yaw), new THREE.Vector3(b.w, b.h, b.d))); });
    scene.add(m);
  };
  addBoxes(boxes, marble);
  addBoxes(glowBoxes, rune);
  const cm = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1.06, 1, 18), marble, cols.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  cols.forEach((c, i) => cm.setMatrixAt(i, m4.compose(new THREE.Vector3(c.x, c.y, c.z), q, new THREE.Vector3(c.r, c.h, c.r))));
  scene.add(cm);
}

// ---------- water surface seen from below ----------
function buildSurface(scene) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...U }, side: THREE.DoubleSide, transparent: true, depthWrite: false,
    vertexShader: `varying vec3 vPos; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vPos=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: COMMON + `varying vec3 vPos;
      void main(){
        float c = caustic(vPos * 0.6 + vec3(uTime, 0.0, 0.0));
        vec3 above = normalize(vPos - uCamPos);
        float win = smoothstep(0.6, 0.85, above.y);          // Snell's window
        vec3 col = mix(vec3(0.25, 0.65, 0.8), vec3(0.85, 1.0, 1.0), win) + c * 0.35;
        float d = length(vPos - uCamPos);
        float a = exp(-d * 0.006);
        gl_FragColor = vec4(mix(uFogColor, col, a), 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400).rotateX(Math.PI / 2), mat);
  m.position.y = 0;
  scene.add(m);
  return m;
}

// ---------- god rays near the surface ----------
function buildRays(scene) {
  const n = 36, r = rng(99);
  const geo = new THREE.PlaneGeometry(1, 1).translate(0, -0.5, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...U, uI: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `attribute float aPhase; uniform vec3 uCamPos; varying vec2 vUv; varying float vPh; varying vec3 vPos;
      void main(){ vUv=uv; vPh=aPhase;
        vec3 c = (modelMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;
        float sx = length(instanceMatrix[0].xyz), sy = length(instanceMatrix[1].xyz);
        vec3 toCam = uCamPos - c; toCam.y = 0.0; toCam = normalize(toCam + vec3(1e-4,0.0,0.0));
        vec3 right = normalize(cross(vec3(0.0,1.0,0.0), toCam));
        vec3 dir = normalize(vec3(0.25, -1.0, 0.1));
        vec3 wp = c + right * position.x * sx + dir * -position.y * sy;
        vPos = wp;
        gl_Position = projectionMatrix*viewMatrix*vec4(wp,1.0); }`,
    fragmentShader: `uniform float uTime, uI; varying vec2 vUv; varying float vPh; varying vec3 vPos;
      void main(){
        float edge = sin(vUv.x * 3.14159);
        float fall = vUv.y;
        float flick = 0.55 + 0.45 * sin(uTime * 0.6 + vPh * 20.0);
        float a = edge * edge * fall * fall * flick * uI * 0.09;
        gl_FragColor = vec4(vec3(0.7, 0.95, 1.0) * a, 1.0);
      }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  const ph = new Float32Array(n);
  const offs = [];
  for (let i = 0; i < n; i++) { ph[i] = r(); offs.push([(r() - 0.5) * 140, (r() - 0.5) * 140, 3 + r() * 9, 40 + r() * 40]); }
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(ph, 1));
  mesh.frustumCulled = false;
  scene.add(mesh);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  return {
    update(cam, depthFactor, t) {
      mat.uniforms.uI.value = depthFactor;
      mesh.visible = depthFactor > 0.01;
      offs.forEach(([ox, oz, w, len], i) => {
        const x = Math.round(cam.x / 140) * 140 + ox + Math.sin(t * 0.05 + i) * 3;
        const z = Math.round(cam.z / 140) * 140 + oz;
        const wx = ((x - cam.x + 70) % 140 + 140) % 140 - 70 + cam.x;
        const wz = ((z - cam.z + 70) % 140 + 140) % 140 - 70 + cam.z;
        mesh.setMatrixAt(i, m4.compose(new THREE.Vector3(wx, 0, wz), q, new THREE.Vector3(w, len, 1)));
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// ---------- drifting marine snow around the camera ----------
function buildSnow(scene) {
  const n = 2600, r = rng(5), pos = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) pos[i] = r() * 60;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...U, uPix: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform vec3 uCamPos; uniform float uTime, uPix; varying float vA; varying float vDeep;
      void main(){
        vec3 p = position;
        p.y -= uTime * 0.25; p.x += sin(uTime * 0.2 + position.y) * 0.8;
        vec3 w = mod(p - uCamPos + 30.0, 60.0) - 30.0 + uCamPos;
        vec4 mv = viewMatrix * vec4(w, 1.0);
        float d = -mv.z;
        vA = smoothstep(30.0, 5.0, d) * smoothstep(0.3, 2.0, d);
        vDeep = smoothstep(-60.0, -200.0, w.y);
        gl_PointSize = uPix * (1.0 + 30.0 / max(d, 1.0));
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vA; varying float vDeep; uniform float uTime;
      void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.1, length(c)) * vA;
        vec3 col = mix(vec3(0.6, 0.75, 0.8) * 0.35, vec3(0.2, 0.8, 1.0) * 0.6, vDeep);
        gl_FragColor = vec4(col * a, 1.0); }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  return pts;
}

// ---------- hydrothermal vents: chimneys + rising dark smoke ----------
function buildVents(scene) {
  const chimneyMat = new THREE.MeshBasicMaterial({ color: 0x1a1512 });
  const chimneys = [];
  for (const [x, z] of VENTS) {
    const y = floorHeight(x, z);
    const g = new THREE.CylinderGeometry(1.2, 3.5, 12, 10, 4);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + noise2(p.getY(i) * 0.4, i * 0.1) * 0.5);
    const m = new THREE.Mesh(g, chimneyMat);
    m.position.set(x, y + 5.5, z);
    scene.add(m);
    chimneys.push(new THREE.Vector3(x, y + 11.5, z));
    colliders.push({ type: 'cyl', c: new THREE.Vector3(x, y + 5.5, z), r: 2.8, y0: y, y1: y + 11.5 });
  }
  const n = 600, r = rng(77);
  const pos = new Float32Array(n * 3), seed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const c = chimneys[i % chimneys.length];
    pos.set([c.x, c.y, c.z], i * 3); seed[i] = r();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...U }, transparent: true, depthWrite: false,
    vertexShader: `attribute float aSeed; uniform float uTime; varying float vA; varying vec3 vPos;
      void main(){
        float t = fract(uTime * 0.08 + aSeed);
        vec3 p = position + vec3(sin(aSeed * 40.0 + uTime) * t * 3.0, t * 30.0, cos(aSeed * 31.0 + uTime) * t * 3.0);
        vA = (1.0 - t) * smoothstep(0.0, 0.1, t);
        vPos = p;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_PointSize = (2.0 + t * 10.0) * 60.0 / max(-mv.z, 1.0);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: COMMON + `varying float vA; varying vec3 vPos;
      void main(){ float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)) * vA * 0.5;
        vec3 col = vec3(0.12, 0.1, 0.09) + vec3(1.0, 0.5, 0.2) * 0.25 * vA * vA;
        gl_FragColor = vec4(applyFog(col, vPos), a); }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  return chimneys;
}
