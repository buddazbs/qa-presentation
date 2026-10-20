// Signal — сцена презентации QA Platform (бывший Callback Admin Tool).
//
// Композиция: по центру вертикальный ствол — сигнальная магистраль
// (column.js), наверху — объёмный логотип платформы (logo.js), вокруг на
// дистанции — ночной город (city.js). Вокруг ствола винтом висят
// карточки: каждая — живой слайд из 3d.html в DOM-слое с той же перспективой
// (css3d.js). От ствола к каждой карточке идёт отвод-кабель.
//
// Камера всегда смотрит на карточку в лоб и встаёт на таком расстоянии, что
// карточка ровно по центру экрана и занимает заданную долю кадра. Между
// карточками камера отъезжает и облетает ствол по той же спирали.

import * as THREE from '../3d/vendor/three.module.js';
import { buildColumn, makeEnvironment } from './column.js';
import { buildLogo } from './logo.js';
import { createCss3d } from './css3d.js';
import { createPost } from './post.js';
import { buildCity } from './city.js';
import { buildFuture } from './future.js';
import { INK, chapterJp } from './signage.js';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isSmall = () => innerWidth <= 720;

// Спираль: радиус до центра карточки, шаг по высоте и поворот за карточку
const SPIRAL = { radius: 4.6, spacing: 5.6, turn: 0.95, top: 0 };
// Логотип — над первой карточкой
const LOGO_Y = 6.2;
// Ширина карточки в мире; в пикселях она по контенту, но не шире экрана
const CARD_WORLD_W = { wide: 6.4, small: 3.4 };
// Переход между карточками — один проход фиксированной длительности, а не
// пружина: у пружины долгий «хвост» дотягивания, и шаг казался вязким
const STEP = 1.05;   // шаг на соседнюю карточку, с
const JUMP = 0.75;   // прыжок через меню / повторное нажатие на ходу, с
// Высокий слайд камера вписывает в кадр отъездом, но не дальше этого
// множителя — иначе текст мельчает; остаток прокручивается внутри карточки
const MAX_FIT = { wide: 1.25, small: 1.12 };

/**
 * Профиль шага: камера трогается сразу (нажатие не «проваливается»),
 * притормаживает у ствола — модули успевают прочитаться, — и мягко садится.
 * Две полуволны косинуса дают торможение в середине; 20% ease-out cubic
 * добавляют скорость на старте и не дают остановиться посередине.
 */
function stepEase(u) {
  const half = u < 0.5 ? (1 - Math.cos(2 * Math.PI * u)) / 4 : 0.5 + (1 - Math.cos(2 * Math.PI * (u - 0.5))) / 4;
  return 0.8 * half + 0.2 * (1 - Math.pow(1 - u, 3));
}

/**
 * Переход на ходу: кубическая кривая Эрмита от текущей позиции и скорости
 * к цели с нулевой скоростью. Импульс сохраняется — без рывка при смене цели.
 */
function hermite(from, to, v0, duration) {
  return u => {
    const u2 = u * u;
    const u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * from + (u3 - 2 * u2 + u) * v0 * duration + (-2 * u3 + 3 * u2) * to;
  };
}

// Цвета сцены: один неоновый акцент и красный печати — у всех глав одни и
// те же. Главы различаются композицией и содержимым, а не перекраской мира
const ACCENT = INK.cyan;
const SEAL = INK.seal;

// Фон: графит с лёгким вертикальным переходом — небо над городом чуть
// светлее, внизу колодец уходит в тень; зерно против полос градиента
const backdropFragment = /* glsl */ `
  uniform vec2 uResolution;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    // Небо над городом: тёмно-синяя дымка, снизу её подсвечивает город —
    // тёплый фиолетовый отсвет улиц; в центре кадра темнее, за карточкой
    vec3 col = mix(vec3(0.27, 0.12, 0.37), vec3(0.08, 0.07, 0.18), smoothstep(0.0, 0.85, vUv.y));
    vec2 q = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
    col *= 1.0 - 0.45 * exp(-dot(q, q) * 3.0);
    col += (hash(vUv * uResolution) - 0.5) * 0.008;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** Точка спирали для дробного номера карточки: угол, высота и нормаль наружу. */
function spiralAt(p) {
  const angle = p * SPIRAL.turn;
  return { angle, y: SPIRAL.top - p * SPIRAL.spacing, normal: new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)) };
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLElement} view — DOM-слой для карточек
 * @param {HTMLElement[]} slides — секции .slide из 3d.html
 * @param {{ onSettle?: (i: number) => void, onLeave?: (i: number) => void }} hooks
 *   onSettle — камера доехала до карточки i (−1 — до логотипа); onLeave — уехала от неё
 */
export function mountSignal(canvas, view, slides, { onSettle, onLeave } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.28;

  const scene = new THREE.Scene();
  scene.environment = makeEnvironment(renderer);
  // Дымка того же цвета, что у города (city.js): ствол и башни уходят в один воздух
  scene.fog = new THREE.FogExp2('#1a1030', 0.012);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 140);
  const post = createPost(renderer);

  // ── Фон ──
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }',
    fragmentShader: backdropFragment,
    uniforms: { uResolution: { value: new THREE.Vector2(1, 1) } },
    depthWrite: false, depthTest: false,
  }));
  backdrop.frustumCulled = false;
  backdrop.renderOrder = -1;
  scene.add(backdrop);

  // ── Свет: холодный белый ключ сверху и слабый циановый контровой снизу —
  // металл читается формой, цвет даёт только неон ──
  // Небо города сверху и тёмная земля снизу: силуэт металла читается и на
  // общем плане, где точечные лампы уже не достают
  scene.add(new THREE.HemisphereLight('#c9d3e0', '#0a0b0e', 0.9));
  const moon = new THREE.DirectionalLight('#dfe7f2', 0.9);
  moon.position.set(8, 20, 6);
  scene.add(moon);
  const keyA = new THREE.PointLight('#e6eef8', 90, 34, 1.6);
  const keyB = new THREE.PointLight(ACCENT, 30, 26, 1.6);
  // Отсвет вывесок города на металле ствола: маджента со стороны улицы
  const street = new THREE.PointLight('#ff2e88', 26, 30, 1.6);
  scene.add(keyA, keyB, street);

  // ── Карточки: слайд в стеклянной рамке, лицом от ствола ──
  const last = slides.length - 1;
  const layer = createCss3d(view);
  const sizeWatch = new ResizeObserver(entries => {
    for (const entry of entries) {
      const card = cards.find(c => c.el === entry.target);
      if (card) card.measured = false;
    }
  });
  const cards = slides.map((slide, i) => {
    // Карточка: неоновый контур со скошенными углами, внутри — прокручиваемый
    // слайд, поверх — HUD-разметка (номер канала, уровень сигнала, адрес)
    const el = document.createElement('article');
    el.className = 'card3d';

    const scroll = document.createElement('div');
    scroll.className = 'card3d__scroll';
    scroll.append(slide);
    const num = String(i + 1).padStart(2, '0');
    const hud = document.createElement('div');
    hud.className = 'card3d__hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<span class="hud__tag"></span><span class="hud__sig"><i></i>SIG <b>▮▮▮▮</b>▯</span>'
      + '<span class="hud__path"></span><span class="hud__corner hud__corner--tr"></span><span class="hud__corner hud__corner--bl"></span>';
    hud.querySelector('.hud__tag').textContent = `${chapterJp(i + 1)} · ${(slide.dataset.slide || '').toUpperCase()}`;
    hud.querySelector('.hud__path').textContent = `qap://signal/ch${num}`;
    el.append(scroll, hud);
    const { y, normal } = spiralAt(i);
    const anchor = new THREE.Object3D();
    anchor.position.set(normal.x * SPIRAL.radius, y, normal.z * SPIRAL.radius);
    anchor.lookAt(anchor.position.clone().add(normal));
    layer.add(el, anchor);
    // Высота карточки меняется и после посадки — слайд раскладывает свою
    // сцену, когда оживает. Любое изменение размера — повод перемерить:
    // и дистанцию камеры (fit), и стеклянную плиту под карточкой
    sizeWatch.observe(el);
    // Титул и итог — разделительные слайды: городу можно быть ярче
    const expressive = slide.classList.contains('slide--hero') || slide.classList.contains('slide--final');
    return { el, anchor, normal, fit: 1, shownFit: 1, measured: false, expressive };
  });

  // ── Проекторы: под карточкой — излучатель, из него вверх в карточку бьёт
  // веер света. Карточка читается как голограмма, а не как висящий лист.
  // DOM-слой лежит поверх WebGL, поэтому виден только веер между излучателем
  // и нижним краем карточки — ровно то, что нужно ──
  const emitterGeo = new THREE.BoxGeometry(1, 0.045, 0.16);
  const lensGeo = new THREE.BoxGeometry(1, 0.012, 0.03);
  const fanGeo = new THREE.PlaneGeometry(1, 1);
  fanGeo.translate(0, 0.5, 0);
  const emitterMaterial = new THREE.MeshPhysicalMaterial({ color: '#1c2036', metalness: 0.85, roughness: 0.3, envMapIntensity: 1.4 });
  const fanUniforms = { uTime: { value: 0 } };
  for (const [i, c] of cards.entries()) {
    const tint = new THREE.Color(ACCENT);
    const group = new THREE.Group();
    group.quaternion.copy(c.anchor.quaternion);
    const emitter = new THREE.Mesh(emitterGeo, emitterMaterial);
    const lens = new THREE.Mesh(lensGeo, new THREE.MeshBasicMaterial({ color: tint }));
    lens.position.set(0, 0.028, 0.03);
    const fan = new THREE.Mesh(fanGeo, new THREE.ShaderMaterial({
      uniforms: { ...fanUniforms, uColor: { value: tint }, uFade: { value: 1 } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      // Трапеция: у излучателя уже, к карточке шире; лучи-волокна и бегущая яркость
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uTime; uniform float uFade; varying vec2 vUv;
        void main() {
          float hw = mix(0.36, 0.5, vUv.y);   // half — зарезервировано в GLSL ES
          float x = abs(vUv.x - 0.5);
          float edge = smoothstep(hw, hw - 0.04, x);
          float rays = 0.75 + 0.25 * sin(vUv.x * 220.0) * sin(vUv.x * 37.0 + uTime * 1.5);
          float rise = 0.85 + 0.15 * sin(vUv.y * 18.0 - uTime * 4.0);
          float a = edge * rays * rise * (0.25 + 0.75 * (1.0 - vUv.y)) * 0.22 * uFade;
          gl_FragColor = vec4(uColor * a, 1.0);
        }
      `,
    }));
    fan.position.z = 0.01;
    group.add(emitter, lens, fan);
    scene.add(group);
    // Стеклянная плита за карточкой: тот же скошенный контур, толщина 0,16.
    // DOM-карточка лежит поверх холста, так что видны ребро плиты на облёте
    // и тонкий кант по краю в фокусе — карточка читается как толстое стекло
    // Плита — тёмное закалённое стекло, без радужной плёнки
    const slab = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshPhysicalMaterial({
      color: '#15181d', metalness: 0, roughness: 0.1,
      clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.4,
      transparent: true, opacity: 0.55, depthWrite: false,
    }));
    slab.quaternion.copy(c.anchor.quaternion);
    scene.add(slab);
    c.projector = { group, emitter, lens, fan, slab };
  }

  /** Скошенный прямоугольник карточки в единицах мира (срезы — как clip-path). */
  function chamfer(w, h, cut) {
    const x = w / 2;
    const y = h / 2;
    const shape = new THREE.Shape();
    shape.moveTo(-x + cut, y);
    shape.lineTo(x, y);
    shape.lineTo(x, -y + cut);
    shape.lineTo(x - cut, -y);
    shape.lineTo(-x, -y);
    shape.lineTo(-x, y - cut);
    shape.closePath();
    return shape;
  }
  /** Поставить проектор под нижний край карточки — по её реальной высоте. */
  function placeProjector(c) {
    const w = c.el.offsetWidth * scale;
    const h = c.el.offsetHeight * scale;
    const gap = 0.5;
    c.projector.group.position.copy(c.anchor.position).add(new THREE.Vector3(0, -h / 2 - gap, 0));
    c.projector.emitter.scale.x = w * 0.72;
    c.projector.lens.scale.x = w * 0.68;
    c.projector.fan.scale.set(w, gap, 1);
    // Плита чуть больше карточки — по краю остаётся светлый кант
    const rim = 0.012;
    const depth = 0.16;
    const cut = parseFloat(getComputedStyle(c.el).getPropertyValue('--cut')) * scale || 0.28;
    c.projector.slab.geometry.dispose();
    c.projector.slab.geometry = new THREE.ExtrudeGeometry(chamfer(w + rim * 2, h + rim * 2, cut + rim * 0.6), {
      depth, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2,
    });
    c.projector.slab.position.copy(c.anchor.position).addScaledVector(c.normal, -depth - 0.03);
  }

  // ── Ствол и логотип ──
  const bottom = SPIRAL.top - last * SPIRAL.spacing;
  const column = buildColumn({
    top: LOGO_Y - 2.2,
    bottom: bottom - 6,
    branches: cards.map((c, i) => ({
      y: c.anchor.position.y + 0.4,
      to: c.anchor.position.clone().addScaledVector(c.normal, -0.08),
      angle: spiralAt(i).angle,
      num: i + 1,
      label: slides[i].dataset.slide || '',
    })),
  });
  scene.add(column.group);
  const logo = buildLogo();
  logo.group.position.y = LOGO_Y;
  scene.add(logo.group);
  const city = buildCity({ top: LOGO_Y + 10, bottom: bottom - 10 });
  scene.add(city.group);
  const future = buildFuture({ shared: city.shared, towers: city.towers, top: LOGO_Y + 10, bottom: bottom - 10 });
  scene.add(future.group);
  // Стекло логотипа (transmission) преломляет только непрозрачный список
  // сцены — прозрачное в него не попадает, и неон за стеклом пропадал.
  // Аддитивному свету порядок смешивания не важен, поэтому он переходит в
  // непрозрачный список: renderOrder 1 рисует его после стен, глубину он по-
  // прежнему не пишет, а стекло теперь видит ореолы, рекламы и огни
  scene.traverse(o => {
    if (o.material?.transparent && o.material.blending === THREE.AdditiveBlending) {
      o.material.transparent = false;
      o.renderOrder = 1;
    }
  });

  // ── Размеры: карточка — по контенту, в фокусе стоит 1:1 к пикселям экрана ──
  let scale = 0.01;   // единиц мира на пиксель вёрстки
  let focusShift = 0; // на сколько пикселей карточка в фокусе правее центра экрана
  const side = new THREE.Vector3();
  let maxDpr = Math.min(devicePixelRatio, 1.5);
  let maxH = 1;       // высота кадра под карточку, px
  function resize() {
    const w = innerWidth;
    const h = innerHeight;
    renderer.setPixelRatio(Math.min(maxDpr, isSmall() ? 1.25 : 1.5));
    renderer.setSize(w, h, false);
    post.resize(w, h, renderer.getPixelRatio());
    city?.setResolution(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
    camera.aspect = w / h;
    camera.fov = isSmall() ? 50 : 40;
    camera.updateProjectionMatrix();
    backdrop.material.uniforms.uResolution.value.set(w, h);
    // Слева — колонка под заголовок главы (signal/title.js): он остаётся на
    // месте сборки, поэтому карточка встаёт правее и не заходит под него.
    // Ширину колонки знает только этот код — CSS берёт её из --sg-title-col
    const pad = Math.min(48, Math.max(20, w * 0.034));
    const titleCol = isSmall() ? 0 : Math.min(320, Math.max(208, w * 0.19));
    const left = isSmall() ? 0 : pad + titleCol + 32;
    document.documentElement.style.setProperty('--sg-title-col', `${titleCol}px`);
    // Потолок ширины — в rem: корень страницы масштабируется от высоты экрана
    // (style.css), и карточка сжимается вместе со своим текстом
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const cardW = isSmall() ? w * 0.9 : Math.min(w * 0.86, 82.5 * rem, w - left - pad);
    focusShift = isSmall() ? 0 : left + (w - pad - left) / 2 - w / 2;
    scale = (isSmall() ? CARD_WORLD_W.small : CARD_WORLD_W.wide) / cardW;
    view.style.setProperty('--card-w', `${cardW}px`);
    // На телефоне сверху шапка, снизу счётчик — карточке остаётся меньше высоты
    maxH = h * (isSmall() ? 0.74 : 0.78);   // снизу справа — счётчик и подпись
    view.style.setProperty('--card-max-h', `${maxH * (isSmall() ? MAX_FIT.small : MAX_FIT.wide)}px`);
    for (const c of cards) { c.anchor.scale.setScalar(scale); c.measured = false; }
  }
  addEventListener('resize', resize);
  resize();

  // Расстояние, на котором пиксель карточки равен пикселю экрана: текст чёткий,
  // а замеры анимаций слайда (getBoundingClientRect) совпадают с вёрсткой
  const focusDistance = () => scale * camera.projectionMatrix.elements[5] * innerHeight / 2;

  // ── Состояние ──
  let target = -1;    // куда едем: −1 — логотип, 0..last — карточки
  let overview = false;
  let overviewMix = 0; // 0 — у карточки, 1 — общий план спирали
  const ovEye = new THREE.Vector3();
  const ovLook = new THREE.Vector3();
  let tween = null;   // { to, start, duration, at(u) } — текущий переход
  let progress = -1;
  let velocity = 0;
  let settled = null; // индекс карточки, у которой камера стоит
  let moving = false;
  let slowFrames = 0;
  let lowPower = false;
  let revealed = false;   // загрузочный экран ушёл — пора собирать знак
  let revealAt = null;
  const eye = new THREE.Vector3();
  const look = new THREE.Vector3();
  const introEye = new THREE.Vector3();
  const introLook = new THREE.Vector3();
  const pointer = new THREE.Vector2();
  addEventListener('pointermove', e => pointer.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1));

  /** Поза камеры у дробной позиции p ≥ 0: напротив спирали, с отъездом между карточками. */
  function cardPose(p, outEye, outLook) {
    const s = spiralAt(p);
    const f = p - Math.floor(p);
    const between = Math.sin(Math.PI * f);   // 0 у карточки, 1 посередине
    const fit = THREE.MathUtils.lerp(cards[Math.floor(p)].shownFit, cards[Math.min(last, Math.ceil(p))].shownFit, f);
    const d = focusDistance() * fit * (1 + 1.1 * between);
    // На середине пути взгляд — на ствол, камера чуть выше: в кадре оба модуля
    outLook.set(s.normal.x * SPIRAL.radius * (1 - 0.85 * between), s.y - between * 0.3, s.normal.z * SPIRAL.radius * (1 - 0.85 * between));
    outEye.set(s.normal.x * (SPIRAL.radius + d), s.y + between * 1.2, s.normal.z * (SPIRAL.radius + d));
    // Карточка правее центра: камера отступает влево вдоль своей горизонтали.
    // На дистанции фокуса пиксель карточки равен пикселю экрана — сдвиг точный
    side.set(-s.normal.z, 0, s.normal.x);   // вектор «вправо» для взгляда на ствол
    const shift = focusShift * scale * fit * (1 + 1.1 * between) * (1 - overviewMix);
    outEye.addScaledVector(side, shift);
    outLook.addScaledVector(side, shift);
  }

  const timer = new THREE.Timer();
  function frame(now) {
    timer.update(now);
    const dt = Math.min(timer.getDelta(), 0.05);
    const t = timer.getElapsed();

    // Пружина в два полушага — устойчиво и на просевшем кадре; у цели — точно
    // в цель, чтобы карточка встала 1:1
    // Переход: позиция — функция времени; в конце — точно в цель, чтобы
    // карточка встала 1:1
    const before = progress;
    if (tween) {
      if (tween.start === null) tween.start = t;
      const u = Math.min(1, (t - tween.start) / tween.duration);
      progress = tween.at(u);
      if (u >= 1) { progress = tween.to; tween = null; }
    }
    velocity = dt > 0 ? (progress - before) / dt : 0;

    // Пока сцена в движении, DOM-слой не перерастеризуется на каждом кадре
    // (will-change); остановились — снимаем, и текст перерисуется чётким
    const nowMoving = progress !== target;
    if (nowMoving !== moving) { moving = nowMoving; view.classList.toggle('is-moving', moving); }

    // Просел кадр надолго — снижаем плотность пикселей WebGL
    slowFrames = dt > 1 / 40 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
    if (slowFrames > 45 && maxDpr > 1) { maxDpr = 1; slowFrames = 0; resize(); }
    // Не помогло — город в экономном режиме: без ореолов и потока машин
    else if (slowFrames > 45 && !lowPower) { lowPower = true; city.lowPower(); future.lowPower(); }

    // ── Камера ──
    if (progress >= 0) {
      cardPose(progress, eye, look);
    } else {
      // Вступление: логотип по центру, ствол уходит вниз; к первой карточке — спуском
      cardPose(0, eye, look);
      const m = THREE.MathUtils.smootherstep(progress, -1, 0);
      introLook.set(0, LOGO_Y - 0.6, 0);
      introEye.set(1.2, LOGO_Y + 0.6, isSmall() ? 13 : 9.5);
      if (!reducedMotion) introEye.x += Math.sin(t * 0.2) * 0.4;
      eye.lerpVectors(introEye, eye, m);
      look.lerpVectors(introLook, look, m);
    }
    // Обзор: камера отъезжает от ствола и смотрит на него чуть сверху —
    // в кадре пять-семь глав по спирали. Переход — ease-in-out по времени
    overviewMix = reducedMotion ? +overview : Math.max(0, Math.min(1, overviewMix + (overview ? dt : -dt) / 0.9));
    if (overviewMix > 0) {
      const k = overviewMix < 0.5 ? 4 * overviewMix ** 3 : 1 - (-2 * overviewMix + 2) ** 3 / 2;
      const s0 = spiralAt(Math.max(0, progress));
      const far = isSmall() ? 52 : 40;
      ovLook.set(0, s0.y - 2.5, 0);
      ovEye.set(Math.cos(s0.angle + 0.35) * far, s0.y + 6, Math.sin(s0.angle + 0.35) * far);
      eye.lerp(ovEye, k);
      look.lerp(ovLook, k);
    }
    camera.position.copy(eye);
    camera.lookAt(look);
    // Крен на облёте: камера закладывает вираж вокруг ствола по скорости. У
    // цели скорость нулевая — крена нет, и карточка встаёт ровно 1:1
    if (!reducedMotion) camera.rotateZ(THREE.MathUtils.clamp(-velocity * 0.03, -0.05, 0.05) * (1 - overviewMix));

    // ── Фокус: слайд оживает, когда карточка почти встала, — анимация
    // слайда начинается в такт с посадкой, а не после паузы ──
    const now0 = !overview && overviewMix === 0 && Number.isInteger(target) && Math.abs(target - progress) < 0.08 ? target : null;
    if (now0 !== settled) {
      if (settled !== null) onLeave?.(settled);
      settled = now0;
      if (settled !== null) onSettle?.(settled);
    }

    // ── Карточки: в фокусе — целиком, соседи — полупрозрачные, дальние скрыты ──
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      const d = Math.abs(i - progress);
      const hidden = d > (overviewMix > 0 ? 4.5 : 1.7);
      if (c.el.hidden !== hidden) c.el.hidden = hidden;
      c.projector.slab.visible = !hidden && c.measured;
      if (hidden) continue;
      // Высоту меряем, когда карточка впервые видна (скрытая — display: none)
      if (!c.measured) { c.fit = Math.max(1, c.el.offsetHeight / maxH); c.measured = true; placeProjector(c); }
      // Высота может смениться, когда слайд ожил (раскладка сцены) — камера
      // доезжает до новой дистанции плавно, а у цели встаёт точно
      c.shownFit += (c.fit - c.shownFit) * (1 - Math.exp(-dt * 6));
      if (Math.abs(c.fit - c.shownFit) < 0.0005) c.shownFit = c.fit;
      // На облёте карточки бледнеют — ствол между ними виден; у посадки
      // карточка уже плотная
      const near = Math.max(0.14, Math.min(1, 1 - (d - 0.1) * 1.8));
      const opacity = (near + (Math.max(0.55, 1 - d * 0.1) - near) * overviewMix).toFixed(2);
      if (c.el.style.opacity !== opacity) c.el.style.opacity = opacity;
      c.projector.fan.material.uniforms.uFade.value = +opacity;
      c.projector.slab.material.opacity = 0.55 * +opacity;
      const focus = i === settled;
      if (c.el.classList.contains('is-focus') !== focus) c.el.classList.toggle('is-focus', focus);
    }

    const clamped = Math.max(0, progress);
    const s = spiralAt(clamped);
    const ly = progress < 0 ? LOGO_Y : s.y;
    keyA.position.set(Math.cos(s.angle + 1.1) * 6, ly + 2.5, Math.sin(s.angle + 1.1) * 6);
    keyB.position.set(Math.cos(s.angle - 1.3) * 6, ly - 2.5, Math.sin(s.angle - 1.3) * 6);
    street.position.set(Math.cos(s.angle + Math.PI * 0.85) * 9, ly - 1, Math.sin(s.angle + Math.PI * 0.85) * 9);

    // Город за карточкой: на плотных слайдах спокойнее, на титуле и итоге —
    // выразительнее; в перелёте и на общем плане маска почти снята
    const f = clamped - Math.floor(clamped);
    const calmAt = i => (cards[i].expressive ? 0.55 : 1);
    const calm = progress < 0 ? 0.35
      : THREE.MathUtils.lerp(calmAt(Math.floor(clamped)), calmAt(Math.min(last, Math.ceil(clamped))), f);
    city.setCalm(calm * (1 - 0.3 * Math.sin(Math.PI * f)) * (1 - overviewMix * 0.7));

    // Сигнал бежит по магистрали вместе с камерой; отвод карточки в фокусе горит
    column.update(reducedMotion ? 0 : t, null, { y: progress < 0 ? LOGO_Y : s.y, strength: Math.min(1, Math.abs(velocity) * 1.6), focus: settled });
    if (revealed && revealAt === null) revealAt = t;
    logo.update(reducedMotion ? 0 : t, revealAt === null ? null : t - revealAt);
    // Логотип чуть следит за курсором — сцена отвечает руке
    logo.group.rotation.y += pointer.x * 0.25;
    logo.group.rotation.x -= pointer.y * 0.12;

    city.update(reducedMotion ? 0 : t);
  future.update(reducedMotion ? 0 : t);
    fanUniforms.uTime.value = reducedMotion ? 0 : t;

    // Оптика: лёгкое расхождение каналов у краёв кадра на скорости облёта
    post.uniforms.uTime.value = reducedMotion ? 0 : t;
    post.uniforms.uAberration.value += (Math.min(1, Math.abs(velocity) * 0.9) - post.uniforms.uAberration.value) * 0.15;
    post.render(scene, camera);
    // Камера стоит у карточки — карточка в плоском слое, текст чёткий
    const still = settled !== null && settled >= 0 && progress === target && cards[settled].shownFit === cards[settled].fit;
    layer.render(camera, still ? { el: cards[settled].el, scale: 1 / cards[settled].fit, dx: focusShift } : null);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    /** −1 — логотип, 0..last — карточки. */
    setTarget(value) {
      const next = Math.max(-1, Math.min(last, value));
      if (next === target) return;
      target = next;
      if (reducedMotion) { progress = next; tween = null; return; }
      // Спокойный шаг к соседней карточке — с замедлением у ствола; на ходу,
      // через меню и от логотипа — напрямую, с сохранением текущей скорости
      const from = progress;
      const calm = !tween && from >= 0 && Math.abs(next - from) === 1;
      const duration = calm ? STEP : JUMP * Math.min(1.6, Math.sqrt(Math.max(Math.abs(next - from), 0.3)));
      tween = {
        to: next, start: null, duration,
        at: calm ? u => from + (next - from) * stepEase(u) : hermite(from, next, tween ? velocity : 0, duration),
      };
    },
    get target() { return target; },
    /** Общий план спирали — или обратно к карточке. */
    setOverview(on) { overview = on; },
    /** Загрузочный экран ушёл: логотип собирается на глазах у зрителя. */
    reveal() { revealed = true; },
    count: slides.length,
  };
}
