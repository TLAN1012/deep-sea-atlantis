// Sea creatures: species data (also the field guide text), spawning and simple swimming AI.
import * as THREE from './three.module.min.js';
import { spriteMaterial } from './shaders.js';
import { groundHeight, ATLANTIS, VENTS, BOUNDS } from './world.js';
import { rng, lerp } from './noise.js';

// zones: where a species lives. pick() returns a random point, clamp() keeps it inside.
const Z = {
  reef:     { c: [0, 0], r: 95, y: [-26, -5] },
  kelp:     { c: [-190, -40], r: 80, y: [-40, -3] },
  open:     { c: [-40, 40], r: 230, y: [-45, -4] },
  surface:  { c: [-180, -40], r: 70, y: [-0.9, -0.9] },
  twilight: { c: [60, 250], r: 170, y: [-135, -65] },
  abyss:    { c: [255, 330], r: 90, y: [-300, -170], rx: 40 },
  vents:    { c: [255, 330], r: 90, y: [-310, -280], rx: 30 },
  atlantis: { c: [ATLANTIS.x, ATLANTIS.z], r: 95, y: [-130, -95] },
};

// mode: 0 paper fish, 1 billboard, 2 flat (top view)
// behave: wander | school | crawl | drift | static | circle
export const SPECIES = [
  // ---- 珊瑚礁 ----
  { id: 'clownfish', name: '小丑魚', zone: 'reef', mode: 0, size: 0.7, n: 50, behave: 'wander', speed: 2, flee: 1,
    desc: '住在海葵的觸手之間。身上的黏液保護牠不被海葵螫到，也幫海葵趕走想吃海葵的魚。' },
  { id: 'blue_tang', name: '藍倒吊', zone: 'reef', mode: 0, size: 0.8, n: 48, behave: 'school', group: 12, speed: 3, flee: 1,
    desc: '尾巴根部藏著像手術刀一樣銳利的骨片，所以英文也叫「外科醫生魚」。' },
  { id: 'pufferfish', name: '河豚', zone: 'reef', mode: 0, size: 0.9, n: 14, behave: 'wander', speed: 1, wiggle: 0.08,
    desc: '受到驚嚇時會大口吞水，把身體鼓成一顆刺球。體內有劇毒的河豚毒素。' },
  { id: 'parrotfish', name: '鸚哥魚', zone: 'reef', mode: 0, size: 1.1, n: 20, behave: 'wander', speed: 2,
    desc: '用鳥喙般的牙齒啃食珊瑚上的藻類，吃下去的碎珊瑚會變成細白沙排出來。熱帶沙灘有不少沙子是牠們做的！' },
  { id: 'angelfish', name: '神仙魚', zone: 'reef', mode: 0, size: 0.9, n: 20, behave: 'wander', speed: 1.8,
    desc: '身體又扁又高，可以輕鬆鑽進珊瑚縫隙。幼魚和成魚的花紋常常完全不一樣。' },
  { id: 'butterflyfish', name: '蝴蝶魚', zone: 'reef', mode: 0, size: 0.7, n: 30, behave: 'wander', speed: 2,
    desc: '尾巴附近的黑色圓點像一隻假眼睛，讓掠食者搞錯頭尾。常常成雙成對一起游。' },
  { id: 'sea_turtle', name: '綠蠵龜', zone: 'reef', mode: 0, size: 2.4, n: 6, behave: 'wander', speed: 2.2, wiggle: 0.05, fin: 1,
    desc: '名字裡的「綠」來自身體脂肪的顏色，因為牠長大後主要吃海草和藻類。台灣的澎湖望安島是牠們的產卵地。' },
  { id: 'manta', name: '鬼蝠魟', zone: 'open', mode: 0, size: 6, n: 4, behave: 'wander', speed: 3, wiggle: 0.12, wspeed: 2,
    desc: '翼展可以超過七公尺，是腦容量最大的魚類之一。頭前方捲起的頭鰭用來把浮游生物撥進嘴裡。' },
  { id: 'seahorse', name: '海馬', zone: 'reef', mode: 1, size: 0.6, n: 10, behave: 'drift', speed: 0.3, wiggle: 0.04, floor: 1,
    desc: '由海馬爸爸懷孕！雄海馬肚子上有育兒袋，負責孵化寶寶。尾巴可以捲住海草，免得被沖走。' },
  { id: 'octopus', name: '章魚', zone: 'reef', mode: 1, size: 1.2, n: 6, behave: 'crawl', speed: 0.6, wiggle: 0.06,
    desc: '有三顆心臟、藍色的血液，八隻腕足上的神經元比腦還多。會變色、會開罐子，非常聰明。' },
  { id: 'moon_jelly', name: '月亮水母', zone: 'kelp', mode: 1, size: 1.3, n: 36, behave: 'drift', speed: 0.4, wiggle: 0.12, wspeed: 3, selfLit: 0.25,
    desc: '四個粉紅色的圓圈是牠的生殖腺。身體 95% 以上是水，沒有腦也沒有心臟。' },
  { id: 'starfish', name: '海星', zone: 'reef', mode: 2, size: 0.8, n: 30, behave: 'static', wiggle: 0,
    desc: '手臂斷掉可以再長回來，有些種類甚至能從一隻手臂長回整隻海星。牠的眼睛長在每隻手臂的末端。' },
  { id: 'crab', name: '螃蟹', zone: 'reef', mode: 1, size: 0.6, n: 22, behave: 'crawl', speed: 0.8, wiggle: 0.05,
    desc: '因為腳關節的構造，大部分螃蟹橫著走最快。長大時要蛻掉舊殼，換上更大的新殼。' },
  { id: 'hermit_crab', name: '寄居蟹', zone: 'reef', mode: 0, size: 0.6, n: 12, behave: 'crawl', speed: 0.4, wiggle: 0.02,
    desc: '柔軟的腹部要靠撿來的空貝殼保護。長大就得搬家，有時候還會排隊交換殼。' },
  { id: 'clam', name: '硨磲貝', zone: 'reef', mode: 1, size: 1.6, n: 8, behave: 'static', wiggle: 0.02,
    desc: '世界上最大的貝類，可以活超過一百年。肉裡住著會行光合作用的藻類，提供牠養分。' },
  // ---- 開闊海域 / 巨藻森林 ----
  { id: 'whale_shark', name: '鯨鯊', zone: 'open', mode: 0, size: 14, n: 2, behave: 'circle', speed: 2.5, wiggle: 0.1, wspeed: 1.5,
    desc: '世界上最大的魚，可以長到十幾公尺，卻只吃浮游生物和小魚。每一隻身上的白點花紋都不一樣，像指紋。' },
  { id: 'sunfish', name: '翻車魚', zone: 'open', mode: 0, size: 3, n: 3, behave: 'wander', speed: 0.9, wiggle: 0.04,
    desc: '世界上最重的硬骨魚，可以超過兩噸。常常側躺在海面曬太陽，讓海鳥幫牠清除身上的寄生蟲。' },
  { id: 'dolphin', name: '海豚', zone: 'open', mode: 0, size: 2.4, n: 8, behave: 'school', group: 8, speed: 7, wiggle: 0.12, yband: [-18, -3],
    desc: '用口哨聲互相叫名字，睡覺時一次只讓半邊大腦休息，另一半保持清醒去換氣。' },
  { id: 'humpback', name: '座頭鯨', zone: 'kelp', mode: 0, size: 18, n: 2, behave: 'circle', speed: 3, wiggle: 0.08, wspeed: 1.2,
    desc: '雄鯨會唱長達二十分鐘的歌，同一海域的鯨魚唱同一首，而且每年會改編。長長的胸鰭是所有鯨魚裡最長的。' },
  { id: 'sardine', name: '沙丁魚', zone: 'open', mode: 0, size: 0.5, n: 240, behave: 'school', group: 80, speed: 5, flee: 1, tight: 1,
    desc: '成千上萬隻聚成「魚球」一起轉彎，讓掠食者眼花撩亂、不知道要咬哪一隻。' },
  { id: 'squid', name: '魷魚', zone: 'open', mode: 0, size: 1.5, n: 10, behave: 'wander', speed: 3, wiggle: 0.05,
    desc: '把水從身體裡噴出去來推進，是一種噴射引擎。遇到危險會噴墨汁當煙霧彈。' },
  { id: 'sea_otter', name: '海獺', zone: 'surface', mode: 0, size: 1.4, n: 4, behave: 'drift', speed: 0.3, wiggle: 0.02,
    desc: '睡覺時會用巨藻把自己纏住，或和同伴手牽手，免得漂走。會拿石頭敲開貝殼，是會用工具的動物。' },
  // ---- 暮光層 ----
  { id: 'lanternfish', name: '燈籠魚', zone: 'twilight', mode: 0, size: 0.5, n: 60, behave: 'school', group: 15, speed: 2.5, selfLit: 0.2, glow: 1.5,
    desc: '可能是地球上數量最多的脊椎動物。每天晚上成群游到淺海吃東西，天亮前再潛回深處。' },
  { id: 'barreleye', name: '桶眼魚', zone: 'twilight', mode: 0, size: 0.8, n: 6, behave: 'wander', speed: 0.8, selfLit: 0.15,
    desc: '頭是透明的！綠色的管狀眼睛可以在透明頭罩裡轉動，往上看獵物的影子。臉上那兩個像眼睛的其實是鼻孔。' },
  { id: 'oarfish', name: '皇帶魚', zone: 'twilight', mode: 0, size: 12, n: 3, behave: 'wander', speed: 1.2, wiggle: 0.25, wspeed: 3, selfLit: 0.15,
    desc: '世界上最長的硬骨魚，可以超過八公尺。直立在水中，靠背上一整排紅色的鰭像波浪一樣擺動前進。' },
  { id: 'vampire_squid', name: '吸血鬼烏賊', zone: 'twilight', mode: 1, size: 1.3, n: 6, behave: 'drift', speed: 0.5, wiggle: 0.1, selfLit: 0.2, glow: 1.5,
    desc: '名字很嚇人，其實只吃海雪（往下飄的有機碎屑）。遇到危險會把披風翻過來包住自己，像一顆刺球。' },
  { id: 'dumbo_octopus', name: '小飛象章魚', zone: 'twilight', mode: 1, size: 1.1, n: 8, behave: 'drift', speed: 0.5, wiggle: 0.12, wspeed: 4, selfLit: 0.2,
    desc: '搧動頭上兩片像大象耳朵的鰭來游泳。住在很深的海底，是章魚中生活得最深的。' },
  { id: 'atolla_jelly', name: '冠水母', zone: 'twilight', mode: 1, size: 1.2, n: 26, behave: 'drift', speed: 0.3, wiggle: 0.1, selfLit: 0.25, glow: 2.2,
    desc: '被攻擊時會發出一圈一圈旋轉的藍光，像警報器一樣，把更大的掠食者引來嚇跑敵人。' },
  { id: 'sperm_whale', name: '抹香鯨', zone: 'twilight', mode: 0, size: 18, n: 2, behave: 'circle', speed: 2.2, wiggle: 0.07, wspeed: 1.2, selfLit: 0.12,
    desc: '能憋氣超過一小時、潛到兩千公尺深，去獵捕大王烏賊。擁有動物界最大的腦。' },
  { id: 'giant_squid', name: '大王烏賊', zone: 'twilight', mode: 0, size: 12, n: 2, behave: 'wander', speed: 1.6, wiggle: 0.12, selfLit: 0.15,
    desc: '擁有動物界最大的眼睛，直徑可達 27 公分，像一顆籃球。直到 2004 年才第一次被拍到活的樣子。' },
  { id: 'frilled_shark', name: '皺鰓鯊', zone: 'twilight', mode: 0, size: 3, n: 4, behave: 'wander', speed: 1.3, wiggle: 0.25, wspeed: 4, selfLit: 0.12,
    desc: '被稱為「活化石」，模樣跟八千萬年前的祖先差不多。懷孕期可能長達三年半，是所有脊椎動物裡最長的。' },
  // ---- 深淵 ----
  { id: 'anglerfish', name: '鮟鱇魚', zone: 'abyss', mode: 0, size: 1.4, n: 8, behave: 'wander', speed: 0.8, selfLit: 0.18, glow: 2.5,
    desc: '頭上的「釣竿」末端住著會發光的細菌，用來引誘獵物。有些種類的雄魚很小，會一輩子黏在雌魚身上。' },
  { id: 'viperfish', name: '蝰魚', zone: 'abyss', mode: 0, size: 1.3, n: 8, behave: 'wander', speed: 1.2, selfLit: 0.15, glow: 2,
    desc: '牙齒長到嘴巴合不起來。肚子上的發光器會模仿上方微光，讓下方的獵物看不到牠的輪廓。' },
  { id: 'gulper_eel', name: '寬咽魚', zone: 'abyss', mode: 0, size: 2.5, n: 6, behave: 'wander', speed: 1, wiggle: 0.22, selfLit: 0.15, glow: 2,
    desc: '嘴巴像一個巨大的網袋，可以吞下比自己還大的獵物。尾巴末端會發出粉紅色的光。' },
  { id: 'blobfish', name: '水滴魚', zone: 'vents', mode: 0, size: 1, n: 6, behave: 'crawl', speed: 0.2, wiggle: 0.02, selfLit: 0.15,
    desc: '在深海高壓下其實長得像一般的魚，被拉上岸後身體才塌成果凍狀。曾被票選為「世界上最醜的動物」。' },
  { id: 'giant_isopod', name: '大王具足蟲', zone: 'vents', mode: 0, size: 1, n: 8, behave: 'crawl', speed: 0.4, wiggle: 0.02, selfLit: 0.15,
    desc: '是西瓜蟲的超大號親戚。非常耐餓，日本水族館有一隻曾經五年多沒吃東西。' },
  { id: 'yeti_crab', name: '雪人蟹', zone: 'vents', mode: 1, size: 0.6, n: 14, behave: 'crawl', speed: 0.4, wiggle: 0.04, selfLit: 0.2,
    desc: '住在海底熱泉旁。會揮動毛茸茸的螯，在毛上「種」細菌來吃，像是在自己身上經營農場。' },
  { id: 'glow_shrimp', name: '深海發光蝦', zone: 'abyss', mode: 0, size: 0.4, n: 36, behave: 'school', group: 12, speed: 1.5, selfLit: 0.2, glow: 2.5,
    desc: '深海裡紅色是隱形色，因為紅光照不到這麼深。有些發光蝦遇到危險會噴出一團發光的液體逃走。' },
  // ---- 亞特蘭提斯 ----
  { id: 'sea_dragon', name: '海龍守護神', zone: 'atlantis', mode: 0, size: 16, n: 1, behave: 'circle', speed: 4, wiggle: 0.2, wspeed: 2, selfLit: 0.5, glow: 2, awake: 1,
    desc: '傳說中守護亞特蘭提斯的古老海龍。只有當五塊石板重新合在一起，神殿甦醒時，牠才會現身。' },
];

const up = new THREE.Vector3(0, 1, 0);

function inZone(z, r) {
  const a = r() * Math.PI * 2, d = Math.sqrt(r()) * z.r;
  let x = z.c[0] + Math.cos(a) * d, zz = z.c[1] + Math.sin(a) * d;
  if (z.rx) x = z.c[0] + (r() - 0.5) * 2 * z.rx;
  x = Math.min(BOUNDS.x1, Math.max(BOUNDS.x0, x)); zz = Math.min(BOUNDS.z1, Math.max(BOUNDS.z0, zz));
  return [x, zz];
}

export class Creatures {
  constructor(scene, T, man) {
    this.r = rng(4242);
    this.groups = [];
    this.awake = false;
    for (const sp of SPECIES) {
      if (sp.size < 1.6 && !sp.scaled) { sp.size *= 1.7; sp.scaled = 1; }   // small fish read better a bit larger
      const info = man[sp.id];
      const aspect = info.w / info.h;
      const sx = aspect >= 1 ? sp.size : sp.size * aspect;
      const sy = aspect >= 1 ? sp.size / aspect : sp.size;
      const geo = new THREE.PlaneGeometry(1, 1, sp.mode === 0 ? 10 : 4, sp.mode === 2 ? 6 : 1);
      const ph = new Float32Array(sp.n);
      for (let i = 0; i < sp.n; i++) ph[i] = this.r();
      geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(ph, 1));
      const mat = spriteMaterial(T[sp.id], {
        mode: sp.mode, wiggle: sp.wiggle ?? (sp.mode === 0 ? 0.15 : 0.08),
        speed: sp.wspeed ?? (sp.mode === 0 ? 6 + 4 / sp.size : 3),
        selfLit: ['twilight', 'abyss', 'vents', 'atlantis'].includes(sp.zone) ? Math.max(0.5, sp.selfLit ?? 0) : (sp.selfLit ?? 0), glow: [sp.glow ?? 0, 0, 0],
      });
      const mesh = new THREE.InstancedMesh(geo, mat, sp.n);
      mesh.frustumCulled = false;
      scene.add(mesh);
      const zone = Z[sp.zone];
      const g = { sp, mesh, zone, sx, sy, list: [], leaders: [] };
      const nLeaders = sp.behave === 'school' ? Math.ceil(sp.n / sp.group) : 0;
      for (let k = 0; k < nLeaders; k++) g.leaders.push(this.spawn(g));
      for (let i = 0; i < sp.n; i++) {
        const c = this.spawn(g);
        if (nLeaders) {
          c.leader = g.leaders[i % nLeaders];
          const spread = sp.tight ? 5 : 3 + sp.size * 2;
          c.off = new THREE.Vector3((this.r() - 0.5) * spread * 2, (this.r() - 0.5) * spread, (this.r() - 0.5) * spread * 2);
          c.pos.copy(c.leader.pos).add(c.off);
        }
        g.list.push(c);
      }
      if (sp.awake) mesh.visible = false;
      this.groups.push(g);
    }
  }

  spawn(g) {
    const { zone, sp } = g, r = this.r;
    const [x, z] = inZone(zone, r);
    const floor = groundHeight(x, z);
    let y;
    if (sp.behave === 'crawl' || sp.behave === 'static') y = floor + g.sy * 0.45;
    else if (sp.floor) y = floor + 1 + r() * 3;
    else y = lerp(Math.max(zone.y[0], floor + sp.size * 0.6 + 1.5), zone.y[1], r());
    if (sp.yband) y = lerp(sp.yband[0], sp.yband[1], r());
    const c = {
      pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(r() - 0.5, 0, r() - 0.5).normalize().multiplyScalar(sp.speed ?? 0),
      target: new THREE.Vector3(), yaw: r() * 6.28, t: r() * 100, circ: { a: r() * 6.28, R: 30 + r() * 40, cx: x, cz: z, dir: r() < 0.5 ? 1 : -1 },
    };
    this.newTarget(g, c);
    return c;
  }

  newTarget(g, c) {
    const { zone, sp } = g, r = this.r;
    let x, z;
    if (sp.behave === 'crawl' || sp.behave === 'drift') {
      const a = r() * 6.28, d = 3 + r() * 10;
      x = c.pos.x + Math.cos(a) * d; z = c.pos.z + Math.sin(a) * d;
      const dz = Math.hypot(x - zone.c[0], z - zone.c[1]);
      if (dz > zone.r) [x, z] = inZone(zone, r);
    } else [x, z] = inZone(zone, r);
    const floor = groundHeight(x, z);
    let y;
    if (sp.behave === 'crawl') y = floor + g.sy * 0.45;
    else if (sp.floor) y = floor + 1 + r() * 3;
    else y = lerp(Math.max(zone.y[0], floor + g.sy + 1.5), Math.max(zone.y[1], floor + g.sy + 2), r());
    if (sp.yband) y = lerp(sp.yband[0], sp.yband[1], r());
    c.target.set(x, y, z);
  }

  setAwake(v) {
    this.awake = v;
    for (const g of this.groups) if (g.sp.awake) g.mesh.visible = v;
  }

  update(dt, t, playerPos) {
    const m4 = new THREE.Matrix4(), fwd = new THREE.Vector3(), side = new THREE.Vector3(), upv = new THREE.Vector3(), tmp = new THREE.Vector3();
    for (const g of this.groups) {
      const { sp, mesh } = g;
      if (!mesh.visible) continue;
      // cheap LOD: far groups update less often
      const near = g.list.some(c => Math.abs(c.pos.x - playerPos.x) + Math.abs(c.pos.z - playerPos.z) < 260);
      if (!near && (Math.floor(t * 60) % 8)) continue;
      for (const L of g.leaders) this.steer(g, L, dt, playerPos, true);
      g.list.forEach((c, i) => {
        if (c.leader) {
          const wob = tmp.set(Math.sin(t * 0.7 + i), Math.sin(t * 0.9 + i * 1.3) * 0.5, Math.cos(t * 0.6 + i * 0.7)).multiplyScalar(sp.tight ? 1.2 : 2);
          const goal = wob.add(c.off).add(c.leader.pos);
          const want = goal.sub(c.pos);
          const dist = want.length();
          want.normalize().multiplyScalar(Math.min(sp.speed * 1.6, dist * 1.5 + sp.speed * 0.4));
          this.avoidPlayer(g, c, want, playerPos);
          c.vel.lerp(want, Math.min(1, dt * 2.5));
          c.pos.addScaledVector(c.vel, dt);
          const fl = groundHeight(c.pos.x, c.pos.z) + 1;
          if (c.pos.y < fl) c.pos.y = fl;
          if (c.pos.y > -0.8) c.pos.y = -0.8;
        } else this.steer(g, c, dt, playerPos, false);
        this.pose(g, c, m4, fwd, side, upv, t, i);
        mesh.setMatrixAt(i, m4);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  avoidPlayer(g, c, want, p) {
    if (!g.sp.flee) return;
    const d = c.pos.distanceTo(p);
    if (d < 7) want.add(c.pos.clone().sub(p).normalize().multiplyScalar((7 - d) * 1.5));
  }

  steer(g, c, dt, playerPos, isLeader) {
    const { sp } = g;
    if (sp.behave === 'static') return;
    if (sp.behave === 'circle') {
      const k = c.circ;
      k.a += dt * sp.speed / k.R * k.dir;
      const zc = g.zone;
      const x = zc.c[0] + Math.cos(k.a) * k.R * 1.6 + Math.sin(k.a * 0.3) * 20;
      const z = zc.c[1] + Math.sin(k.a) * k.R * 1.2;
      const fl = groundHeight(x, z) + sp.size * 0.35 + 3;
      const yb = sp.id === 'sea_dragon' ? -110 + Math.sin(k.a * 2) * 12 : lerp(zc.y[0], zc.y[1], 0.5 + 0.4 * Math.sin(k.a * 0.7));
      const goal = new THREE.Vector3(x, Math.max(fl, Math.min(yb, -sp.size * 0.3 - 1)), z);
      const want = goal.sub(c.pos);
      c.vel.lerp(want.normalize().multiplyScalar(sp.speed), Math.min(1, dt * 0.8));
      c.pos.addScaledVector(c.vel, dt);
      return;
    }
    const to = c.target.clone().sub(c.pos);
    const d = to.length();
    if (d < 2 + sp.size) this.newTarget(g, c);
    let speed = sp.speed;
    if (sp.behave === 'crawl') { to.y = 0; speed *= 0.8 + 0.4 * Math.sin(c.t += dt); }
    const want = to.normalize().multiplyScalar(speed);
    if (sp.behave === 'drift') { want.multiplyScalar(0.6); want.y += Math.sin((c.t += dt) * 1.3) * 0.3; }
    this.avoidPlayer(g, c, want, playerPos);
    c.vel.lerp(want, Math.min(1, dt * (sp.size > 5 ? 0.35 : 1.2)));
    c.pos.addScaledVector(c.vel, dt);
    const fl = groundHeight(c.pos.x, c.pos.z);
    if (sp.behave === 'crawl') c.pos.y = fl + g.sy * 0.45;
    else if (c.pos.y < fl + g.sy * 0.6 + 0.5) { c.pos.y = fl + g.sy * 0.6 + 0.5; this.newTarget(g, c); }
    if (sp.zone === 'surface') c.pos.y = -0.7 + Math.sin(c.t * 1.2) * 0.1;
    if (c.pos.y > -0.8 && sp.zone !== 'surface') c.pos.y = -0.8;
  }

  pose(g, c, m4, fwd, side, upv, t, i) {
    const { sp, sx, sy } = g;
    if (sp.mode === 1) {
      m4.makeScale(sx, sy, 1).setPosition(c.pos);
      return;
    }
    const v = c.vel;
    if (sp.behave === 'static') {
      fwd.set(Math.cos(c.yaw), 0, Math.sin(c.yaw));
    } else if (v.lengthSq() > 1e-4) {
      fwd.copy(v).normalize();
      // limit pitch so fish don't swim straight up
      const maxPitch = sp.behave === 'crawl' ? 0.05 : 0.55;
      const h = Math.hypot(fwd.x, fwd.z) || 1e-3;
      const pitch = Math.max(-maxPitch, Math.min(maxPitch, Math.atan2(fwd.y, h)));
      fwd.set(fwd.x / h * Math.cos(pitch), Math.sin(pitch), fwd.z / h * Math.cos(pitch));
      c.lastFwd = (c.lastFwd || fwd.clone()).lerp(fwd, 0.15).normalize();
      fwd.copy(c.lastFwd);
    } else fwd.copy(c.lastFwd || fwd.set(1, 0, 0));
    side.crossVectors(fwd, up).normalize();
    upv.crossVectors(side, fwd).normalize();
    if (sp.mode === 2) {
      // flat: local x = forward, local y (up in sheet) = side, local z = up
      m4.makeBasis(fwd.clone().multiplyScalar(sx), upv.clone().multiplyScalar(1), side.clone().multiplyScalar(-sy));
      // our flat shader maps the plane's y to -z, so column 2 carries the sprite height
    } else {
      m4.makeBasis(fwd.clone().multiplyScalar(sx), upv.clone().multiplyScalar(sy), side.clone().multiplyScalar(-(0.3 + sx * 0.3)));
    }
    m4.setPosition(c.pos);
  }

  // closest creature near the screen centre, for the camera
  findTarget(camPos, camDir, maxAngle = 0.2) {
    let best = null, bestScore = Infinity;
    const tmp = new THREE.Vector3();
    for (const g of this.groups) {
      if (!g.mesh.visible) continue;
      const reach = 14 + g.sp.size * 3;
      for (const c of g.list) {
        tmp.copy(c.pos).sub(camPos);
        const d = tmp.length();
        if (d > reach || d < 0.5) continue;
        const ang = Math.acos(Math.min(1, tmp.dot(camDir) / d));
        const allow = maxAngle + Math.atan(g.sp.size * 0.5 / d);
        if (ang > allow) continue;
        const score = ang / allow + d / reach * 0.5;
        if (score < bestScore) { bestScore = score; best = { sp: g.sp, pos: c.pos.clone(), dist: d }; }
      }
    }
    return best;
  }
}
