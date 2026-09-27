// The player: a little yellow submarine and a chibi diver who can leave it.
import * as THREE from './three.module.min.js';
import { groundHeight, pushOut, BOUNDS } from './world.js';

const toonGrad = (() => {
  const d = new Uint8Array([90, 170, 255]);
  const t = new THREE.DataTexture(d, 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true;
  return t;
})();
const toon = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap: toonGrad, emissive: new THREE.Color(color).multiplyScalar(0.18), ...extra });

function outline(mesh, s = 1.06) {
  const o = new THREE.Mesh(mesh.geometry, new THREE.MeshBasicMaterial({ color: 0x14213d, side: THREE.BackSide }));
  o.scale.setScalar(s);
  mesh.add(o);
  return mesh;
}

// model faces -z
function makeSub() {
  const g = new THREE.Group();
  const yellow = toon(0xffc93c), orange = toon(0xff8c42), dark = toon(0x2b3a55);
  const body = outline(new THREE.Mesh(new THREE.SphereGeometry(1.3, 32, 20), yellow), 1.05);
  body.scale.set(1, 0.9, 1.45);
  g.add(body);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.75, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshPhongMaterial({ color: 0x9be7ff, transparent: true, opacity: 0.55, shininess: 120, specular: 0xffffff }));
  dome.position.set(0, 0.95, -0.45);
  g.add(dome);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.76, 0.08, 8, 24), orange);
  ring.rotation.x = Math.PI / 2; ring.position.copy(dome.position);
  g.add(ring);
  for (const sx of [-1, 1]) {
    for (const z of [-0.4, 0.45]) {
      const port = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.06, 8, 18), orange);
      port.position.set(sx * 1.23, 0.1, z); port.rotation.y = Math.PI / 2;
      const glass = new THREE.Mesh(new THREE.CircleGeometry(0.2, 16), new THREE.MeshBasicMaterial({ color: 0x66d9ff }));
      glass.position.set(sx * 1.25, 0.1, z); glass.rotation.y = sx * Math.PI / 2;
      g.add(port, glass);
    }
    const fin = outline(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.6), orange), 1.1);
    fin.position.set(sx * 1.2, -0.25, 0.9);
    g.add(fin);
  }
  const tailV = outline(new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.7), orange), 1.1);
  tailV.position.set(0, 0.3, 1.85);
  g.add(tailV);
  const hub = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.5, 12).rotateX(Math.PI / 2), dark);
  hub.position.set(0, 0, 2.05);
  g.add(hub);
  const prop = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.75, 0.05), dark);
    b.position.y = 0.38; const p = new THREE.Group(); p.add(b); p.rotation.z = (i / 3) * Math.PI * 2; prop.add(p);
  }
  prop.position.set(0, 0, 2.3);
  g.add(prop);
  const peri = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.8, 8), dark);
  peri.position.set(0.35, 1.35, 0.3);
  const periTop = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.35), dark);
  periTop.position.set(0.35, 1.72, 0.18);
  g.add(peri, periTop);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff3b0 });
  for (const sx of [-0.55, 0.55]) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), lampMat);
    l.position.set(sx, -0.35, -1.75);
    g.add(l);
  }
  g.userData = { prop, lampMat };
  return g;
}

function makeDiver() {
  const g = new THREE.Group();          // pivot at body centre, faces -z
  const suit = toon(0xff7b54), brass = toon(0xf2b134), tank = toon(0xb8c4d6), fins = toon(0x3ec1d3), skin = toon(0xffd6b0);
  const body = outline(new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.45, 6, 12), suit));
  g.add(body);
  const helmet = outline(new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 16), brass), 1.05);
  helmet.position.y = 0.72;
  g.add(helmet);
  const visor = new THREE.Mesh(new THREE.CircleGeometry(0.26, 24), new THREE.MeshPhongMaterial({ color: 0x7fdfff, shininess: 100, specular: 0xffffff }));
  visor.position.set(0, 0.74, -0.41);
  visor.rotation.y = Math.PI;
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.2, 20), skin);
  face.position.set(0, 0.74, -0.38); face.rotation.y = Math.PI;
  const eyeM = new THREE.MeshBasicMaterial({ color: 0x1b1b2f });
  for (const sx of [-0.07, 0.07]) {
    const e = new THREE.Mesh(new THREE.CircleGeometry(0.03, 10), eyeM);
    e.position.set(sx, 0.77, -0.395); e.rotation.y = Math.PI; g.add(e);
  }
  g.add(face, visor);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff3b0 }));
  lamp.position.set(0, 1.1, -0.25);
  g.add(lamp);
  const tk = outline(new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.45, 4, 10), tank));
  tk.position.set(0, 0.05, 0.33);
  g.add(tk);
  const limb = (x, y, len, mat) => {
    const piv = new THREE.Group(); piv.position.set(x, y, 0);
    const m = outline(new THREE.Mesh(new THREE.CapsuleGeometry(0.1, len, 4, 8), mat));
    m.position.y = -len / 2 - 0.05; piv.add(m); g.add(piv); return piv;
  };
  const armL = limb(-0.36, 0.25, 0.35, suit), armR = limb(0.36, 0.25, 0.35, suit);
  const legL = limb(-0.15, -0.45, 0.4, suit), legR = limb(0.15, -0.45, 0.4, suit);
  for (const leg of [legL, legR]) {
    const f = outline(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.45), fins), 1.15);
    f.position.set(0, -0.7, 0.12); leg.add(f);
  }
  g.userData = { armL, armR, legL, legR };
  return g;
}

export class Player {
  constructor(scene) {
    this.sub = makeSub();
    this.diver = makeDiver();
    scene.add(this.sub, this.diver);
    this.diver.visible = false;
    this.subPos = new THREE.Vector3(0, -8, -20);
    this.subYaw = 0;
    this.pos = this.subPos.clone();
    this.vel = new THREE.Vector3();
    this.inSub = true;
    this.oxygen = 1;
    this.lampOn = false;
    this.camYaw = 0; this.camPitch = -0.15; this.camDist = 9;
    this.yaw = 0; this.pitch = 0;
    this.input = { x: 0, y: 0, up: 0, down: 0 };
    this.camera = null;
    this.t = 0;
  }

  get radius() { return this.inSub ? 1.9 : 0.5; }
  get speed() { return this.inSub ? 10 : 4.5; }

  toggleSub() {
    if (this.inSub) {
      // step out beside the sub
      this.inSub = false;
      this.subPos.copy(this.pos);
      this.subYaw = this.yaw;
      const side = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).multiplyScalar(-2.8);
      this.pos.add(side);
      this.diver.visible = true;
      this.camDist = 4.5;
      return 'out';
    }
    if (this.pos.distanceTo(this.subPos) < 6) {
      this.inSub = true;
      this.pos.copy(this.subPos);
      this.diver.visible = false;
      this.oxygen = 1;
      this.camDist = 9;
      return 'in';
    }
    return 'far';
  }

  returnToSub() {
    this.pos.copy(this.subPos);
    this.inSub = true; this.diver.visible = false; this.oxygen = 1; this.camDist = 9;
  }

  update(dt, camera) {
    this.t += dt;
    const inp = this.input;
    // swim toward where the camera looks
    const fwd = new THREE.Vector3(-Math.sin(this.camYaw) * Math.cos(this.camPitch), Math.sin(this.camPitch), -Math.cos(this.camYaw) * Math.cos(this.camPitch));
    const right = new THREE.Vector3(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
    const want = new THREE.Vector3()
      .addScaledVector(fwd, inp.y)
      .addScaledVector(right, inp.x)
      .add(new THREE.Vector3(0, inp.up - inp.down, 0));
    if (want.lengthSq() > 1) want.normalize();
    want.multiplyScalar(this.speed);
    this.vel.lerp(want, Math.min(1, dt * (this.inSub ? 1.6 : 3)));
    this.pos.addScaledVector(this.vel, dt);

    // world limits
    const r = this.radius;
    this.pos.x = Math.min(BOUNDS.x1, Math.max(BOUNDS.x0, this.pos.x));
    this.pos.z = Math.min(BOUNDS.z1, Math.max(BOUNDS.z0, this.pos.z));
    pushOut(this.pos, r);
    const fl = groundHeight(this.pos.x, this.pos.z) + r * 0.8;
    if (this.pos.y < fl) { this.pos.y = fl; this.vel.y = Math.max(0, this.vel.y); }
    if (this.pos.y > -r * 0.5) { this.pos.y = -r * 0.5; this.vel.y = Math.min(0, this.vel.y); }

    // face the direction of travel (or the camera when idle)
    const hv = Math.hypot(this.vel.x, this.vel.z);
    if (hv > 0.5) {
      const target = Math.atan2(-this.vel.x, -this.vel.z);
      let d = target - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * (this.inSub ? 2.5 : 6));
    }
    const targetPitch = Math.atan2(this.vel.y, Math.max(hv, 1)) * 0.6;
    this.pitch += (targetPitch - this.pitch) * Math.min(1, dt * 3);

    const moving = this.vel.length() / this.speed;
    if (this.inSub) {
      this.sub.position.copy(this.pos);
      this.sub.position.y += Math.sin(this.t * 1.5) * 0.06;
      this.sub.rotation.set(this.pitch, this.yaw, -Math.max(-0.3, Math.min(0.3, (inp.x * 0.25))), 'YXZ');
      this.sub.userData.prop.rotation.z += dt * (2 + moving * 25);
    } else {
      this.sub.position.copy(this.subPos);
      this.sub.position.y += Math.sin(this.t * 1.2) * 0.1;
      this.sub.rotation.set(0, this.subYaw, 0);
      this.sub.userData.prop.rotation.z += dt * 1.5;
      this.diver.position.copy(this.pos);
      const swimPitch = -moving * 1.2 + this.pitch;
      this.diver.rotation.set(swimPitch, this.yaw, 0, 'YXZ');
      const u = this.diver.userData, k = this.t * (3 + moving * 6);
      u.legL.rotation.x = Math.sin(k) * (0.2 + moving * 0.5);
      u.legR.rotation.x = -Math.sin(k) * (0.2 + moving * 0.5);
      u.armL.rotation.x = -0.3 + Math.sin(this.t * 1.5) * 0.25 - moving * 2.4;
      u.armR.rotation.x = -0.3 - Math.sin(this.t * 1.5) * 0.25 - moving * 2.4;
      u.armL.rotation.z = -0.25; u.armR.rotation.z = 0.25;
      // oxygen drains faster deeper
      this.oxygen -= dt / (150 - Math.min(90, -this.pos.y * 0.3));
    }

    // third-person camera
    const cd = this.camDist;
    const target = this.pos.clone().add(new THREE.Vector3(0, this.inSub ? 2.7 : 1.2, 0));
    const back = new THREE.Vector3(Math.sin(this.camYaw) * Math.cos(this.camPitch), -Math.sin(this.camPitch), Math.cos(this.camYaw) * Math.cos(this.camPitch));
    const cp = target.clone().addScaledVector(back, cd);
    const cfl = groundHeight(cp.x, cp.z) + 0.8;
    if (cp.y < cfl) cp.y = cfl;
    if (cp.y > -0.4) cp.y = -0.4;
    camera.position.lerp(cp, Math.min(1, dt * 8));
    camera.lookAt(target);
  }

  // headlamp origin/direction for the shaders
  lamp(out) {
    const f = new THREE.Vector3(-Math.sin(this.camYaw) * Math.cos(this.camPitch), Math.sin(this.camPitch), -Math.cos(this.camYaw) * Math.cos(this.camPitch));
    out.pos.copy(this.pos).addScaledVector(f, this.inSub ? 1.5 : 0.3);
    out.pos.y += this.inSub ? 0 : 0.9;
    out.dir.copy(f).normalize();
  }
}
