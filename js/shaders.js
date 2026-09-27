// Shared underwater lighting for every custom material: depth-dependent sunlight,
// animated caustics, the player's headlamp and fog. All materials share one uniform
// object (U) so main.js updates them once per frame.
import * as THREE from './three.module.min.js';

export const U = {
  uTime: { value: 0 },
  uCamPos: { value: new THREE.Vector3() },
  uFogColor: { value: new THREE.Color() },
  uFogDensity: { value: 0.01 },
  uSun: { value: 1 },                         // sunlight scale at the camera depth
  uLampPos: { value: new THREE.Vector3() },
  uLampDir: { value: new THREE.Vector3(0, 0, -1) },
  uLampOn: { value: 0 },
  uLampRange: { value: 45 },
  uAwake: { value: 0 },                       // Atlantis awakening glow 0..1
};

export const COMMON = /* glsl */`
uniform float uTime;
uniform vec3 uCamPos;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uSun;
uniform vec3 uLampPos;
uniform vec3 uLampDir;
uniform float uLampOn;
uniform float uLampRange;
uniform float uAwake;

// sunlight reaching depth y (y<0 underwater): fades and turns blue
vec3 sunAt(float y) {
  float d = max(-y, 0.0);
  vec3 att = exp(-d * vec3(0.045, 0.022, 0.016));
  return att;
}

// cheap caustic pattern (two moving warped sine grids)
float caustic(vec3 p) {
  vec2 q = p.xz * 0.35;
  float t = uTime * 0.8;
  vec2 w = q + vec2(sin(q.y * 1.7 + t), cos(q.x * 1.3 - t * 0.9)) * 0.6;
  float c = sin(w.x * 2.1 + t) * sin(w.y * 2.3 - t * 0.7);
  float c2 = sin((w.x + w.y) * 1.6 - t * 1.1) * sin((w.x - w.y) * 1.9 + t * 0.6);
  float v = abs(c + c2 * 0.8);
  return pow(clamp(1.0 - v, 0.0, 1.0), 4.0);
}

// headlamp: spot cone from the player
float lamp(vec3 p, vec3 n, bool twoSided) {
  if (uLampOn < 0.01) return 0.0;
  vec3 L = p - uLampPos;
  float dist = length(L);
  L /= max(dist, 1e-3);
  float cone = smoothstep(0.70, 0.9, dot(L, uLampDir));
  float fall = clamp(1.0 - dist / uLampRange, 0.0, 1.0);
  float ndl = twoSided ? 0.8 : clamp(dot(n, -L) * 0.7 + 0.3, 0.0, 1.0);
  return uLampOn * (cone * fall * fall * ndl * 2.2 + clamp(1.0 - dist / 14.0, 0.0, 1.0) * 0.25);
}

vec3 applyFog(vec3 col, vec3 p) {
  float d = length(p - uCamPos);
  float f = 1.0 - exp(-pow(d * uFogDensity, 1.35));
  return mix(col, uFogColor, clamp(f, 0.0, 1.0));
}
`;

// ---------- world surfaces (terrain, rocks, ruins): triplanar textures ----------
export function worldMaterial({ top, side, scale = 0.12, tint = [1, 1, 1], blendByHeight = null, emissive = 0 }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...U,
      tTop: { value: top }, tSide: { value: side }, tMud: { value: blendByHeight },
      uScale: { value: scale }, uTint: { value: new THREE.Vector3(...tint) },
      uUseMud: { value: blendByHeight ? 1 : 0 }, uEmissive: { value: emissive },
    },
    vertexShader: /* glsl */`
      varying vec3 vPos; varying vec3 vNrm;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        #ifdef USE_INSTANCING
          wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vNrm = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        #else
          vNrm = normalize(mat3(modelMatrix) * normal);
        #endif
        vPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: COMMON + /* glsl */`
      uniform sampler2D tTop, tSide, tMud; uniform float uScale, uUseMud, uEmissive; uniform vec3 uTint;
      varying vec3 vPos; varying vec3 vNrm;
      void main() {
        vec3 n = normalize(vNrm);
        vec3 b = pow(abs(n), vec3(4.0)); b /= (b.x + b.y + b.z);
        vec3 p = vPos * uScale;
        vec3 topC = texture2D(tTop, p.xz).rgb;
        if (uUseMud > 0.5) {
          vec3 mudC = texture2D(tMud, p.xz * 0.7).rgb;
          topC = mix(topC, mudC, smoothstep(-70.0, -130.0, vPos.y));
        }
        vec3 sx = texture2D(tSide, p.zy).rgb, sz = texture2D(tSide, p.xy).rgb;
        float up = smoothstep(0.55, 0.8, n.y);
        float sw = b.x + b.z + 1e-4;
        vec3 sideC = (sx * b.x + sz * b.z) / sw;
        vec3 col = mix(sideC, topC, max(up, b.y * 0.5)) * uTint;
        vec3 sun = sunAt(vPos.y);
        float ndl = clamp(n.y * 0.6 + 0.4, 0.0, 1.0);
        vec3 light = sun * (0.35 + 0.75 * ndl) + vec3(0.03, 0.05, 0.09);
        light += sun * caustic(vPos) * 0.6 * smoothstep(-0.2, 0.6, n.y);
        light += vec3(1.0, 0.95, 0.8) * lamp(vPos, n, false);
        col *= light;
        col += uEmissive * uTint * vec3(0.2, 0.6, 0.7) * (0.6 + uAwake);
        gl_FragColor = vec4(applyFog(col, vPos), 1.0);
      }`,
  });
}

// ---------- sprite creatures & plants ----------
// mode 0: "paper" plane along the swim direction, wiggling tail (fish)
// mode 1: cylindrical billboard facing the camera with a pulse (jellies, octopus)
// mode 2: flat horizontal plane flapping its wings (manta, starfish)
// mode 3: plant: sways, anchored at the bottom edge
export function spriteMaterial(tex, { mode = 0, wiggle = 0.15, speed = 6, selfLit = 0, glow = [0, 0, 0] } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...U, tMap: { value: tex }, uMode: { value: mode }, uWiggle: { value: wiggle },
      uSpeed: { value: speed }, uSelfLit: { value: selfLit }, uGlow: { value: new THREE.Vector3(...glow) },
    },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      uniform float uTime, uMode, uWiggle, uSpeed; uniform vec3 uCamPos;
      attribute float aPhase;
      varying vec2 vUv; varying vec3 vPos; varying float vPhase;
      void main() {
        vUv = uv;
        vec3 p = position;                    // plane spans -0.5..0.5 in x and y
        float ph = aPhase;
        vPhase = ph;
        mat4 im = instanceMatrix;
        vec3 wp;
        if (uMode < 0.5) {
          float tail = smoothstep(0.35, -0.5, p.x);
          p.z += sin(uTime * uSpeed + ph * 6.28 + p.x * 3.0) * uWiggle * (0.25 + tail);
          wp = (modelMatrix * im * vec4(p, 1.0)).xyz;
        } else if (uMode < 1.5) {
          vec3 c = (modelMatrix * im * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float sx = length(im[0].xyz), sy = length(im[1].xyz);
          float pulse = sin(uTime * uSpeed * 0.5 + ph * 6.28);
          p.x *= 1.0 + pulse * uWiggle * (0.6 - p.y);
          p.y *= 1.0 - pulse * uWiggle * 0.4;
          vec3 toCam = uCamPos - c; toCam.y = 0.0; toCam = normalize(toCam + vec3(1e-4, 0.0, 0.0));
          vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
          wp = c + right * p.x * sx + vec3(0.0, 1.0, 0.0) * p.y * sy;
        } else if (uMode < 2.5) {
          float wing = abs(p.y) * 2.0;
          vec3 q = vec3(p.x, 0.0, -p.y);
          q.y += sin(uTime * uSpeed + ph * 6.28 - p.x * 1.5) * uWiggle * wing * wing;
          wp = (modelMatrix * im * vec4(q, 1.0)).xyz;
        } else {
          float h = p.y + 0.5;
          p.x += sin(uTime * 1.3 + ph * 6.28) * uWiggle * h * h;
          p.z += cos(uTime * 1.1 + ph * 5.0) * uWiggle * h * h * 0.6;
          wp = (modelMatrix * im * vec4(p, 1.0)).xyz;
        }
        vPos = wp;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: COMMON + /* glsl */`
      uniform sampler2D tMap; uniform float uSelfLit; uniform vec3 uGlow;
      varying vec2 vUv; varying vec3 vPos; varying float vPhase;
      void main() {
        vec4 t = texture2D(tMap, vUv);
        if (t.a < 0.5) discard;
        vec3 sun = sunAt(vPos.y);
        vec3 light = sun * (0.85 + caustic(vPos) * 0.5) + vec3(0.05, 0.07, 0.11);
        light += vec3(1.0, 0.95, 0.85) * lamp(vPos, vec3(0.0, 1.0, 0.0), true);
        light = max(light, vec3(uSelfLit));
        vec3 col = t.rgb * light;
        // glowing bits: bright, saturated pixels of deep-sea creatures light up
        float lum = max(t.r, max(t.g, t.b));
        float sat = lum - min(t.r, min(t.g, t.b));
        float g = smoothstep(0.55, 0.9, lum) * smoothstep(0.25, 0.5, sat);
        col += t.rgb * g * uGlow.x * (0.8 + 0.2 * sin(uTime * 3.0 + vPhase * 6.28));
        gl_FragColor = vec4(applyFog(col, vPos), 1.0);
      }`,
  });
}
