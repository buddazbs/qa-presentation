// Логотип QA Platform в 3D — тот же знак, которым заканчивается вступление
// (signal/intro.js): тёмная плитка со скруглёнными углами, тонкое
// циановое кольцо по краю, три слоя знака Layers циановой трубкой на разной
// высоте над плиткой, верхний — почти белый. Вступление садит свой плоский
// знак ровно на эту плитку (logoRect в main.js) и растворяется в нём —
// поэтому пропорции, цвета и высоты слоёв здесь те же, что в intro.css:
// плитка 220, скругление 48, знак 152, слои на 8/22/36 над плиткой.
//
// Знак собран во вступлении, поэтому здесь он с первого кадра целый и стоит
// лицом к камере. Покачивание и отклик на курсор плавно набираются уже после
// перехода — в момент стыка знак неподвижен, шва не видно.
//
// Знак — иконка Layers из Lucide (ISC License, © Lucide Icons and
// Contributors). Её контуры не перерисованы вручную: браузер сам проходит
// по SVG-пути (getPointAtLength), а по точкам строится трубка — штрих
// становится объёмным, с круглыми концами, как stroke-linecap у иконки.

import * as THREE from '../3d/vendor/three.module.js';
import { INK } from './signage.js';
import { roundedRect } from './column.js';

// Сверху вниз: ромб верхнего слоя и два «уголка» под ним
const LAYER_PATHS = [
  'M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z',
  'M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12',
  'M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17',
];

export const TILE = 1.9;                // сторона плитки
const PX = TILE / 220;                  // единица макета вступления (плитка 220)
const RADIUS = 48 * PX;                 // скругление углов
const DEPTH = 0.12;                     // толщина плитки
const GLYPH = 152 * PX;                 // ширина знака
const STROKE = 0.032;                   // радиус трубки штриха (stroke 1,5 из 24 — и чуть толще, для объёма)
const LIFT = [36, 22, 8].map(z => z * PX); // высота слоя над плиткой: верхний — выше всех
// Покачивание после перехода: ждёт, пока вступление уйдёт, и набирается за SWAY_IN
const SWAY_AFTER = 2.6;
const SWAY_IN = 2.5;

/** Точки SVG-пути в координатах плитки. Нужен DOM — путь меряет браузер. */
function samplePath(d) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  svg.append(path);
  svg.style.cssText = 'position:absolute;width:0;height:0;visibility:hidden';
  document.body.append(svg);
  const length = path.getTotalLength();
  const steps = Math.max(24, Math.round(length * 6));
  const k = GLYPH / 24;
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const p = path.getPointAtLength((i / steps) * length);
    points.push(new THREE.Vector3((p.x - 12) * k, -(p.y - 12) * k, 0));
  }
  svg.remove();
  return points;
}

/** Мягкое свечение вокруг плитки — как box-shadow «готово» у знака вступления. */
function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const g = canvas.getContext('2d');
  g.filter = 'blur(22px)';
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.roundRect(56, 56, 144, 144, 32);
  g.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Слой знака: трубка штриха, круглые концы у открытых путей и едва заметная
 * заливка — как fill у слоёв во вступлении.
 */
function buildLayer(d, line, fill) {
  const layer = new THREE.Group();
  const points = samplePath(d);
  const closed = /z$/i.test(d);
  const curve = new THREE.CatmullRomCurve3(closed ? points.slice(0, -1) : points, closed, 'centripetal');
  layer.add(new THREE.Mesh(new THREE.TubeGeometry(curve, points.length * 2, STROKE, 12, closed), line));
  if (!closed) {
    const cap = new THREE.SphereGeometry(STROKE, 12, 8);
    for (const end of [points[0], points[points.length - 1]]) {
      const ball = new THREE.Mesh(cap, line);
      ball.position.copy(end);
      layer.add(ball);
    }
  }
  const shape = new THREE.Shape(points.map(p => new THREE.Vector2(p.x, p.y)));
  layer.add(new THREE.Mesh(new THREE.ShapeGeometry(shape), fill));
  return layer;
}

export function buildLogo() {
  const group = new THREE.Group();
  // Всё содержимое — в pose: ей задаётся покачивание, а group main.js
  // разворачивает лицом к камере
  const pose = new THREE.Group();
  group.add(pose);

  // ── Плитка: тёмный графит со скруглёнными углами и тонкой фаской; лицевая
  // сторона — на z = 0, слои знака — над ней ──
  const tileGeometry = new THREE.ExtrudeGeometry(roundedRect(TILE - 0.04, TILE - 0.04, RADIUS - 0.02), {
    depth: DEPTH, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 4, curveSegments: 32,
  });
  tileGeometry.translate(0, 0, -DEPTH - 0.02);
  // Группы ExtrudeGeometry: 0 — лицо и тыл, 1 — кромка. Лицо не освещается —
  // ровный тёмный цвет плитки вступления (#0b0d11), без бликов и засветки
  // лампами сцены; кромка — металл, по ней свет обрисовывает толщину
  pose.add(new THREE.Mesh(tileGeometry, [
    new THREE.MeshBasicMaterial({ color: '#0b0d11', toneMapped: false }),
    new THREE.MeshPhysicalMaterial({ color: '#15171c', metalness: 0.6, roughness: 0.4, envMapIntensity: 0.6 }),
  ]));

  // Кольцо по краю лица — тонкая линия, как mv__ring-line (отступ 4 из 120)
  const ring = roundedRect(TILE * (112 / 120), TILE * (112 / 120), TILE * (26 / 120)).getPoints(24);
  const ringLine = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(ring.map(p => new THREE.Vector3(p.x, p.y, 0.004))),
    new THREE.LineBasicMaterial({ color: INK.cyan, transparent: true, opacity: 0.45, toneMapped: false }),
  );
  pose.add(ringLine);

  // Свечение «система готова» — за плиткой, аддитивно
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(TILE * 1.78, TILE * 1.78), new THREE.MeshBasicMaterial({
    map: glowTexture(), color: new THREE.Color(INK.cyan).multiplyScalar(0.28),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  glow.position.z = -DEPTH - 0.06;
  pose.add(glow);

  // ── Знак: нижние слои — циан, верхний — почти белый, заливки едва видны ──
  const cyan = new THREE.MeshBasicMaterial({ color: INK.cyan, toneMapped: false });
  const white = new THREE.MeshBasicMaterial({ color: '#e9fbff', toneMapped: false });
  const fillMaterial = opacity => new THREE.MeshBasicMaterial({ color: INK.cyan, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  LAYER_PATHS.forEach((d, n) => {
    const layer = buildLayer(d, n === 0 ? white : cyan, fillMaterial(n === 0 ? 0.14 : 0.07));
    layer.position.z = LIFT[n];
    pose.add(layer);
  });

  return {
    group,
    /**
     * @param {number} t — время сцены, с (0 — reduced motion)
     * @param {number|null} since — сколько секунд назад ушло вступление; null — ещё идёт
     * @param {{ x: number, y: number }} pointer — курсор, −1..1
     */
    update(t, since, pointer) {
      // В стыке с вступлением знак неподвижен; покачивание и отклик на курсор
      // набираются после — без рывка
      const u = t === 0 || since === null ? 0 : Math.min(1, Math.max(0, (since - SWAY_AFTER) / SWAY_IN));
      const k = u * u * (3 - 2 * u);
      pose.rotation.y = k * (Math.sin(t * 0.45) * 0.4 + pointer.x * 0.25);
      pose.rotation.x = k * (Math.sin(t * 0.31) * 0.06 - pointer.y * 0.12);
    },
  };
}
