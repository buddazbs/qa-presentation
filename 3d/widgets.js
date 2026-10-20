/* ══════════════════════════════════════════════════════════════════
   Callback Admin Tool — 3D-панели (Three.js)

   orbit — «Что это»: CAT в центре, платёжные системы на трёх орбитах
           шлют в него колбэки; ядро вспыхивает на каждом.
   vault — «Две базы»: чтение из БД рынка течёт в callback_admin_tool,
           попытка записи в обратную сторону отбивается клапаном.

   Подписи — HTML поверх канваса: шрифт презентации и чёткость на любом
   DPR. Кадры идут, только пока панель на экране; в режиме покоя —
   один неподвижный кадр.
   ══════════════════════════════════════════════════════════════════ */
import * as THREE from './vendor/three.module.js';

const CALM = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (t) => t * t * (3 - 2 * t);

/* Палитра из styles.css :root. Виджет можно перекрасить, передав свою
   палитру вторым аргументом (signal.html передаёт неон): ключи те же,
   недостающие берутся отсюда. */
const PALETTE = {
  cyan: '#38e8ff',
  violet: '#8b6cff',
  magenta: '#ff4d9d',
  lime: '#6bffb0',
  amber: '#ffc857',
  red: '#ff5c6e',
  ink: '#e8edff',
};
const colors = (over = {}) => Object.fromEntries(
  Object.entries({ ...PALETTE, ...over }).map(([k, v]) => [k, new THREE.Color(v)]),
);

/* ─────────────────────────── Общее ─────────────────────────── */

// Мягкое пятно света: одна текстура на все спрайты и искры
let glowTex = null;
function glow() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.16, 'rgba(255,255,255,0.8)');
  r.addColorStop(0.42, 'rgba(255,255,255,0.18)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

function sprite(color, size, opacity = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glow(), color, opacity, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  s.scale.setScalar(size);
  return s;
}

// Окружность в плоскости XZ; n сторон — шестиугольник клапана тоже она
function ring(r, n = 96, closed = false) {
  const pts = [];
  for (let i = 0; i < n + (closed ? 1 : 0); i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
  }
  return new THREE.BufferGeometry().setFromPoints(pts);
}

// Свечение по краю сферы: ядро светится ободком, а не заливкой
function fresnel(color) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: color }, uPower: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uPower;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
        gl_FragColor = vec4(uColor * (0.1 + f * 1.15) * uPower, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

// Искры: пул точек с временем жизни, яркость гаснет через цвет вершины
function sparks(parent, count, color) {
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
  const vel = new Float32Array(count * 3), life = new Float32Array(count);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    map: glow(), size: 0.16, vertexColors: true, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  pts.frustumCulled = false;
  parent.add(pts);
  let next = 0;
  return {
    burst(at, dir, n) {
      for (let k = 0; k < n; k++) {
        const i = next++ % count, j = i * 3;
        pos[j] = at.x; pos[j + 1] = at.y; pos[j + 2] = at.z;
        const a = Math.atan2(dir.y, dir.x) + (Math.random() - 0.5) * 2.2;
        const sp = 1.2 + Math.random() * 1.8;
        vel[j] = Math.cos(a) * sp; vel[j + 1] = Math.sin(a) * sp; vel[j + 2] = (Math.random() - 0.5) * 1.2;
        life[i] = 1;
      }
    },
    update(dt) {
      for (let i = 0; i < count; i++) {
        const j = i * 3;
        if (life[i] > 0) {
          life[i] = Math.max(0, life[i] - dt * 1.9);
          const drag = Math.pow(0.04, dt);
          vel[j] *= drag; vel[j + 1] *= drag; vel[j + 2] *= drag;
          pos[j] += vel[j] * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += vel[j + 2] * dt;
        }
        const k = life[i] * life[i];
        col[j] = color.r * k; col[j + 1] = color.g * k; col[j + 2] = color.b * k;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    },
  };
}

/* Каркас панели: рендерер, камера, HTML-подписи, размер по панели,
   кадры только пока панель видна. build() получает сцену и отдаёт
   update(t, dt); dt = 0 — просьба нарисовать неподвижный кадр. */
function mountWidget(host, build) {
  if (!host) return;
  const canvas = document.createElement('canvas');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    host.classList.add('no-gl');   // без WebGL панель остаётся пустой рамкой с подписью
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const layer = document.createElement('div');
  layer.className = 'gl-tags';
  host.append(canvas, layer);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 4 / 3, 0.1, 60);

  /* Горизонтальный угол обзора фиксирован по раскладке 4:3: в узкой
     высокой панели сцена не обрезается по бокам, а получает воздух
     сверху и снизу. Подписи — HTML, сами они не мельчают вместе со
     сценой, поэтому их масштаб k идёт за шириной панели. */
  const HALF = Math.tan(THREE.MathUtils.degToRad(20)) * (4 / 3);
  let W = 1, H = 1, k = 1;
  const tag = (html, cls = '') => {
    const el = document.createElement('div');
    el.className = `gl-tag ${cls}`.trim();
    el.innerHTML = html;
    layer.appendChild(el);
    return el;
  };
  // Мировая точка → пиксели панели; dy — сдвиг подписи над точкой
  const v = new THREE.Vector3();
  const pin = (el, p, dy = 0) => {
    v.copy(p).project(camera);
    const x = ((v.x + 1) / 2) * W, y = ((1 - v.y) / 2) * H + dy;
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${k.toFixed(3)})`;
  };

  const update = build({ scene, camera, tag, pin });
  camera.updateMatrixWorld();

  let t = CALM.matches ? 3 : 0, last = 0, raf = 0;
  const draw = (dt) => { update(t, dt); renderer.render(scene, camera); };
  const frame = (now) => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    t += dt;
    draw(dt);
    raf = requestAnimationFrame(frame);
  };

  new ResizeObserver(() => {
    W = host.clientWidth; H = host.clientHeight;
    if (!W || !H) return;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.fov = Math.max(40, THREE.MathUtils.radToDeg(2 * Math.atan(HALF / camera.aspect)));
    camera.updateProjectionMatrix();
    k = Math.min(1, Math.max(0.72, W / 520));
    draw(0);   // setSize стирает канвас — сразу же рисуем заново
  }).observe(host);

  new IntersectionObserver(([e]) => {
    cancelAnimationFrame(raf);
    if (!e.isIntersecting || CALM.matches) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }).observe(host);
}

/* ─────────────────────────── orbit ─────────────────────────── */

/* Платёжные системы из шаблонов. Ближняя орбита быстрее дальней. */
const ORBITS = [
  { r: 1.75, tilt: [1.2, 0, 0.2], speed: 0.16, key: 'cyan',
    names: ['OkPay', 'Skrill', 'Payeer', 'Piastrix'] },
  { r: 2.6, tilt: [1.28, 0, -0.14], speed: -0.1, key: 'violet',
    names: ['Neteller', 'Jeton', 'PayOp', 'Paylink', 'Monetix', 'Volt'] },
  { r: 3.4, tilt: [1.12, 0, 0.08], speed: 0.065, key: 'magenta',
    names: ['UPI', 'Bkash', 'Nagad', 'Pix', 'Tink'] },
];

/** @param {Partial<typeof PALETTE>} [palette] — свои цвета вместо палитры styles.css */
export function mountOrbit(host, palette) {
  const C = colors(palette);
  mountWidget(host, ({ scene, camera, tag, pin }) => {
    camera.position.set(0, 1.1, 9.8);
    camera.lookAt(0, -0.3, 0);

    const root = new THREE.Group();
    scene.add(root);

    // Пыль: глубина без лишнего шума
    const dustN = 500, dust = new Float32Array(dustN * 3);
    for (let i = 0; i < dustN; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      const d = 2 + Math.random() * 4.5;
      dust.set([Math.cos(a) * s * d, u * d * 0.6, Math.sin(a) * s * d], i * 3);
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dust, 3));
    const dustPts = new THREE.Points(dustGeo, new THREE.PointsMaterial({
      map: glow(), color: C.ink, size: 0.07, transparent: true, opacity: 0.35,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    root.add(dustPts);

    // Ядро: каркас, светящаяся сфера внутри и ореол
    const core = new THREE.Group();
    const shell = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.92, 1)),
      new THREE.LineBasicMaterial({ color: C.cyan, transparent: true, opacity: 0.5 }),
    );
    const heart = new THREE.Mesh(new THREE.IcosahedronGeometry(0.64, 4), fresnel(C.cyan));
    const halo = sprite(C.cyan, 3.4, 0.3);
    core.add(halo, heart, shell);
    root.add(core);
    const coreTag = tag('<b>CAT</b>', 'gl-tag--core');

    // Волна от ядра на каждый принятый колбэк
    const waves = Array.from({ length: 4 }, () => {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(0.97, 1, 72),
        new THREE.MeshBasicMaterial({ color: C.cyan, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      core.add(m);
      return { m, t: 1 };
    });
    let waveNext = 0;

    // Орбиты и узлы
    const nodes = [];
    ORBITS.forEach((o, oi) => {
      const color = C[o.key];
      const plane = new THREE.Group();
      plane.rotation.set(...o.tilt);
      root.add(plane);
      const line = new THREE.Line(ring(o.r, 160, true), new THREE.LineDashedMaterial({
        color, transparent: true, opacity: 0.32, dashSize: 0.14, gapSize: 0.1,
      }));
      line.computeLineDistances();
      plane.add(line);

      o.names.forEach((name, k) => {
        const pivot = new THREE.Object3D();
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), new THREE.MeshBasicMaterial({ color }));
        const aura = sprite(color, 0.75, 0.6);
        pivot.add(aura, dot);
        plane.add(pivot);
        const el = tag(name);
        el.style.setProperty('--c', `#${color.getHexString()}`);
        nodes.push({ pivot, aura, el, r: o.r, speed: o.speed, color, a0: (k / o.names.length) * Math.PI * 2 + oi * 0.7, ping: 0 });
      });
    });

    /* Колбэк: светящаяся голова и хвост летят по дуге от узла в ядро.
       Хвост — те же точки кривой чуть позади головы, яркость — цветом. */
    const TRAIL = 30;
    const pulses = Array.from({ length: 7 }, () => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
        vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      line.frustumCulled = false;
      const head = sprite(C.cyan, 0.5);
      line.visible = head.visible = false;
      root.add(line, head);
      return { line, head, t: -1, dur: 1.2, from: new THREE.Vector3(), ctrl: new THREE.Vector3(), color: C.cyan };
    });
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3());
    const pt = new THREE.Vector3(), wp = new THREE.Vector3();
    let kick = 0, spawnIn = 0.4;

    function launch() {
      const p = pulses.find((x) => x.t < 0);
      if (!p) return;
      const n = nodes[Math.floor(Math.random() * nodes.length)];
      n.ping = 1;
      root.worldToLocal(n.pivot.getWorldPosition(p.from));
      // дуга выгибается вверх и к зрителю — видно, что это полёт, а не линия
      p.ctrl.copy(p.from).multiplyScalar(0.45).add(pt.set(0, 0.7 + p.from.length() * 0.18, 0.5));
      p.color = n.color;
      p.dur = 0.95 + p.from.length() * 0.12;
      p.t = 0;
      p.head.material.color.copy(n.color);
      p.line.visible = p.head.visible = true;
    }

    function arrive(p) {
      p.t = -1;
      p.line.visible = p.head.visible = false;
      kick = 1;
      const w = waves[waveNext++ % waves.length];
      w.t = 0;
      w.m.material.color.copy(p.color);
    }

    return (t, dt) => {
      root.rotation.y = Math.sin(t * 0.12) * 0.14;
      dustPts.rotation.y = t * 0.02;
      shell.rotation.set(t * 0.11, t * 0.23, 0);
      heart.rotation.y = -t * 0.3;

      kick *= Math.exp(-dt * 3.2);
      heart.material.uniforms.uPower.value = 1 + kick * 1.4;
      halo.material.opacity = 0.28 + kick * 0.35;
      halo.scale.setScalar(3.4 + kick * 0.9);
      shell.material.opacity = 0.45 + kick * 0.4;
      pin(coreTag, core.getWorldPosition(wp));

      for (const w of waves) {
        if (w.t >= 1) { w.m.material.opacity = 0; continue; }
        w.t = Math.min(1, w.t + dt / 1.1);
        w.m.quaternion.copy(camera.quaternion);
        w.m.scale.setScalar(0.9 + smooth(w.t) * 2.1);
        w.m.material.opacity = 0.7 * (1 - w.t) * (1 - w.t);
      }

      for (const n of nodes) {
        const a = n.a0 + t * n.speed * Math.PI * 2 * 0.25;
        n.pivot.position.set(Math.cos(a) * n.r, 0, Math.sin(a) * n.r);
        n.ping = Math.max(0, n.ping - dt * 1.6);
        n.aura.scale.setScalar(0.75 + n.ping * 1.1);
        n.pivot.getWorldPosition(wp);
        // дальние подписи тусклее и под ближними — объём читается и в HTML
        const k = clamp((wp.z + 3.4) / 6.8, 0, 1);
        n.el.style.opacity = (0.4 + k * 0.6).toFixed(2);
        n.el.style.zIndex = String(Math.round(k * 100));
        n.el.classList.toggle('on', n.ping > 0.35);
        pin(n.el, wp, -17);
      }

      if (dt > 0) {
        spawnIn -= dt;
        if (spawnIn <= 0) { launch(); spawnIn = 0.28 + Math.random() * 0.45; }
      }

      for (const p of pulses) {
        if (p.t < 0) continue;
        p.t += dt / p.dur;
        if (p.t >= 1) { arrive(p); continue; }
        curve.v0.copy(p.from); curve.v1.copy(p.ctrl); curve.v2.set(0, 0, 0);
        const head = Math.pow(p.t, 1.5);   // разгон к ядру
        curve.getPoint(head, p.head.position);
        const pos = p.line.geometry.attributes.position, col = p.line.geometry.attributes.color;
        const fadeIn = clamp(p.t * 6, 0, 1);
        for (let i = 0; i < TRAIL; i++) {
          curve.getPoint(Math.max(0, head - i * 0.011), pt);
          pos.setXYZ(i, pt.x, pt.y, pt.z);
          const b = Math.pow(1 - i / TRAIL, 1.6) * fadeIn;
          col.setXYZ(i, p.color.r * b, p.color.g * b, p.color.b * b);
        }
        pos.needsUpdate = col.needsUpdate = true;
        p.head.material.opacity = fadeIn;
      }
    };
  });
}

/* ─────────────────────────── vault ─────────────────────────── */

/** @param {Partial<typeof PALETTE>} [palette] — свои цвета вместо палитры styles.css */
export function mountVault(host, palette) {
  const C = colors(palette);
  mountWidget(host, ({ scene, camera, tag, pin }) => {
    camera.position.set(0, 2, 8.3);
    camera.lookAt(0, -0.25, 0);

    const root = new THREE.Group();
    scene.add(root);
    const wp = new THREE.Vector3();
    const anchor = (x, y, z = 0) => {
      const o = new THREE.Object3D();
      o.position.set(x, y, z);
      root.add(o);
      return o;
    };

    /* База — три «диска» друг над другом, как на иконке БД. По
       поверхности крутятся строки данных; диск вспыхивает, когда
       из него читают или в него пишут. */
    function db(x, color, spin) {
      const g = new THREE.Group();
      g.position.x = x;
      root.add(g);
      const segs = [];
      for (let k = 0; k < 3; k++) {
        const y = (k - 1) * 0.76;
        const body = new THREE.Mesh(
          new THREE.CylinderGeometry(0.95, 0.95, 0.62, 56, 1, true),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }),
        );
        body.position.y = y;
        const edge = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6 });
        const top = new THREE.LineLoop(ring(0.95), edge), bot = new THREE.LineLoop(ring(0.95), edge);
        top.position.y = y + 0.31;
        bot.position.y = y - 0.31;

        const rows = new Float32Array(3 * 42 * 3);
        for (let r = 0; r < 3; r++) {
          for (let i = 0; i < 42; i++) {
            const a = (i / 42) * Math.PI * 2 + r * 0.4;
            rows.set([Math.cos(a) * 0.96, (r - 1) * 0.15, Math.sin(a) * 0.96], (r * 42 + i) * 3);
          }
        }
        const rowGeo = new THREE.BufferGeometry();
        rowGeo.setAttribute('position', new THREE.BufferAttribute(rows, 3));
        const data = new THREE.Points(rowGeo, new THREE.PointsMaterial({
          map: glow(), color, size: 0.1, transparent: true, opacity: 0.55,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        data.position.y = y;
        g.add(body, top, bot, data);
        segs.push({ body, edge, data, flash: 0 });
      }
      // Крышка: объём верхнему диску
      const cap = new THREE.Mesh(
        new THREE.CircleGeometry(0.95, 56),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }),
      );
      cap.rotation.x = -Math.PI / 2;
      cap.position.y = 0.76 + 0.31;
      const aura = sprite(color, 4.2, 0.1);
      g.add(cap, aura);
      return {
        segs,
        hit(k = Math.floor(Math.random() * 3)) { segs[k].flash = 1; },
        update(t, dt) {
          for (const s of segs) {
            s.flash = Math.max(0, s.flash - dt * 2.2);
            s.edge.opacity = 0.55 + s.flash * 0.45;
            s.body.material.opacity = 0.06 + s.flash * 0.16;
            s.data.material.opacity = 0.45 + s.flash * 0.55;
            s.data.rotation.y = t * spin;
          }
        },
      };
    }

    const ADMIN_X = -2.65, MARKET_X = 2.65, VALVE_X = 0.3;
    const admin = db(ADMIN_X, C.lime, 0.22);
    const market = db(MARKET_X, C.amber, -0.3);

    // Дорожки: чтение сверху, запись снизу
    const READ_Y = 0.42, WRITE_Y = -0.5, FROM = 1.55;
    const lane = (x0, x1, y, color, opacity) => {
      const l = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x0, y, 0), new THREE.Vector3(x1, y, 0)]),
        new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 0.1, gapSize: 0.08 }),
      );
      l.computeLineDistances();
      root.add(l);
      return l;
    };
    lane(FROM, -FROM, READ_Y, C.lime, 0.4);
    lane(-FROM, VALVE_X, WRITE_Y, C.red, 0.35);
    lane(VALVE_X, FROM, WRITE_Y, C.red, 0.08);   // путь есть, но по нему никто не ходит

    // Клапан: шестигранник поперёк нижней дорожки
    const valve = new THREE.Group();
    valve.position.set(VALVE_X, WRITE_Y, 0);
    // Вполоборота к камере: строго поперёк полосы шестигранник виден ребром
    valve.rotation.y = -0.75;
    const valveFace = new THREE.Mesh(
      new THREE.CircleGeometry(0.36, 6),
      new THREE.MeshBasicMaterial({ color: C.amber, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }),
    );
    valveFace.rotation.y = Math.PI / 2;
    const valveEdge = new THREE.LineLoop(ring(0.36, 6), new THREE.LineBasicMaterial({ color: C.amber, transparent: true, opacity: 0.9 }));
    valveEdge.rotation.z = Math.PI / 2;
    const valveGlow = sprite(C.amber, 1.4, 0.15);
    valve.add(valveGlow, valveFace, valveEdge);
    root.add(valve);

    // Чтение: пакеты идут цепочкой из рынка в админку
    const reads = Array.from({ length: 4 }, (_, i) => {
      const s = sprite(C.lime, 0.38);
      const tail = sprite(C.lime, 0.22, 0.4);
      root.add(s, tail);
      return { s, tail, off: i / 4, last: 0 };
    });

    // Запись: пакет упирается в клапан и отскакивает
    const write = sprite(C.red, 0.42);
    root.add(write);
    const burst = sparks(root, 40, C.red);
    const hitAt = new THREE.Vector3(VALVE_X - 0.12, WRITE_Y, 0), back = new THREE.Vector2(-1, 0);
    let valveFlash = 0, lastQ = 0;
    const CYCLE = 2.8, HIT = 0.42;

    const tags = [
      [tag('<span class="db-name">callback_admin_tool</span><span class="db-mode ok">чтение и запись</span>', 'gl-tag--db'), anchor(ADMIN_X, -1.62)],
      [tag('<span class="db-name">БД рынка</span><span class="db-mode warn">только чтение, по запросу</span>', 'gl-tag--db'), anchor(MARKET_X, -1.62)],
      [tag('только чтение', 'gl-tag--valve'), anchor(VALVE_X, WRITE_Y - 0.62)],
      [tag('чтение · по id', 'gl-tag--lane gl-tag--read'), anchor(0, READ_Y + 0.3)],
      [tag('запись', 'gl-tag--lane gl-tag--write'), anchor(-0.75, WRITE_Y + 0.28)],
    ];

    return (t, dt) => {
      root.rotation.y = Math.sin(t * 0.18) * 0.2;
      root.rotation.x = 0.04 + Math.sin(t * 0.13) * 0.03;
      admin.update(t, dt);
      market.update(t, dt);

      for (const r of reads) {
        const ph = (t * 0.42 + r.off) % 1;
        if (dt > 0 && ph < r.last) { market.hit(); admin.hit(); }
        r.last = ph;
        const x = FROM - ph * FROM * 2;
        const o = Math.sin(ph * Math.PI);
        r.s.position.set(x, READ_Y, 0);
        r.tail.position.set(x + 0.14, READ_Y, 0);
        r.s.material.opacity = o;
        r.tail.material.opacity = o * 0.4;
      }

      const q = (t % CYCLE) / CYCLE;
      if (dt > 0 && lastQ < HIT && q >= HIT) {
        valveFlash = 1;
        burst.burst(hitAt, back, 12);
      }
      lastQ = q;
      let wx, wo, ws = 0.42;
      if (q < HIT) {
        const k = q / HIT;
        wx = -FROM + (hitAt.x + FROM) * k * k;   // разгон в клапан
        wo = clamp(k * 5, 0, 1);
      } else if (q < 0.8) {
        const k = (q - HIT) / (0.8 - HIT);
        wx = hitAt.x - (1 - Math.pow(1 - k, 3)) * 1.35;
        wo = 1 - k;
        ws = 0.42 * (1 - k * 0.5);
      } else {
        wx = -FROM; wo = 0;
      }
      write.position.set(wx, WRITE_Y, 0);
      write.material.opacity = wo;
      write.scale.setScalar(ws);

      valveFlash = Math.max(0, valveFlash - dt * 2.4);
      valveFace.material.opacity = 0.14 + valveFlash * 0.4;
      valveGlow.material.opacity = 0.15 + valveFlash * 0.6;
      valve.scale.setScalar(1 + valveFlash * 0.18);
      valveEdge.rotation.x = t * 0.4;
      burst.update(dt);

      for (const [el, a] of tags) pin(el, a.getWorldPosition(wp));
    };
  });
}
