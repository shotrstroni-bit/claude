import * as THREE from 'three';
import { smin, ellipsoid as E, roundCone as RC, meshSDF } from './sdf.js';

// Units are meters; y is up, the character faces +z. Arm joints are for the +x side and mirrored.
const ARM = {
  S: [0.155, 1.345, -0.012],
  E: [0.3, 1.15, -0.045],
  W: [0.214, 1.0, 0.0],
  H: [0.198, 0.93, 0.03]
};
const smax = (a, b, k) => -smin(-a, -b, k);

function torsoAndLegs(x, y, z) {
  let d = E(x, y, z, 0, 1.255, -0.005, 0.122, 0.15, 0.092);
  d = smin(d, E(x, y, z, 0, 1.335, -0.014, 0.148, 0.058, 0.076), 0.05);
  d = smin(d, E(x, y, z, 0, 1.1, 0, 0.084, 0.11, 0.07), 0.06);
  d = smin(d, E(x, y, z, 0, 0.915, -0.008, 0.195, 0.135, 0.125), 0.08);
  d = smin(d, RC(x, y, z, [0, 1.33, -0.012], [0, 1.47, 0], 0.043, 0.038), 0.03);
  const ax = Math.abs(x);
  d = smin(d, E(ax, y, z, 0.088, 0.862, -0.058, 0.104, 0.11, 0.104), 0.04);
  d = smin(d, E(ax, y, z, 0.068, 1.214, 0.055, 0.082, 0.078, 0.078), 0.045);
  d = smin(d, E(x, y, z, 0, 1.205, 0.075, 0.05, 0.055, 0.05), 0.03);
  d = smin(d, E(ax, y, z, 0.15, 1.335, -0.012, 0.052, 0.05, 0.052), 0.03);
  d = smin(d, RC(ax, y, z, [0.1, 0.86, 0], [0.072, 0.5, 0.008], 0.118, 0.056), 0.04);
  d = smin(d, E(ax, y, z, 0.104, 0.7, 0, 0.11, 0.17, 0.106), 0.05);
  d = smin(d, E(ax, y, z, 0.086, 0.575, 0.004, 0.072, 0.11, 0.072), 0.05);
  d = smin(d, RC(ax, y, z, [0.072, 0.5, 0.008], [0.066, 0.1, -0.012], 0.055, 0.034), 0.035);
  d = smin(d, E(ax, y, z, 0.077, 0.375, -0.02, 0.057, 0.11, 0.057), 0.03);
  d = smin(d, RC(ax, y, z, [0.066, 0.075, -0.025], [0.08, 0.035, 0.12], 0.046, 0.033), 0.025);
  d = smin(d, E(ax, y, z, 0.066, 0.05, -0.03, 0.045, 0.05, 0.05), 0.02);
  return Math.max(d, -y);
}

function arms(x, y, z) {
  const ax = Math.abs(x);
  let d = RC(ax, y, z, ARM.S, ARM.E, 0.046, 0.034);
  d = smin(d, RC(ax, y, z, ARM.E, ARM.W, 0.033, 0.026), 0.01);
  d = smin(d, RC(ax, y, z, ARM.W, ARM.H, 0.028, 0.02), 0.012);
  d = smin(d, E(ax, y, z, 0.205, 0.965, 0.018, 0.026, 0.042, 0.034), 0.012);
  return d;
}

const body = (x, y, z) => smin(torsoAndLegs(x, y, z), arms(x, y, z), 0.008);

function head(x, y, z) {
  let d = E(x, y, z, 0, 1.585, -0.012, 0.084, 0.088, 0.09);
  d = smin(d, E(x, y, z, 0, 1.53, 0.01, 0.07, 0.08, 0.074), 0.035);
  d = smin(d, E(x, y, z, 0, 1.47, 0.028, 0.026, 0.026, 0.03), 0.035);
  d = smin(d, E(Math.abs(x), y, z, 0.082, 1.545, -0.005, 0.011, 0.024, 0.017), 0.006);
  return d;
}

function hair(x, y, z) {
  let h = E(x, y, z, 0, 1.594, -0.016, 0.097, 0.1, 0.102);
  h = smin(h, E(x, y, z, 0, 1.52, -0.024, 0.101, 0.118, 0.098), 0.04);
  h = smin(h, E(x, y, z, 0, 1.445, -0.022, 0.1, 0.05, 0.094), 0.03);
  h = smax(h, 1.418 - y + 0.005 * Math.cos(Math.atan2(x, z) * 7), 0.012);
  h = smax(h, -E(x, y, z, 0.012, 1.5, 0.088, 0.071, 0.09, 0.1), 0.008);
  h = smin(h, RC(x, y, z, [0.014, 1.605, 0.082], [-0.052, 1.552, 0.088], 0.02, 0.011), 0.022);
  h = smin(h, RC(x, y, z, [-0.064, 1.62, 0.05], [-0.077, 1.44, 0.05], 0.022, 0.009), 0.02);
  h = smin(h, RC(x, y, z, [0.07, 1.63, 0.045], [0.083, 1.47, 0.04], 0.018, 0.008), 0.02);
  return h;
}

const TOON = /* glsl */ `
uniform vec3 uLightDir;
uniform vec3 uFogColor;
uniform vec2 uFog;
varying vec3 vPos;
varying vec3 vNW;
varying vec3 vWPos;
uniform float uBias;
vec3 toon(vec3 albedo, vec3 tint, float gloss, out float lit) {
  vec3 N = normalize(vNW);
  vec3 L = normalize(uLightDir);
  vec3 V = normalize(cameraPosition - vWPos);
  float ndl = dot(N, L);
  lit = smoothstep(0.0, 0.05, ndl + uBias);
  vec3 c = albedo * mix(tint, vec3(1.0), lit);
  c += albedo * smoothstep(0.6, 0.66, ndl) * 0.07;
  float rim = smoothstep(0.66, 0.74, 1.0 - max(dot(N, V), 0.0));
  c += rim * vec3(0.72, 0.88, 1.0) * (0.12 + 0.22 * lit);
  vec3 Hh = normalize(L + V);
  if (gloss > 0.0) c += smoothstep(0.955, 0.97, dot(N, Hh)) * gloss * lit;
  if (gloss < 0.0) c += smoothstep(0.7, 0.95, dot(N, Hh)) * -gloss * lit;
  float f = smoothstep(uFog.x, uFog.y, length(vWPos - cameraPosition));
  return mix(c, uFogColor, f);
}
`;

const VERT = /* glsl */ `
attribute float aArm;
varying vec3 vPos;
varying vec3 vNW;
varying vec3 vWPos;
varying float vArm;
varying vec3 vN;
void main() {
  vPos = position;
  vN = normal;
  vArm = aArm;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWPos = wp.xyz;
  vNW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const BODY_FRAG = /* glsl */ `
${TOON}
uniform vec3 uS; uniform vec3 uE; uniform vec3 uW; uniform vec3 uH;
varying float vArm;
float segT(vec3 p, vec3 a, vec3 b) { vec3 ba = b - a; return clamp(dot(p - a, ba) / dot(ba, ba), 0.0, 1.0); }
float segD(vec3 p, vec3 a, vec3 b) { return length(p - a - (b - a) * segT(p, a, b)); }
float band(float v, float w) { return 1.0 - smoothstep(w * 0.6, w, abs(v)); }
void main() {
  vec3 p = vPos;
  vec3 SKIN = vec3(1.0, 0.885, 0.82);
  vec3 skinTint = vec3(0.95, 0.72, 0.72);
  vec3 clothTint = vec3(0.74, 0.72, 0.87);
  vec3 albedo; vec3 tint = clothTint; float gloss = 0.0;
  float ax = abs(p.x);

  if (vArm < 0.0) {
    vec3 q = vec3(ax, p.y, p.z);
    float d1 = segD(q, uS, uE), d2 = segD(q, uE, uW), d3 = segD(q, uW, uH);
    float t2 = segT(q, uE, uW);
    bool hand = (d3 < d2 && segT(q, uW, uH) > 0.02) || (d2 <= d1 && t2 > 0.93);
    if (hand) { albedo = SKIN; tint = skinTint; }
    else if (d2 <= d1 && t2 > 0.84) { albedo = vec3(0.16, 0.17, 0.21); }
    else {
      float s = d1 < d2 ? segT(q, uS, uE) * length(uE - uS) : length(uE - uS) + t2 * length(uW - uE);
      float st = smoothstep(0.33, 0.37, fract(s / 0.03)) * (1.0 - smoothstep(0.96, 1.0, fract(s / 0.03)));
      albedo = mix(vec3(0.17, 0.18, 0.22), vec3(0.965, 0.97, 0.985), st);
    }
  } else if (p.y > 1.36 && length(p.xz - vec2(0.0, -0.004)) < 0.054 - 0.01 * smoothstep(1.4, 1.36, p.y)) {
    albedo = SKIN; tint = skinTint;
  } else if (p.y > 1.046) {
    float w = 0.04 + 0.013 * exp(-pow((p.y - 1.212) / 0.055, 2.0));
    bool shirt = p.z > 0.015 && ax < w;
    if (shirt) {
      float bow = 0.011 * exp(-pow((ax - 0.07) / 0.05, 2.0)) * exp(-pow((p.y - 1.21) / 0.06, 2.0));
      float sy = fract((p.y + bow) / 0.029);
      float st = smoothstep(0.34, 0.38, sy) * (1.0 - smoothstep(0.96, 1.0, sy));
      albedo = mix(vec3(0.17, 0.18, 0.22), vec3(0.965, 0.97, 0.985), st);
      if (p.y > 1.375) albedo = vec3(0.965, 0.97, 0.985);
    } else {
      albedo = vec3(0.13, 0.135, 0.17);
      gloss = -0.1;
      if (p.z > 0.0 && abs(ax - w) < 0.0028) albedo = vec3(0.04, 0.04, 0.05);
    }
  } else if (p.y > 1.02) {
    albedo = vec3(0.5, 0.29, 0.17);
    gloss = 0.15;
    if (p.z > 0.0 && ax < 0.024) {
      bool ring = ax > 0.016 || abs(p.y - 1.033) > 0.0075;
      if (ring) { albedo = vec3(0.93, 0.76, 0.38); gloss = 0.6; }
    }
    if (p.z > 0.0 && abs(ax - 0.055) < 0.0045) albedo *= 0.7;
    if (abs(p.y - 1.041) < 0.0011 && fract(p.x * 120.0) < 0.5) albedo = vec3(0.68, 0.45, 0.28);
  } else if (p.y > 0.165) {
    albedo = vec3(0.37, 0.57, 0.83);
    tint = vec3(0.66, 0.68, 0.9);
    vec3 seam = vec3(0.2, 0.33, 0.58);
    vec3 stitch = vec3(0.93, 0.73, 0.42);
    if (p.y > 0.77 && ax < 0.0018) albedo = seam;
    if (p.z > 0.0 && p.y > 0.86 && abs(p.x - 0.017) < 0.0012 && fract(p.y / 0.008) < 0.6) albedo = stitch;
    if (p.z > 0.0 && ax > 0.05 && ax < 0.165) {
      float py = 1.02 - (ax - 0.05) * 0.9;
      if (abs(p.y - py) < 0.0016) albedo = seam;
      if (abs(p.y - py + 0.007) < 0.001 && fract(ax * 130.0) < 0.55) albedo = stitch;
    }
    if (p.z < -0.02 && ax > 0.03 && ax < 0.15 && p.y > 0.8 && p.y < 0.955) {
      float e = min(min(ax - 0.03, 0.15 - ax), min(p.y - 0.8 + (ax - 0.09) * (ax - 0.09) * 2.0, 0.955 - p.y));
      if (e < 0.0035 && fract((p.y + ax) * 130.0) < 0.55) albedo = stitch;
    }
    if (p.y < 0.177) albedo *= 0.82;
  } else {
    albedo = vec3(0.52, 0.31, 0.19);
    gloss = 0.3;
    if (p.y < 0.018) albedo = vec3(0.17, 0.1, 0.07);
  }
  float lit;
  gl_FragColor = vec4(toon(albedo, tint, gloss, lit), 1.0);
}
`;

const HEAD_FRAG = /* glsl */ `
${TOON}
uniform sampler2D uFace;
uniform float uK;
varying vec3 vN;
void main() {
  vec3 p = vPos;
  vec3 SKIN = vec3(1.0, 0.885, 0.82);
  float lit;
  vec3 c = toon(SKIN, vec3(0.95, 0.72, 0.72), 0.0, lit);
  vec2 uv = vec2((40.0 + p.x / uK) / 80.0, 1.0 - ((1.543 - p.y) / uK + 28.0) / 80.0);
  if (vN.z > 0.15 && uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) {
    vec4 t = texture2D(uFace, uv);
    c = mix(c, t.rgb * (0.88 + 0.12 * lit), t.a);
  }
  gl_FragColor = vec4(c, 1.0);
}
`;

const HAIR_FRAG = /* glsl */ `
${TOON}
void main() {
  vec3 p = vPos;
  float a = atan(p.x, p.z);
  vec3 albedo = mix(vec3(0.93, 0.7, 0.3), vec3(1.0, 0.9, 0.55), smoothstep(1.43, 1.66, p.y));
  albedo *= 0.97 + 0.03 * sin(a * 38.0);
  float lit;
  vec3 c = toon(albedo, vec3(0.88, 0.72, 0.64), 0.0, lit);
  float ring = 1.0 - smoothstep(0.0025, 0.005, abs(p.y - 1.636 - 0.0025 * sin(a * 10.0)));
  vec3 V = normalize(cameraPosition - vWPos);
  c += ring * smoothstep(0.2, 0.6, dot(normalize(vNW), V)) * vec3(1.0, 0.97, 0.82) * 0.3 * lit;
  gl_FragColor = vec4(c, 1.0);
}
`;

const OUTLINE_VERT = /* glsl */ `
uniform float uWidth;
void main() {
  vec4 wp = modelMatrix * vec4(position + normal * uWidth, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const OUTLINE_FRAG = /* glsl */ `
uniform vec3 uColor;
void main() { gl_FragColor = vec4(uColor, 1.0); }
`;

function faceSvg() {
  const OL = '#2a1a24';
  const eye = `
    <path d="M204 104 C210 99 224 98 232 103 C230 111 222 116 216 116 C210 116 206 112 204 104 Z" fill="#fff"/>
    <g clip-path="url(#ec)">
      <ellipse cx="218" cy="108" rx="7.2" ry="8.8" fill="url(#ir)"/>
      <ellipse cx="218" cy="109" rx="3.2" ry="4.6" fill="#0f2650"/>
      <path d="M204 100 C212 96 226 96 234 101 L234 106 C226 102 212 102 204 106 Z" fill="#6b3f4a" opacity=".25"/>
    </g>
    <circle cx="215" cy="105" r="2.3" fill="#fff"/><circle cx="221.5" cy="112" r="1.1" fill="#fff"/>
    <path d="M202 105 C208 96 226 94 236 99 L233 103 C224 99 211 99 204 107 Z" fill="${OL}"/>
    <path d="M233 103 L238 100" stroke="${OL}" stroke-width="2" stroke-linecap="round"/>
    <path d="M209 115 C214 117.5 222 117 228 112" stroke="#a8685a" stroke-width="1.1" fill="none" stroke-linecap="round"/>
    <path d="M206 97 C213 92 225 92 232 96" stroke="#c88b78" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    <path d="M207 90 C214 86 224 86 232 90" stroke="#8f6a3a" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="160 80 80 80" width="1024" height="1024">
<defs>
  <linearGradient id="ir" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d4f99"/><stop offset=".55" stop-color="#3b92dc"/><stop offset="1" stop-color="#8fd3ff"/></linearGradient>
  <clipPath id="ec"><path d="M204 104 C210 99 224 98 232 103 C230 111 222 116 216 116 C210 116 206 112 204 104 Z"/></clipPath>
</defs>
<ellipse cx="176" cy="125" rx="9" ry="4" fill="#ff8a98" opacity=".3"/>
<ellipse cx="224" cy="125" rx="9" ry="4" fill="#ff8a98" opacity=".3"/>
<g>${eye}</g>
<g transform="translate(400 0) scale(-1 1)">${eye}</g>
<path d="M200 121 C198.5 125 197.5 127 199.5 128.5" stroke="#c98a76" stroke-width="1.4" fill="none" stroke-linecap="round"/>
<path d="M193 139 C197 141.5 203 141.5 207 138" stroke="#9c4f52" stroke-width="1.8" fill="none" stroke-linecap="round"/>
<path d="M197 142.5 C200 144 203 144 205 142.5" stroke="#e9a19c" stroke-width="1.4" fill="none" stroke-linecap="round"/>
</svg>`;
}

function loadFaceTexture() {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const tex = new THREE.Texture(img);
      tex.anisotropy = 8;
      tex.needsUpdate = true;
      resolve(tex);
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(faceSvg());
  });
}

function geometryFrom(m) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(m.normal, 3));
  g.setAttribute('aArm', new THREE.BufferAttribute(m.extra || new Float32Array(m.position.length / 3).fill(1), 1));
  g.setIndex(new THREE.BufferAttribute(m.index, 1));
  g.computeBoundingSphere();
  return g;
}

export function sharedUniforms() {
  return {
    uLightDir: { value: new THREE.Vector3(-0.45, 0.8, 0.65).normalize() },
    uFogColor: { value: new THREE.Color(0.8, 0.9, 1.0) },
    uFog: { value: new THREE.Vector2(90, 380) }
  };
}

export async function buildAndroid18(shared) {
  const t0 = performance.now();
  const bodyMesh = meshSDF(body, [-0.37, -0.01, -0.2], [0.37, 1.49, 0.23], 0.006,
    (x, y, z) => arms(x, y, z) - torsoAndLegs(x, y, z));
  const headMesh = meshSDF(head, [-0.11, 1.42, -0.12], [0.11, 1.69, 0.13], 0.003);
  const hairMesh = meshSDF(hair, [-0.13, 1.38, -0.14], [0.13, 1.71, 0.15], 0.003);
  const face = await loadFaceTexture();
  const buildMs = Math.round(performance.now() - t0);

  const mk = (frag, extra) => new THREE.ShaderMaterial({
    uniforms: { ...shared, uBias: { value: 0 }, ...extra },
    vertexShader: VERT,
    fragmentShader: frag
  });
  const v3 = (a) => ({ value: new THREE.Vector3(...a) });
  const bodyMat = mk(BODY_FRAG, { uS: v3(ARM.S), uE: v3(ARM.E), uW: v3(ARM.W), uH: v3(ARM.H) });
  const headMat = mk(HEAD_FRAG, { uFace: { value: face }, uK: { value: 0.00184 }, uBias: { value: 0.35 } });
  const hairMat = mk(HAIR_FRAG, {});

  const outlineMat = new THREE.ShaderMaterial({
    uniforms: { uWidth: { value: 0.0032 }, uColor: { value: new THREE.Color(0.16, 0.1, 0.14) } },
    vertexShader: OUTLINE_VERT,
    fragmentShader: OUTLINE_FRAG,
    side: THREE.BackSide
  });

  const group = new THREE.Group();
  const outlines = new THREE.Group();
  for (const [m, mat] of [[bodyMesh, bodyMat], [headMesh, headMat], [hairMesh, hairMat]]) {
    const g = geometryFrom(m);
    group.add(new THREE.Mesh(g, mat));
    outlines.add(new THREE.Mesh(g, outlineMat));
  }
  group.add(outlines);
  const tris = (bodyMesh.index.length + headMesh.index.length + hairMesh.index.length) / 3;
  return { group, outlines, outlineMat, buildMs, tris };
}
