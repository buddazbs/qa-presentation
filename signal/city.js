// Ночной Токио вокруг сигнальной магистрали — переулок в неоновой дымке.
//
// Ориентир — улица после дождя: кирпичные стены, залитые розовым и
// циановым светом вывесок, вертикальные неоновые короба на консолях,
// бумажные фонари, кондиционеры, пожарные лестницы, провода поперёк
// переулка, а в конце — небоскрёбы с горящими окнами в лиловом тумане.
//
// Сцена вертикальная: камера спускается вдоль ствола, и город — колодец
// из зданий вокруг него. Слои, от ствола наружу:
//   · ближний (r 40–50) — кирпичные дома переулка с лестницами,
//     кондиционерами, фонарями и самыми яркими вывесками;
//   · эстакады (r 58) — кольцевые трассы с потоком фар и стоп-огней;
//   · средний (r 62–80) — плотная застройка, вывески поменьше;
//   · дальний (r 100–150) — небоскрёбы с сеткой окон, тают в тумане.
// Туман светится: чем дальше, тем лиловее — как воздух, подсвеченный
// улицей снизу.
//
// Город не спорит с карточкой: всё, что светится, приглушается маской по
// экрану — центр кадра, колонка заголовка слева и углы с меню темнее, края
// и верх ярче. Насколько — задаёт uCalm (signal/main.js).

import * as THREE from '../3d/vendor/three.module.js';
import { INK, signTexture } from './signage.js';

const HAZE_DEEP = '#120d24';
const HAZE_GLOW = '#58307a';
const MAX_LIGHTS = 24;

// Маска зон по экрану: множитель яркости для всего, что светится
export const ZONE_GLSL = /* glsl */ `
  uniform vec2 uResolution;
  uniform float uCalm;
  float zoneMask() {
    vec2 s = gl_FragCoord.xy / uResolution;
    // Карточка стоит правее центра — колонку слева занимает заголовок главы
    float card = exp(-(pow((s.x - 0.58) / 0.3, 2.0) + pow((s.y - 0.5) / 0.34, 2.0)));
    float title = exp(-(pow((s.x - 0.13) / 0.13, 2.0) + pow((s.y - 0.5) / 0.18, 2.0)));
    float top = smoothstep(0.72, 1.0, s.y);
    // Углы снизу — меню глав и счётчик, сверху — марка и переключатель глав:
    // за подписями интерфейса город гаснет всегда
    float ui = exp(-(pow((s.x - 0.9) / 0.13, 2.0) + pow(s.y / 0.17, 2.0))) + exp(-(pow((s.x - 0.08) / 0.14, 2.0) + pow(s.y / 0.2, 2.0)))
      + 0.75 * (exp(-(pow((s.x - 0.07) / 0.1, 2.0) + pow((1.0 - s.y) / 0.08, 2.0))) + exp(-(pow((s.x - 0.92) / 0.1, 2.0) + pow((1.0 - s.y) / 0.08, 2.0))));
    // За заголовком слева город гаснет при любом uCalm: он на экране всё время
    float calm = (1.0 - uCalm * clamp(0.66 * card, 0.0, 0.82)) * (1.0 - 0.72 * title);
    return calm * (1.0 - 0.9 * clamp(ui, 0.0, 1.0)) * (1.0 + 0.25 * top);
  }
`;
// Светящийся туман: дальнее растворяется в лиловом, а не в чёрном
export const FOG_GLSL = /* glsl */ `
  uniform float uDensity; uniform vec3 uHazeDeep; uniform vec3 uHazeGlow;
  float hazeAt(float depth) { return 1.0 - exp(-pow(depth * uDensity, 2.0)); }
  vec3 fogged(vec3 c, float depth) { float f = hazeAt(depth); return mix(c, mix(uHazeDeep, uHazeGlow, pow(f, 0.8)), f); }
`;
// Засветка улицы: стены, обращённые к стволу, залиты розовым и циановым
const WASH_GLSL = /* glsl */ `
  vec3 neonWash(vec3 world, vec3 n) {
    float facing = max(0.0, dot(n, -normalize(vec3(world.x, 0.0, world.z))));
    float a = atan(world.z, world.x);
    float k = 0.5 + 0.5 * sin(a * 3.0 + world.y * 0.045);
    return mix(vec3(0.18, 0.85, 1.0), vec3(1.0, 0.2, 0.62), k) * facing;
  }
`;
export const VARYING_DEPTH = /* glsl */ `
  varying vec2 vUv; varying float vDepth; varying vec3 vColor;
  #ifdef USE_INSTANCING
    attribute vec3 aColor;
  #endif
  void main() {
    vUv = uv; vColor = vec3(1.0);
    mat4 inst = mat4(1.0);
    #ifdef USE_INSTANCING
      inst = instanceMatrix;
      #ifdef HAS_COLOR
        vColor = aColor;
      #endif
    #endif
    vec4 mv = modelViewMatrix * inst * vec4(position, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const facadeVertex = /* glsl */ `
  attribute vec4 aSeed;   // x: сид, y: доля горящих окон, z: тип фасада, w: слой (0 ближний … 2 дальний)
  attribute vec3 aTint;   // цвет служебных рёбер; чёрный — рёбер нет
  varying vec3 vWorld; varying vec3 vN; varying vec3 vLocalN; varying vec3 vMeters; varying vec3 vSize;
  varying vec4 vSeed; varying vec3 vTint; varying float vDepth;
  void main() {
    vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
    vLocalN = normal;
    vSize = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
    vMeters = position * vSize;
    vSeed = aSeed; vTint = aTint;
    vec4 mv = viewMatrix * world;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const facadeFragment = /* glsl */ `
  uniform float uTime;
  uniform vec3 uLightPos[${MAX_LIGHTS}]; uniform vec3 uLightCol[${MAX_LIGHTS}]; uniform int uLightCount;
  varying vec3 vWorld; varying vec3 vN; varying vec3 vLocalN; varying vec3 vMeters; varying vec3 vSize;
  varying vec4 vSeed; varying vec3 vTint; varying float vDepth;
  ${ZONE_GLSL}
  ${FOG_GLSL}
  ${WASH_GLSL}
  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(cameraPosition - vWorld);
    bool roof = abs(vLocalN.y) > 0.5;
    float type = vSeed.z;
    float layer = vSeed.w;
    float along = abs(vLocalN.x) > 0.5 ? vMeters.z : vMeters.x;
    float halfW = abs(vLocalN.x) > 0.5 ? vSize.z * 0.5 : vSize.x * 0.5;
    float toEdge = halfW - abs(along);

    vec3 wall = vec3(0.03, 0.026, 0.045);
    vec3 emit = vec3(0.0);
    float y = vWorld.y;
    if (!roof) {
      float fy = y / 0.5;
      vec2 id = vec2(floor(along / 0.36), floor(fy));
      float office = step(1.0 - vSeed.y, hash(vec3(floor(id.x / 6.0), id.y, vSeed.x)));
      float lit = office * step(0.2, hash(vec3(id, vSeed.x + 1.0)));
      // Окна: тёплый и холодный белый, у части — розовый свет за шторой
      float pick = hash(vec3(floor(id.x / 6.0), id.y, vSeed.x + 7.0));
      vec3 tone = pick < 0.4 ? vec3(1.0, 0.8, 0.6) : pick < 0.8 ? vec3(0.72, 0.86, 1.0) : vec3(1.0, 0.36, 0.72);
      float bright = 0.18 + 0.22 * hash(vec3(id, 3.0));
      float win;
      if (type > 2.5) {
        // Кирпич: перевязка в полкирпича, тёмные швы; окна — редкие высокие
        // проёмы в рамах, как в домах переулка
        float row = floor(y / 0.14);
        float bx = fract((along + mod(row, 2.0) * 0.16) / 0.32);
        float by = fract(y / 0.14);
        float mortar = step(bx, 0.06) + step(by, 0.12);
        float brick = 0.8 + 0.35 * hash(vec3(floor((along + mod(row, 2.0) * 0.16) / 0.32), row, vSeed.x));
        wall = vec3(0.045, 0.03, 0.042) * brick * (1.0 - 0.6 * clamp(mortar, 0.0, 1.0));
        vec2 w = vec2(fract(along / 2.2), fract(y / 2.6));
        win = step(0.3, w.x) * step(w.x, 0.7) * step(0.25, w.y) * step(w.y, 0.85);
        vec2 wid = vec2(floor(along / 2.2), floor(y / 2.6));
        lit = step(1.0 - vSeed.y * 1.1, hash(vec3(wid, vSeed.x)));
        // Переплёт рамы
        win *= 1.0 - step(abs(w.x - 0.5), 0.012) - step(abs(w.y - 0.55), 0.01);
        tone = hash(vec3(wid, 5.0)) < 0.5 ? vec3(1.0, 0.36, 0.72) : vec3(0.72, 0.9, 1.0);
        bright = 0.45;
      } else if (type < 0.5) {
        // Стеклянная навесная стена: ленты остекления, импосты, отражение неба
        win = step(0.28, fract(fy)) * step(0.06, fract(along / 1.2));
        float fres = pow(1.0 - abs(dot(N, V)), 3.0);
        wall = vec3(0.02, 0.025, 0.05) + uHazeGlow * fres * 0.6;
      } else if (type < 1.5) {
        vec2 f = vec2(fract(along / 0.36), fract(fy));
        win = step(0.16, f.x) * step(f.x, 0.84) * step(0.3, f.y) * step(f.y, 0.86);
        wall = vec3(0.034, 0.032, 0.048);
      } else {
        float fin = step(0.62, fract(along / 0.6));
        win = (1.0 - fin) * step(0.22, fract(fy));
        wall = mix(vec3(0.024, 0.024, 0.04), vec3(0.07, 0.066, 0.09), fin);
      }
      // Дальний слой — небоскрёбы: окон больше, они ярче — город «горит» в тумане
      float detail = layer > 1.5 ? 1.25 : 1.0;
      emit += tone * bright * win * lit * detail;
      float band = step(fract(y / 7.0), 0.035) * step(type, 2.5);
      wall *= 1.0 - 0.6 * band;
      emit *= 1.0 - band;
      float edge = (1.0 - smoothstep(0.0, 0.1, toEdge)) * step(0.01, dot(vTint, vec3(1.0)));
      float crown = (1.0 - smoothstep(0.0, 0.35, vSize.y * 0.5 - vMeters.y)) * step(0.01, dot(vTint, vec3(1.0)));
      emit += vTint * (edge * 0.9 + crown * 0.7);
    } else {
      wall = vec3(0.03, 0.028, 0.04);
    }

    // Свет вывесок на стенах и засветка улицы
    vec3 spill = vec3(0.0);
    for (int i = 0; i < ${MAX_LIGHTS}; i++) {
      if (i >= uLightCount) break;
      vec3 d = uLightPos[i] - vWorld;
      float att = 1.0 / (1.0 + dot(d, d) * 0.05);
      spill += uLightCol[i] * att * max(0.0, dot(N, normalize(d)));
    }
    // Засветка улицы пятнами: ярче там, где по высоте висят вывески
    float washSpot = 0.35 + 0.65 * smoothstep(0.2, 0.9, 0.5 + 0.5 * sin(vWorld.y * 0.21 + atan(vWorld.z, vWorld.x) * 5.0));
    vec3 wash = neonWash(vWorld, N) * washSpot * (layer < 0.5 ? 0.1 : layer < 1.5 ? 0.05 : 0.0);
    vec3 c = wall + wall * spill * 8.0 + spill * 0.07 + wall * wash * 7.0 + wash * 0.03 + emit * zoneMask();
    gl_FragColor = vec4(fogged(c, vDepth), 1.0);
  }
`;

/** Лицо вывески: текстура, яркость по зонам кадра, туман. */
function signFaceMaterial(shared, texture, intensity) {
  return new THREE.ShaderMaterial({
    uniforms: { ...shared, uMap: { value: texture }, uIntensity: { value: intensity } },
    side: THREE.DoubleSide,
    vertexShader: VARYING_DEPTH,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; uniform float uIntensity;
      varying vec2 vUv; varying float vDepth;
      ${ZONE_GLSL}
      ${FOG_GLSL}
      void main() {
        vec3 c = texture2D(uMap, vUv).rgb * uIntensity * zoneMask();
        // Вывеска — источник: туман её гасит слабее, чем стены
        gl_FragColor = vec4(mix(c, fogged(c, vDepth), 0.75), 1.0);
      }
    `,
  });
}

/** Ореол: свечение влажного воздуха вокруг короба; цвет — у каждого свой. */
function haloMaterial(shared, intensity) {
  return new THREE.ShaderMaterial({
    defines: { HAS_COLOR: '' },
    uniforms: { ...shared, uIntensity: { value: intensity } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: VARYING_DEPTH,
    fragmentShader: /* glsl */ `
      uniform float uIntensity;
      varying vec2 vUv; varying float vDepth; varying vec3 vColor;
      ${ZONE_GLSL}
      ${FOG_GLSL}
      void main() {
        vec3 uColor = vColor;
        vec2 q = abs(vUv - 0.5) * 2.0;
        float d = length(max(q - vec2(0.5), 0.0)) / 0.5;
        float a = pow(max(0.0, 1.0 - d), 2.0) * (1.0 - step(0.0, 0.5 - max(q.x, q.y)) * 0.55);
        gl_FragColor = vec4(uColor * a * uIntensity * zoneMask() * (1.0 - 0.6 * hazeAt(vDepth)), 1.0);
      }
    `,
  });
}

/** Бумажный фонарь: рёбра каркаса, тёмные крышки сверху и снизу, свет изнутри. */
function lanternMaterial(shared) {
  return new THREE.ShaderMaterial({
    uniforms: shared,
    vertexShader: /* glsl */ `
      attribute vec3 aColor; varying vec3 vColor; varying vec3 vP; varying float vDepth; varying vec3 vN; varying vec3 vView;
      void main() {
        vColor = aColor; vP = position; vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        vDepth = -mv.z; vView = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor; varying vec3 vP; varying float vDepth; varying vec3 vN; varying vec3 vView;
      ${ZONE_GLSL}
      ${FOG_GLSL}
      void main() {
        float ribs = 0.65 + 0.35 * smoothstep(0.0, 0.25, abs(fract(vP.y * 7.0) - 0.5));
        float cap = step(0.86, abs(vP.y));
        // Бумага светится ярче в середине и к краю силуэта — свет просвечивает
        float body = 0.7 + 0.5 * pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 1.5);
        vec3 c = mix(vColor * ribs * body * 1.3 * zoneMask(), vec3(0.03), cap);
        gl_FragColor = vec4(mix(c, fogged(c, vDepth), 0.7), 1.0);
      }
    `,
  });
}

/** Кондиционеры, лестницы, площадки: тёмный металл, засветка улицы, туман. */
function propMaterial(shared, albedo) {
  return new THREE.ShaderMaterial({
    uniforms: { ...shared, uAlbedo: { value: new THREE.Color(albedo) } },
    vertexShader: /* glsl */ `
      varying vec3 vWorld; varying vec3 vN; varying float vDepth; varying vec3 vP;
      void main() {
        vP = position;
        // Тот же материал и у одиночных деталей (короба вывесок), и у наборов
        mat4 inst = mat4(1.0);
        #ifdef USE_INSTANCING
          inst = instanceMatrix;
        #endif
        vec4 world = modelMatrix * inst * vec4(position, 1.0);
        vWorld = world.xyz; vN = normalize(mat3(modelMatrix * inst) * normal);
        vec4 mv = viewMatrix * world; vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uAlbedo;
      varying vec3 vWorld; varying vec3 vN; varying float vDepth; varying vec3 vP;
      ${FOG_GLSL}
      ${WASH_GLSL}
      void main() {
        vec3 n = normalize(vN);
        float top = max(0.0, n.y) * 0.5;
        vec3 c = uAlbedo * (0.35 + top) + uAlbedo * neonWash(vWorld, n) * 2.2;
        gl_FragColor = vec4(fogged(c, vDepth), 1.0);
      }
    `,
  });
}

/** Поток машин по эстакаде: короткие огни с промежутками, едут по кругу. */
function trafficMaterial(shared, color, speed, seed) {
  return new THREE.ShaderMaterial({
    uniforms: { ...shared, uColor: { value: new THREE.Color(color) }, uSpeed: { value: speed }, uSeed: { value: seed } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: VARYING_DEPTH,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uSpeed; uniform float uSeed; uniform float uTime;
      varying vec2 vUv; varying float vDepth;
      ${ZONE_GLSL}
      ${FOG_GLSL}
      float hash(float n) { return fract(sin(n) * 43758.5453); }
      void main() {
        float x = vUv.x * 900.0 + uTime * uSpeed;
        float slot = floor(x / 6.0);
        float car = step(0.55, hash(slot + uSeed)) * smoothstep(0.0, 0.3, fract(x / 6.0)) * (1.0 - smoothstep(0.3, 0.9, fract(x / 6.0)));
        gl_FragColor = vec4(uColor * car * 0.8 * zoneMask() * (1.0 - hazeAt(vDepth)), 1.0);
      }
    `,
  });
}

/**
 * @param {{ top: number, bottom: number }} span — высоты, которые проходит камера
 */
export function buildCity({ top, bottom }) {
  const group = new THREE.Group();
  const rnd = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(9001);
  const height = top - bottom;
  const shared = {
    uResolution: { value: new THREE.Vector2(1, 1) },
    uCalm: { value: 1 },
    uDensity: { value: 0.0098 },
    uHazeDeep: { value: new THREE.Color(HAZE_DEEP) },
    uHazeGlow: { value: new THREE.Color(HAZE_GLOW) },
    uTime: { value: 0 },
  };
  const axisY = new THREE.Vector3(0, 1, 0);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);

  // ── Здания: ближний переулок, средняя застройка, дальние небоскрёбы ──
  const LAYERS = [
    { count: 28, r: [40, 50], w: [6, 10], lit: [0.16, 0.36], tint: 0.15, types: [3, 3, 1] },
    { count: 40, r: [62, 80], w: [6, 11], lit: [0.1, 0.28], tint: 0.15, types: [0, 1, 2, 3] },
    { count: 60, r: [100, 150], w: [8, 15], lit: [0.16, 0.34], tint: 0.05, types: [0, 0, 2] },
  ];
  const TINTS = [INK.aqua, INK.magenta, INK.pink, INK.violet].map(c => new THREE.Color(c));
  const boxes = [];
  const towers = [];
  LAYERS.forEach((L, layer) => {
    for (let i = 0; i < L.count; i++) {
      const a = (i / L.count) * Math.PI * 2 + (rnd() - 0.5) * (Math.PI / L.count);
      const r = L.r[0] + rnd() * (L.r[1] - L.r[0]);
      const w = L.w[0] + rnd() * (L.w[1] - L.w[0]);
      const d = L.w[0] + rnd() * (L.w[1] - L.w[0]);
      const roofY = rnd() < 0.62 ? top + 8 + rnd() * 50 : top - 6 - rnd() * 36;
      const baseY = bottom - 60;
      q.setFromAxisAngle(axisY, -a + (rnd() - 0.5) * 0.3);
      const quat = q.clone();
      const center = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
      const type = L.types[Math.floor(rnd() * L.types.length)];
      const seed = [rnd() * 100, L.lit[0] + rnd() * (L.lit[1] - L.lit[0]), type, layer];
      const tint = rnd() < L.tint ? TINTS[Math.floor(rnd() * TINTS.length)].clone().multiplyScalar(layer ? 0.7 : 1) : null;
      const setback = layer > 0 && rnd() < 0.45 && roofY < top + 30;
      const breakY = setback ? roofY - 6 - rnd() * 14 : roofY;
      boxes.push({ pos: center.clone().setY((baseY + breakY) / 2), quat, size: [w, breakY - baseY, d], seed, tint: setback ? null : tint });
      if (setback) boxes.push({ pos: center.clone().setY((breakY + roofY) / 2), quat, size: [w * 0.68, roofY - breakY, d * 0.68], seed, tint });
      towers.push({ a, r, w: setback ? w * 0.68 : w, d: setback ? d * 0.68 : d, wBase: w, dBase: d, roofY, quat, center, layer, type });
    }
  });
  const near = towers.filter(t => t.layer === 0);
  const mid = towers.filter(t => t.layer === 1);

  // Переходы между соседними домами переулка
  near.forEach((t, i) => {
    if (rnd() > 0.45) return;
    const u = near[(i + 1) % near.length];
    const y = Math.min(t.roofY, u.roofY) - 4 - rnd() * Math.min(40, height * 0.6);
    const midP = t.center.clone().add(u.center).multiplyScalar(0.5).setY(y);
    const dir = u.center.clone().sub(t.center).normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
    boxes.push({ pos: midP, quat, size: [t.center.distanceTo(u.center), 1.6, 2.2], seed: [rnd() * 100, 0.6, 0, 0], tint: rnd() < 0.5 ? TINTS[1].clone().multiplyScalar(0.7) : null });
  });

  const facadeGeo = new THREE.BoxGeometry(1, 1, 1);
  const seeds = new Float32Array(boxes.length * 4);
  const tints = new Float32Array(boxes.length * 3);
  const lightPos = Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector3());
  const lightCol = Array.from({ length: MAX_LIGHTS }, () => new THREE.Color(0, 0, 0));
  const facadeUniforms = { ...shared, uLightPos: { value: lightPos }, uLightCol: { value: lightCol }, uLightCount: { value: 0 } };
  const facades = new THREE.InstancedMesh(facadeGeo, new THREE.ShaderMaterial({
    uniforms: facadeUniforms, vertexShader: facadeVertex, fragmentShader: facadeFragment,
  }), boxes.length);
  boxes.forEach((b, i) => {
    m.compose(b.pos, b.quat, new THREE.Vector3(...b.size));
    facades.setMatrixAt(i, m);
    seeds.set(b.seed, i * 4);
    if (b.tint) tints.set([b.tint.r, b.tint.g, b.tint.b], i * 3);
  });
  facadeGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  facadeGeo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tints, 3));
  facades.frustumCulled = false;
  group.add(facades);

  /** Точка на фасаде башни, обращённом к стволу: along — вдоль фасада, out — от стены. */
  const onFace = (t, along, y, out) => {
    const inward = new THREE.Vector3(-Math.cos(t.a), 0, -Math.sin(t.a));
    const tangent = new THREE.Vector3(-inward.z, 0, inward.x);
    return t.center.clone().addScaledVector(inward, Math.max(t.wBase, t.dBase) / 2 + out).addScaledVector(tangent, along).setY(y);
  };
  const faceQuat = t => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(-Math.cos(t.a), 0, -Math.sin(t.a)));

  // ── Кондиционеры: блоки на стенах переулка, решётка вентилятора спереди ──
  const acs = [];
  near.forEach(t => {
    const n = 7 + Math.floor(rnd() * 7);
    for (let k = 0; k < n; k++) {
      const y = bottom - 6 + rnd() * (Math.min(t.roofY, top + 10) - bottom + 2);
      acs.push({ p: onFace(t, (rnd() - 0.5) * t.wBase * 0.8, y, 0.3), q: faceQuat(t) });
    }
  });
  const acMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.95, 0.65, 0.55), propMaterial(shared, '#4a4c58'), acs.length);
  const fanMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(0.22, 20), propMaterial(shared, '#15161c'), acs.length);
  acs.forEach((a, i) => {
    m.compose(a.p, a.q, one);
    acMesh.setMatrixAt(i, m);
    const front = new THREE.Vector3(0.18, 0, 0.28).applyQuaternion(a.q).add(a.p);
    m.compose(front, a.q, one);
    fanMesh.setMatrixAt(i, m);
  });
  group.add(acMesh, fanMesh);

  // ── Пожарные лестницы: площадки с ограждением и марш между ними ──
  const platforms = [];
  near.forEach(t => {
    if (t.type !== 3 || rnd() < 0.35) return;
    const along = (rnd() - 0.5) * t.wBase * 0.4;
    const yTop = Math.min(t.roofY - 1, top + 12);
    for (let y = yTop; y > bottom - 10; y -= 3.2) platforms.push({ t, along, y });
  });
  const steelProp = propMaterial(shared, '#2b2d38');
  const deckMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(3, 0.08, 1.1), steelProp, platforms.length);
  const railMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(3, 0.04, 0.04), steelProp, platforms.length * 2);
  const postMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.04, 0.9, 0.04), steelProp, platforms.length * 4);
  const stairMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(3.4, 0.06, 0.6), steelProp, platforms.length);
  platforms.forEach(({ t, along, y }, i) => {
    const fq = faceQuat(t);
    m.compose(onFace(t, along, y, 0.55), fq, one);
    deckMesh.setMatrixAt(i, m);
    for (const [k, dy] of [[0, 0.9], [1, 0.45]]) {
      m.compose(onFace(t, along, y + dy, 1.08), fq, one);
      railMesh.setMatrixAt(i * 2 + k, m);
    }
    [-1.48, -0.5, 0.5, 1.48].forEach((dx, k) => {
      m.compose(onFace(t, along + dx, y + 0.45, 1.08), fq, one);
      postMesh.setMatrixAt(i * 4 + k, m);
    });
    // Марш вниз к следующей площадке — наклон ~45°
    const sq = fq.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (i % 2 ? 1 : -1) * 0.75));
    m.compose(onFace(t, along, y - 1.6, 0.6), sq, one);
    stairMesh.setMatrixAt(i, m);
  });
  group.add(deckMesh, railMesh, postMesh, stairMesh);

  // ── Провода поперёк переулка: провисают между соседними домами ──
  const wirePts = [];
  near.forEach((t, i) => {
    const u = near[(i + 1) % near.length];
    const n = 4 + Math.floor(rnd() * 5);
    for (let k = 0; k < n; k++) {
      const y = bottom - 4 + rnd() * (height + 6);
      const a = onFace(t, t.wBase * 0.45, y, 0.05);
      const b = onFace(u, -u.wBase * 0.45, y + (rnd() - 0.5) * 2, 0.05);
      const sag = 0.6 + rnd() * 1.6;
      let prev = a;
      for (let s = 1; s <= 14; s++) {
        const f = s / 14;
        const p = a.clone().lerp(b, f);
        p.y -= sag * 4 * f * (1 - f);
        wirePts.push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
        prev = p;
      }
    }
  });
  const wireGeo = new THREE.BufferGeometry();
  wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wirePts, 3));
  const wires = new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: '#07060c', fog: true }));
  wires.frustumCulled = false;
  group.add(wires);

  // ── Крыши: надстройка, мачта и заградительный огонь; у дальних небоскрёбов
  // — шпили с красным огнём на вершине ──
  const lowRoofs = towers.filter(t => t.roofY < top + 10 && t.layer < 2);
  const roofProp = propMaterial(shared, '#1e202a');
  const plant = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), roofProp, lowRoofs.length);
  const masts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.1, 1, 6), roofProp, lowRoofs.length);
  const spires = towers.filter(t => t.layer === 2 && rnd() < 0.18);
  const spireMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.6, 1, 8), roofProp, spires.length);
  const beacons = new THREE.InstancedMesh(new THREE.SphereGeometry(0.3, 10, 8), new THREE.MeshBasicMaterial({ color: '#ff2a3a', toneMapped: false, fog: false }), lowRoofs.length + spires.length);
  lowRoofs.forEach((t, i) => {
    const ph = 1.2 + rnd() * 1.8;
    m.compose(t.center.clone().setY(t.roofY + ph / 2), t.quat, new THREE.Vector3(t.w * 0.4, ph, t.d * 0.35));
    plant.setMatrixAt(i, m);
    const mh = 3 + rnd() * 6;
    const mp = t.center.clone().add(new THREE.Vector3((rnd() - 0.5) * t.w * 0.5, 0, (rnd() - 0.5) * t.d * 0.5));
    m.compose(mp.clone().setY(t.roofY + mh / 2), t.quat, new THREE.Vector3(1, mh, 1));
    masts.setMatrixAt(i, m);
    m.makeTranslation(mp.x, t.roofY + mh, mp.z);
    beacons.setMatrixAt(i, m);
  });
  spires.forEach((t, i) => {
    const sh = 14 + rnd() * 18;
    m.compose(t.center.clone().setY(t.roofY + sh / 2), t.quat, new THREE.Vector3(1, sh, 1));
    spireMesh.setMatrixAt(i, m);
    m.compose(t.center.clone().setY(t.roofY + sh), t.quat, new THREE.Vector3(2, 2, 2));
    beacons.setMatrixAt(lowRoofs.length + i, m);
  });
  group.add(plant, masts, spireMesh, beacons);

  // ── Эстакады: кольцевые трассы, по ним идёт поток ──
  const traffic = [];
  for (let k = 0; k < 4; k++) {
    const y = top - 10 - (k + 0.5) / 4 * (height - 10);
    const deck = new THREE.Mesh(new THREE.TorusGeometry(57, 0.35, 4, 256), new THREE.MeshStandardMaterial({ color: '#15161e', metalness: 0.6, roughness: 0.6 }));
    deck.rotation.x = Math.PI / 2;
    deck.scale.z = 0.35;
    deck.position.y = y;
    group.add(deck);
    for (const [dr, color, speed] of [[-0.25, '#e8eeff', 9], [0.25, '#ff3b5c', -7]]) {
      const lane = new THREE.Mesh(new THREE.TorusGeometry(57 + dr, 0.06, 4, 512), trafficMaterial(shared, color, speed, k * 13 + dr * 7));
      lane.rotation.x = Math.PI / 2;
      lane.position.y = y + 0.16;
      group.add(lane);
      traffic.push(lane);
    }
  }

  // ── Вывески: вертикальные неоновые короба на консолях, как в переулке,
  // и плоские на стенах. Только осмысленные надписи (перевод — рядом); одна
  // надпись встречается на нескольких домах — как сетевые заведения.
  // Каждая надпись — один набор экземпляров: десятки вывесок за пару вызовов
  const SIGNS = [
    { text: 'ラーメン', style: 'tube', accent: INK.aqua },                    // рамэн
    { text: '居酒屋', style: 'tube', accent: INK.magenta },                   // идзакая
    { text: 'カラオケ', style: 'tube', accent: INK.violet },                  // караоке
    { text: '焼鳥', style: 'tube', accent: INK.pink },                        // якитори
    { text: '寿司', style: 'tube', accent: INK.aqua },                        // суси
    { text: '喫茶', style: 'tube', accent: INK.pink },                        // кафе
    { text: '品質保証', style: 'tube', accent: INK.aqua, caption: 'QA' },     // обеспечение качества
    { text: '歌舞伎町', style: 'tube', accent: INK.magenta },                 // Кабукитё
    { text: '薬局', style: 'box', accent: INK.aqua },                          // аптека
    { text: '麻雀', style: 'tube', accent: INK.violet },                       // маджонг
    { text: '酒場', style: 'tube', accent: INK.magenta },                      // бар
    { text: '占い', style: 'tube', accent: INK.pink },                         // гадание
    { text: '決済通知', style: 'tube', accent: INK.magenta, caption: 'CALLBACK' }, // уведомление о платеже
    { text: 'モックサーバ', style: 'tube', accent: INK.violet, caption: 'MOCK' },  // мок-сервер
    { text: '中華料理', style: 'inverse', accent: INK.seal },                  // китайская кухня
    { text: '二十四時間', style: 'tube', accent: INK.pink },                   // круглосуточно
    { text: '古着', style: 'tube', accent: INK.aqua },                         // винтажная одежда
    { text: '試験環境', style: 'inverse', accent: INK.magenta, caption: 'TEST ENV' }, // тестовое окружение
    { text: '銭湯', style: 'tube', accent: INK.aqua },                         // баня
    { text: '本屋', style: 'tube', accent: INK.pink },                         // книжный
    { text: '営業中', style: 'tube', accent: INK.aqua, orient: 'h' },          // открыто
    { text: 'ホテル', style: 'tube', accent: INK.violet, orient: 'h' },        // отель
  ];
  const FAR_SIGNS = [
    { text: '新宿', style: 'tube', accent: INK.magenta },                      // Синдзюку
    { text: '信号幹線', style: 'tube', accent: INK.aqua },                     // сигнальная магистраль
    { text: '品質保証基盤', style: 'tube', accent: INK.violet },               // QA-платформа
    { text: '電気街', style: 'tube', accent: INK.aqua },                       // «электрический квартал»
    { text: '渋谷', style: 'tube', accent: INK.magenta },                      // Сибуя
    { text: '東京', style: 'tube', accent: INK.pink, orient: 'h' },            // Токио
  ];
  // Размещение: на каждом доме переулка — 3–5 вывесок на разных высотах,
  // на средних домах — по одной крупной
  const placed = [];
  near.forEach((t, ti) => {
    const n = 3 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) {
      const s = SIGNS[Math.floor(rnd() * SIGNS.length)];
      const y = bottom - 2 + ((k + rnd() * 0.8) / n) * (height + 4);
      placed.push({ s, t, y, side: (ti + k) % 2 ? 1 : -1, blade: (s.orient ?? 'v') === 'v' && rnd() < 0.75 });
    }
  });
  mid.forEach((t, ti) => {
    if (ti % 3) return;
    const s = FAR_SIGNS[(ti / 3) % FAR_SIGNS.length];
    placed.push({ s, t, y: bottom + rnd() * height, side: 1, blade: false, far: true, size: 9 + rnd() * 6 });
  });

  const textures = new Map();
  const texOf = s => {
    if (!textures.has(s.text)) textures.set(s.text, signTexture(s.text, { orient: s.orient ?? 'v', style: s.style, accent: s.accent, caption: s.caption, raw: true }));
    return textures.get(s.text);
  };
  const faces = new Map();   // text → [matrix, …]
  const boxMats = [];
  const haloMats = [];
  const haloCols = [];
  const lanterns = [];
  const zAxis = new THREE.Vector3(0, 0, 1);
  const tmpQ = new THREE.Quaternion();
  let light = 0;
  placed.forEach((p, k) => {
    const { s, t } = p;
    const { aspect } = texOf(s);
    const vertical = (s.orient ?? 'v') === 'v';
    const H = p.size ?? (vertical ? 3.2 + rnd() * 3 : 1.6 + rnd() * 0.8);
    const W = H * aspect;
    const y = Math.min(p.y, t.roofY - H / 2 - 1);
    const along = p.side * t.wBase * (0.18 + rnd() * 0.2);
    // Короб: на консоли поперёк стены или плоско на фасаде
    const pos = onFace(t, along, y, p.blade ? W / 2 + 0.55 : 0.25);
    const quat = faceQuat(t);
    if (p.blade) quat.multiply(tmpQ.setFromAxisAngle(axisY, Math.PI / 2 + p.side * 0.22));
    const normal = zAxis.clone().applyQuaternion(quat);
    const list = faces.get(s.text) ?? [];
    list.push(new THREE.Matrix4().compose(pos.clone().addScaledVector(normal, 0.005), quat, new THREE.Vector3(W, H, 1)));
    boxMats.push(new THREE.Matrix4().compose(pos.clone().addScaledVector(normal, -0.13), quat, new THREE.Vector3(W + 0.16, H + 0.16, 0.24)));
    haloMats.push(new THREE.Matrix4().compose(pos.clone().addScaledVector(normal, 0.03), quat, new THREE.Vector3(W * 2.2, H + W * 1.2, 1)));
    haloCols.push(new THREE.Color(s.accent).multiplyScalar(p.far ? 0.55 : 1));
    if (p.blade) {
      // Вторая сторона — надпись читается и с другого конца переулка
      const back = quat.clone().multiply(tmpQ.setFromAxisAngle(axisY, Math.PI));
      list.push(new THREE.Matrix4().compose(pos.clone().addScaledVector(normal, -0.265), back, new THREE.Vector3(W, H, 1)));
      haloMats.push(new THREE.Matrix4().compose(pos.clone().addScaledVector(normal, -0.29), back, new THREE.Vector3(W * 2.2, H + W * 1.2, 1)));
      haloCols.push(new THREE.Color(s.accent));
    }
    faces.set(s.text, list);
    // Пара фонарей под частью вывесок переулка
    if (!p.far && k % 4 === 0) {
      for (const dx of [-0.85, 0.85]) lanterns.push({ p: onFace(t, along + dx, y - H / 2 - 1.1, 0.75), color: k % 8 ? INK.seal : INK.pink });
    }
    if (light < MAX_LIGHTS && !p.far && k % 4 === 1) {
      lightPos[light].copy(pos).add(new THREE.Vector3(-Math.cos(t.a), 0, -Math.sin(t.a)).multiplyScalar(1.5));
      lightCol[light].set(s.accent);
      light++;
    }
  });
  facadeUniforms.uLightCount.value = light;

  const unit = new THREE.PlaneGeometry(1, 1);
  for (const [text, mats] of faces) {
    const s = [...SIGNS, ...FAR_SIGNS].find(x => x.text === text);
    const mesh = new THREE.InstancedMesh(unit, signFaceMaterial(shared, texOf(s).texture, s.style === 'inverse' ? 1.05 : 1.4), mats.length);
    mats.forEach((mm, i) => mesh.setMatrixAt(i, mm));
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  const signMetal = propMaterial(shared, '#16161e');
  const boxMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), signMetal, boxMats.length);
  boxMats.forEach((mm, i) => boxMesh.setMatrixAt(i, mm));
  const haloGeo = new THREE.PlaneGeometry(1, 1);
  const haloColAttr = new Float32Array(haloCols.length * 3);
  haloCols.forEach((col, i) => haloColAttr.set([col.r, col.g, col.b], i * 3));
  haloGeo.setAttribute('aColor', new THREE.InstancedBufferAttribute(haloColAttr, 3));
  const halos = new THREE.InstancedMesh(haloGeo, haloMaterial(shared, 0.55), haloMats.length);
  haloMats.forEach((mm, i) => halos.setMatrixAt(i, mm));
  for (const mesh of [boxMesh, halos]) { mesh.frustumCulled = false; group.add(mesh); }

  // ── Бумажные фонари: красные и розовые, висят парами на крюках ──
  const lanternGeo = new THREE.SphereGeometry(1, 20, 14);
  const lanternColors = new Float32Array(lanterns.length * 3);
  const lanternMesh = new THREE.InstancedMesh(lanternGeo, lanternMaterial(shared), lanterns.length);
  const hooks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 0.5, 0.03), signMetal, lanterns.length);
  const c = new THREE.Color();
  lanterns.forEach((l, i) => {
    m.compose(l.p, new THREE.Quaternion(), new THREE.Vector3(0.38, 0.5, 0.38));
    lanternMesh.setMatrixAt(i, m);
    m.compose(l.p.clone().setY(l.p.y + 0.72), new THREE.Quaternion(), one);
    hooks.setMatrixAt(i, m);
    c.set(l.color);
    lanternColors.set([c.r, c.g, c.b], i * 3);
  });
  lanternGeo.setAttribute('aColor', new THREE.InstancedBufferAttribute(lanternColors, 3));
  group.add(lanternMesh, hooks);

  return {
    group,
    shared,
    towers,   // для надстроек будущего (future.js)
    update(t) { shared.uTime.value = t; },
    /** Размер буфера кадра в пикселях устройства — для маски зон. */
    setResolution(w, h) { shared.uResolution.value.set(w, h); },
    /** 0..1 — насколько приглушать город за контентом. */
    setCalm(v) { shared.uCalm.value = v; },
    /** Слабое устройство: без ореолов и потока, меньше источников подсветки. */
    lowPower() {
      halos.visible = false;
      traffic.forEach(l => { l.visible = false; });
      facadeUniforms.uLightCount.value = Math.min(light, 8);
    },
  };
}
