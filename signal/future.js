// Город будущего поверх ночного переулка (city.js): то, чего не было в Токио
// прошлого века, — в палитре Night City.
//   · голо-рекламы — полупрозрачные экраны на средних и дальних башнях:
//     развёртка строк, дрожание, редкий срыв кадра;
//   · AV — летающие машины кольцевыми коридорами между домами: фары, стоп-огни
//     и короткий световой след;
//   · прожекторы с крыш небоскрёбов шарят по низкому небу;
//   · дождь — тонкие косые штрихи в неоне, только вблизи.
// Всё светящееся подчиняется той же маске зон и туману, что и город: за
// карточкой и подписями интерфейса гаснет.
//
// Палитра — три цвета вывесок Night City: жёлтый, бирюзовый, красный.

import * as THREE from '../3d/vendor/three.module.js';
import { ZONE_GLSL, FOG_GLSL, VARYING_DEPTH } from './city.js';

export const NC = { yellow: '#fcee0a', cyan: '#00f0ff', red: '#ff003c' };

const COND = '"DIN Condensed", "Avenir Next Condensed", "Arial Narrow", sans-serif';
const JP = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans JP", sans-serif';

// Рекламы: японская надпись осмыслена, рядом — перевод
const ADS = [
  { jp: '決済通知', en: 'CALLBACK  //  24/7', ink: NC.yellow, edge: NC.cyan },       // уведомление о платеже
  { jp: '模擬応答', en: 'MOCK RESPONSE', ink: NC.cyan, edge: NC.red },               // имитация ответа
  { jp: '品質', en: 'QA PLATFORM', ink: NC.red, edge: NC.yellow, tall: true },        // качество
  { jp: '信号', en: 'SIGNAL ONLINE', ink: NC.yellow, edge: NC.red, tall: true },      // сигнал
  { jp: '試験中', en: 'TEST IN PROGRESS', ink: NC.cyan, edge: NC.yellow },           // идёт тестирование
];

/** Холст рекламы: чёрное — прозрачно (экран аддитивный), рисуется только свет. */
function adTexture({ jp, en, ink, edge, tall }) {
  const W = tall ? 384 : 1024;
  const H = tall ? 1024 : 448;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  // Рамка со скошенным углом — геометрия интерфейсов Night City
  const cut = 48;
  g.strokeStyle = edge; g.lineWidth = 6;
  g.beginPath(); g.moveTo(cut, 8); g.lineTo(W - 8, 8); g.lineTo(W - 8, H - cut); g.lineTo(W - cut, H - 8); g.lineTo(8, H - 8); g.lineTo(8, cut); g.closePath(); g.stroke();
  // Штриховой блок и штрихкод — служебная маркировка экрана
  g.fillStyle = edge;
  for (let i = 0; i < 9; i++) g.fillRect(W - 150 + i * 14, 26, 6, 26);
  g.save(); g.beginPath(); g.rect(24, H - 70, 120, 40); g.clip();
  g.strokeStyle = ink; g.lineWidth = 6;
  for (let x = -40; x < 180; x += 16) { g.beginPath(); g.moveTo(24 + x, H - 30); g.lineTo(64 + x, H - 70); g.stroke(); }
  g.restore();
  // Надпись: японская — крупно, английская — узким гротеском
  g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (tall) {
    g.font = `900 210px ${JP}`;
    [...jp].forEach((ch, i) => g.fillText(ch, W / 2, 230 + i * 230));
    g.save(); g.translate(W - 46, H / 2); g.rotate(Math.PI / 2);
    g.font = `700 44px ${COND}`; g.fillStyle = edge; g.fillText(en, 0, 0); g.restore();
  } else {
    g.font = `900 190px ${JP}`;
    g.fillText(jp, W / 2, H * 0.44);
    g.font = `700 64px ${COND}`; g.fillStyle = edge;
    g.fillText(en, W / 2, H * 0.8);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Голоэкран: развёртка, дрожание и редкий срыв строк. */
function holoMaterial(shared, map, seed) {
  return new THREE.ShaderMaterial({
    uniforms: { ...shared, uMap: { value: map }, uSeed: { value: seed } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: VARYING_DEPTH,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; uniform float uTime; uniform float uSeed;
      varying vec2 vUv; varying float vDepth;
      ${ZONE_GLSL}
      ${FOG_GLSL}
      float hash(float n) { return fract(sin(n) * 43758.5453); }
      void main() {
        vec2 uv = vUv;
        // Срыв: раз в несколько секунд полоса экрана съезжает вбок на пару кадров
        float tick = floor(uTime * 12.0 + uSeed * 31.0);
        float burst = step(0.94, hash(floor(tick / 6.0) + uSeed));
        float band = step(abs(uv.y - hash(tick + uSeed * 3.0)), 0.06);
        uv.x += burst * band * (hash(tick * 1.7) - 0.5) * 0.12;
        vec3 c = texture2D(uMap, uv).rgb;
        // Разделение каналов во время срыва
        c.r = mix(c.r, texture2D(uMap, uv + vec2(0.012, 0.0)).r, burst);
        // Строки развёртки и бегущая полоса
        float scan = 0.72 + 0.28 * sin(vUv.y * 420.0);
        float sweep = 1.0 + 0.8 * smoothstep(0.06, 0.0, abs(fract(vUv.y - uTime * 0.18 + uSeed) - 0.5));
        float flicker = 0.9 + 0.1 * sin(uTime * 23.0 + uSeed * 10.0);
        c *= scan * sweep * flicker * 1.15;
        gl_FragColor = vec4(c * zoneMask() * (1.0 - 0.7 * hazeAt(vDepth)), 1.0);
      }
    `,
  });
}

/** Световой след AV: ярко у машины, гаснет к хвосту. */
function trailMaterial(shared) {
  return new THREE.ShaderMaterial({
    defines: { HAS_COLOR: '' },
    uniforms: { ...shared },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: VARYING_DEPTH,
    fragmentShader: /* glsl */ `
      varying vec2 vUv; varying float vDepth; varying vec3 vColor;
      ${ZONE_GLSL}
      ${FOG_GLSL}
      void main() {
        float a = pow(vUv.x, 2.2) * (1.0 - abs(vUv.y - 0.5) * 2.0);
        gl_FragColor = vec4(vColor * a * 0.9 * zoneMask() * (1.0 - hazeAt(vDepth)), 1.0);
      }
    `,
  });
}

/** Луч прожектора: мягкий край конуса, гаснет к концу. */
function beamMaterial(shared, color) {
  return new THREE.ShaderMaterial({
    uniforms: { ...shared, uColor: { value: new THREE.Color(color) } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying float vDepth; varying float vEdge;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDepth = -mv.z;
        vec3 n = normalize(normalMatrix * normal);
        vEdge = abs(dot(n, normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying vec2 vUv; varying float vDepth; varying float vEdge;
      ${ZONE_GLSL}
      ${FOG_GLSL}
      void main() {
        float a = pow(vUv.y, 1.2) * pow(vEdge, 1.2) * 0.3;
        gl_FragColor = vec4(uColor * a * zoneMask() * (1.0 - 0.5 * hazeAt(vDepth)), 1.0);
      }
    `,
  });
}

/** Дождь: штрихи падают по кругу в своей колонке высоты; ветер даёт наклон. */
function rainMaterial(shared, span) {
  return new THREE.ShaderMaterial({
    uniforms: { ...shared, uBottom: { value: span.bottom }, uSpan: { value: span.height } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform float uTime; uniform float uBottom; uniform float uSpan;
      attribute float aTail; attribute float aSpeed;
      varying float vDepth; varying float vTail;
      void main() {
        vec3 p = position;
        p.y = uBottom + mod(p.y - uBottom - uTime * aSpeed, uSpan);
        p.y += aTail * 1.1; p.x -= aTail * 0.18;
        vTail = aTail;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vDepth; varying float vTail;
      ${ZONE_GLSL}
      ${FOG_GLSL}
      void main() {
        float near = smoothstep(2.0, 6.0, vDepth) * (1.0 - smoothstep(20.0, 40.0, vDepth));
        vec3 c = mix(vec3(0.55, 0.75, 1.0), vec3(0.9, 0.5, 1.0), vTail) * 0.22 * (1.0 - vTail * 0.7);
        gl_FragColor = vec4(c * near * (0.4 + 0.6 * zoneMask()), 1.0);
      }
    `,
  });
}

/**
 * @param {{ shared: object, towers: object[], top: number, bottom: number }} city
 */
export function buildFuture({ shared, towers, top, bottom }) {
  const group = new THREE.Group();
  const rnd = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(2077);
  const height = top - bottom;
  const m = new THREE.Matrix4();
  const one = new THREE.Vector3(1, 1, 1);

  // ── Голо-рекламы: на средних башнях, которые не заняты вывесками, и на
  // дальних небоскрёбах — крупно, видно сквозь туман ──
  const textures = ADS.map(adTexture);
  const holoMats = ADS.map((ad, k) => holoMaterial(shared, textures[k], k * 0.37 + 0.11));
  const near = towers.filter((t, i) => t.layer === 0 && i % 2 === 0);
  const mid = towers.filter((t, i) => t.layer === 1 && i % 3 === 1);
  const far = towers.filter(t => t.layer === 2 && rnd() < 0.2);
  // На доме переулка — по две рекламы на разной высоте, мельче вывесок-коробов
  const spots = [...near.flatMap(t => [[t, 0.45], [t, 0.45]]), ...mid.map(t => [t, 1]), ...far.map(t => [t, 2.2])];
  spots.forEach(([t, k], i) => {
    const ad = i % ADS.length;
    const tall = ADS[ad].tall;
    const H = (tall ? 16 : 7) * k * (0.85 + rnd() * 0.3);
    const W = H * (tall ? 384 / 1024 : 1024 / 448);
    const y = Math.min(bottom + rnd() * height, t.roofY - H / 2 - 2);
    const inward = new THREE.Vector3(-Math.cos(t.a), 0, -Math.sin(t.a));
    const tangent = new THREE.Vector3(-inward.z, 0, inward.x);
    const pos = t.center.clone().addScaledVector(inward, Math.max(t.wBase, t.dBase) / 2 + 1.2)
      .addScaledVector(tangent, t.layer === 0 ? (rnd() - 0.5) * t.wBase * 0.5 : 0).setY(y);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(W, H), holoMats[ad]);
    plane.position.copy(pos);
    plane.lookAt(0, y, 0);
    plane.frustumCulled = false;
    group.add(plane);
  });

  // ── AV: кольцевые коридоры между стволом и переулком, над эстакадами и
  // за средней застройкой; у каждой машины своя высота и скорость ──
  const CARS = 54;
  const cars = Array.from({ length: CARS }, (_, i) => {
    const lane = [[24, 34], [54, 60], [84, 96]][i % 3];
    return {
      r: lane[0] + rnd() * (lane[1] - lane[0]),
      y: bottom - 6 + rnd() * (height + 30),
      a: rnd() * Math.PI * 2,
      w: (rnd() < 0.5 ? -1 : 1) * (5 + rnd() * 9),
      bob: rnd() * 6,
      tint: rnd() < 0.25,
    };
  });
  const bodyMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.7, 0.42, 0.85), new THREE.MeshStandardMaterial({ color: '#1a1b24', metalness: 0.8, roughness: 0.35 }), CARS);
  const headMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.08, 0.7), new THREE.MeshBasicMaterial({ color: '#e8f4ff', toneMapped: false }), CARS);
  const tailMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.08, 0.75), new THREE.MeshBasicMaterial({ color: NC.red, toneMapped: false }), CARS);
  const trailGeo = new THREE.PlaneGeometry(1, 1);
  const trailCol = new Float32Array(CARS * 3);
  const c = new THREE.Color();
  cars.forEach((car, i) => { c.set(car.tint ? NC.cyan : NC.red).multiplyScalar(car.tint ? 0.8 : 0.9); trailCol.set([c.r, c.g, c.b], i * 3); });
  trailGeo.setAttribute('aColor', new THREE.InstancedBufferAttribute(trailCol, 3));
  const trailMesh = new THREE.InstancedMesh(trailGeo, trailMaterial(shared), CARS);
  for (const mesh of [bodyMesh, headMesh, tailMesh, trailMesh]) { mesh.frustumCulled = false; group.add(mesh); }
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const local = new THREE.Vector3();
  const trailScale = new THREE.Vector3(7, 0.22, 1);
  const flyCars = t => {
    cars.forEach((car, i) => {
      const a = car.a + (car.w / car.r) * t;
      pos.set(Math.cos(a) * car.r, car.y + Math.sin(t * 0.4 + car.bob) * 0.6, Math.sin(a) * car.r);
      // Нос по касательной: при обратном ходе разворачиваемся
      quat.setFromAxisAngle(yAxis, -a + (car.w > 0 ? -Math.PI / 2 : Math.PI / 2));
      m.compose(pos, quat, one); bodyMesh.setMatrixAt(i, m);
      local.set(0.86, 0, 0).applyQuaternion(quat).add(pos); m.compose(local, quat, one); headMesh.setMatrixAt(i, m);
      local.set(-0.86, 0, 0).applyQuaternion(quat).add(pos); m.compose(local, quat, one); tailMesh.setMatrixAt(i, m);
      local.set(-4.4, 0, 0).applyQuaternion(quat).add(pos); m.compose(local, quat, trailScale); trailMesh.setMatrixAt(i, m);
    });
    for (const mesh of [bodyMesh, headMesh, tailMesh, trailMesh]) mesh.instanceMatrix.needsUpdate = true;
  };

  // ── Прожекторы: с дальних небоскрёбов на высоте пролёта камеры — лучи
  // идут косо вверх через небо кадра и медленно шарят ──
  const beamGeo = new THREE.ConeGeometry(8, 140, 24, 1, true);
  beamGeo.translate(0, -70, 0);   // вершина — в начале координат, конус вниз по −Y
  beamGeo.rotateX(Math.PI);       // и вверх по +Y
  const beams = towers.filter(t => t.layer === 2).filter((_, i) => i % 5 === 0).map((t, i) => {
    const beam = new THREE.Mesh(beamGeo, beamMaterial(shared, [NC.cyan, '#cfe6ff', NC.yellow, '#cfe6ff'][i % 4]));
    beam.position.copy(t.center).multiplyScalar(0.92).setY(Math.min(t.roofY, bottom + rnd() * height));
    beam.frustumCulled = false;
    beam.rotation.order = 'YXZ';   // наклон в своей плоскости, затем поворот вокруг вертикали
    group.add(beam);
    return { beam, phase: rnd() * 6, speed: 0.12 + rnd() * 0.1 };
  });
  const sweep = t => beams.forEach(({ beam, phase, speed }) => {
    beam.rotation.x = 0.9 + 0.3 * Math.sin(t * speed + phase);
    beam.rotation.y = t * speed * 0.7 + phase;
  });

  // ── Дождь: кольцо вокруг ствола, где ходит камера ──
  const DROPS = 4200;
  const rainPos = new Float32Array(DROPS * 6);
  const rainTail = new Float32Array(DROPS * 2);
  const rainSpeed = new Float32Array(DROPS * 2);
  for (let i = 0; i < DROPS; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 6 + Math.sqrt(rnd()) * 34;
    const y = bottom - 10 + rnd() * (height + 40);
    const s = 26 + rnd() * 14;
    rainPos.set([Math.cos(a) * r, y, Math.sin(a) * r, Math.cos(a) * r, y, Math.sin(a) * r], i * 6);
    rainTail.set([0, 1], i * 2);
    rainSpeed.set([s, s], i * 2);
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  rainGeo.setAttribute('aTail', new THREE.BufferAttribute(rainTail, 1));
  rainGeo.setAttribute('aSpeed', new THREE.BufferAttribute(rainSpeed, 1));
  const rain = new THREE.LineSegments(rainGeo, rainMaterial(shared, { bottom: bottom - 10, height: height + 40 }));
  rain.frustumCulled = false;
  group.add(rain);

  flyCars(0);
  sweep(0);
  return {
    group,
    update(t) { flyCars(t); sweep(t); },
    /** Слабое устройство: без дождя и лучей. */
    lowPower() {
      rain.visible = false;
      beams.forEach(b => { b.beam.visible = false; });
    },
  };
}
