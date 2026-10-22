// Ствол сцены — 信号幹線, сигнальная магистраль. Инженерное сооружение, а
// не организм: всё, что здесь есть, можно собрать на заводе.
//
//   · шахта — восьмигранная труба из анодированного металла, по граням —
//     съёмные сервисные панели на винтах;
//   · сигнал — четыре световые линии в пазах граней, по ним вниз идут
//     импульсы; это единственный «живой» свет ствола;
//   · коммуникации — четыре кабелепровода, прижатые скобами;
//   · каркас — четыре несущие стойки, связанные X-раскосами в ферму;
//   · фланцы — кольца на болтах через каждые 3,1 высоты, на части из них —
//     гравированная шкала делений;
//   · главы — распределительный модуль на кронштейне, от него к карточке
//     уходит кабель отвода;
//   · между главами — промышленный монитор с логом платформы и либо
//     спутниковая антенна на поворотной опоре, либо вертикальная вывеска.

import * as THREE from '../3d/vendor/three.module.js';
import { INK, JP_FONT, ANISOTROPY, buildSign, chapterJp, seeded } from './signage.js';

/**
 * Окружение для отражений металла: студийные софтбоксы — белые и холодные
 * серые, одна узкая циановая и одна красная полоса (вывески за кадром).
 * Металл ловит блики формы, а не цветную радугу.
 */
export function makeEnvironment(renderer) {
  const env = new THREE.Scene();
  env.background = new THREE.Color('#050607');
  const panel = (color, intensity, pos, size) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(size[0], size[1]),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }),
    );
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  panel('#ffffff', 2.4, [6, 3, 0], [2.5, 10]);
  panel('#c9d2de', 1.4, [-6, 1, 2], [4, 8]);
  panel('#ffffff', 1.2, [0, 7, 0], [6, 6]);
  panel(INK.cyan, 2.2, [-2, 0, -6], [0.6, 10]);
  panel(INK.seal, 1.4, [4, -3, -5], [0.5, 6]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(env, 0.03).texture;
  pmrem.dispose();
  return texture;
}

export const VERTEX_UV = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

/**
 * Световая линия магистрали: короткие пакеты бегут сверху вниз по мировой
 * высоте; у камеры при перелёте линия разгорается — сигнал идёт с нами.
 */
function signalLineMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    uniforms,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying float vY; varying vec2 vUv; void main() { vUv = uv; vY = (modelMatrix * vec4(position, 1.0)).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uColor; uniform float uSurgeY; uniform float uSurge;
      varying float vY; varying vec2 vUv;
      void main() {
        // Пакет — короткий штрих с длинной паузой: читается как передача, а не мерцание
        float f = fract(vY * 0.11 + uTime * 0.42);
        float packet = smoothstep(0.0, 0.02, f) * (1.0 - smoothstep(0.02, 0.07, f));
        float surge = uSurge * exp(-pow((vY - uSurgeY) / 2.2, 2.0));
        float core = 1.0 - abs(vUv.x - 0.5) * 2.0;
        float glow = 0.22 + packet * 1.6 + surge * 0.9;
        gl_FragColor = vec4(uColor * glow * (0.4 + 0.6 * core), 1.0);
      }
    `,
  });
}

/** Свет внутри кабеля отвода: ровный ток; в фокусе — пакет к карточке и ярче. */
function branchFiberMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uBoost: { value: 0 }, uArrive: { value: 99 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: VERTEX_UV,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uColor; uniform float uBoost; uniform float uArrive;
      varying vec2 vUv;
      void main() {
        float flow = pow(fract(vUv.x * 4.0 - uTime * 0.8), 18.0);
        // Глава подключилась: один пакет проходит от модуля до карточки за 0,6 с
        float head = exp(-pow((vUv.x - uArrive / 0.6) / 0.05, 2.0)) * step(uArrive, 0.7);
        float glow = 0.12 + flow * 0.6 + uBoost * (0.35 + flow * 0.9) + head * 2.4;
        gl_FragColor = vec4(uColor * glow, 1.0);
      }
    `,
  });
}

export function roundedRect(w, h, r) {
  const x = w / 2;
  const y = h / 2;
  const s = new THREE.Shape();
  s.moveTo(-x + r, -y);
  s.lineTo(x - r, -y);
  s.quadraticCurveTo(x, -y, x, -y + r);
  s.lineTo(x, y - r);
  s.quadraticCurveTo(x, y, x - r, y);
  s.lineTo(-x + r, y);
  s.quadraticCurveTo(-x, y, -x, y - r);
  s.lineTo(-x, -y + r);
  s.quadraticCurveTo(-x, -y, -x + r, -y);
  return s;
}

/** Подпись дисплея модуля: номер, японская маркировка главы и название. */
function labelTexture(num, name) {
  return canvasTexture(512, 320, g => {
    g.fillStyle = '#fff';
    g.font = '200 148px Inter, system-ui, -apple-system, sans-serif';
    g.fillText(String(num).padStart(2, '0'), 26, 146);
    g.font = `600 34px ${JP_FONT}`;
    g.fillText(chapterJp(num), 300, 146);
    g.fillRect(32, 170, 448, 2);
    g.font = '500 28px ui-monospace, Menlo, monospace';
    g.letterSpacing = '4px';
    g.fillText(name.toUpperCase(), 32, 212);
  });
}

/** Дисплей модуля: подпись главы и столбики трафика; в фокусе ярче. */
function screenMaterial(uniforms, seed, label) {
  return new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uSeed: { value: seed }, uBoost: { value: 0 }, uLabel: { value: label } },
    vertexShader: VERTEX_UV,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uColor; uniform float uSeed; uniform float uBoost; uniform sampler2D uLabel;
      varying vec2 vUv;
      void main() {
        float band = 0.24;
        float col = floor(vUv.x * 18.0);
        float speed = 0.6 + fract(col * 0.37 + uSeed) * 1.2;
        float h = 0.2 + 0.7 * abs(sin(uTime * speed * (1.0 + uBoost) + col * 1.7 + uSeed * 5.0));
        float bar = step(vUv.y / band, h) * step(0.25, fract(vUv.x * 18.0)) * step(vUv.y, band);
        float label = texture2D(uLabel, vUv).r;
        vec3 c = vec3(0.012) + uColor * bar * (0.35 + uBoost * 0.5) + vec3(0.92, 0.94, 0.97) * label * (0.55 + uBoost * 0.45);
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
}

// Лог: 32 строки по LOG_LINE px на холсте 512×1024 макета; экран показывает
// LOG_VIEW строк
const LOG_ROWS = 32;
const LOG_LINE = 1024 / LOG_ROWS;
const LOG_VIEW = 13;

/**
 * Лог платформы для мониторов: что делает сервис, строка за строкой. Время —
 * тусклое, метод и стрелки — циан, «ok/200/online» — белые, отказы — красный
 * печати, длительности — латунь. Шум цвета нет: один ряд лексем.
 */
function logTexture() {
  const lines = [
    'POST /api/callbacks/:id/send', 'prepareCallbackRequest()', '  vars ← form + declared', '  secrets → isolated',
    '  fillFromDb market=okpay', '  substitute {{...}} → url', 'QuickJS run  3.1ms  16MB', '  sign HMAC-SHA256  ok',
    'assertSafeOutboundUrl  ok', '→ POST https://ps.test/cb', '← 200 OK  41ms', 'history +1  (cap 150)',
    'GET /api/mocks?ports=8084,8085', '  stand adapter  online', '  stand processor-01  online', '  host+creds ← server',
    'PUT /callbacks/42  409', '  → reload latest', 'qa-package v14  ok', 'astGuard: require(  deny',
  ];
  const tone = word => (/^(POST|GET|PUT|→|←)$/.test(word) ? INK.cyan
    : /^(409|deny)$/.test(word) ? INK.seal
    : /^\d+(\.\d+)?(ms|MB)$/.test(word) ? '#c4a574'
    : /^(ok|200|OK|online)$/.test(word) ? '#ffffff' : '#c3c9d2');
  return canvasTexture(512, 1024, g => {
    g.font = '500 23px ui-monospace, Menlo, monospace';
    g.textBaseline = 'middle';
    for (let i = 0; i < LOG_ROWS; i++) {
      const line = lines[i % lines.length];
      const y = (i + 0.5) * LOG_LINE;
      let x = 16;
      g.fillStyle = '#5b626e';
      const stamp = `${String(i * 7 % 60).padStart(2, '0')}:${String(i * 13 % 60).padStart(2, '0')} `;
      g.fillText(stamp, x, y);
      x += g.measureText(stamp).width;
      // Лексемы через пробелы — каждая своим цветом; отступ вложенной строки сохраняется
      for (const part of line.split(/( +)/)) {
        if (!part.trim()) { x += g.measureText(part).width; continue; }
        g.fillStyle = tone(part);
        g.globalAlpha = line.startsWith(' ') ? 0.75 : 1;
        g.fillText(part, x, y);
        x += g.measureText(part).width;
      }
      g.globalAlpha = 1;
    }
  }, { color: true });
}

/** Шапка и статус терминала — неподвижны поверх прокрутки. */
function monitorChrome() {
  return canvasTexture(512, 330, (g, W, H) => {
    g.font = '600 15px ui-monospace, Menlo, monospace';
    g.textBaseline = 'middle';
    g.fillStyle = INK.cyan;
    g.fillText('QAP · LOG', 16, 15);
    g.fillStyle = '#7d8591';
    g.fillText('tail -f callback.log', 120, 15);
    g.fillRect(0, 29, W, 1);
    g.fillRect(0, H - 25, W, 1);
    g.fillStyle = INK.seal;
    g.beginPath(); g.arc(22, H - 12, 4, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#c3c9d2';
    g.fillText('LIVE  ch 01–13', 34, H - 12);
    // Знак приглашения в нижней строке лога — над ним мигает курсор шейдера
    g.fillStyle = INK.cyan;
    g.fillText('$', 16, H * (1 - 0.112));
  }, { color: true });
}

/**
 * Экран монитора — терминал: новая строка лога приходит раз в ~1,2 с и
 * сдвигает текст вверх за 0,12 с, как настоящий tail -f. Сверху шапка,
 * снизу статус, у последней строки мигает курсор. ЭЛТ-развёртка, затемнение
 * к краям и косой блик стекла — экран читается как стекло перед люминофором.
 */
function monitorMaterial(uniforms, seed, log, chrome) {
  return new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uSeed: { value: seed }, uLog: { value: log }, uChrome: { value: chrome } },
    vertexShader: VERTEX_UV,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uSeed; uniform sampler2D uLog; uniform sampler2D uChrome;
      varying vec2 vUv;
      void main() {
        // Область лога — между шапкой и статусом; строки идут ступенями
        float y0 = 0.08, y1 = 0.91;
        float k = (vUv.y - y0) / (y1 - y0);
        float clock = uTime / 1.2 + uSeed * 17.0;
        float shift = floor(clock) + smoothstep(0.0, 0.1, fract(clock));
        float rows = ${LOG_VIEW.toFixed(1)}, total = ${LOG_ROWS.toFixed(1)};
        vec2 uv = vec2(vUv.x, fract((k * rows - shift) / total));
        // Нижняя строка — приглашение ввода: лог идёт над ней
        vec3 text = texture2D(uLog, uv).rgb * step(1.0 / rows, k) * step(k, 1.0);
        // Курсор: блок после знака приглашения, мигает раз в секунду
        float cursor = step(0.058, vUv.x) * step(vUv.x, 0.082) * step(0.15 / rows, k) * step(k, 0.85 / rows) * step(0.5, fract(uTime));
        vec3 ui = texture2D(uChrome, vUv).rgb;
        vec3 c = vec3(0.012, 0.014, 0.018) + text * 0.85 + ui * 0.8 + vec3(0.18, 0.85, 1.0) * cursor * 0.6;
        // Развёртка, виньетка и блик стекла
        c *= 0.86 + 0.14 * sin(vUv.y * 900.0);
        vec2 q = vUv - 0.5;
        c *= 1.0 - 0.9 * dot(q, q);
        c += vec3(0.05, 0.055, 0.06) * smoothstep(0.08, 0.0, abs(vUv.x + vUv.y * 0.6 - 0.95));
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
}

/**
 * Холст-текстура: draw(g, w, h) рисует в координатах макета, холст вдвое
 * плотнее. Для карт рельефа и шероховатости — linear, для цвета — sRGB.
 */
function canvasTexture(w, h, draw, { color = false, repeat = [1, 1] } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = w * 2;
  canvas.height = h * 2;
  const g = canvas.getContext('2d');
  g.scale(2, 2);
  draw(g, w, h);
  const texture = new THREE.CanvasTexture(canvas);
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(...repeat);
  texture.anisotropy = ANISOTROPY;
  return texture;
}

/**
 * Обшивка шахты — одна грань восьмигранника на 1 м высоты (тайл): серый
 * анодированный металл, продольная шлифовка (риски вдоль высоты), по краям
 * грани — сварной шов и ряд заклёпок. Рельеф: шов утоплен, заклёпки выпуклые.
 * Возвращает { bump, rough }: одна разметка для двух карт.
 */
function shaftSkin(height) {
  const W = 256, H = 512;
  const paint = (g, bumpPass) => {
    const rnd = seeded(7);
    g.fillStyle = bumpPass ? '#808080' : '#9a9a9a';
    g.fillRect(0, 0, W, H);
    // Шлифовка: тонкие вертикальные риски разной яркости
    for (let x = 0; x < W; x += 1) {
      const v = (bumpPass ? 128 : 154) + (rnd() - 0.5) * (bumpPass ? 14 : 60);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x, 0, 1, H);
    }
    // Сварной шов по краям грани и заклёпки вдоль него
    g.fillStyle = bumpPass ? '#3a3a3a' : '#606060';
    g.fillRect(0, 0, 3, H);
    g.fillRect(W - 3, 0, 3, H);
    g.fillStyle = bumpPass ? '#e0e0e0' : '#7a7a7a';
    for (let y = 16; y < H; y += 64) for (const x of [12, W - 12]) { g.beginPath(); g.arc(x, y, 3.2, 0, Math.PI * 2); g.fill(); }
  };
  const repeat = [8, height];
  return {
    bump: canvasTexture(W, H, g => paint(g, true), { repeat }),
    rough: canvasTexture(W, H, g => paint(g, false), { repeat }),
  };
}

/**
 * Сервисная панель: внизу — жалюзи вентиляции (прорези с тенью под
 * козырьком), вверху — трафаретная надпись 点検口 («люк для осмотра») и
 * стрелка к винтам. Возвращает { map, bump }.
 */
function panelSkin() {
  const W = 128, H = 320;
  const paint = (g, bumpPass) => {
    g.fillStyle = bumpPass ? '#808080' : '#ffffff';
    g.fillRect(0, 0, W, H);
    for (let y = H - 128; y < H - 20; y += 12) {
      g.fillStyle = bumpPass ? '#202020' : '#3a3a3a';
      g.fillRect(20, y, W - 40, 5);
      g.fillStyle = bumpPass ? '#d0d0d0' : '#ffffff';
      g.fillRect(20, y - 1.5, W - 40, 1.5);
    }
    if (bumpPass) return;
    g.fillStyle = 'rgba(30, 32, 38, 0.85)';
    g.font = `700 22px ${JP_FONT}`;
    g.textAlign = 'center';
    g.fillText('点検口', W / 2, 52);
    g.font = '600 10px ui-monospace, Menlo, monospace';
    g.fillText('SVC ↓ 4×M6', W / 2, 70);
  };
  return {
    map: canvasTexture(W, H, g => paint(g, false), { color: true }),
    bump: canvasTexture(W, H, g => paint(g, true)),
  };
}

/**
 * Отражатель антенны по UV лат-поверхности (u — вокруг оси, v — от центра к
 * ободу): 12 лепестков с радиальными швами, кольцевой шов посередине,
 * заклёпки по швам. Карта рельефа — одна на все антенны.
 */
const REFLECTOR_BUMP = canvasTexture(512, 128, (g, W, H) => {
  g.fillStyle = '#808080';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#404040';
  for (let k = 0; k < 12; k++) g.fillRect((k / 12) * W - 1, 0, 2, H);
  g.fillRect(0, H * 0.55 - 1, W, 2);
  g.fillStyle = '#c8c8c8';
  for (let k = 0; k < 12; k++) for (let v = 0.2; v < 1; v += 0.2) { g.beginPath(); g.arc((k / 12) * W + 5, v * H, 1.6, 0, Math.PI * 2); g.fill(); }
});

/** Профиль фланца (половина сечения): от стенки шахты до обода с проточкой. */
function flangeProfile() {
  return [
    [0.71, -0.18], [1.22, -0.18], [1.3, -0.12], [1.3, -0.05], [1.21, -0.03],
    [1.21, 0.03], [1.3, 0.05], [1.3, 0.12], [1.22, 0.18], [0.71, 0.18],
  ].map(([x, y]) => new THREE.Vector2(x, y));
}

/** ease-in-out cubic: привод разгоняется и тормозит, без отскока. */
const servo = u => (u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2);

/**
 * Спутниковая антенна на поворотной опоре. Отражатель — параболоид,
 * облучатель стоит в его фокусе на трёх растяжках, сзади — ступица и рёбра
 * жёсткости, наклон — на оси в вилке, азимут — на поворотном столе.
 * Ось антенны — +y группы tilt.
 */
// Общий для всех антенн материал заградительного огня
const BEACON = new THREE.MeshBasicMaterial({ color: INK.seal, toneMapped: false });

function buildDish({ steel, chrome, dark }) {
  const R = 0.62;               // радиус отражателя
  const K = 0.42;               // y = K·r²  → фокус на 1/(4K)
  const focus = 1 / (4 * K);
  const depth = K * R * R;

  const yaw = new THREE.Group();
  const turntable = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.08, 32), chrome);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.34, 16), dark);
  post.position.y = 0.2;
  yaw.add(turntable, post);
  // Вилка: две щеки и ось наклона
  const cheekGeo = new THREE.BoxGeometry(0.035, 0.3, 0.14);
  for (const side of [-1, 1]) {
    const cheek = new THREE.Mesh(cheekGeo, steel);
    cheek.position.set(side * 0.16, 0.42, 0);
    yaw.add(cheek);
  }
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.4, 12), chrome);
  axle.rotation.z = Math.PI / 2;
  axle.position.y = 0.5;
  yaw.add(axle);

  const tilt = new THREE.Group();
  tilt.position.y = 0.5;
  yaw.add(tilt);
  const dish = new THREE.Group();
  dish.position.y = 0.12;           // отражатель поднят над осью на ступицу
  tilt.add(dish);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.14, 24), dark);
  hub.position.y = -0.06;
  dish.add(hub);

  const profile = [];
  for (let i = 0; i <= 24; i++) {
    const r = 0.02 + (i / 24) * (R - 0.02);
    profile.push(new THREE.Vector2(r, K * r * r));
  }
  const reflector = new THREE.Mesh(new THREE.LatheGeometry(profile, 72), new THREE.MeshPhysicalMaterial({
    // Крашеный тёмный металл, не зеркало: чаша собирает свет ближней лампы, светлая выгорала в белое
    color: '#5a606a', metalness: 0.55, roughness: 0.58, bumpMap: REFLECTOR_BUMP, bumpScale: 2.2, side: THREE.DoubleSide, envMapIntensity: 0.8,
  }));
  dish.add(reflector);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.016, 8, 96), chrome);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = depth;
  dish.add(rim);
  // Рёбра жёсткости по тыльной стороне: от ступицы к ободу по образующей
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const r = 0.1 + (i / 10) * (R - 0.12);
      pts.push(new THREE.Vector3(Math.cos(a) * r, K * r * r - 0.025, Math.sin(a) * r));
    }
    dish.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.012, 5, false), steel));
  }
  const backRing = new THREE.Mesh(new THREE.TorusGeometry(R * 0.55, 0.012, 6, 64), steel);
  backRing.rotation.x = Math.PI / 2;
  backRing.position.y = K * (R * 0.55) ** 2 - 0.025;
  dish.add(backRing);

  // Облучатель: рупор смотрит в отражатель, за ним — корпус конвертера
  const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.07, 0.1, 20, 1, true), chrome);
  horn.position.y = focus;
  const lnb = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.16, 0.09), dark);
  lnb.position.y = focus + 0.13;
  const lnbLed = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.005), new THREE.MeshBasicMaterial({ color: INK.cyan, toneMapped: false }));
  lnbLed.position.set(0, focus + 0.17, 0.047);
  dish.add(horn, lnb, lnbLed);
  // Заградительный огонь на облучателе: короткая красная вспышка раз в 1,5 с
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), BEACON);
  beacon.position.set(0, focus + 0.24, 0);
  dish.add(beacon);
  // Три растяжки от обода к облучателю
  const strutGeo = new THREE.CylinderGeometry(0.009, 0.009, 1, 6);
  for (let s = 0; s < 3; s++) {
    const a = (s / 3) * Math.PI * 2 + Math.PI / 6;
    const from = new THREE.Vector3(Math.cos(a) * R * 0.97, depth, Math.sin(a) * R * 0.97);
    const to = new THREE.Vector3(0, focus + 0.06, 0);
    const strut = new THREE.Mesh(strutGeo, steel);
    strut.position.copy(from).add(to).multiplyScalar(0.5);
    strut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    strut.scale.y = from.distanceTo(to);
    dish.add(strut);
  }
  return { yaw, tilt };
}

/**
 * @param {{ top: number, bottom: number, branches: Array<{ y: number, to: THREE.Vector3, angle: number, num: number, label: string }> }} opts
 *   top/bottom — концы ствола; branches — отводы к карточкам (точка входа в карточку).
 */
export function buildColumn({ top, bottom, branches }) {
  const group = new THREE.Group();
  const height = top - bottom;
  const axisY = new THREE.Vector3(0, 1, 0);
  const zAxis = new THREE.Vector3(0, 0, 1);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  // Промежутки между главами: там висят монитор и антенна или вывеска
  const gaps = branches.slice(1).map((b, i) => ({ y: (branches[i].y + b.y) / 2, angle: (branches[i].angle + b.angle) / 2 }));
  const signal = {
    uTime: { value: 0 }, uColor: { value: new THREE.Color(INK.cyan) },
    uSurgeY: { value: 0 }, uSurge: { value: 0 },
  };

  // ── Материалы: металл трёх отделок и красный печати для маркировки ──
  // Обшивка шахты и панели — с рельефом: шлифовка, швы, заклёпки, жалюзи
  const skin = shaftSkin(height);
  const shaftMaterial = new THREE.MeshPhysicalMaterial({ color: '#1a1d23', metalness: 0.85, roughness: 0.42, roughnessMap: skin.rough, bumpMap: skin.bump, bumpScale: 1.2, clearcoat: 0.3, clearcoatRoughness: 0.4, envMapIntensity: 1.1 });
  const panel = panelSkin();
  const panelMaterial = new THREE.MeshPhysicalMaterial({ color: '#2b2f37', map: panel.map, bumpMap: panel.bump, bumpScale: 1.5, metalness: 0.8, roughness: 0.3, envMapIntensity: 1.2 });
  const steel = new THREE.MeshPhysicalMaterial({ color: '#3a3f48', metalness: 0.9, roughness: 0.28, envMapIntensity: 1.3 });
  const chrome = new THREE.MeshPhysicalMaterial({ color: '#c8ccd4', metalness: 1, roughness: 0.16, clearcoat: 0.4, envMapIntensity: 1.4 });
  const dark = new THREE.MeshPhysicalMaterial({ color: '#121418', metalness: 0.6, roughness: 0.5, envMapIntensity: 0.9 });
  const ledMaterial = new THREE.MeshBasicMaterial({ color: INK.cyan, toneMapped: false });
  const sealMaterial = new THREE.MeshBasicMaterial({ color: INK.seal, toneMapped: false });

  // ── Шахта: восьмигранник; грани плоские — по ним идут панели и пазы ──
  const SHAFT_R = 0.7;
  const APOTHEM = SHAFT_R * Math.cos(Math.PI / 8);
  // Центр k-й грани в углах сцены (x = cos a, z = sin a)
  const faceAngle = k => Math.PI / 8 + (k * Math.PI) / 4;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(SHAFT_R, SHAFT_R, height, 8, 1, false), shaftMaterial);
  // У CylinderGeometry вершины на θ = k·45° от +z, в углах сцены это 90° − θ,
  // то есть тоже k·45°: рёбра — на k·45°, центры граней — ровно на faceAngle
  shaft.position.y = bottom + height / 2;
  group.add(shaft);

  // ── Фланцы: шаг 3,1; у модулей и деталей промежутков фланца нет ──
  const FLANGE_STEP = 3.1;
  const flangeYs = [];
  for (let y = top - 1.4; y > bottom + 0.6; y -= FLANGE_STEP) {
    if (branches.every(b => Math.abs(b.y - y) > 1.6) && gaps.every(g => Math.abs(g.y - y) > 0.9)) flangeYs.push(y);
  }
  const flangeGeo = new THREE.LatheGeometry(flangeProfile(), 64);
  const boltGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.06, 6);
  boltGeo.rotateZ(Math.PI / 2);
  const bolts = new THREE.InstancedMesh(boltGeo, chrome, flangeYs.length * 12);
  flangeYs.forEach((y, k) => {
    const flange = new THREE.Mesh(flangeGeo, steel);
    flange.position.y = y;
    group.add(flange);
    for (let b = 0; b < 12; b++) {
      const a = (b / 12) * Math.PI * 2;
      q.setFromAxisAngle(axisY, -a);
      m.compose(new THREE.Vector3(Math.cos(a) * 1.31, y, Math.sin(a) * 1.31), q, one);
      bolts.setMatrixAt(k * 12 + b, m);
    }
  });
  group.add(bolts);

  // ── Сервисные панели: между фланцами, на четырёх гранях через одну, с
  // винтами по углам и красной меткой сервисного номера. Секции, где стоит
  // модуль главы, пропускаются — там шахту закрывает корпус ──
  const stops = [top - 0.2, ...flangeYs, bottom + 0.2];
  const sections = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const hi = stops[i] - 0.35;
    const lo = stops[i + 1] + 0.35;
    if (hi - lo < 1.0) continue;
    if (branches.some(b => b.y > lo - 1 && b.y < hi + 1)) continue;
    sections.push([lo, hi]);
  }
  const panelGeo = new THREE.BoxGeometry(0.4, 1, 0.03);
  const screwGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.012, 8);
  screwGeo.rotateX(Math.PI / 2);
  const tagGeo = new THREE.PlaneGeometry(0.07, 0.07);
  const panels = new THREE.InstancedMesh(panelGeo, panelMaterial, Math.max(1, sections.length * 4));
  const screws = new THREE.InstancedMesh(screwGeo, chrome, Math.max(1, sections.length * 16));
  const tags = new THREE.InstancedMesh(tagGeo, sealMaterial, Math.max(1, sections.length * 4));
  panels.count = sections.length * 4;
  screws.count = sections.length * 16;
  tags.count = sections.length * 4;
  const local = new THREE.Vector3();
  sections.forEach(([lo, hi], s) => {
    const h = Math.min(2.2, hi - lo);
    const yc = (lo + hi) / 2;
    for (let p = 0; p < 4; p++) {
      const a = faceAngle(p * 2 + (s % 2));
      const n = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const face = n.clone().multiplyScalar(APOTHEM + 0.015).setY(yc);
      q.setFromUnitVectors(zAxis, n);
      m.compose(face, q, new THREE.Vector3(1, h, 1));
      panels.setMatrixAt(s * 4 + p, m);
      for (let c = 0; c < 4; c++) {
        local.set((c % 2 ? 1 : -1) * 0.16, (c < 2 ? 1 : -1) * (h / 2 - 0.06), 0.017).applyQuaternion(q);
        m.compose(local.add(face), q, one);
        screws.setMatrixAt(s * 16 + p * 4 + c, m);
      }
      local.set(0.12, h / 2 - 0.16, 0.0165).applyQuaternion(q);
      m.compose(local.add(face), q, one);
      tags.setMatrixAt(s * 4 + p, m);
    }
  });
  group.add(panels, screws, tags);

  // ── Световые пазы сигнала: по рёбрам шахты между гранями с панелями —
  // утопленный тёмный паз и светящаяся линия в нём, на всю высоту ──
  const lineMaterial = signalLineMaterial(signal);
  const lineGeo = new THREE.PlaneGeometry(0.04, height);
  const grooveGeo = new THREE.BoxGeometry(0.1, height, 0.02);
  for (let k = 0; k < 4; k++) {
    const a = faceAngle(k * 2) + Math.PI / 8;          // ребро между гранями 2k и 2k+1
    const n = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    q.setFromUnitVectors(zAxis, n);
    const groove = new THREE.Mesh(grooveGeo, dark);
    groove.quaternion.copy(q);
    groove.position.copy(n).multiplyScalar(SHAFT_R - 0.004).setY(bottom + height / 2);
    const line = new THREE.Mesh(lineGeo, lineMaterial);
    line.quaternion.copy(q);
    line.position.copy(n).multiplyScalar(SHAFT_R + 0.008).setY(bottom + height / 2);
    group.add(groove, line);
  }

  // ── Кабелепроводы: четыре трубы на скобах между шахтой и стойками ──
  const CONDUIT_R = 0.9;
  const conduitGeo = new THREE.CylinderGeometry(0.06, 0.06, height, 12);
  const clampGeo = new THREE.BoxGeometry(0.22, 0.06, 0.16);
  const clampYs = [];
  for (let y = top - 0.8; y > bottom + 0.4; y -= 1.55) clampYs.push(y);
  const clamps = new THREE.InstancedMesh(clampGeo, steel, 4 * clampYs.length);
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    const conduit = new THREE.Mesh(conduitGeo, k % 2 ? dark : steel);
    conduit.position.set(Math.cos(a) * CONDUIT_R, bottom + height / 2, Math.sin(a) * CONDUIT_R);
    group.add(conduit);
    clampYs.forEach((y, j) => {
      q.setFromAxisAngle(axisY, -a);
      m.compose(new THREE.Vector3(Math.cos(a) * (CONDUIT_R - 0.07), y, Math.sin(a) * (CONDUIT_R - 0.07)), q, one);
      clamps.setMatrixAt(k * clampYs.length + j, m);
    });
  }
  group.add(clamps);

  // ── Каркас: четыре стойки и X-раскосы по граням между фланцами. Раскос —
  // дуга по цилиндру стоек, а не хорда: хорда прошла бы сквозь шахту ──
  const RAIL_R = 1.12;
  const railMaterial = new THREE.MeshPhysicalMaterial({ color: '#2a2e36', metalness: 0.95, roughness: 0.25, envMapIntensity: 1.3 });
  for (let r = 0; r < 4; r++) {
    const a = Math.PI / 4 + (r * Math.PI) / 2;
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, height, 10), railMaterial);
    rail.position.set(Math.cos(a) * RAIL_R, bottom + height / 2, Math.sin(a) * RAIL_R);
    group.add(rail);
  }
  const BRACE_RISE = 2.5;
  const braceArc = hand => {
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const u = i / 24;
      const a = hand * u * Math.PI / 2;
      pts.push(new THREE.Vector3(Math.cos(a) * RAIL_R, -u * BRACE_RISE, Math.sin(a) * RAIL_R));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.02, 6, false);
  };
  const cells = flangeYs.slice(1).map((y, k) => [flangeYs[k], y]).filter(([a, b]) => a - b < FLANGE_STEP + 0.1);
  const cellTop = y0 => y0 - (FLANGE_STEP - BRACE_RISE) / 2;
  if (cells.length) {
    for (const hand of [1, -1]) {
      const braces = new THREE.InstancedMesh(braceArc(hand), railMaterial, cells.length * 4);
      cells.forEach(([y0], k) => {
        for (let r = 0; r < 4; r++) {
          const a = Math.PI / 4 + ((r + (hand < 0 ? 1 : 0)) * Math.PI) / 2;
          q.setFromAxisAngle(axisY, -a);
          m.compose(new THREE.Vector3(0, cellTop(y0), 0), q, one);
          braces.setMatrixAt(k * 4 + r, m);
        }
      });
      group.add(braces);
    }
    // Косынки: пластины на стойке там, где сходятся раскосы
    const gussets = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.14, 0.03), steel, cells.length * 8);
    cells.forEach(([y0], k) => {
      for (let r = 0; r < 4; r++) {
        const a = Math.PI / 4 + (r * Math.PI) / 2;
        q.setFromAxisAngle(axisY, Math.PI / 2 - a);
        [0, BRACE_RISE].forEach((dy, e) => {
          m.compose(new THREE.Vector3(Math.cos(a) * (RAIL_R + 0.03), cellTop(y0) - dy, Math.sin(a) * (RAIL_R + 0.03)), q, one);
          gussets.setMatrixAt(k * 8 + r * 2 + e, m);
        });
      }
    });
    group.add(gussets);
  }

  // ── Шкала делений: на каждом третьем фланце, неподвижная — гравировка на
  // оборудовании, а не крутящаяся декорация ──
  const tickMaterial = new THREE.MeshBasicMaterial({ color: '#9aa1ad', transparent: true, opacity: 0.5, depthWrite: false });
  const tickGeo = new THREE.BoxGeometry(1, 0.01, 0.012);
  flangeYs.forEach((y, k) => {
    if (k % 3) return;
    const ticks = new THREE.InstancedMesh(tickGeo, tickMaterial, 72);
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      const len = i % 9 === 0 ? 0.16 : 0.06;
      q.setFromAxisAngle(axisY, -a);
      m.compose(new THREE.Vector3(Math.cos(a) * (1.34 + len / 2), 0.19, Math.sin(a) * (1.34 + len / 2)), q, new THREE.Vector3(len, 1, 1));
      ticks.setMatrixAt(i, m);
    }
    ticks.position.y = y;
    group.add(ticks);
  });

  // ── Нижний торец: шахта входит в фрезерованный стакан ──
  const capGeo = new THREE.LatheGeometry([
    [0.0, 0.62], [0.55, 0.6], [1.0, 0.52], [1.32, 0.36], [1.5, 0.14], [1.52, -0.1],
    [1.42, -0.16], [1.42, -0.42], [1.5, -0.48], [1.5, -0.62], [1.3, -0.7], [1.02, -0.7],
  ].reverse().map(([x, y]) => new THREE.Vector2(x, y)), 72);
  const bottomCap = new THREE.Mesh(capGeo, chrome);
  bottomCap.position.y = bottom - 0.1;
  bottomCap.rotation.x = Math.PI;
  group.add(bottomCap);

  // ── Верхний торец — эмиттер левитации: знак логотипа ни на чём не стоит.
  // Шахта заканчивается тонким восьмигранным воротником, над ним — плоская
  // площадка: на её лице — кольца индукционной катушки и болты крепления,
  // катушка тихо дышит светом. По диагоналям — четыре излучателя, от их
  // линз к знаку сходятся тонкие лучи. Выше висят два сегментных кольца
  // (бирюзовое со шкалой и жёлтое, крутятся навстречу), а от площадки вверх
  // идёт едва видимый столб поля. Массы нет — только кромки и свет ──
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.86, 0.74, 0.16, 8), steel);
  collar.position.y = top + 0.02;
  const padY = top + 0.14;
  // Лицо площадки: катушка (кольца), радиальные перемычки и восемь болтов.
  // У CylinderGeometry крышка развёрнута на uv как круг — рисуем в круге
  const coil = canvasTexture(256, 256, (g, W) => {
    const c = W / 2;
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, W);
    g.strokeStyle = '#ffffff';
    for (let r = 26; r < 112; r += 9) {
      g.globalAlpha = 0.35 + 0.65 * (1 - r / 112);
      g.lineWidth = 2.2;
      g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.stroke();
    }
    g.globalAlpha = 1;
    g.fillStyle = '#000';
    for (let k = 0; k < 8; k++) {
      g.save(); g.translate(c, c); g.rotate((k / 8) * Math.PI * 2 + Math.PI / 8);
      g.fillRect(20, -2.5, 96, 5);
      g.restore();
    }
  }, { color: true });
  const padBolts = canvasTexture(256, 256, (g, W) => {
    const c = W / 2;
    g.fillStyle = '#808080';
    g.fillRect(0, 0, W, W);
    g.fillStyle = '#e0e0e0';
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      g.beginPath(); g.arc(c + Math.cos(a) * 118, c + Math.sin(a) * 118, 4.5, 0, Math.PI * 2); g.fill();
    }
  });
  const padTop = new THREE.MeshStandardMaterial({
    color: '#121418', metalness: 0.6, roughness: 0.45, envMapIntensity: 0.9,
    bumpMap: padBolts, bumpScale: 2, emissiveMap: coil, emissive: INK.cyan, emissiveIntensity: 0.35,
  });
  // Группы CylinderGeometry: 0 — бок, 1 — верхняя крышка, 2 — нижняя
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.06, 1.0, 0.05, 8), [dark, padTop, dark]);
  pad.position.y = padY;
  // Световая кромка площадки — восьмигранник, как сечение шахты
  const padEdge = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.012, 4, 8), ledMaterial);
  padEdge.rotation.set(Math.PI / 2, 0, Math.PI / 8);
  padEdge.position.y = padY + 0.03;
  // Стойки каркаса заканчиваются у торца шахты и выходят за край площадки —
  // их срезы накрывает тонкое опорное кольцо того же металла
  const railCap = new THREE.Mesh(new THREE.TorusGeometry(RAIL_R, 0.06, 8, 96), railMaterial);
  railCap.rotation.x = Math.PI / 2;
  railCap.position.y = top;
  group.add(collar, pad, padEdge, railCap);

  // Излучатели: наклонные штыри по диагоналям площадки, на конце — головка
  // с жёлтой линзой; от линзы к нижнему краю знака идёт тонкий луч
  const prongGeo = new THREE.BoxGeometry(0.05, 0.42, 0.05);
  prongGeo.translate(0, 0.21, 0);
  const prongs = new THREE.InstancedMesh(prongGeo, steel, 4);
  const headGeo = new THREE.CylinderGeometry(0.05, 0.065, 0.08, 12);
  const heads = new THREE.InstancedMesh(headGeo, dark, 4);
  const tipMaterial = new THREE.MeshBasicMaterial({ color: '#fcee0a', toneMapped: false });
  const lensGeo = new THREE.CircleGeometry(0.04, 16);
  lensGeo.rotateX(-Math.PI / 2);
  lensGeo.translate(0, 0.041, 0);
  const tips = new THREE.InstancedMesh(lensGeo, tipMaterial, 4);
  const rayGeo = new THREE.CylinderGeometry(0.006, 0.014, 1, 6, 1, true);
  rayGeo.translate(0, 0.5, 0);
  const rays = new THREE.InstancedMesh(rayGeo, new THREE.ShaderMaterial({
    uniforms: { uTime: signal.uTime, uColor: { value: new THREE.Color('#fcee0a') } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: VERTEX_UV,
    // Луч гаснет к знаку и мерцает бегущими сгустками — поле «качают»
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
      void main() {
        float fade = pow(1.0 - vUv.y, 1.6);
        float pulse = 0.6 + 0.4 * smoothstep(0.7, 1.0, fract(vUv.y * 3.0 - uTime * 1.2));
        gl_FragColor = vec4(uColor * fade * pulse * 0.35, 1.0);
      }
    `,
  }), 4);
  const tilt = new THREE.Quaternion();
  const toGlyph = new THREE.Vector3(0, padY + 1.75, 0);   // низ знака над площадкой
  for (let i = 0; i < 4; i++) {
    const ang = Math.PI / 4 + (i * Math.PI) / 2;
    const base = new THREE.Vector3(Math.cos(ang) * 0.9, padY + 0.02, Math.sin(ang) * 0.9);
    // Наклон к оси: штырь «смотрит» туда, где висит знак
    tilt.setFromAxisAngle(new THREE.Vector3(-Math.sin(ang), 0, Math.cos(ang)), 0.35);
    m.compose(base, tilt, one);
    prongs.setMatrixAt(i, m);
    const tip = base.clone().add(new THREE.Vector3(0, 0.42, 0).applyQuaternion(tilt));
    m.compose(tip, tilt, one);
    heads.setMatrixAt(i, m);
    tips.setMatrixAt(i, m);
    const dir = toGlyph.clone().sub(tip);
    m.compose(tip, new THREE.Quaternion().setFromUnitVectors(axisY, dir.clone().normalize()), new THREE.Vector3(1, dir.length(), 1));
    rays.setMatrixAt(i, m);
  }
  group.add(prongs, heads, tips, rays);

  // Сегментные кольца: дуги с разрывами, как шкала прицела; у бирюзового —
  // шкала делений по внешней кромке, крутится вместе с ним
  const ringSegments = (radius, count, gap, material) => {
    const ring = new THREE.Group();
    const arc = (Math.PI * 2) / count - gap;
    const geo = new THREE.TorusGeometry(radius, 0.018, 4, 24, arc);
    for (let i = 0; i < count; i++) {
      const seg = new THREE.Mesh(geo, material);
      seg.rotation.z = i * (arc + gap);
      ring.add(seg);
    }
    ring.rotation.x = Math.PI / 2;
    return ring;
  };
  const ringCyan = ringSegments(1.18, 6, 0.22, ledMaterial);
  ringCyan.position.y = padY + 0.5;
  const dial = new THREE.InstancedMesh(new THREE.BoxGeometry(0.008, 0.05, 0.006), ledMaterial, 60);
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const len = i % 5 === 0 ? 1.6 : 0.8;
    m.compose(new THREE.Vector3(Math.cos(a) * (1.24 + len * 0.012), Math.sin(a) * (1.24 + len * 0.012), 0), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a - Math.PI / 2), new THREE.Vector3(1, len, 1));
    dial.setMatrixAt(i, m);
  }
  ringCyan.add(dial);
  const ringYellow = ringSegments(0.92, 3, 0.7, tipMaterial);
  ringYellow.position.y = padY + 0.78;
  group.add(ringCyan, ringYellow);

  // Столб поля: открытый цилиндр, свет у площадки, к знаку гаснет. По нему
  // вверх бегут тонкие полосы, вокруг — вертикальные струи; кромка столба
  // ярче середины — свет виден в толще поля, а не плоской плёнкой
  const fieldHeight = 1.5;
  const fieldGeo = new THREE.CylinderGeometry(0.95, 1.0, fieldHeight, 48, 1, true);
  fieldGeo.translate(0, fieldHeight / 2, 0);
  const field = new THREE.Mesh(fieldGeo, new THREE.ShaderMaterial({
    uniforms: { uTime: signal.uTime, uColor: { value: new THREE.Color(INK.cyan) } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying float vRim;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vRim = 1.0 - abs(dot(normalize(normalMatrix * normal), normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uColor;
      varying vec2 vUv; varying float vRim;
      void main() {
        float fade = pow(1.0 - vUv.y, 2.0);
        float bands = smoothstep(0.85, 1.0, fract(vUv.y * 6.0 - uTime * 0.6));
        float streams = 0.7 + 0.3 * sin(vUv.x * 6.2832 * 16.0 + vUv.y * 4.0 - uTime * 0.8);
        float rim = 0.45 + 0.55 * pow(vRim, 1.5);
        gl_FragColor = vec4(uColor * fade * rim * streams * (0.05 + 0.22 * bands), 1.0);
      }
    `,
  }));
  field.position.y = padY + 0.03;
  group.add(field);

  // ── Распределительные модули: корпус на кронштейне, радиатор, дисплей с
  // подписью главы, индикаторы, табличка и разъём отвода ──
  const housingGeo = new THREE.ExtrudeGeometry(roundedRect(1.36, 1.8, 0.12), {
    depth: 0.34, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, curveSegments: 6,
  });
  housingGeo.center();
  const housingMaterial = new THREE.MeshPhysicalMaterial({ color: '#20242b', metalness: 0.75, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2, envMapIntensity: 1.3 });
  const rimShape = roundedRect(1.44, 1.88, 0.14);
  rimShape.holes.push(roundedRect(1.4, 1.84, 0.12));
  const rimGeo = new THREE.ShapeGeometry(rimShape, 8);
  const finGeo = new THREE.BoxGeometry(0.03, 1.5, 0.3);
  const bracketGeo = new THREE.BoxGeometry(0.42, 0.6, 0.4);
  const bezelGeo = new THREE.PlaneGeometry(1.14, 0.76);
  const bezelMaterial = new THREE.MeshBasicMaterial({ color: '#030405' });
  const screenGeo = new THREE.PlaneGeometry(1.06, 0.6625);
  const portGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.07, 20);
  portGeo.rotateX(Math.PI / 2);
  const statusGeo = new THREE.BoxGeometry(0.1, 0.03, 0.02);
  const plateGeo = new THREE.PlaneGeometry(0.16, 0.16);
  const sheathMaterial = new THREE.MeshPhysicalMaterial({ color: '#23262d', metalness: 0.2, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.3, envMapIntensity: 1.1 });
  const screens = [];
  const branchFibers = [];
  const leds = [];

  for (const branch of branches) {
    const dir = new THREE.Vector3(branch.to.x, 0, branch.to.z).normalize();
    const center = new THREE.Vector3(dir.x * 1.62, branch.y, dir.z * 1.62);

    const unit = new THREE.Group();
    unit.position.copy(center);
    unit.lookAt(center.clone().add(dir));   // +z модуля смотрит наружу
    unit.add(new THREE.Mesh(housingGeo, housingMaterial));
    const bracket = new THREE.Mesh(bracketGeo, steel);
    bracket.position.z = -0.38;
    unit.add(bracket);
    const rim = new THREE.Mesh(rimGeo, ledMaterial);
    rim.position.z = 0.2;
    unit.add(rim);
    const fins = new THREE.InstancedMesh(finGeo, steel, 12);
    for (let i = 0; i < 12; i++) {
      m.makeTranslation((i < 6 ? -1 : 1) * (0.74 + (i % 6) * 0.06), 0, 0);
      fins.setMatrixAt(i, m);
    }
    unit.add(fins);
    const bezel = new THREE.Mesh(bezelGeo, bezelMaterial);
    bezel.position.set(0, 0.3, 0.2);
    const material = screenMaterial(signal, screens.length * 0.618, labelTexture(branch.num, branch.label));
    const screen = new THREE.Mesh(screenGeo, material);
    screen.position.set(0, 0.3, 0.202);
    const port = new THREE.Mesh(portGeo, chrome);
    port.position.set(0, -0.58, 0.22);
    // Красная табличка — как печать приёмки на оборудовании
    const plate = new THREE.Mesh(plateGeo, sealMaterial);
    plate.position.set(0.5, -0.58, 0.201);
    unit.add(bezel, screen, port, plate);
    for (let i = 0; i < 4; i++) {
      const led = new THREE.Mesh(statusGeo, ledMaterial);
      led.position.set(-0.3 + i * 0.13, -0.22, 0.2);
      unit.add(led);
      leds.push(led);
    }
    group.add(unit);
    screens.push(material);

    // Кабель отвода: из разъёма вниз и дугой к тылу карточки — так провисает
    // настоящий кабель; у карточки — штекер
    const start = center.clone().addScaledVector(dir, 0.3).add(new THREE.Vector3(0, -0.58, 0));
    const end = branch.to.clone();
    const mid1 = start.clone().addScaledVector(dir, 1.1).add(new THREE.Vector3(0, -0.6, 0));
    const mid2 = end.clone().addScaledVector(dir, -0.9).add(new THREE.Vector3(0, 0.3, 0));
    const curve = new THREE.CubicBezierCurve3(start, mid1, mid2, end);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.1, 12, false), sheathMaterial));
    const fiber = branchFiberMaterial(signal);
    branchFibers.push(fiber);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.03, 8, false), fiber));
    const plug = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.3, 24), chrome);
    plug.position.copy(end);
    plug.quaternion.setFromUnitVectors(axisY, curve.getTangent(1));
    group.add(plug);
  }

  // ── Мониторы: промышленный дисплей в корпусе на шарнирном кронштейне ──
  const log = logTexture();
  const chrome2d = monitorChrome();
  const monitorGeo = new THREE.BoxGeometry(1.86, 1.26, 0.1);
  const monitorScreenGeo = new THREE.PlaneGeometry(1.7, 1.1);
  const armGeo = new THREE.CylinderGeometry(0.05, 0.06, 1.3, 12);
  armGeo.rotateX(Math.PI / 2);
  const jointGeo = new THREE.SphereGeometry(0.09, 16, 12);
  gaps.forEach((gap, k) => {
    const a = gap.angle - 0.95;
    const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const rig = new THREE.Group();
    rig.position.set(out.x * 1.3, gap.y, out.z * 1.3);
    rig.lookAt(rig.position.clone().add(out));
    const arm = new THREE.Mesh(armGeo, steel);
    arm.position.z = 0.65;
    const joint = new THREE.Mesh(jointGeo, chrome);
    joint.position.z = 1.3;
    const head = new THREE.Group();
    head.position.set(0, 0.1, 1.42);
    head.rotation.y = 0.5;                       // экран развёрнут к камере облёта
    const body = new THREE.Mesh(monitorGeo, housingMaterial);
    const screen = new THREE.Mesh(monitorScreenGeo, monitorMaterial(signal, k * 0.37, log, chrome2d));
    screen.position.z = 0.051;
    const status = new THREE.Mesh(statusGeo, ledMaterial);
    status.position.set(0.78, -0.58, 0.052);
    head.add(body, screen, status);
    rig.add(arm, joint, head);
    group.add(rig);
  });

  // ── Антенны и вывески: по другую сторону от монитора, через промежуток ──
  const dishes = [];
  const SIGNS = [
    { text: '信号幹線', caption: 'SIGNAL', accent: INK.cyan },
    { text: '品質保証', caption: 'QA', accent: INK.seal, inverse: true },
    { text: '決済通知', caption: 'CALLBACK', accent: INK.cyan },
    { text: 'モックサーバ', caption: 'MOCK', accent: INK.cyan },
    { text: '試験環境', caption: 'TEST ENV', accent: INK.seal, inverse: true },
    { text: '監視中', caption: 'MONITOR', accent: INK.cyan },
  ];
  const boomGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.0, 12);
  boomGeo.rotateX(Math.PI / 2);
  const baseGeo = new THREE.BoxGeometry(0.42, 0.06, 0.42);
  gaps.forEach((gap, k) => {
    const a = gap.angle + 1.15;
    const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const mount = new THREE.Group();
    mount.position.set(out.x * 1.3, gap.y, out.z * 1.3);
    mount.lookAt(mount.position.clone().add(out));
    const boom = new THREE.Mesh(boomGeo, steel);
    boom.position.z = 0.5;
    mount.add(boom);
    if (k % 2 === 0) {
      // Площадка на конце штанги, на ней поворотный стол антенны
      const base = new THREE.Mesh(baseGeo, steel);
      base.position.set(0, 0.04, 1.08);
      const { yaw, tilt } = buildDish({ steel, chrome, dark });
      yaw.position.set(0, 0.1, 1.08);
      mount.add(base, yaw);
      dishes.push({ yaw, tilt, seed: k * 1.7 + 0.3 });
    } else {
      const s = SIGNS[((k - 1) / 2) % SIGNS.length];
      const sign = buildSign(s.text, { ...s, width: 0.42, height: 1.68 });
      sign.position.set(0, 0, 1.1);
      sign.rotation.y = -0.55;                    // лицом к камере облёта
      mount.add(sign);
    }
    group.add(mount);
  });

  // Цели привода антенны: детерминированный псевдослучайный ряд 0..1
  const pick = (seed, n) => {
    const x = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  const arrive = new Map();
  return {
    group,
    /** surge: { y, strength } — волна сигнала на высоте камеры; focus — глава в фокусе. */
    update(t, color, surge) {
      signal.uTime.value = t;
      if (color) signal.uColor.value.copy(color);
      if (surge) {
        signal.uSurgeY.value = surge.y;
        signal.uSurge.value += (surge.strength - signal.uSurge.value) * 0.12;
        branchFibers.forEach((mat, i) => {
          const on = i === surge.focus;
          mat.uniforms.uBoost.value += ((on ? 1 : 0) - mat.uniforms.uBoost.value) * 0.08;
          if (on && !arrive.has(i)) arrive.set(i, t);
          if (!on) arrive.delete(i);
          mat.uniforms.uArrive.value = on ? t - arrive.get(i) : 99;
        });
        screens.forEach((mat, i) => { mat.uniforms.uBoost.value += ((i === surge.focus ? 1 : 0) - mat.uniforms.uBoost.value) * 0.08; });
      }
      // Антенны: раз в 7 с привод доворачивает на новую цель за 1,75 с и
      // держит её — так работает слежение, а не качание маятником
      // Заградительные огни: вспышка 0,15 с из 1,5 с; при reduced motion (t = 0) горят ровно
      BEACON.color.set(INK.seal).multiplyScalar(t === 0 || t % 1.5 < 0.15 ? 1 : 0.12);
      for (const d of dishes) {
        const period = 7;
        const local = t + d.seed * 3;
        const n = Math.floor(local / period);
        const k = servo(Math.min(1, ((local % period) / period) * 4));
        const az0 = pick(d.seed, n) * 1.6 - 0.8;
        const az1 = pick(d.seed, n + 1) * 1.6 - 0.8;
        const el0 = 0.35 + pick(d.seed + 5, n) * 0.5;
        const el1 = 0.35 + pick(d.seed + 5, n + 1) * 0.5;
        d.yaw.rotation.y = az0 + (az1 - az0) * k;
        d.tilt.rotation.x = el0 + (el1 - el0) * k;
      }
      // Кольца эмиттера крутятся навстречу друг другу — медленно, как привод
      ringCyan.rotation.z = t * 0.35;
      // Катушка дышит в такт полосам поля: пик — когда полоса уходит с площадки
      padTop.emissiveIntensity = 0.28 + 0.14 * Math.max(0, Math.sin(t * 0.6 * Math.PI * 2));
      ringYellow.rotation.z = -t * 0.55;
      // Индикаторы модулей: «бегущий огонь» — состояние канала
      leds.forEach((led, i) => { led.visible = Math.sin(t * 2.4 - i * 1.1) > -0.4; });
    },
  };
}
