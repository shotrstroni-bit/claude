import * as THREE from 'three';

const WORLD_VERT = /* glsl */ `
varying vec3 vPos;
varying vec3 vNW;
varying vec3 vWPos;
void main() {
  vPos = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWPos = wp.xyz;
  vNW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const WORLD_FRAG = /* glsl */ `
uniform vec3 uLightDir;
uniform vec3 uFogColor;
uniform vec2 uFog;
uniform vec3 uColor;
uniform vec3 uTop;
uniform vec3 uTint;
uniform float uStrata;
varying vec3 vPos;
varying vec3 vNW;
varying vec3 vWPos;
void main() {
  vec3 N = normalize(vNW);
  vec3 albedo = N.y > 0.85 ? uTop : uColor;
  if (uStrata > 0.0 && N.y < 0.85) albedo *= 1.0 - uStrata * step(0.82, fract(vWPos.y / 2.3));
  float lit = smoothstep(0.0, 0.05, dot(N, normalize(uLightDir)));
  vec3 c = albedo * mix(uTint, vec3(1.0), lit);
  float f = smoothstep(uFog.x, uFog.y, length(vWPos - cameraPosition));
  gl_FragColor = vec4(mix(c, uFogColor, f), 1.0);
}
`;

function toonWorld(shared, color, top, tint, strata) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...shared,
      uColor: { value: new THREE.Color(...color) },
      uTop: { value: new THREE.Color(...(top || color)) },
      uTint: { value: new THREE.Color(...(tint || [0.72, 0.68, 0.86])) },
      uStrata: { value: strata || 0 }
    },
    vertexShader: WORLD_VERT,
    fragmentShader: WORLD_FRAG
  });
}

function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

export function buildWorld(shared) {
  const world = new THREE.Group();
  const rand = rng(7);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(400, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vD; uniform vec3 uLightDir;
        void main(){
          float h = vD.y;
          vec3 top = vec3(0.23, 0.62, 0.95), mid = vec3(0.62, 0.84, 1.0), hor = vec3(0.92, 0.96, 1.0);
          vec3 c = mix(hor, mid, smoothstep(0.0, 0.18, h));
          c = mix(c, top, smoothstep(0.18, 0.7, h));
          if (h < 0.0) c = vec3(0.86, 0.94, 1.0);
          float sun = max(dot(vD, normalize(uLightDir)), 0.0);
          c += vec3(1.0, 0.95, 0.8) * (pow(sun, 400.0) * 1.2 + pow(sun, 12.0) * 0.18);
          gl_FragColor = vec4(c, 1.0);
        }`,
      uniforms: { uLightDir: shared.uLightDir }
    })
  );
  sky.renderOrder = -1;
  world.add(sky);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(300, 64).rotateX(-Math.PI / 2),
    toonWorld(shared, [0.47, 0.75, 0.36], [0.47, 0.75, 0.36]));
  world.add(ground);

  const patchMat = toonWorld(shared, [0.4, 0.68, 0.31], [0.4, 0.68, 0.31]);
  for (let i = 0; i < 18; i++) {
    const r = 3 + rand() * 30, a = rand() * Math.PI * 2;
    const p = new THREE.Mesh(new THREE.CircleGeometry(1 + rand() * 2.5, 20).rotateX(-Math.PI / 2), patchMat);
    p.scale.set(1.8, 1, 1);
    p.position.set(Math.cos(a) * r, 0.003, Math.sin(a) * r);
    world.add(p);
  }

  const mesaMat = toonWorld(shared, [0.83, 0.52, 0.37], [0.93, 0.66, 0.5], [0.72, 0.6, 0.78], 0.12);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + rand() * 0.2;
    const r = 110 + rand() * 120;
    const h = 10 + rand() * 26;
    const top = 6 + rand() * 12;
    const g = new THREE.CylinderGeometry(top, top * (1.15 + rand() * 0.25), h, 6 + Math.floor(rand() * 3), 1).toNonIndexed();
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mesaMat);
    m.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
    m.rotation.y = rand() * Math.PI;
    m.scale.set(1, 1, 0.6 + rand() * 0.6);
    world.add(m);
  }

  const bushMat = toonWorld(shared, [0.3, 0.6, 0.27], [0.42, 0.72, 0.33]);
  for (let i = 0; i < 14; i++) {
    const a = rand() * Math.PI * 2, r = 4 + rand() * 18;
    const bush = new THREE.Group();
    for (let j = 0; j < 4; j++) {
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35 + rand() * 0.3, 1), bushMat);
      s.position.set((rand() - 0.5) * 0.8, 0.2 + rand() * 0.15, (rand() - 0.5) * 0.6);
      bush.add(s);
    }
    bush.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    world.add(bush);
  }

  const cloudMat = new THREE.ShaderMaterial({
    uniforms: { uLightDir: shared.uLightDir },
    vertexShader: 'varying vec3 vN; void main(){ vN = normalize(mat3(modelMatrix)*normal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vN; uniform vec3 uLightDir; void main(){ float l = smoothstep(-0.1,0.0,dot(normalize(vN),normalize(uLightDir))); gl_FragColor = vec4(mix(vec3(0.8,0.87,1.0), vec3(1.0), l),1.0); }'
  });
  const clouds = new THREE.Group();
  for (let i = 0; i < 12; i++) {
    const c = new THREE.Group();
    const n = 4 + Math.floor(rand() * 4);
    for (let j = 0; j < n; j++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(3 + rand() * 3, 16, 12), cloudMat);
      s.position.set(j * 4 - n * 2, rand() * 2, (rand() - 0.5) * 4);
      s.scale.y = 0.7;
      c.add(s);
    }
    const a = rand() * Math.PI * 2, r = 80 + rand() * 120;
    c.position.set(Math.cos(a) * r, 35 + rand() * 30, Math.sin(a) * r);
    c.lookAt(0, c.position.y, 0);
    clouds.add(c);
  }
  world.add(clouds);

  const shadowTex = (() => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const g = cv.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(20,40,20,0.55)');
    grd.addColorStop(0.6, 'rgba(20,40,20,0.25)');
    grd.addColorStop(1, 'rgba(20,40,20,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(cv);
  })();
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.5).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  blob.position.y = 0.004;
  world.add(blob);

  return { world, clouds };
}
