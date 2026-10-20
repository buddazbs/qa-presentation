// Логотип QA Platform в 3D: знак Layers — тот же, что в сайдбаре платформы, —
// внутри тонкой пластины жидкого стекла. Стекло прозрачное и преломляет город
// за собой, цвет бренда — только лёгкий лиловый оттенок в толще стекла и
// радужный перелив по кромке: пластина не перекрывает кадр плотным пятном. Три слоя знака — три части платформы
// (колбэки, моки, общий код): когда уходит загрузочный экран, они ложатся
// друг на друга по очереди и дальше стоят неподвижно.
//
// Знак — иконка Layers из Lucide (ISC License, © Lucide Icons and
// Contributors). Её контуры не перерисованы вручную: браузер сам проходит
// по SVG-пути (getPointAtLength), а по точкам строится трубка — штрих
// становится объёмным, с круглыми концами, как stroke-linecap у иконки.

import * as THREE from '../3d/vendor/three.module.js';

// Сверху вниз: ромб верхнего слоя и два «уголка» под ним
const LAYER_PATHS = [
  'M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z',
  'M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12',
  'M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17',
];
// Бренд: BRAND_ACCENT_LIGHT тёмной темы сайдбара — оттенок толщи стекла
const BRAND = '#6a4fe0';
// Сборка знака: слой опускается за DROP с, следующий — через STAGGER с
const DROP = 0.9;
const STAGGER = 0.16;

const TILE = 1.9;      // сторона пластины
const DEPTH = 0.22;    // толщина без скругления кромки
const GLYPH = 1.3;     // ширина знака в пластине
const STROKE = 0.08;   // радиус трубки штриха (stroke-width 2.5 из 24)

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

function roundedSquare(size, radius) {
  const h = size / 2;
  const s = new THREE.Shape();
  s.moveTo(-h + radius, -h);
  s.lineTo(h - radius, -h);
  s.quadraticCurveTo(h, -h, h, -h + radius);
  s.lineTo(h, h - radius);
  s.quadraticCurveTo(h, h, h - radius, h);
  s.lineTo(-h + radius, h);
  s.quadraticCurveTo(-h, h, -h, h - radius);
  s.lineTo(-h, -h + radius);
  s.quadraticCurveTo(-h, -h, -h + radius, -h);
  return s;
}

/** Знак: по группе на слой — трубка штриха и круглые концы. */
function buildGlyph(material) {
  const group = new THREE.Group();
  const cap = new THREE.SphereGeometry(STROKE, 20, 14);
  const layers = LAYER_PATHS.map(d => {
    const layer = new THREE.Group();
    const points = samplePath(d);
    const closed = /z$/i.test(d);
    const curve = new THREE.CatmullRomCurve3(closed ? points.slice(0, -1) : points, closed, 'centripetal');
    layer.add(new THREE.Mesh(new THREE.TubeGeometry(curve, points.length * 2, STROKE, 18, closed), material));
    if (!closed) {
      for (const end of [points[0], points[points.length - 1]]) {
        const ball = new THREE.Mesh(cap, material);
        ball.position.copy(end);
        layer.add(ball);
      }
    }
    group.add(layer);
    return layer;
  });
  return { group, layers };
}

const easeOut = u => 1 - Math.pow(1 - Math.min(1, Math.max(0, u)), 3);

export function buildLogo() {
  const group = new THREE.Group();

  // ── Пластина жидкого стекла: скруглённая кромка ловит блики, сквозь
  // толщу виден город — чуть смещённый преломлением и с радугой дисперсии ──
  const tileGeometry = new THREE.ExtrudeGeometry(roundedSquare(TILE, 0.5), {
    depth: DEPTH, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 10, curveSegments: 40,
  });
  tileGeometry.center();
  const tile = new THREE.Mesh(tileGeometry, new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    metalness: 0,
    roughness: 0.04,
    transmission: 1,
    thickness: 0.6,
    ior: 1.5,
    dispersion: 2.5,
    attenuationColor: BRAND,
    attenuationDistance: 3,
    iridescence: 0.35,
    iridescenceIOR: 1.3,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    specularIntensity: 1,
    envMapIntensity: 0.9,
  }));
  group.add(tile);

  // ── Знак: белый, чуть светится, вплавлен в середину стекла — один на обе
  // стороны: через прозрачную пластину второй знак читался бы зеркально ──
  const glyphMaterial = new THREE.MeshPhysicalMaterial({
    color: '#f2f3f8', metalness: 0.2, roughness: 0.2, clearcoat: 1, emissive: '#d9d4ff', emissiveIntensity: 0.25, envMapIntensity: 1,
  });
  const front = buildGlyph(glyphMaterial);
  group.add(front.group);
  const { layers } = front;


  return {
    group,
    /**
     * @param {number} t — время сцены, с (0 — reduced motion)
     * @param {number|null} since — сколько секунд назад ушла загрузка; null — ещё идёт
     */
    update(t, since) {
      // Сборка: слои опускаются по очереди и садятся без отскока
      layers.forEach((layer, n) => {
        const k = n % LAYER_PATHS.length;
        const u = t === 0 ? 1 : since === null ? 0 : easeOut((since - k * STAGGER) / DROP);
        layer.position.y = (1 - u) * (1.4 + k * 0.35);
        layer.scale.setScalar(0.92 + 0.08 * u);
        layer.visible = u > 0;
      });
      // Плавное покачивание вместо вращения — знак всё время читается спереди
      group.rotation.y = Math.sin(t * 0.45) * 0.55;
      group.rotation.x = Math.sin(t * 0.31) * 0.08;
    },
  };
}
