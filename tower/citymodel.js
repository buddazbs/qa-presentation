// Город из Blender (blender/build_city.py → tower/assets/city.glb).
//
// Модель в метрах, Z вверх; экспорт glTF переводит в Y вверх, а сцена
// презентации живёт в единицах «метр × 0,5» (scene_spec.json → slide_mounts).
// Слайды висят на центральной башне TWR-00: точки крепления и логотип
// лежат в extras узла CITY_ROOT (slide_mounts_yup, logo_anchor_yup) — пустые
// узлы MOUNT-xx оптимизатор GLB вырезает. Здесь же оживает неон: вывески
// мерцают, окна дышат, а за плотными слайдами город приглушается.

import * as THREE from '../3d/vendor/three.module.js';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';
import { MeshoptDecoder } from './vendor/libs/meshopt_decoder.module.js';

export const CITY_SCALE = 0.5;
// Ночь темнее, чем свет в Blender: стены и окна приглушены, контраст дают вывески
const WALL_DIM = 0.6;
const WINDOW_DIM = 0.42;
const NEON_DIM = 0.6;
// Анизотропия текстур вывесок: под углом к камере знаки не расплываются
const SIGN_ANISOTROPY = 8;

/** Телефон и слабые устройства получают облегчённую модель без мелких деталей. */
function pickModel() {
  // Телефон: короткая сторона экрана меньше 600 px. Проектор 1280×720 — полная модель
  const small = Math.min(screen.width, screen.height) < 600;
  const weak = (navigator.hardwareConcurrency || 8) <= 4;
  return new URL(`assets/${small || weak ? 'city_lite' : 'city'}.glb`, import.meta.url).href;
}

/**
 * @param {THREE.Scene} scene
 * @param {{ material(k: number): THREE.Material | null }} [screens] видеоэкраны (screens.js) для граней M_Video_<канал>
 * @returns {Promise<{ mounts: THREE.Vector3[], logo: THREE.Vector3 | null, update(t: number): void, setCalm(k: number): void, lowPower(): void }>}
 */
export async function loadCity(scene, screens) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(pickModel());
  const root = gltf.scene;
  root.scale.setScalar(CITY_SCALE);
  scene.add(root);
  root.updateMatrixWorld(true);

  // Точки консолей и логотипа: метры в осях glTF → мир сцены через масштаб корня
  // (glTF → три: extras узла лежат в userData; узел CITY_ROOT — внутри gltf.scene)
  const cityRoot = root.getObjectByName('CITY_ROOT') || root;
  const toWorld = (list, i) => cityRoot.parent.localToWorld(new THREE.Vector3(list[i], list[i + 1], list[i + 2]));
  const flat = cityRoot.userData.slide_mounts_yup || [];
  const mounts = [];
  for (let i = 0; i < flat.length; i += 3) mounts.push(toWorld(flat, i));
  const logo = cityRoot.userData.logo_anchor_yup ? toWorld(cityRoot.userData.logo_anchor_yup, 0) : null;
  // Материалы по ролям: вывески мерцают, окна дышат, неон держит яркость
  const signs = [];
  const windows = [];
  const neon = [];
  const seen = new Set();
  // Вывески — как в основной презентации (signage.js): текстура выводится
  // без тон-маппинга и с яркостью 1. Через PBR-свечение 2,2–2,6 под ACES
  // насыщенные знаки выгорали в пятна, а ореол пост-эффекта их размывал
  const isSign = mat => mat.name.startsWith('M_SignAtlas') || mat.name === 'M_Ads' || mat.name === 'M_Monitors';
  const basic = new Map();
  const signMaterial = mat => {
    if (!basic.has(mat)) {
      const map = mat.emissiveMap;
      map.anisotropy = SIGN_ANISOTROPY;
      const m = new THREE.MeshBasicMaterial({ map, toneMapped: false, name: mat.name });
      basic.set(mat, m);
      signs.push({ mat: m, base: mat.name === 'M_Monitors' ? 0.8 : 1 });
      mat.dispose();
    }
    return basic.get(mat);
  };
  const swap = m => {
    const video = /^M_Video_(\d+)/.exec(m.name);
    if (video && screens?.material(+video[1])) { m.dispose(); return screens.material(+video[1]); }
    return isSign(m) ? signMaterial(m) : m;
  };
  root.traverse(o => {
    if (!o.isMesh) return;
    // Город статичен: матрицы считаются один раз
    o.matrixAutoUpdate = false;
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
    for (const mat of [o.material].flat()) {
      if (seen.has(mat) || mat.isMeshBasicMaterial) continue;
      seen.add(mat);
      mat.color.multiplyScalar(WALL_DIM);
      const entry = { mat, base: mat.emissiveIntensity };
      if (mat.name.startsWith('M_Facade')) { entry.base *= WINDOW_DIM; windows.push(entry); }
      // Неон без текстур оптимизатор GLB сводит в палитру: PaletteMaterial* — это он
      else if (mat.name.endsWith('Emission') || mat.name.startsWith('PaletteMaterial')) { entry.base *= NEON_DIM; neon.push(entry); }
      // Шероховатый тёмный металл без карты окружения выглядит пластиком
      mat.envMapIntensity = 0.8;
    }
  });

  let level = 1;   // 1 — полная яркость; за плотным слайдом тише
  let flicker = true;
  return {
    mounts,
    logo,
    update(t) {
      for (let i = 0; i < signs.length; i++) {
        const s = signs[i];
        // Редкий сбой питания: короткий провал раз в несколько секунд
        const blink = flicker && Math.sin(t * 7.3 + i * 2.1) > 0.985 ? 0.35 : 1;
        s.mat.color.setScalar(s.base * (0.75 + 0.25 * level) * blink * (0.94 + 0.06 * Math.sin(t * 1.7 + i)));
      }
      for (let i = 0; i < windows.length; i++) {
        windows[i].mat.emissiveIntensity = windows[i].base * (0.55 + 0.45 * level) * (0.96 + 0.04 * Math.sin(t * 0.4 + i * 1.3));
      }
      for (const n of neon) n.mat.emissiveIntensity = n.base * (0.7 + 0.3 * level);
    },
    /** Спокойствие как у city.js: 1 — плотный слайд, город тише; 0,35 — вступление и титулы. */
    setCalm(c) { level = 1 - 0.45 * c; },
    lowPower() { flicker = false; },
  };
}

/**
 * Транспорт и лепесток сакуры (blender/build_city.py → tower/assets/props.glb):
 * четыре модели машин VEH-01…04 и PETAL — геометрия с материалами частей,
 * плюс свободные воздушные коридоры, проверенные в Blender по геометрии города
 * (extras PROPS_ROOT.air_lanes_m: радиус и высота кольца в метрах).
 * @returns {Promise<{ vehicles: { name: string, parts: { geometry: THREE.BufferGeometry, material: THREE.Material }[] }[],
 *   petal: { geometry: THREE.BufferGeometry, material: THREE.Material } | null, lanes: { r: number, y: number }[] }>}
 */
export async function loadProps() {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(new URL('assets/props.glb', import.meta.url).href);
  const root = gltf.scene.getObjectByName('PROPS_ROOT');
  const parts = name => {
    const out = [];
    root.getObjectByName(name)?.traverse(o => {
      if (!o.isMesh) return;
      // Узел в Blender стоит со сдвигом раскладки — нужна только форма: метры → единицы сцены
      const geometry = o.geometry.clone().scale(CITY_SCALE, CITY_SCALE, CITY_SCALE);
      out.push({ geometry, material: o.material });
    });
    return out;
  };
  const flat = root.userData.air_lanes_m || [];
  const lanes = [];
  for (let i = 0; i < flat.length; i += 2) lanes.push({ r: flat[i] * CITY_SCALE, y: flat[i + 1] * CITY_SCALE });
  const vehicles = ['VEH-01', 'VEH-02', 'VEH-03', 'VEH-04'].map(name => ({ name, parts: parts(name) }));
  return { vehicles, petal: parts('PETAL')[0] || null, lanes };
}
