// Воздух города: то, что на рендерах R01 / R05A делает кадр «снятым», а не
// макетом. Всё — слои глубины, а не один плоский оверлей:
//   · сакура — лепестки из Blender (props.glb: изогнутая пластина с выемкой
//     и толщиной) в объёме вокруг камеры: падают с разной скоростью, качаются,
//     кувыркаются по нескольким осям, идут волнами порывов, появляются плавно;
//   · дымка — мягкие пятна пара между кварталами, тонированные неоном,
//     и лёгкий пар у основания каждой консоли;
//   · транспорт — четыре модели машин из Blender на воздушных кольцах, которые
//     build_city.py проверил по геометрии города (не ближе 4,5 м к стенам);
//     в одном кольце у всех одна скорость — обгонов и столкновений нет;
//   · прожекторы — медленно качающиеся конусы света с высотных шпилей.
// Яркость сдержана: за слайдом город — фон, текст карточки остаётся главным.
// Мигания нет (WCAG 2.3.1): всё меняется плавно.

import * as THREE from '../3d/vendor/three.module.js';

/** Мягкое пятно пара: радиальный спад и шумовая рваность края. */
function mistTexture() {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const blobs = Array.from({ length: 9 }, () => [0.3 + rnd() * 0.4, 0.3 + rnd() * 0.4, 0.12 + rnd() * 0.2]);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      let a = 0;
      for (const [bx, by, br] of blobs) a += Math.exp(-(((u - bx) ** 2 + (v - by) ** 2) / (br * br)));
      const edge = Math.max(0, 1 - Math.hypot(u - 0.5, v - 0.5) * 2);
      img.data[(y * size + x) * 4 + 3] = Math.min(255, a * edge * edge * 120);
      img.data.fill(255, (y * size + x) * 4, (y * size + x) * 4 + 3);
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Шлейф за машиной: горячий у сопла, тает к хвосту и к краям. */
function trailTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 8;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 64, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 8);
  const edge = g.createLinearGradient(0, 0, 0, 8);
  edge.addColorStop(0, 'rgba(0,0,0,1)'); edge.addColorStop(0.5, 'rgba(0,0,0,0)'); edge.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = edge;
  g.fillRect(0, 0, 64, 8);
  return new THREE.CanvasTexture(c);
}

/** Конус прожектора: свет плотнее у оси и у источника, без жёсткого края. */
const beamMaterial = color => new THREE.ShaderMaterial({
  uniforms: { uColor: { value: new THREE.Color(color) } },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */ `
    uniform vec3 uColor; varying vec2 vUv;
    void main() {
      float along = vUv.y;                           // 1 у источника (вершина конуса)
      float axis = 1.0 - abs(vUv.x - 0.5) * 2.0;    // развёртка по окружности
      float a = pow(along, 1.6) * (0.35 + 0.65 * axis * axis) * 0.09;
      gl_FragColor = vec4(uColor * a, 1.0);
    }
  `,
});

// Машины: длина в единицах сцены (метры × 0,5) и крейсерская скорость, ед./с
const TYPES = {
  'VEH-01': { length: 1.8, speed: 6.5, weight: 3 },   // курьер
  'VEH-02': { length: 2.4, speed: 7.5, weight: 3 },   // седан
  'VEH-03': { length: 3.3, speed: 4.0, weight: 2 },   // грузовой
  'VEH-04': { length: 2.5, speed: 8.0, weight: 1 },   // патруль
};

/**
 * @param {THREE.Scene} scene
 * @param {{ top: number, bottom: number, mounts: () => THREE.Vector3[], reduced: boolean, small: boolean }} opts
 */
export function createAtmosphere(scene, { top, bottom, mounts, reduced, small }) {
  const group = new THREE.Group();
  scene.add(group);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  // ── Дымка: пятна пара в кварталах за шахтой и у консолей ──
  const mistMap = mistTexture();
  const tints = ['#6a4aa8', '#2c6a9a', '#9a3a8a', '#3a4a7a'];
  const mist = [];
  const MIST = small ? 26 : 48;
  for (let i = 0; i < MIST; i++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({
      map: mistMap, color: tints[i % tints.length], transparent: true, opacity: 0.16 + rnd() * 0.12,
      depthWrite: false, fog: true,
    }));
    const a = rnd() * Math.PI * 2;
    const r = 28 + rnd() * 30;
    const s = 18 + rnd() * 26;
    m.scale.set(s, s * 0.45, 1);
    m.position.set(Math.cos(a) * r, bottom + rnd() * (top - bottom), Math.sin(a) * r);
    m.userData = { a, r, y: m.position.y, speed: (rnd() - 0.5) * 0.01 };
    group.add(m);
    mist.push(m);
  }
  // Пар у основания консолей: связывает экран с башней, как дымка у вывесок R05A
  const steam = [];
  const placeSteam = () => {
    for (const p of mounts()) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistMap, color: '#8a9ac8', transparent: true, opacity: 0.1, depthWrite: false, fog: true }));
      m.scale.set(9, 3, 1);
      m.position.copy(p).multiplyScalar(0.7).setY(p.y - 4.2);
      m.userData = { y: m.position.y, phase: rnd() * 6.28 };
      group.add(m);
      steam.push(m);
    }
  };

  // ── Прожекторы: конусы со шпилей, медленный качающийся обзор ──
  const beams = [];
  const beamGeo = new THREE.ConeGeometry(5, 70, 24, 1, true);
  beamGeo.translate(0, -35, 0);   // вершина конуса — в источнике
  beamGeo.rotateX(Math.PI);       // конус светит вверх
  for (let i = 0; i < (small ? 3 : 6); i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    const r = 42 + rnd() * 14;
    const beam = new THREE.Mesh(beamGeo, beamMaterial(i % 2 ? '#7cf0ff' : '#ff6fd8'));
    beam.position.set(Math.cos(a) * r, top - 6 - rnd() * 14, Math.sin(a) * r);
    beam.userData = { phase: rnd() * 6.28, tilt: 0.35 + rnd() * 0.3 };
    group.add(beam);
    beams.push(beam);
  }

  // Транспорт и лепестки появляются, когда загружен props.glb (setProps)
  let traffic = null;
  let petals = null;

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  const UP = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const euler = new THREE.Euler();
  let time = 0;

  /** Машины по кольцам: тип, место в кольце и общая для кольца скорость. */
  function buildTraffic({ vehicles, lanes }) {
    const types = vehicles.filter(v => v.parts.length);
    if (!types.length || !lanes.length) return null;
    const bag = types.flatMap(v => Array(TYPES[v.name]?.weight ?? 1).fill(v));
    // Кольца вперемешку по высоте; сначала те, что внутри города (до 62 ед. — край города),
    // их видно от карточек, внешние за домами только добирают число
    const pool = lanes.map(l => ({ ...l, k: rnd() + (l.r > 62 ? 1 : 0) })).sort((a, b) => a.k - b.k).slice(0, small ? 14 : 30);
    const cars = [];
    pool.forEach((lane, li) => {
      const dir = li % 2 ? 1 : -1;
      const n = 1 + Math.floor(rnd() * (small ? 2 : 4));
      const kinds = Array.from({ length: n }, () => bag[Math.floor(rnd() * bag.length)]);
      // Скорость кольца — по самому медленному: машины одного кольца не догоняют друг друга
      const speed = Math.min(...kinds.map(v => TYPES[v.name].speed)) * (0.8 + rnd() * 0.3);
      const start = rnd() * Math.PI * 2;
      kinds.forEach((v, i) => cars.push({
        type: v.name, r: lane.r, y: lane.y, dir, w: speed / lane.r,
        a: start + (i / n) * Math.PI * 2 + (rnd() - 0.5) * (1.2 / n), bob: rnd() * 6.28,
      }));
    });
    const byType = new Map(types.map(v => [v.name, cars.filter(c => c.type === v.name)]));
    const meshes = [];
    for (const v of types) {
      const list = byType.get(v.name);
      if (!list.length) continue;
      for (const part of v.parts) {
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, list.length);
        mesh.frustumCulled = false;
        // Окраска: у каждой машины свой оттенок той же краски
        if (part.material.name?.startsWith('M_VehPaint')) {
          const c = new THREE.Color();
          list.forEach((_, i) => mesh.setColorAt(i, c.setScalar(0.75 + rnd() * 0.5)));
        }
        group.add(mesh);
        meshes.push({ mesh, list });
      }
    }
    // Шлейф: полоса за кормой, аддитивная, гаснет к хвосту
    const trailGeo = new THREE.PlaneGeometry(1, 0.22).rotateX(-Math.PI / 2).translate(-0.5, 0, 0);
    const trail = new THREE.InstancedMesh(trailGeo, new THREE.MeshBasicMaterial({
      map: trailTexture(), color: '#ff4a5c', transparent: true, opacity: 0.55, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true,
    }), cars.length);
    trail.frustumCulled = false;
    group.add(trail);
    return { cars, meshes, trail };
  }

  /** Лепестки: живые падают, умершие ждут своей волны и появляются вырастая. */
  function buildPetals(petal) {
    if (!petal || reduced) return null;
    const COUNT = small ? 220 : 520;
    const material = petal.material.clone();
    material.side = THREE.DoubleSide;
    // На тёмном фасаде лепесток должен читаться: подсветка ярче, чем в Blender, но не до белого
    material.emissiveIntensity *= 1.5;
    const mesh = new THREE.InstancedMesh(petal.geometry, material, COUNT);
    mesh.frustumCulled = false;
    const BOX = { x: 26, y: 22, z: 26 };
    const list = [];
    const c = new THREE.Color();
    for (let i = 0; i < COUNT; i++) {
      const axis = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
      const axis2 = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
      list.push({
        p: new THREE.Vector3((rnd() - 0.5) * BOX.x, (rnd() - 0.5) * BOX.y, (rnd() - 0.5) * BOX.z),
        fall: 0.35 + rnd() * 0.75, sway: 0.25 + rnd() * 0.6, swayF: 0.4 + rnd() * 0.9, phase: rnd() * 6.28,
        axis, axis2, spin: (0.6 + rnd() * 2.2) * (rnd() < 0.5 ? -1 : 1), flutter: 0.4 + rnd() * 0.9,
        size: 0.3 + rnd() * rnd() * 0.5, age: 0, alive: rnd() < 0.45,
      });
      // От насыщенно-розового до бледного: лепестки не одного цвета
      mesh.setColorAt(i, c.setHSL(0.93 + rnd() * 0.05, 0.65 + rnd() * 0.3, 0.6 + rnd() * 0.18));
      list[i].age = list[i].alive ? 10 : 0;
    }
    group.add(mesh);
    return { mesh, list, BOX, budget: 0, active: COUNT };
  }

  function updateTraffic(move) {
    const { cars, meshes, trail } = traffic;
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      c.a += c.w * c.dir * move;
      c.px = Math.cos(c.a) * c.r;
      c.pz = Math.sin(c.a) * c.r;
      c.py = c.y + Math.sin(time * 0.6 + c.bob) * 0.15;
      // Нос — по касательной к кольцу; лёгкий крен в повороте
      c.yaw = -c.a - c.dir * Math.PI / 2;
    }
    for (const { mesh, list } of meshes) {
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        euler.set(c.dir * 0.06, c.yaw, 0, 'YXZ');
        mesh.setMatrixAt(i, m4.compose(pos.set(c.px, c.py, c.pz), q.setFromEuler(euler), one));
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      const len = TYPES[c.type].length;
      euler.set(0, c.yaw, 0, 'YXZ');
      q.setFromEuler(euler);
      // Шлейф начинается у кормы и тянется назад на две длины машины
      pos.set(-len * 0.5, 0.1, 0).applyQuaternion(q).add(scl.set(c.px, c.py, c.pz));
      trail.setMatrixAt(i, m4.compose(pos, q, scl.set(len * 2, 1, 1)));
    }
    trail.instanceMatrix.needsUpdate = true;
  }

  function updatePetals(move, camera) {
    const P = petals;
    const { BOX } = P;
    const cam = camera.position;
    // Порывы: медленная волна с неровным периодом — то густо, то почти пусто
    const gust = Math.max(0, Math.sin(time * 0.42 + Math.sin(time * 0.13) * 1.7)) ** 2;
    const rate = (P.active * 0.035) * (0.5 + 1.4 * gust);   // рождений в секунду
    P.budget += rate * move;
    const windX = 0.35 + 0.9 * gust;
    const windZ = 0.25 * Math.sin(time * 0.07);
    const wrap = (v, size, c) => c + ((((v - c) % size) + size * 1.5) % size) - size / 2;
    for (let i = 0; i < P.active; i++) {
      const s = P.list[i];
      if (!s.alive) {
        // Новый лепесток — по неровному графику, в верхней трети объёма, вырастает за ~0,8 с
        if (P.budget >= 1 && rnd() < 0.5) {
          P.budget -= 1;
          s.alive = true;
          s.age = 0;
          s.p.set(cam.x + (rnd() - 0.5) * BOX.x, cam.y + BOX.y * (0.15 + rnd() * 0.35), cam.z + (rnd() - 0.5) * BOX.z);
        } else {
          P.mesh.setMatrixAt(i, m4.makeScale(0, 0, 0));
          continue;
        }
      }
      s.age += move;
      const sw = Math.sin(time * s.swayF + s.phase);
      s.p.x += (windX + sw * s.sway) * move;
      s.p.z += (windZ + Math.cos(time * s.swayF * 0.8 + s.phase) * s.sway * 0.6) * move;
      // Плашмя лепесток падает медленнее: скорость зависит от фазы кувырка
      s.p.y -= s.fall * (0.7 + 0.3 * Math.abs(sw)) * move;
      // Камера ушла — лепесток переносится по кругу объёма вокруг неё
      s.p.x = wrap(s.p.x, BOX.x, cam.x);
      s.p.z = wrap(s.p.z, BOX.z, cam.z);
      if (s.p.y < cam.y - BOX.y / 2 || s.p.y > cam.y + BOX.y / 2 + 2) { s.alive = false; P.mesh.setMatrixAt(i, m4.makeScale(0, 0, 0)); continue; }
      q.setFromAxisAngle(s.axis, time * s.spin + s.phase);
      q2.setFromAxisAngle(s.axis2, Math.sin(time * s.flutter * 3 + s.phase) * 0.9);
      q.multiply(q2);
      const grow = Math.min(1, s.age / 0.8);
      const k = s.size * grow * grow * (3 - 2 * grow);
      P.mesh.setMatrixAt(i, m4.compose(s.p, q, scl.set(k, k, k)));
    }
    P.budget = Math.min(P.budget, 8);
    P.mesh.instanceMatrix.needsUpdate = true;
  }

  return {
    /** Пар у консолей ставится, когда известны точки крепления (после загрузки города). */
    placeSteam,
    /** Машины и лепестки из props.glb (citymodel.js loadProps). */
    setProps(props) {
      traffic = buildTraffic(props);
      petals = buildPetals(props.petal);
    },
    lowPower() {
      beams.forEach(b => (b.visible = false));
      if (petals) {
        petals.active = Math.floor(petals.list.length / 2);
        petals.mesh.count = petals.active;
      }
    },
    update(t, dt, camera) {
      const move = reduced ? 0 : Math.min(dt, 0.1);
      time += move;
      for (const m of mist) {
        const u = m.userData;
        u.a += u.speed * move;
        m.position.set(Math.cos(u.a) * u.r, u.y + Math.sin(time * 0.1 + u.a * 3) * 1.5, Math.sin(u.a) * u.r);
      }
      for (const m of steam) {
        m.position.y = m.userData.y + Math.sin(time * 0.3 + m.userData.phase) * 0.4;
        m.material.opacity = 0.08 + 0.04 * Math.sin(time * 0.5 + m.userData.phase);
      }
      if (traffic) updateTraffic(move);
      if (petals) updatePetals(move, camera);
      for (const b of beams) {
        const u = b.userData;
        b.rotation.set(Math.sin(time * 0.12 + u.phase) * u.tilt, 0, Math.cos(time * 0.09 + u.phase) * u.tilt);
      }
    },
  };
}
