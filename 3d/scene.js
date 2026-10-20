/* ══════════════════════════════════════════════════════════════════
   Callback Admin Tool — 3D-сцена (Three.js)

   Одно облако частиц на всю презентацию. У каждого слайда своя
   фигура; между соседними фигурами облако перетекает по мере
   скролла. Как и в stage.js, состояние не копится от события к
   событию: каждый кадр заново вычисляет его из положения скролла,
   поэтому рывок к якорю или resize не оставят сцену «между».
   ══════════════════════════════════════════════════════════════════ */
import * as THREE from './vendor/three.module.js';

const CALM = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (t) => t * t * (3 - 2 * t);

/* Палитра из styles.css :root */
const PAL = {
  cyan: new THREE.Color('#38e8ff'),
  violet: new THREE.Color('#8b6cff'),
  magenta: new THREE.Color('#ff4d9d'),
  lime: new THREE.Color('#6bffb0'),
  amber: new THREE.Color('#ffc857'),
  red: new THREE.Color('#ff5c6e'),
  ink: new THREE.Color('#e8edff'),
  faint: new THREE.Color('#5a6480'),
};

const N = matchMedia('(max-width: 48rem)').matches ? 5000 : 9000;

/* Детерминированный random: фигуры одинаковы при каждой загрузке */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ─────────────────────────── Фигуры ───────────────────────────
   Каждая фигура — функция (i, r) → [x, y, z, color]. Радиус сцены
   около 3 единиц; камера стоит на z = 9. */

const sphere = (r, rad) => {
  const u = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
  return [Math.cos(a) * s * rad, u * rad, Math.sin(a) * s * rad];
};

const SHAPES = {
  // Титул: галактика — ядро и спиральные рукава
  galaxy(i, r) {
    if (i % 7 === 0) {
      const [x, y, z] = sphere(r, 0.5 + r() * 0.3);
      return [x, y, z, PAL.ink];
    }
    const arm = i % 3, d = Math.pow(r(), 0.7) * 3.4;
    const a = arm * ((Math.PI * 2) / 3) + d * 1.25 + (r() - 0.5) * 0.45;
    const col = [PAL.cyan, PAL.violet, PAL.magenta][arm];
    // диск наклонён к камере на ~60°, иначе с z = 9 он виден с ребра
    const y = (r() - 0.5) * 0.25 * (3.6 - d), z = Math.sin(a) * d;
    return [Math.cos(a) * d, y * 0.5 - z * 0.86, y * 0.86 + z * 0.5, col];
  },

  // Что это: четыре сгустка — четыре карточки
  quads(i, r) {
    const k = i % 4;
    const [x, y, z] = sphere(r, 0.55 * Math.cbrt(r()));
    return [x + (k - 1.5) * 1.8, y, z, [PAL.cyan, PAL.violet, PAL.magenta, PAL.lime][k]];
  },

  // Как было: хаос — много мелких «коллекций», раскиданных как попало
  chaos(i, r) {
    const cluster = i % 40;
    const cr = rng(cluster + 101);
    const cx = (cr() - 0.5) * 7.5, cy = (cr() - 0.5) * 4.5, cz = (cr() - 0.5) * 3;
    return [cx + (r() - 0.5) * 0.5, cy + (r() - 0.5) * 0.3, cz + (r() - 0.5) * 0.1,
      [PAL.red, PAL.amber, PAL.magenta, PAL.faint][cluster % 4]];
  },

  // Почему не Postman: две половины — старое и новое
  versus(i, r) {
    const left = i % 2 === 0;
    const x = (left ? -1 : 1) * (0.6 + r() * 2.6), y = (r() - 0.5) * 4;
    const z = left ? (r() - 0.5) * 2.2 : (r() - 0.5) * 0.2;
    return [x, left ? y : Math.round(y * 3) / 3, z, left ? PAL.red : PAL.lime];
  },

  // Конвейер: спираль-труба вдоль X
  pipe(i, r) {
    const t = r(), x = (t - 0.5) * 8.4;
    const a = t * Math.PI * 10 + (i % 2) * Math.PI;
    const rad = 0.45 + r() * 0.12;
    const col = t > 0.18 && t < 0.28 ? PAL.magenta : t > 0.9 ? PAL.magenta : PAL.cyan.clone().lerp(PAL.violet, t);
    return [x, Math.sin(t * Math.PI * 2) * 0.6 + Math.cos(a) * rad, Math.sin(a) * rad, col];
  },

  // Песочница: ядро и две оболочки — guard и лимиты
  cage(i, r) {
    const k = i % 5;
    if (k < 2) { const [x, y, z] = sphere(r, 0.8 * Math.cbrt(r())); return [x, y, z, PAL.cyan]; }
    if (k < 4) { const [x, y, z] = sphere(r, 1.9); return [x, y, z, PAL.violet]; }
    // прутья: меридианы внешней оболочки
    const m = Math.floor(r() * 16), u = r() * 2 - 1, a = (m / 16) * Math.PI * 2, s = Math.sqrt(1 - u * u);
    return [Math.cos(a) * s * 2.6, u * 2.6, Math.sin(a) * s * 2.6, PAL.magenta];
  },

  // QA Package: стопка версий — диски друг над другом
  stack(i, r) {
    const level = i % 8, a = r() * Math.PI * 2, d = Math.sqrt(r()) * 2.1;
    const top = level === 7;
    return [Math.cos(a) * d, (level - 3.5) * 0.48, Math.sin(a) * d * 0.9, top ? PAL.cyan : level % 2 ? PAL.violet : PAL.faint];
  },

  // Редактор: строки кода — плоскость из «слов»
  code(i, r) {
    const line = i % 14, cr = rng(line + 7);
    const len = 2 + cr() * 5, indent = Math.floor(cr() * 3) * 0.5;
    const x = -3.5 + indent + r() * len;
    const word = Math.floor((x + 4) * 1.6);
    const col = [PAL.violet, PAL.ink, PAL.cyan, PAL.lime, PAL.ink][word % 5];
    return [x, 2.6 - line * 0.4 + (r() - 0.5) * 0.08, (r() - 0.5) * 0.1, line === 9 ? PAL.cyan : col];
  },

  // Две базы: два цилиндра и поток в одну сторону
  dbs(i, r) {
    const k = i % 6;
    if (k === 5) {
      const t = r();
      return [2.1 - t * 4.2, (r() - 0.5) * 0.15 + 0.3, (r() - 0.5) * 0.15, PAL.cyan];
    }
    const left = k % 2 === 0, a = r() * Math.PI * 2;
    return [(left ? -2.9 : 2.9) + Math.cos(a) * 0.9, (r() - 0.5) * 2.6, Math.sin(a) * 0.9, left ? PAL.cyan : PAL.amber];
  },

  // Секреты: ядро и четыре луча, дошёл до конца только один
  secret(i, r) {
    const ray = i % 5;
    if (ray === 4) { const [x, y, z] = sphere(r, 0.5 * Math.cbrt(r())); return [x - 2.5, y, z, PAL.magenta]; }
    const t = r(), gy = (1.5 - ray) * 1.1;
    const reach = ray === 0 ? 1 : 0.62;
    const x = -2.5 + t * 5.5 * reach, y = gy * smooth(t);
    return [x, y + (r() - 0.5) * 0.06, (r() - 0.5) * 0.06, ray === 0 ? PAL.lime : PAL.red];
  },

  // Цифры: столбики, высота — логарифм значения
  bars(i, r) {
    const vals = [10139, 17947, 52, 43, 268, 15, 1];
    const k = i % vals.length, hgt = (Math.log10(vals[k] + 1) / 4.3) * 4;
    const x = (k - 3) * 1.1 + (r() - 0.5) * 0.55, z = (r() - 0.5) * 0.55;
    return [x, -2 + r() * hgt, z, k === 3 || k === 4 ? PAL.cyan : PAL.violet];
  },

  // Честно: спокойная волна
  calm(i, r) {
    const x = (r() - 0.5) * 9, z = (r() - 0.5) * 5;
    return [x, Math.sin(x * 0.9) * 0.25 + Math.cos(z * 1.3) * 0.2 - 0.6, z, i % 9 === 0 ? PAL.amber : PAL.faint];
  },

  // Итог: концентрические кольца
  rings(i, r) {
    const k = i % 5, a = r() * Math.PI * 2, rad = 0.7 + k * 0.62 + (r() - 0.5) * 0.05;
    return [Math.cos(a) * rad, Math.sin(a) * rad, (r() - 0.5) * 0.08, [PAL.cyan, PAL.violet, PAL.magenta, PAL.cyan, PAL.violet][k]];
  },
};

/* Сценарий: фигура, яркость и масштаб облака на каждом слайде.
   На слайдах «текст + картинка» облако растянуто (s) шире колонок:
   иначе оно целиком прячется за панелью иллюстрации. Яркость гасит
   его на плотных слайдах. */
const SCRIPT = {
  'Титул':             { shape: 'galaxy', dim: 1.0,  s: 1,   spin: 0.05 },
  'Что это':           { shape: 'quads',  dim: 0.5,  s: 1.6, spin: 0.02 },
  'Как было':          { shape: 'chaos',  dim: 0.5,  s: 1.5, spin: 0.01 },
  'Почему не Postman': { shape: 'versus', dim: 0.3,  s: 1.3, spin: 0 },
  'Конвейер':          { shape: 'pipe',   dim: 0.55, s: 1.4, spin: 0.03 },
  'Песочница':         { shape: 'cage',   dim: 0.45, s: 1.8, spin: 0.06 },
  'QA Package':        { shape: 'stack',  dim: 0.5,  s: 1.7, spin: 0.04 },
  'Редактор':          { shape: 'code',   dim: 0.4,  s: 1.6, spin: 0 },
  'Две базы':          { shape: 'dbs',    dim: 0.5,  s: 1.5, spin: 0.02 },
  'Секреты':           { shape: 'secret', dim: 0.5,  s: 1.5, spin: 0 },
  'Цифры':             { shape: 'bars',   dim: 0.45, s: 1.4, spin: 0.05 },
  'Честно':            { shape: 'calm',   dim: 0.4,  s: 1.3, spin: 0.01 },
  'Итог':              { shape: 'rings',  dim: 0.9,  s: 1,   spin: 0.03 },
};

function build(shapeName) {
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  const r = rng(shapeName.length * 977 + shapeName.charCodeAt(0));
  const fn = SHAPES[shapeName];
  for (let i = 0; i < N; i++) {
    const [x, y, z, c] = fn(i, r);
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  return { pos, col };
}

/* ─────────────────────────── Сцена ─────────────────────────── */

export function mountScene(canvas, slides) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
  } catch {
    canvas.remove(); // без WebGL остаётся CSS-фон, презентация читается как есть
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, 9);

  const steps = slides.map((s) => SCRIPT[s.dataset.slide] ?? SCRIPT['Честно']);
  const shapes = steps.map((s) => build(s.shape));

  // Запаздывание частицы при перетекании: волна, а не одновременный рывок
  const lag = new Float32Array(N);
  const lr = rng(42);
  for (let i = 0; i < N; i++) lag[i] = lr() * 0.4;

  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) seed[i] = lr();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uDim: { value: 1 },
      uSize: { value: 30 * renderer.getPixelRatio() },
    },
    vertexShader: /* glsl */ `
      attribute vec3 color;
      attribute float seed;
      uniform float uTime;
      uniform float uSize;
      varying vec3 vColor;
      varying float vTw;
      void main() {
        vec3 p = position;
        // дыхание: каждая частица чуть плавает на своей фазе
        p += 0.03 * vec3(sin(uTime * 0.9 + seed * 40.0), cos(uTime * 0.7 + seed * 31.0), sin(uTime * 0.5 + seed * 17.0));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * (0.35 + seed * 0.65) / -mv.z;
        vColor = color;
        vTw = 0.65 + 0.35 * sin(uTime * 2.0 + seed * 60.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uDim;
      varying vec3 vColor;
      varying float vTw;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        a *= a;
        gl_FragColor = vec4(vColor * vTw, a * uDim);
      }`,
  });

  const points = new THREE.Points(geo, mat);
  const group = new THREE.Group();
  group.add(points);
  scene.add(group);

  /* Положение в презентации: индекс слайда + доля пути до следующего.
     Считаем по центру экрана относительно offsetTop слайдов — слайд
     может быть выше экрана, поэтому простое scrollY / vh не годится. */
  function progress() {
    const mid = scrollY + innerHeight / 2;
    let i = 0;
    while (i < slides.length - 1 && slides[i + 1].offsetTop + innerHeight * 0.1 <= mid) i++;
    const cur = slides[i], next = slides[i + 1];
    if (!next) return [i, 0];
    const start = cur.offsetTop + cur.offsetHeight - innerHeight * 0.4;
    const span = next.offsetTop + innerHeight * 0.1 - start;
    return [i, clamp((mid - start) / span, 0, 1)];
  }

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // на узком экране отодвигаем камеру: фигуры шириной ~8 единиц
    camera.position.z = w / h < 1 ? 13 : 9;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  addEventListener('pointermove', (e) => {
    mouse.tx = (e.clientX / innerWidth - 0.5) * 2;
    mouse.ty = (e.clientY / innerHeight - 0.5) * 2;
  });

  let last = performance.now(), angle = 0, shownI = -1, shownT = -1;
  const t0 = performance.now();

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const calm = CALM.matches;
    const [i, rawT] = progress();
    const t = calm ? Math.round(rawT) : rawT;
    const a = shapes[i], b = shapes[Math.min(i + 1, shapes.length - 1)];
    const sa = steps[i], sb = steps[Math.min(i + 1, steps.length - 1)];

    // Геометрию пересчитываем только когда сдвинулся скролл
    if (i !== shownI || Math.abs(t - shownT) > 1e-4) {
      for (let k = 0; k < N; k++) {
        const lt = smooth(clamp((t - lag[k]) / 0.6, 0, 1));
        const j = k * 3;
        // лёгкий подскок по Z в середине перехода — облако «вздыхает»
        const lift = Math.sin(lt * Math.PI) * 0.6 * (lag[k] - 0.2);
        pos[j] = a.pos[j] + (b.pos[j] - a.pos[j]) * lt;
        pos[j + 1] = a.pos[j + 1] + (b.pos[j + 1] - a.pos[j + 1]) * lt;
        pos[j + 2] = a.pos[j + 2] + (b.pos[j + 2] - a.pos[j + 2]) * lt + lift;
        col[j] = a.col[j] + (b.col[j] - a.col[j]) * lt;
        col[j + 1] = a.col[j + 1] + (b.col[j + 1] - a.col[j + 1]) * lt;
        col[j + 2] = a.col[j + 2] + (b.col[j + 2] - a.col[j + 2]) * lt;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      shownI = i; shownT = t;
    }

    const st = smooth(t);
    mat.uniforms.uDim.value = sa.dim + (sb.dim - sa.dim) * st;
    mat.uniforms.uTime.value = calm ? 0 : (now - t0) / 1000;

    const spin = sa.spin + (sb.spin - sa.spin) * st;
    if (!calm) angle += spin * dt * Math.PI * 2;
    // вращение гасится к «плоским» фигурам, иначе код и столбцы видны с ребра
    const flat = (s) => (s.spin === 0 ? 0 : 1);
    const flatK = flat(sa) + (flat(sb) - flat(sa)) * st;
    const settle = Math.sin(angle) * 0.35 * flatK;

    mouse.x += (mouse.tx - mouse.x) * 0.04;
    mouse.y += (mouse.ty - mouse.y) * 0.04;
    group.rotation.y = settle + (calm ? 0 : mouse.x * 0.18);
    group.rotation.x = 0.12 * flatK + (calm ? 0 : mouse.y * 0.1);
    group.scale.setScalar(sa.s + (sb.s - sa.s) * st);

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
