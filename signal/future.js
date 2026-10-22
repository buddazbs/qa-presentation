// Город будущего поверх ночного переулка (city.js): то, чего не было в Токио
// прошлого века, — в палитре Night City.
//   · голо-рекламы — полупрозрачные экраны на средних и дальних башнях:
//     развёртка строк, пиксельная сетка, бегущая строка внизу, дрожание и
//     редкий срыв кадра; под каждым экраном — рейка проектора;
//   · AV — летающие машины кольцевыми коридорами между домами: скруглённый
//     корпус с тёмной кабиной, пара фар, задний световой бар, бортовые ходовые
//     огни, свечение двигателей снизу и короткий световой след;
//   · прожекторы с крыш небоскрёбов шарят по низкому небу.
// Всё светящееся подчиняется той же маске зон и туману, что и город: за
// карточкой и подписями интерфейса гаснет.
//
// Палитра — три цвета вывесок Night City: жёлтый, бирюзовый, красный.

import * as THREE from '../3d/vendor/three.module.js';
import { ZONE_GLSL, FOG_GLSL, SHIELD_GLSL, VARYING_DEPTH } from './city.js';
import { ANISOTROPY, seeded } from './signage.js';

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

/**
 * Холст рекламы: чёрное — прозрачно (экран аддитивный), рисуется только свет.
 * Слои, от фона к переднему плану: едва заметная сетка развёртки, двойная
 * рамка со скошенным углом и засечками, угловые метки совмещения, служебные
 * строки, надпись. Внизу — полоса бегущей строки: её содержимое повторяется
 * по ширине без шва, шейдер прокручивает только эту полосу (TICKER).
 */
// Полоса бегущей строки в долях холста: высота снизу (y) и ширина (x) —
// общие для текстуры и шейдера, размер холста знает только adTexture
const TICKER = { wide: { y: [0.075, 0.15], x: [150 / 1024, 1000 / 1024] }, tall: { y: [0.075, 0.105], x: [24 / 384, 360 / 384] } };
function adTexture({ jp, en, ink, edge, tall }) {
  const W = tall ? 384 : 1024;
  const H = tall ? 1024 : 448;
  const cv = document.createElement('canvas');
  cv.width = W * 2; cv.height = H * 2;
  const g = cv.getContext('2d');
  g.scale(2, 2);
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  // Сетка развёртки: тонкие линии цвета рамки, едва видны — экран «включён»
  g.globalAlpha = 0.09;
  g.fillStyle = edge;
  for (let x = 24; x < W; x += 24) g.fillRect(x, 0, 1, H);
  for (let y = 24; y < H; y += 24) g.fillRect(0, y, W, 1);
  g.globalAlpha = 1;
  // Рамка со скошенным углом — геометрия интерфейсов Night City — и вторая,
  // тонкая, внутри; засечки по верхней кромке
  const cut = 48;
  const frame = (o, lw) => {
    g.lineWidth = lw;
    g.beginPath(); g.moveTo(cut + o, 8 + o); g.lineTo(W - 8 - o, 8 + o); g.lineTo(W - 8 - o, H - cut - o); g.lineTo(W - cut - o, H - 8 - o); g.lineTo(8 + o, H - 8 - o); g.lineTo(8 + o, cut + o); g.closePath(); g.stroke();
  };
  g.strokeStyle = edge; frame(0, 6);
  g.globalAlpha = 0.5; frame(14, 1.5); g.globalAlpha = 1;
  g.fillStyle = edge;
  for (let x = cut + 24; x < W - 170; x += 24) g.fillRect(x, 8, 1.5, x % 96 === 0 ? 14 : 7);
  // Угловые метки совмещения — внутренние уголки
  g.lineWidth = 2;
  for (const [x, y, sx, sy] of [[34, 34, 1, 1], [W - 34, 34, -1, 1], [34, H - 34, 1, -1], [W - 34, H - 34, -1, -1]]) {
    g.beginPath(); g.moveTo(x, y + sy * 16); g.lineTo(x, y); g.lineTo(x + sx * 16, y); g.stroke();
  }
  // Штриховой блок и штрихкод — служебная маркировка экрана
  for (let i = 0; i < 9; i++) g.fillRect(W - 150 + i * 14, 26, 6, 26);
  g.save(); g.beginPath(); g.rect(24, H - 70, 120, 40); g.clip();
  g.strokeStyle = ink; g.lineWidth = 6;
  for (let x = -40; x < 180; x += 16) { g.beginPath(); g.moveTo(24 + x, H - 30); g.lineTo(64 + x, H - 70); g.stroke(); }
  g.restore();
  // Служебная строка: код канала — моноширинный, мелко
  g.font = '600 15px ui-monospace, Menlo, monospace';
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.fillStyle = edge;
  g.fillText(`CH-${String(jp.codePointAt(0) % 97).padStart(2, '0')} // HOLO`, tall ? 30 : 64, tall ? 78 : 44);
  // Надпись: японская — крупно, английская — узким гротеском
  g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (tall) {
    g.font = `900 210px ${JP}`;
    [...jp].forEach((ch, i) => g.fillText(ch, W / 2, 230 + i * 230));
    g.save(); g.translate(W - 46, H / 2); g.rotate(Math.PI / 2);
    g.font = `700 44px ${COND}`; g.fillStyle = edge; g.fillText(en, 0, 0); g.restore();
  } else {
    g.font = `900 190px ${JP}`;
    g.fillText(jp, W / 2, H * 0.42);
    g.font = `700 64px ${COND}`; g.fillStyle = edge;
    g.fillText(en, W / 2, H * 0.74);
  }
  // Бегущая строка: полоса у нижнего края, текст повторён по всей ширине —
  // при прокрутке шва нет
  const { y: [b0, b1], x: [a0, a1] } = tall ? TICKER.tall : TICKER.wide;
  const by = H * (1 - b1), bh = H * (b1 - b0);
  const bx = W * a0, bw = W * (a1 - a0);
  g.fillStyle = '#000'; g.fillRect(bx, by, bw, bh);
  g.globalAlpha = 0.6; g.fillStyle = edge; g.fillRect(bx, by, bw, 1.5); g.globalAlpha = 1;
  g.save(); g.beginPath(); g.rect(bx, by, bw, bh); g.clip();
  g.font = `600 ${Math.round(bh * 0.62)}px ${COND}`; g.textAlign = 'left'; g.fillStyle = ink;
  const unit = `${en}  ·  ${jp}  ·  `;
  const step = g.measureText(unit).width;
  // Ширина полосы — целое число повторов: на стыке прокрутки шва нет
  const reps = Math.max(1, Math.round(bw / step));
  g.translate(bx, 0); g.scale(bw / (reps * step), 1);
  for (let k = 0; k <= reps; k++) g.fillText(unit, k * step, by + bh * 0.55);
  g.restore();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = ANISOTROPY;
  return tex;
}

/**
 * Голоэкран: развёртка, пиксельная сетка, бегущая строка, дрожание и редкий
 * срыв строк. Мелкие узоры (строки, пиксели) сглажены по размеру пикселя:
 * вдали гаснут до средней яркости и не рябят муаром. Край экрана мягкий —
 * луч проектора снизу, поэтому низ ярче верха.
 */
function holoMaterial(shared, map, seed, tall) {
  const { y: [t0, t1], x: [u0, u1] } = tall ? TICKER.tall : TICKER.wide;
  const span = u1 - u0;
  return new THREE.ShaderMaterial({
    uniforms: { ...shared, uMap: { value: map }, uSeed: { value: seed } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: VARYING_DEPTH,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; uniform float uTime; uniform float uSeed;
      varying vec2 vUv; varying float vDepth;
      ${ZONE_GLSL}
      ${FOG_GLSL}
      ${SHIELD_GLSL}
      float hash(float n) { return fract(sin(n) * 43758.5453); }
      void main() {
        vec2 uv = vUv;
        // Бегущая строка: прокручивается только своя полоса у нижнего края
        if (uv.y > ${t0.toFixed(3)} && uv.y < ${t1.toFixed(3)} && uv.x > ${u0.toFixed(4)} && uv.x < ${u1.toFixed(4)}) uv.x = ${u0.toFixed(4)} + mod(uv.x - ${u0.toFixed(4)} + uTime * 0.035, ${span.toFixed(4)});
        // Срыв: раз в несколько секунд полоса экрана съезжает вбок на пару кадров
        float tick = floor(uTime * 12.0 + uSeed * 31.0);
        float burst = step(0.94, hash(floor(tick / 6.0) + uSeed));
        float band = step(abs(uv.y - hash(tick + uSeed * 3.0)), 0.06);
        uv.x += burst * band * (hash(tick * 1.7) - 0.5) * 0.12;
        vec3 c = texture2D(uMap, uv).rgb;
        // Разделение каналов во время срыва
        c.r = mix(c.r, texture2D(uMap, uv + vec2(0.012, 0.0)).r, burst);
        // Строки развёртки и пиксельная сетка: сила падает, когда период мельче пикселя
        float ly = vUv.y * 420.0;
        float sl = 1.0 - clamp(fwidth(ly) * 1.5 - 0.3, 0.0, 1.0);
        float scan = 1.0 - 0.28 * sl * (0.5 - 0.5 * cos(ly * 6.2832));
        float px = vUv.x * 512.0;
        float pl = 1.0 - clamp(fwidth(px) * 1.5 - 0.3, 0.0, 1.0);
        float grid = 1.0 - 0.22 * pl * smoothstep(0.75, 1.0, fract(px));
        float sweep = 1.0 + 0.8 * smoothstep(0.06, 0.0, abs(fract(vUv.y - uTime * 0.18 + uSeed) - 0.5));
        float flicker = 0.92 + 0.08 * sin(uTime * 23.0 + uSeed * 10.0);
        // Край экрана мягкий; к низу — ближе к проектору — свет плотнее
        vec2 q = abs(vUv - 0.5) * 2.0;
        float edge = (1.0 - smoothstep(0.94, 1.0, q.x)) * (1.0 - smoothstep(0.94, 1.0, q.y));
        float beam = 0.85 + 0.25 * (1.0 - vUv.y);
        c *= scan * grid * sweep * flicker * edge * beam * 1.15;
        gl_FragColor = vec4(c * zoneMask() * shield() * (1.0 - 0.7 * hazeAt(vDepth)), 1.0);
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
      ${SHIELD_GLSL}
      void main() {
        float a = pow(vUv.x, 2.2) * (1.0 - abs(vUv.y - 0.5) * 2.0);
        gl_FragColor = vec4(vColor * a * 0.9 * zoneMask() * shield() * (1.0 - hazeAt(vDepth)), 1.0);
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
    // vUv.y: 1 у линзы, 0 на дальнем конце; vEdge: 1 — ось луча к камере,
    // 0 — край конуса. Свет густой у линзы и по оси, к краю и к концу гаснет;
    // в луче медленно дрейфует пыль — объём воздуха, а не плоский конус
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uTime;
      varying vec2 vUv; varying float vDepth; varying float vEdge;
      ${ZONE_GLSL}
      ${FOG_GLSL}
      ${SHIELD_GLSL}
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), f.x), f.y);
      }
      void main() {
        float along = 1.0 - vUv.y;
        float shell = pow(vEdge, 1.2) * 0.26;
        float core = pow(vEdge, 7.0) * 0.22;
        // Пыль: два слоя шума, тянутся вдоль луча с разной скоростью
        float dust = 0.72 + 0.28 * noise(vec2(vUv.x * 36.0, along * 22.0 - uTime * 0.5))
                          * (0.6 + 0.4 * noise(vec2(vUv.x * 90.0 + 3.0, along * 60.0 - uTime * 1.3)));
        // Выход из линзы — мягкий, без острой вершины конуса
        float mouth = smoothstep(0.0, 0.025, along);
        float a = pow(vUv.y, 1.2) * (shell + core) * dust * mouth;
        gl_FragColor = vec4(uColor * a * zoneMask() * shield() * (1.0 - 0.5 * hazeAt(vDepth)), 1.0);
      }
    `,
  });
}

/** Коробка со скруглёнными рёбрами: вершины прижимаются к внутренней коробке и выдавливаются на радиус. */
function roundedBox(w, h, d, r, seg = 5) {
  const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const inner = new THREE.Vector3(w / 2 - r, h / 2 - r, d / 2 - r);
  const v = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    c.set(Math.max(-inner.x, Math.min(inner.x, v.x)), Math.max(-inner.y, Math.min(inner.y, v.y)), Math.max(-inner.z, Math.min(inner.z, v.z)));
    v.sub(c);
    if (v.lengthSq() > 1e-8) {
      v.normalize();
      nor.setXYZ(i, v.x, v.y, v.z);
      v.multiplyScalar(r).add(c);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
  }
  return g;
}

/** Мягкое пятно света: радиальный градиент, края в ноль. */
function radialTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * @param {{ shared: object, towers: object[], top: number, bottom: number }} city
 */
export function buildFuture({ shared, towers, top, bottom }) {
  const group = new THREE.Group();
  const rnd = seeded(2077);
  const height = top - bottom;
  const m = new THREE.Matrix4();
  const one = new THREE.Vector3(1, 1, 1);

  // ── Голо-рекламы: на средних башнях, которые не заняты вывесками, и на
  // дальних небоскрёбах — крупно, видно сквозь туман ──
  const textures = ADS.map(adTexture);
  const holoMats = ADS.map((ad, k) => holoMaterial(shared, textures[k], k * 0.37 + 0.11, ad.tall));
  const near = towers.filter((t, i) => t.layer === 0 && i % 2 === 0);
  const mid = towers.filter((t, i) => t.layer === 1 && i % 3 === 1);
  const far = towers.filter(t => t.layer === 2 && rnd() < 0.2);
  // На доме переулка — по две рекламы на разной высоте, мельче вывесок-коробов
  const spots = [...near.flatMap(t => [[t, 0.45], [t, 0.45]]), ...mid.map(t => [t, 1]), ...far.map(t => [t, 2.2])];
  const placed = new Map();   // дом → высота и размер уже повешенной рекламы
  spots.forEach(([t, k], i) => {
    const ad = i % ADS.length;
    const tall = ADS[ad].tall;
    const H = (tall ? 16 : 7) * k * (0.85 + rnd() * 0.3);
    const W = H * (tall ? 384 / 1024 : 1024 / 448);
    let y = Math.min(bottom + rnd() * height, t.roofY - H / 2 - 2);
    // Вторая реклама на том же доме не должна наезжать на первую: если
    // высоты сошлись, она уходит выше или ниже на свою высоту с зазором
    const prev = placed.get(t);
    if (prev && Math.abs(y - prev.y) < (H + prev.H) / 2 + 1) {
      const up = prev.y + (H + prev.H) / 2 + 1.5;
      y = up + H / 2 < t.roofY - 2 ? up : prev.y - (H + prev.H) / 2 - 1.5;
    }
    placed.set(t, { y, H });
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
  // Корпус и кабина — скруглённые: блик бежит по кромке, силуэт не «коробка».
  // Огни — отдельные детали со своим положением на корпусе (нос по +x)
  const hullMat = new THREE.MeshStandardMaterial({ color: '#1a1b24', metalness: 0.8, roughness: 0.32 });
  const glassMat = new THREE.MeshStandardMaterial({ color: '#05070c', metalness: 0.95, roughness: 0.06 });
  const parts = [
    // geo, mat, точки крепления на корпусе (x, y, z); tint — цвет экземпляра по машине
    { geo: roundedBox(1.7, 0.36, 0.85, 0.15), mat: hullMat, at: [[0, 0, 0]] },
    { geo: roundedBox(0.82, 0.22, 0.64, 0.1), mat: glassMat, at: [[0.08, 0.22, 0]] },
    // Пара фар у носа
    { geo: new THREE.BoxGeometry(0.05, 0.06, 0.16), mat: new THREE.MeshBasicMaterial({ color: '#eef6ff', toneMapped: false }), at: [[0.86, 0.02, 0.24], [0.86, 0.02, -0.24]] },
    // Задний световой бар во всю ширину
    { geo: new THREE.BoxGeometry(0.04, 0.05, 0.78), mat: new THREE.MeshBasicMaterial({ color: NC.red, toneMapped: false }), at: [[-0.86, 0.04, 0]] },
    // Бортовые ходовые огни: тонкие полосы по бокам, цвет — как у следа
    {
      geo: new THREE.BoxGeometry(1.15, 0.022, 0.02), mat: new THREE.MeshBasicMaterial({ toneMapped: false }),
      at: [[-0.05, 0.02, 0.43], [-0.05, 0.02, -0.43]], tint: (car, c) => c.set(car.tint ? NC.cyan : NC.red).multiplyScalar(0.9),
    },
    // Свечение двигателей снизу: мягкое пятно, смотрит вниз
    {
      geo: new THREE.PlaneGeometry(1.5, 0.8).rotateX(Math.PI / 2),
      mat: new THREE.MeshBasicMaterial({ map: radialTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
      at: [[0, -0.2, 0]], tint: (car, c) => c.set(car.tint ? NC.cyan : '#8fd8ff').multiplyScalar(0.55), glow: true,
    },
  ];
  const c = new THREE.Color();
  const meshes = parts.map(p => {
    const mesh = new THREE.InstancedMesh(p.geo, p.mat, CARS * p.at.length);
    mesh.frustumCulled = false;
    if (p.tint) cars.forEach((car, i) => p.at.forEach((_, k) => mesh.setColorAt(i * p.at.length + k, p.tint(car, c))));
    group.add(mesh);
    return { mesh, at: p.at.map(a => new THREE.Vector3(...a)), glow: p.glow };
  });
  const glow = meshes.find(p => p.glow).mesh;
  const trailGeo = new THREE.PlaneGeometry(1, 1);
  const trailCol = new Float32Array(CARS * 3);
  cars.forEach((car, i) => { c.set(car.tint ? NC.cyan : NC.red).multiplyScalar(car.tint ? 0.8 : 0.9); trailCol.set([c.r, c.g, c.b], i * 3); });
  trailGeo.setAttribute('aColor', new THREE.InstancedBufferAttribute(trailCol, 3));
  const trailMesh = new THREE.InstancedMesh(trailGeo, trailMaterial(shared), CARS);
  trailMesh.frustumCulled = false;
  group.add(trailMesh);
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const local = new THREE.Vector3();
  const trailScale = new THREE.Vector3(7, 0.18, 1);
  const place = (mesh, idx, at, scale = one) => {
    local.copy(at).applyQuaternion(quat).add(pos);
    m.compose(local, quat, scale);
    mesh.setMatrixAt(idx, m);
  };
  const flyCars = t => {
    cars.forEach((car, i) => {
      const a = car.a + (car.w / car.r) * t;
      pos.set(Math.cos(a) * car.r, car.y + Math.sin(t * 0.4 + car.bob) * 0.6, Math.sin(a) * car.r);
      // Нос по касательной: при обратном ходе разворачиваемся
      quat.setFromAxisAngle(yAxis, -a + (car.w > 0 ? -Math.PI / 2 : Math.PI / 2));
      for (const { mesh, at } of meshes) at.forEach((p, k) => place(mesh, i * at.length + k, p));
      local.set(-4.4, 0.03, 0).applyQuaternion(quat).add(pos); m.compose(local, quat, trailScale); trailMesh.setMatrixAt(i, m);
    });
    for (const { mesh } of meshes) mesh.instanceMatrix.needsUpdate = true;
    trailMesh.instanceMatrix.needsUpdate = true;
  };

  // ── Прожекторы: с дальних небоскрёбов на высоте пролёта камеры — лучи
  // идут косо вверх через небо кадра и медленно шарят ──
  const beamGeo = new THREE.ConeGeometry(8, 140, 24, 1, true);
  beamGeo.translate(0, -70, 0);   // вершина — в начале координат, конус вниз по −Y
  beamGeo.rotateX(Math.PI);       // и вверх по +Y
  // Фонарь: корпус-барабан за линзой, кольцо-бленда и светящаяся линза.
  // Дочерний к лучу — поворачивается вместе с ним, ось — +Y
  const housingGeo = new THREE.CylinderGeometry(0.95, 1.15, 1.7, 28, 1);
  housingGeo.translate(0, -0.9, 0);
  const hoodGeo = new THREE.TorusGeometry(0.98, 0.09, 8, 36);
  hoodGeo.rotateX(Math.PI / 2);
  const lensGeo = new THREE.CircleGeometry(0.88, 36);
  lensGeo.rotateX(-Math.PI / 2);
  const lampMetal = new THREE.MeshStandardMaterial({ color: '#20222c', metalness: 0.85, roughness: 0.38 });
  const beams = towers.filter(t => t.layer === 2).filter((_, i) => i % 5 === 0).map((t, i) => {
    const color = [NC.cyan, '#cfe6ff', NC.yellow, '#cfe6ff'][i % 4];
    const beam = new THREE.Mesh(beamGeo, beamMaterial(shared, color));
    beam.position.copy(t.center).multiplyScalar(0.92).setY(Math.min(t.roofY, bottom + rnd() * height));
    beam.frustumCulled = false;
    beam.rotation.order = 'YXZ';   // наклон в своей плоскости, затем поворот вокруг вертикали
    const lens = new THREE.Mesh(lensGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.3).multiplyScalar(0.85), toneMapped: false }));
    lens.position.y = 0.02;
    beam.add(new THREE.Mesh(housingGeo, lampMetal), new THREE.Mesh(hoodGeo, lampMetal), lens);
    group.add(beam);
    return { beam, phase: rnd() * 6, speed: 0.12 + rnd() * 0.1 };
  });
  const sweep = t => beams.forEach(({ beam, phase, speed }) => {
    beam.rotation.x = 0.9 + 0.3 * Math.sin(t * speed + phase);
    beam.rotation.y = t * speed * 0.7 + phase;
  });

  flyCars(0);
  sweep(0);
  return {
    group,
    update(t) { flyCars(t); sweep(t); },
    /** Слабое устройство: без лучей и свечения двигателей. */
    lowPower() {
      beams.forEach(b => { b.beam.visible = false; });
      glow.visible = false;
    },
  };
}