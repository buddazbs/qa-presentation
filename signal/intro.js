// Вступление — короткая motion-сцена вместо загрузочного экрана. Пока она
// идёт, презентация грузится по-настоящему: этапы старта те же, что были у
// загрузчика, и строка состояния внизу отмечает их по факту.
//
// Стиль — неоновый технологичный: тонкие светящиеся линии трёх цветов на
// почти чёрном столе (циан — сигнал, жёлтый — ответы и данные, красный —
// мок), HUD, сетка с координатами. Свечение мягкое, без пересвета и бликов.
// Линии прорисовываются, сканируют и пульсируют.
//
// Раскадровка (120 BPM, доля — 0,5 с; время сцены — t, секунды):
//   до нажатия — заставка: камера облетает стол, пунктир будущей карты,
//            пакеты бегут по сетке, луч сканирует стол, маяк источника ждёт;
//   0      — запуск по нажатию (жест пользователя открывает звук); камера
//            из облёта уходит в путь;
//   0,8–2  — тест-ран: импульс сам прочерчивает магистраль слева к узлу;
//   2–3    — колбэк: POST /callback уходит в сервис, назад приходит 200 OK;
//   3–4    — мок: второй отвод, мок отвечает 201;
//   4–5    — линии стягиваются в узел, камера поднимается над столом;
//   5–6    — три слоя знака падают по долям: общий код, моки, колбэки;
//   6,5–7,3 — название собирается из разрядки, печать 品;
//   ожидание — если презентация ещё грузится, кадр дышит на месте;
//   7,5    — по кольцу знака проходит скан: система готова;
//   8–9,4  — знак перелетает на место 3D-логотипа сцены и растворяется в нём.
//
// Всё — функция времени render(t): кадр детерминирован, ?at=5.2 замораживает
// сцену на этом моменте, ?idle=12 — заставку (для проверки), ?auto запускает
// без нажатия, без звука. prefers-reduced-motion — без полёта камеры и
// падений: финальный кадр проявляется и уходит прозрачностью, звука нет.
//
// Плавность: каждый кадр меняет только transform и opacity отдельных слоёв.
// Перерисовываются лишь маленькие SVG маршрутов, пока по ним идёт сигнал;
// стол с сеткой растрируется один раз. Фильтров на кадре нет — свечение
// нарисовано заранее, им управляет прозрачность. Стили пишутся, только если
// значение изменилось.

const NS = 'http://www.w3.org/2000/svg';
// Знак Layers (Lucide, ISC) — тот же, что у логотипа в сцене и в сайдбаре
const LAYERS = [
  'M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z',
  'M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12',
  'M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17',
];
// Слои падают снизу вверх: фундамент — общий код, сверху — колбэки
const DROPS = [
  { layer: 2, at: 5.0, z: 8, jp: '共通', ru: 'Общий код' },
  { layer: 1, at: 5.5, z: 22, jp: '模擬', ru: 'Моки' },
  { layer: 0, at: 6.0, z: 36, jp: '通知', ru: 'Колбэки' },
];
const T = { hold: 7.3, sweep: 7.5, out: 8.0, end: 9.4 };
const TILE = 220;     // сторона плитки знака в мировых px
const PERSP = 1100;   // перспектива сцены, px

// ── Время и кривые ──
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;
const span = (t, a, b) => clamp((t - a) / (b - a));
const smooth = k => k * k * k * (k * (k * 6 - 15) + 10);
const outCubic = k => 1 - (1 - k) ** 3;
const inOut = k => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2);
const outBack = k => 1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2;
const wrap = (v, m) => ((v % m) + m) % m;

/**
 * Камера — ключи по времени, между ними кубический Эрмит с касательными по
 * соседям: скорость на ключах не обнуляется, путь один, без рывков.
 * tilt — наклон стола, spin — поворот вокруг его нормали, z — наезд,
 * x/y — точка стола в центре кадра.
 */
const CAMERA = [
  { t: 0,   tilt: 66, spin: -24, z: -420, x: -760, y: 40 },
  { t: 1.2, tilt: 64, spin: -16, z: -220, x: -420, y: 20 },
  { t: 2.0, tilt: 60, spin: -8,  z: -120, x: -40,  y: 0 },
  { t: 2.6, tilt: 57, spin: 2,   z: -160, x: 260,  y: -90 },
  { t: 3.3, tilt: 55, spin: 10,  z: -230, x: 260,  y: 60 },
  { t: 4.1, tilt: 50, spin: 14,  z: -360, x: 80,   y: 20 },
  { t: 5.0, tilt: 34, spin: 10,  z: -170, x: 0,    y: 0 },
  { t: 6.0, tilt: 14, spin: 4,   z: -40,  x: 0,    y: 0 },
  { t: 7.3, tilt: 0,  spin: 0,   z: 20,   x: 0,    y: 0 },
];
const CHANNELS = ['tilt', 'spin', 'z', 'x', 'y'];
const slopes = CAMERA.map((k, i) => Object.fromEntries(CHANNELS.map(c => {
  if (i === 0 || i === CAMERA.length - 1) return [c, 0];
  const a = CAMERA[i - 1], b = CAMERA[i + 1];
  return [c, ((k[c] - a[c]) / (k.t - a.t) + (b[c] - k[c]) / (b.t - k.t)) / 2];
})));
function cameraAt(t) {
  const last = CAMERA.length - 1;
  if (t >= CAMERA[last].t) return { ...CAMERA[last] };
  let i = 0;
  while (CAMERA[i + 1].t < t) i++;
  const a = CAMERA[i], b = CAMERA[i + 1], h = b.t - a.t, u = Math.max(0, (t - a.t) / h);
  const u2 = u * u, u3 = u2 * u;
  const out = {};
  for (const c of CHANNELS) {
    out[c] = (2 * u3 - 3 * u2 + 1) * a[c] + (u3 - 2 * u2 + u) * h * slopes[i][c]
      + (-2 * u3 + 3 * u2) * b[c] + (u3 - u2) * h * slopes[i + 1][c];
  }
  return out;
}

// ── Сеть на столе: ломаные с фасками 45°, как дорожки платы ──
const C = [0, 0];
const ROUTES = {
  trunk: { pts: [[-1180, 0], C], tone: 'signal' },
  callback: { pts: [C, [240, 0], [440, -200], [660, -200]], tone: 'signal' },
  mock: { pts: [C, [180, 0], [400, 220], [600, 220]], tone: 'mock' },
};
function measure(points) {
  const segs = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1], [bx, by] = points[i];
    const len = Math.hypot(bx - ax, by - ay);
    segs.push({ ax, ay, bx, by, len, from: total });
    total += len;
  }
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  return {
    d: 'M' + points.map(p => p.join(' ')).join(' L'),
    box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
    at(u) {
      const s = clamp(u) * total;
      const seg = segs.find(g => s <= g.from + g.len) || segs[segs.length - 1];
      const k = seg.len ? (s - seg.from) / seg.len : 0;
      return [lerp(seg.ax, seg.bx, k), lerp(seg.ay, seg.by, k)];
    },
  };
}
// Импульсы: маршрут, направление, окно времени. Ответ — жёлтый
const PULSES = [
  { route: 'trunk', from: 0.8, to: 2.0 },
  { route: 'callback', from: 2.0, to: 2.5 },
  { route: 'callback', from: 2.5, to: 3.0, back: true, reply: true },
  { route: 'mock', from: 3.0, to: 3.5 },
  { route: 'mock', from: 3.5, to: 4.0, back: true, reply: true },
];
// Подписи стоят на столе, повёрнутые к камере
const PINS = [
  { at: [-1060, 0], show: [1.0, 3.6], jp: '試験', text: 'test run', kind: 'route' },
  { at: [660, -200], show: [2.45, 4.1], jp: 'サービス', text: 'сервис', kind: 'node' },
  { at: [330, -96], show: [2.05, 3.9], text: 'POST /callback', kind: 'route', type: true },
  { at: [660, -200], lift: 64, show: [2.55, 4.1], text: '200 OK', kind: 'ok', type: true },
  { at: [600, 220], show: [3.45, 4.2], jp: '模擬', text: 'мок', kind: 'mock' },
  { at: [600, 220], lift: 64, show: [3.55, 4.2], text: 'mock · 201', kind: 'ok', type: true },
];
// Таблички-разметка на краях стола: стоят вертикально, дают параллакс
const SIGNS = [
  { at: [-700, -420], text: '信号幹線', r: 8 },
  { at: [900, 520], text: '第一系統', r: -20 },
  { at: [1500, 240], text: '品質', r: -34 },
  { at: [1100, -560], text: '検証', r: -6 },
];

// ── Заставка до запуска: стол живёт сам, пока зритель не нажал ──
// Камера медленно облетает стол над будущей картой маршрутов; b — часы
// ожидания, секунды. По нажатию поза плавно переходит в путь CAMERA
function idleCamera(b) {
  return {
    tilt: 61 + Math.sin(b * 0.17) * 4,
    spin: -24 + b * 4,
    z: -330 + Math.sin(b * 0.23) * 50,
    x: -260 + Math.sin(b * 0.11) * 260,
    y: Math.sin(b * 0.13 + 1) * 80,
  };
}
// Стол: крупная сетка — шаг 400, линии на x ≡ 200 и y ≡ 300 по модулю 400.
// Магистраль сигнала лежит на y = 0, между линиями
const GRID = { cols: [-1400, -1000, -600, -200, 200, 600, 1000, 1400], rows: [-900, -500, -100, 300, 700, 1100] };
const FLOOR_R = 1300; // радиус, за которым стол растворяется
// Фоновый трафик: пакеты бегут по крупным линиям сетки
const TRAFFIC = [
  { axis: 'x', line: -500, speed: 420, phase: 0 },
  { axis: 'x', line: 300, speed: -360, phase: 900 },
  { axis: 'x', line: -900, speed: 300, phase: 1700, tone: 'data' },
  { axis: 'x', line: 700, speed: 520, phase: 400 },
  { axis: 'y', line: -600, speed: 340, phase: 1200 },
  { axis: 'y', line: 200, speed: -460, phase: 300, tone: 'mock' },
  { axis: 'y', line: 1000, speed: 380, phase: 2100 },
  { axis: 'y', line: -1400, speed: -300, phase: 800, tone: 'data' },
];
const LANE = 3600;     // длина пробега пакета вместе с паузой
const PACKET = 140;    // длина пакета
const BEACON = 2.6;    // период маяка источника, с
const SCAN = 5.2;      // период луча-сканера, с

/** Детерминированная «случайность» — один и тот же шум каждый запуск. */
function seeded(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};
const svg = (tag, attrs = {}) => {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};
const px = n => `${n.toFixed(2)}px`;

/**
 * Запись стиля только при изменении: на кадре большинство значений стоит на
 * месте, и лишняя запись — это пересчёт стилей без нужды.
 */
const memo = new WeakMap();
function put(node, prop, value) {
  let m = memo.get(node);
  if (!m) memo.set(node, (m = {}));
  if (m[prop] === value) return;
  m[prop] = value;
  if (prop === 'textContent') node.textContent = value;
  else if (prop.startsWith('--')) node.style.setProperty(prop, value);
  else node.style[prop] = value;
}
/** Прозрачность с порогом: невидимый слой снимается с отрисовки. */
function fade(node, k) {
  const v = k <= 0.001 ? 0 : Math.min(1, k);
  put(node, 'opacity', v.toFixed(3));
  put(node, 'visibility', v ? 'visible' : 'hidden');
  return v > 0;
}

// ══════════════ Звук: музыка и эффекты синтезом Web Audio ══════════════
// Ля минор, 120 BPM. Гул стола → грув из тиков и баса на сигналах →
// подъём на стягивании → три ноты аккорда на падениях слоёв → перелив
// названия → финальный аккорд на переходе в сцену.

const NOTE = n => 440 * 2 ** ((n - 69) / 12);
const A1 = 33, E2 = 40, A2 = 45, E3 = 52, A3 = 57, C4 = 60, E4 = 64, G4 = 67, A4 = 69, B4 = 71, C5 = 72, E5 = 76, A5 = 81, B5 = 83, C6 = 84, E6 = 88;

function createAudio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx();
  const master = ctx.createGain();
  master.gain.value = 0.8;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);
  // Пространство: короткая синтетическая реверберация
  const verb = ctx.createConvolver();
  const len = ctx.sampleRate * 2.4;
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  const rnd = seeded(7);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (rnd() * 2 - 1) * (1 - i / len) ** 3;
  }
  verb.buffer = ir;
  const wet = ctx.createGain();
  wet.gain.value = 0.32;
  verb.connect(wet).connect(master);
  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = rnd() * 2 - 1;

  /** Выход голоса: сухой сигнал + посыл в пространство. */
  const out = (send = 0.4) => {
    const g = ctx.createGain();
    g.connect(master);
    const s = ctx.createGain();
    s.gain.value = send;
    g.connect(s).connect(verb);
    return g;
  };
  const env = (param, at, peak, attack, decay, floor = 0.0001) => {
    param.setValueAtTime(0.0001, at);
    param.exponentialRampToValueAtTime(peak, at + attack);
    param.exponentialRampToValueAtTime(floor, at + attack + decay);
  };
  const tone = (type, freq, at, { gain = 0.2, attack = 0.005, decay = 0.4, send = 0.4, glide } = {}) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, at + attack + decay);
    const g = out(send);
    env(g.gain, at, gain, attack, decay);
    o.connect(g);
    o.start(at);
    o.stop(at + attack + decay + 0.05);
  };
  const hiss = (at, dur, { gain = 0.1, type = 'bandpass', f0 = 800, f1 = f0, q = 1, attack = 0.005, send = 0.3, rise = false } = {}) => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, at);
    f.frequency.exponentialRampToValueAtTime(f1, at + dur);
    const g = out(send);
    if (rise) {
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(gain, at + dur);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.06);
    } else env(g.gain, at, gain, attack, dur);
    src.connect(f).connect(g);
    src.start(at);
    src.stop(at + dur + 0.1);
  };

  // Гул: две пилы через фильтр, раскрывается к названию
  let drone = null;
  const startDrone = at => {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 3;
    f.frequency.setValueAtTime(160, at);
    f.frequency.exponentialRampToValueAtTime(900, at + 7);
    const g = out(0.6);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.09, at + 1.6);
    const oscs = [[A1, -6], [A1, 7], [E2, 0]].map(([n, det]) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = NOTE(n);
      o.detune.value = det;
      o.connect(f);
      o.start(at);
      return o;
    });
    f.connect(g);
    drone = { g, f, oscs };
  };
  const stopDrone = (at, release = 2.2) => {
    if (!drone) return;
    drone.g.gain.cancelScheduledValues(at);
    drone.g.gain.setValueAtTime(drone.g.gain.value || 0.09, at);
    drone.g.gain.exponentialRampToValueAtTime(0.0001, at + release);
    drone.oscs.forEach(o => o.stop(at + release + 0.1));
    drone = null;
  };

  const kick = at => tone('sine', 120, at, { gain: 0.5, attack: 0.002, decay: 0.32, glide: 38, send: 0.05 });
  const hat = (at, accent) => hiss(at, 0.04, { gain: accent ? 0.05 : 0.028, type: 'highpass', f0: 7000, send: 0.1 });
  const bass = (at, n) => {
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = NOTE(n);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(900, at);
    f.frequency.exponentialRampToValueAtTime(180, at + 0.2);
    const g = out(0.1);
    env(g.gain, at, 0.09, 0.004, 0.2);
    o.connect(f).connect(g);
    o.start(at);
    o.stop(at + 0.26);
  };
  const ping = (at, n, gain = 0.12) => {
    tone('sine', NOTE(n), at, { gain, decay: 0.7, send: 0.6 });
    tone('sine', NOTE(n + 19), at, { gain: gain * 0.25, decay: 0.3, send: 0.6 });
  };
  const run = (at, dur, n0, n1) => tone('triangle', NOTE(n0), at, { gain: 0.05, attack: dur * 0.6, decay: dur * 0.5, glide: NOTE(n1), send: 0.3 });
  const pluck = (at, n) => {
    tone('triangle', NOTE(n), at, { gain: 0.2, decay: 1.6, send: 0.5 });
    tone('sine', NOTE(n - 12), at, { gain: 0.18, decay: 1.1, send: 0.2 });
    tone('sine', 90, at, { gain: 0.42, attack: 0.002, decay: 0.28, glide: 36, send: 0.05 }); // удар о стол
  };
  const pad = (at, notes, dur, gain = 0.05) => notes.forEach((n, i) => {
    const o = ctx.createOscillator();
    o.type = i % 2 ? 'triangle' : 'sawtooth';
    o.frequency.value = NOTE(n);
    o.detune.value = (i - 1.5) * 5;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1400;
    const g = out(0.8);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(f).connect(g);
    o.start(at);
    o.stop(at + dur + 0.1);
  });

  // Партитура: время сцены → звук. Перед ожиданием — только то, что
  // успевает закончиться; после — всё, что связано с готовностью
  const score = [
    [0, at => startDrone(at)],
    [0.8, at => run(at, 1.2, A3, A4)],
    [2.0, at => { kick(at); ping(at, A4); }],
    [2.0, at => run(at, 0.5, A4, E5)],
    [2.5, at => ping(at, E5)],
    [2.5, at => run(at, 0.5, E5, A4)],
    [3.0, at => { kick(at); ping(at, A5, 0.08); }],
    [3.0, at => run(at, 0.5, A4, C5)],
    [3.5, at => ping(at, C5)],
    [3.5, at => run(at, 0.5, C5, A4)],
    [4.0, at => { kick(at); ping(at, E5, 0.07); hiss(at, 1.0, { gain: 0.1, f0: 300, f1: 5000, q: 2, rise: true }); }],
    [5.0, at => pluck(at, A3)],
    [5.5, at => pluck(at, C4)],
    [6.0, at => pluck(at, E4)],
    [6.5, at => [A5, C6, E6, B5].forEach((n, i) => ping(at + i * 0.125, n, 0.06))],
    [7.0, at => { tone('sine', 70, at, { gain: 0.5, attack: 0.002, decay: 0.3, glide: 40, send: 0.1 }); hiss(at, 0.09, { gain: 0.16, f0: 520, q: 3, send: 0.3 }); }],
    [T.sweep, at => { hiss(at, 0.8, { gain: 0.07, f0: 1800, f1: 7000, q: 4, send: 0.6 }); ping(at + 0.25, A5, 0.1); ping(at + 0.5, E6, 0.06); }],
    [T.out, at => { stopDrone(at + 0.4, 2.6); hiss(at, 1.1, { gain: 0.12, f0: 300, f1: 3200, q: 1.5, send: 0.4, rise: true }); }],
    [T.out + 1.1, at => { pad(at, [A2, E3, A3, C4, G4, B4], 3.4, 0.045); kick(at); }],
  ];
  // Грув: восьмые хэты с 2 до 7 с, бас восьмыми на сигналах и падениях
  for (let k = 0; k < 20; k++) score.push([2 + k * 0.25, at => hat(at, k % 2 === 0)]);
  for (let k = 0; k < 4; k++) score.push([3 + k * 0.25, at => bass(at, A1 + 12)]);
  for (let k = 0; k < 8; k++) score.push([5 + k * 0.25, at => bass(at, [A1, A1, A1, A1, A1 + 3, A1 + 3, A1 + 7, A1 + 7][k] + 12)]);
  score.sort((a, b) => a[0] - b[0]);

  let cursor = 0;
  return {
    ctx,
    /** Запланировать события из [from, to) сцены; base — время контекста для t = 0. */
    schedule(from, to, base) {
      while (cursor < score.length && score[cursor][0] < to) {
        const [t, play] = score[cursor++];
        if (t >= from - 0.05) play(Math.max(ctx.currentTime, base + t));
      }
    },
    /** Пропуск вступления: всё до момента выхода молча пропускаем. */
    skipTo(t) {
      while (cursor < score.length && score[cursor][0] < t) cursor++;
    },
    stopDrone: at => stopDrone(at ?? ctx.currentTime, 0.6),
  };
}

// ══════════════ Сцена ══════════════

/**
 * @param {HTMLElement} root — контейнер .mv из index.html
 * @param {Array<{ id: string, label: string }>} steps — этапы запуска по порядку
 * @param {{ reduce: boolean }} opts
 */
export function createIntro(root, steps, { reduce }) {
  const params = new URLSearchParams(location.search);
  const frozenAt = params.has('at') ? Number(params.get('at')) : null;
  // ?idle=12 — заставка, замороженная на 12-й секунде ожидания
  const frozenIdle = params.has('idle') ? Number(params.get('idle')) : null;
  const auto = params.has('auto') || frozenAt !== null;

  // ── Сборка DOM ──
  const veil = root.querySelector('.mv__veil');
  const stage = root.querySelector('.mv__stage');
  const world = el('div', 'mv__world');
  stage.append(world);
  /** Слой на столе: позиция — мировые координаты, чуть над плоскостью стола. */
  const onFloor = (node, x, y, z = 1) => put(node, 'transform', `translate3d(${px(x)}, ${px(y)}, ${z}px)`);

  // Стол — статичный слой: сетка, перекрестья и координаты растрируются один раз
  const floorDeep = el('div', 'mv__floor mv__floor--deep');
  const floor = el('div', 'mv__floor');
  GRID.cols.forEach((x, ci) => GRID.rows.forEach((y, ri) => {
    const mark = el('i', 'mv__cross');
    mark.style.left = `${1800 + x}px`;
    mark.style.top = `${1300 + y}px`;
    const coord = el('span', 'mv__coord', `${'ABCDEFGH'[ci]}${ri + 1}`);
    coord.style.left = `${1800 + x + 10}px`;
    coord.style.top = `${1300 + y + 8}px`;
    floor.append(mark, coord);
  }));
  world.append(floorDeep, floor);

  // Луч-сканер проходит стол поперёк в заставке
  const scan = el('div', 'mv__scan');
  // Фоновый трафик: пакеты — отдельные слои, двигаются только transform
  const traffic = TRAFFIC.map(p => {
    const node = el('i', `mv__packet${p.tone ? ' mv__packet--' + p.tone : ''}`);
    return { ...p, node };
  });
  world.append(scan, ...traffic.map(p => p.node));

  // Маршруты: у каждого свой маленький SVG по габаритам — когда по нему идёт
  // сигнал, перерисовывается только он, а не весь стол
  const PAD = 30;
  const routes = Object.fromEntries(Object.entries(ROUTES).map(([name, { pts, tone }]) => {
    const r = measure(pts);
    const [x0, y0, x1, y1] = r.box;
    const w = x1 - x0 + PAD * 2, h = y1 - y0 + PAD * 2;
    const box = svg('svg', { class: `mv__route mv__route--${tone}`, viewBox: `${x0 - PAD} ${y0 - PAD} ${w} ${h}`, width: w, height: h });
    const path = cls => {
      const p = svg('path', { d: r.d, class: cls, pathLength: 1 });
      box.append(p);
      return p;
    };
    const ghost = path('mv__ghost');
    const glow = path('mv__line-glow');
    const line = path('mv__line');
    const cometGlow = path('mv__comet-glow');
    const comet = path('mv__comet');
    onFloor(box, x0 - PAD, y0 - PAD);
    world.append(box);
    return [name, { ...r, box, ghost, glow, line, comet, cometGlow }];
  }));

  // Узлы: рамка и ореол — ореол нарисован заранее, вспышка — его прозрачность
  const node = (cls, x, y) => {
    const n = el('div', `mv__node ${cls}`);
    const halo = el('i', 'mv__halo');
    n.append(halo);
    world.append(n);
    return { n, halo, x, y };
  };
  const nodes = {
    src: node('mv__node--src', -1180, 0),
    c: node('mv__node--core', 0, 0),
    svc: node('mv__node--svc', 660, -200),
    mck: node('mv__node--mock', 600, 220),
  };
  // Волны: кольцо максимального радиуса, растёт через scale
  const wave = (x, y, R, tone = '') => {
    const w = el('i', `mv__wave${tone ? ' mv__wave--' + tone : ''}`);
    w.style.width = w.style.height = `${R * 2}px`;
    world.append(w);
    return { node: w, x, y, R };
  };
  const ripples = [
    { at: 2.0, x: 0, y: 0 }, { at: 2.5, x: 660, y: -200, tone: 'data' }, { at: 3.0, x: 0, y: 0 },
    { at: 3.5, x: 600, y: 220, tone: 'mock' }, { at: 4.0, x: 0, y: 0 },
    ...DROPS.map(d => ({ at: d.at, x: 0, y: 0, big: true })),
  ].map(r => ({ ...r, ...wave(r.x, r.y, r.big ? 270 : 100, r.tone) }));
  // Маяк источника в ожидании: две волны со сдвигом в полпериода
  const beacons = [0, BEACON / 2].map(shift => ({ shift, ...wave(-1180, 0, 130) }));
  // Голова импульса — светящаяся точка; ответы — жёлтые
  const pulses = PULSES.map(p => {
    const head = el('i', `mv__head${p.reply ? ' mv__head--reply' : ''}${ROUTES[p.route].tone === 'mock' && !p.reply ? ' mv__head--mock' : ''}`);
    world.append(head);
    return { ...p, head };
  });

  // Подписи на столе и таблички по краям
  const pins = PINS.map(p => {
    const pin = el('div', `mv__pin mv__pin--${p.kind}`);
    const label = el('div', 'mv__label');
    if (p.jp) {
      const jp = el('span', 'mv__jp', p.jp);
      jp.lang = 'ja';
      label.append(jp);
    }
    const textNode = el('span', 'mv__text', p.type ? '' : p.text);
    label.append(textNode);
    pin.append(label);
    world.append(pin);
    return { ...p, pin, textNode, typed: null };
  });
  const signs = SIGNS.map(s => {
    const sign = el('div', 'mv__sign', s.text);
    sign.lang = 'ja';
    sign.style.transform = `translate3d(${px(s.at[0])}, ${px(s.at[1])}, 0) rotateZ(${s.r}deg) rotateX(-90deg)`;
    world.append(sign);
    return { ...s, sign };
  });

  // Знак: плитка и три слоя над ней
  const mark = el('div', 'mv__mark');
  const plate = el('div', 'mv__plate');
  const plateHalo = el('i', 'mv__plate-halo');
  const ring = svg('svg', { class: 'mv__ring', viewBox: '0 0 120 120' });
  const ringPath = 'M30 4 H90 A26 26 0 0 1 116 30 V90 A26 26 0 0 1 90 116 H30 A26 26 0 0 1 4 90 V30 A26 26 0 0 1 30 4 Z';
  const ringLine = svg('path', { d: ringPath, class: 'mv__ring-line', pathLength: 100 });
  const ringSweep = svg('path', { d: ringPath, class: 'mv__ring-sweep', pathLength: 100 });
  ring.append(ringLine, ringSweep);
  plate.append(plateHalo, ring);
  mark.append(plate);
  const layers = DROPS.map(d => {
    const n = el('div', 'mv__layer');
    n.dataset.layer = String(d.layer);
    // Вспышка удара — заранее размытая копия знака, ей меняется только прозрачность
    const glow = svg('svg', { viewBox: '0 0 24 24', class: 'mv__layer-glow' });
    glow.append(svg('path', { d: LAYERS[d.layer] }));
    const art = svg('svg', { viewBox: '0 0 24 24' });
    art.append(svg('path', { d: LAYERS[d.layer] }));
    n.append(glow, art);
    mark.append(n);
    const tag = el('div', 'mv__tag');
    const jp = el('span', 'mv__jp', d.jp);
    jp.lang = 'ja';
    tag.append(jp, el('span', 'mv__text', d.ru));
    n.append(tag);
    return { ...d, node: n, glow, tag };
  });
  world.append(mark);

  // Название — в плоскости экрана, под знаком
  const title = root.querySelector('.mv__title');
  const word = title.querySelector('.mv__word');
  const letters = [...word.textContent].map(ch => {
    const s = el('span', 'mv__char', ch);
    s.setAttribute('aria-hidden', 'true');
    return s;
  });
  word.setAttribute('aria-label', word.textContent);
  word.replaceChildren(...letters);
  const sub = title.querySelector('.mv__sub');
  const seal = root.querySelector('.mv__seal');
  const timecode = root.querySelector('.mv__tc');
  const hud = root.querySelector('.mv__hud');
  const pkt = root.querySelector('.mv__pkt');
  const scanX = root.querySelector('.mv__scanx');
  const statusLine = root.querySelector('.mv__status');

  // ── Строка запуска: этапы те же, что были у загрузчика ──
  const total = steps.length;
  const stateOf = new Map(steps.map(s => [s.id, 'idle']));
  const status = root.querySelector('.mv__status-text');
  const count = root.querySelector('.mv__count');
  const bar = root.querySelector('.mv__bar i');
  const retry = root.querySelector('.mv__retry');
  retry.addEventListener('click', () => location.reload());
  const doneCount = () => [...stateOf.values()].filter(v => v === 'done').length;
  function setStep(id, next, note) {
    stateOf.set(id, next);
    const done = doneCount();
    count.textContent = `${done} / ${total}`;
    bar.style.transform = `scaleX(${done / total})`;
    const step = steps.find(s => s.id === id);
    if (next === 'busy') status.textContent = `${step.label}…`;
    if (next === 'done' && note) status.textContent = note;
  }
  count.textContent = `0 / ${total}`;

  // ── Состояние воспроизведения ──
  let t = frozenAt ?? 0;
  let playing = false;
  let ready = false;
  let failed = false;
  let handoff = null;          // { target, reveal, resolve } из finish()
  let revealed = false;
  let target = null;           // прямоугольник 3D-логотипа на экране
  let audio = null;
  let last = 0;
  let breath = frozenIdle ?? 0; // часы «дыхания» и заставки
  let startedAt = null;        // breath в момент нажатия — откуда камера уходит в путь

  // ── Кадр ──
  function render(t) {
    const W = innerWidth, H = innerHeight;
    // Масштаб мира от экрана: на 1000px по высоте — 1:1; телефон — крупнее, сцена обрезается по бокам
    const unit = Math.min(H / 1000, W / (W < 720 ? 950 : 1500));
    put(root, '--unit', unit.toFixed(4));

    // Заставка: пока не нажали — 1; после нажатия за 0,8 с уходит
    const idle = startedAt === null && frozenAt === null ? 1 : 1 - smooth(span(t, 0, 0.8));
    const idleClock = startedAt ?? breath;

    // Камера: из облёта заставки — в путь, затем дыхание в ожидании, затухающее на выходе
    const cam = cameraAt(Math.min(t, T.hold));
    const handover = 1 - smooth(span(t, 0, 1.4));
    if (handover > 0 && frozenAt === null) {
      const from = idleCamera(idleClock);
      // Поворот догоняет путь по короткой дуге, без раскрутки накопленных оборотов
      from.spin = cam.spin + (wrap(from.spin - cam.spin + 180, 360) - 180);
      for (const c of CHANNELS) cam[c] = lerp(cam[c], from[c], handover);
    }
    const live = reduce ? 0 : smooth(span(t, 6.4, T.hold)) * (1 - smooth(span(t, T.out, T.out + 0.5)));
    cam.tilt += Math.sin(breath * 0.9) * 4 * live;
    cam.spin += Math.sin(breath * 0.6 + 1) * 3 * live;
    cam.z += Math.sin(breath * 0.7) * 10 * live;

    // Выход: знак перелетает на место 3D-логотипа и совпадает с ним по размеру
    let ox = 0, oy = 0, oz = cam.z;
    if (t > T.out && !reduce) {
      const fly = inOut(span(t, T.out, T.out + 1.0));
      const rect = target ?? { x: W / 2, y: H / 2, size: TILE * unit * 0.8 };
      // Сторона плитки на экране = TILE·unit·P/(P − z)
      const k = rect.size / (TILE * unit);
      const zEnd = PERSP * (1 - 1 / k);
      oz = lerp(cam.z, zEnd, fly);
      const s = PERSP / (PERSP - oz);
      ox = lerp(0, (rect.x - W / 2) / s, fly);
      oy = lerp(0, (rect.y - H / 2) / s, fly);
    }
    put(world, 'transform',
      `translate3d(${px(ox)}, ${px(oy)}, ${px(oz)}) scale(${unit.toFixed(4)}) rotateX(${cam.tilt.toFixed(3)}deg) rotateZ(${cam.spin.toFixed(3)}deg) translate3d(${px(-cam.x)}, ${px(-cam.y)}, 0)`);
    const face = `rotateZ(${(-cam.spin).toFixed(3)}deg) rotateX(${(-cam.tilt).toFixed(3)}deg)`;

    // Стол: в заставке приглушён, на запуске проявляется, на выходе уходит
    const floorIn = (0.7 + 0.3 * smooth(span(t, 0, 1.0))) * (1 - smooth(span(t, T.out, T.out + 0.6)));
    fade(floor, floorIn);
    fade(floorDeep, floorIn * 0.8);
    // Ближе к краю стола всё растворяется вместе с сеткой
    const edge = (x, y) => 1 - smooth(span(Math.hypot(x / 1.38, y), FLOOR_R * 0.55, FLOOR_R));

    // ── Заставка: трафик, скан, маяк ──
    let laps = 0;
    for (const p of traffic) {
      const run = idleClock * Math.abs(p.speed) + p.phase;
      laps += Math.floor(run / LANE);
      const dir = Math.sign(p.speed);
      const head = (wrap(run, LANE) - LANE / 2) * dir;
      const tail = head - dir * PACKET;
      const [x, y] = p.axis === 'x' ? [tail, p.line] : [p.line, tail];
      const [hx, hy] = p.axis === 'x' ? [head, p.line] : [p.line, head];
      if (fade(p.node, idle * edge(hx, hy))) {
        const angle = p.axis === 'x' ? (dir > 0 ? 0 : 180) : (dir > 0 ? 90 : -90);
        put(p.node, 'transform', `translate3d(${px(x)}, ${px(y)}, 1px) rotate(${angle}deg)`);
      }
    }
    const sx = (wrap(idleClock, SCAN) / SCAN) * 3000 - 1500;
    if (fade(scan, idle * edge(sx, 0) * 0.9)) onFloor(scan, sx, -FLOOR_R, 1);
    if (idle > 0) {
      put(pkt, 'textContent', String(laps).padStart(4, '0'));
      const coord = Math.round(sx / 40) * 40;
      put(scanX, 'textContent', `${coord < 0 ? '−' : '+'}${String(Math.abs(coord)).padStart(4, '0')}`);
    }
    for (const b of beacons) {
      const k = wrap(idleClock + b.shift, BEACON) / 1.6;
      if (fade(b.node, k < 1 ? (1 - k) * 0.8 * idle : 0)) {
        put(b.node, 'transform', `translate3d(${px(b.x - b.R)}, ${px(b.y - b.R)}, 1px) scale(${(0.08 + 0.92 * outCubic(k)).toFixed(4)})`);
      }
    }

    // ── Маршруты: прочерчиваются головой импульса, на 4–4,6 стягиваются в узел ──
    const pull = smooth(span(t, 4.0, 4.6));
    const drawn = { trunk: inOut(span(t, 0.8, 2.0)), callback: outCubic(span(t, 2.0, 2.5)), mock: outCubic(span(t, 3.0, 3.5)) };
    for (const [name, r] of Object.entries(routes)) {
      fade(r.box, Math.max(idle, drawn[name] > 0 ? 1 - smooth(span(t, 4.4, 4.7)) : 0));
      put(r.ghost, 'opacity', (idle * 0.6).toFixed(3));
      // Магистраль приходит в узел — стягивается к своему концу; отводы — к началу
      const from = name === 'trunk' ? pull : 0;
      const to = name === 'trunk' ? drawn[name] : Math.min(drawn[name], 1 - pull);
      const dash = `${Math.max(0, to - from).toFixed(4)} 2`;
      const offset = (-from).toFixed(4);
      for (const p of [r.line, r.glow]) {
        put(p, 'strokeDasharray', dash);
        put(p, 'strokeDashoffset', offset);
      }
    }

    // ── Импульсы: голова — слой с transform, хвост-комета — штрих по маршруту ──
    const active = {};
    for (const p of pulses) {
      const on = t >= p.from && t <= p.to + 0.12 && pull < 1;
      if (!fade(p.head, on ? 1 : 0)) continue;
      const r = routes[p.route];
      const ease = p.route === 'trunk' ? inOut : outCubic;
      const k = ease(span(t, p.from, p.to));
      const u = p.back ? 1 - k : k;
      const [hx, hy] = r.at(u);
      put(p.head, 'transform', `translate3d(${px(hx)}, ${px(hy)}, 2px)`);
      // Хвост длиннее на скорости и сходит на нет при торможении
      const speed = Math.abs(k - ease(span(t - 1 / 15, p.from, p.to)));
      const len = Math.min(0.45, speed * 2.2);
      active[p.route] = { a: p.back ? u : u - len, len, reply: p.reply };
    }
    for (const [name, r] of Object.entries(routes)) {
      const c = active[name];
      put(r.box, '--comet', c?.reply ? 'var(--mv-data)' : 'currentColor');
      for (const p of [r.comet, r.cometGlow]) {
        put(p, 'opacity', c ? '1' : '0');
        if (c) {
          put(p, 'strokeDasharray', `${c.len.toFixed(4)} 2`);
          put(p, 'strokeDashoffset', (-c.a).toFixed(4));
        }
      }
    }

    // ── Узлы: вспыхивают при приходе сигнала, на стягивании съезжают в центр ──
    const flash = at => (t >= at ? Math.exp(-(t - at) * 6) : 0);
    const placeNode = (nd, k, glow, slide = 0) => {
      if (!fade(nd.n, k)) return;
      onFloor(nd.n, nd.x * (1 - slide), nd.y * (1 - slide));
      put(nd.halo, 'opacity', glow.toFixed(3));
    };
    // Источник в заставке «дышит» — мягкая пульсация ореола в такт маяку
    const breathe = 0.35 + 0.35 * Math.cos((wrap(idleClock, BEACON) / BEACON) * Math.PI * 2);
    placeNode(nodes.src, Math.max(idle, span(t, 0.3, 0.6)) * (1 - pull), Math.max(breathe * idle, flash(0.8)));
    placeNode(nodes.c, span(t, 1.85, 2.0) * (1 - smooth(span(t, 4.6, 5.0))), Math.max(flash(2.0), flash(3.0), flash(4.0)));
    placeNode(nodes.svc, span(t, 2.45, 2.55) * (1 - pull), flash(2.5), pull);
    placeNode(nodes.mck, span(t, 3.45, 3.55) * (1 - pull), flash(3.5), pull);
    for (const r of ripples) {
      const k = span(t, r.at, r.at + (r.big ? 1.1 : 0.8));
      if (fade(r.node, k > 0 && k < 1 ? (1 - k) * (r.big ? 0.6 : 0.85) : 0)) {
        put(r.node, 'transform', `translate3d(${px(r.x - r.R)}, ${px(r.y - r.R)}, 1px) scale(${(0.06 + 0.94 * outCubic(k)).toFixed(4)})`);
      }
    }

    // ── Подписи: проявляются, печатаются, на стягивании уезжают вместе с узлами ──
    for (const p of pins) {
      const [show, hide] = p.show;
      const k = span(t, show, show + 0.18) * (1 - span(t, hide - 0.25, hide));
      if (!fade(p.pin, k)) continue;
      const x = p.at[0] * (1 - pull), y = p.at[1] * (1 - pull);
      put(p.pin, 'transform', `translate3d(${px(x)}, ${px(y)}, 0) ${face} translateY(${px(-(p.lift ?? 26) - (1 - k) * 10)})`);
      if (p.type) {
        const n = Math.ceil(span(t, show, show + 0.32) * p.text.length);
        const txt = p.text.slice(0, n) + (n < p.text.length && n > 0 ? '▍' : '');
        put(p.textNode, 'textContent', txt);
      }
    }
    for (const s of signs) {
      fade(s.sign, Math.max(idle, smooth(span(t, 0.3, 1.4))) * (1 - smooth(span(t, 4.4, 5.2))) * 0.5);
    }

    // ── Плитка знака: контур прорисовывается к 5 с; скан по кольцу — готовность ──
    if (fade(plate, smooth(span(t, 4.5, 5.0)))) {
      put(ringLine, 'strokeDashoffset', (100 - 100 * smooth(span(t, 4.5, 5.1))).toFixed(2));
      const sweep = span(t, T.sweep, T.sweep + 0.8);
      put(ringSweep, 'opacity', sweep > 0 && sweep < 1 ? '1' : '0');
      put(ringSweep, 'strokeDashoffset', (12 - 100 * inOut(sweep)).toFixed(2));
    }
    const readyK = smooth(span(t, T.sweep + 0.2, T.sweep + 0.6));
    put(plateHalo, 'opacity', readyK.toFixed(3));
    put(statusLine, 'opacity', (1 - readyK * 0.4).toFixed(3));

    // ── Слои: падение с ускорением, удар, отскок; нижние проседают от удара верхних ──
    layers.forEach((l, i) => {
      const fallStart = l.at - 0.42;
      if (!fade(l.node, span(t, fallStart, fallStart + 0.12))) return;
      let z = l.z;
      let squash = 1;
      if (t < l.at) {
        const k = span(t, fallStart, l.at);
        z = l.z + 760 * (1 - k * k);
      } else {
        const a = t - l.at;
        z = l.z + 14 * Math.sin(a * 16) * Math.exp(-a * 7);
        squash = 1 - 0.06 * Math.exp(-a * 12);
      }
      // Вторичная реакция: следующие удары продавливают уже лежащий слой
      for (const above of layers.slice(i + 1)) {
        const a = t - above.at;
        if (a > 0) z -= 6 * Math.exp(-a * 9) * Math.sin(Math.min(Math.PI, a * 20));
      }
      put(l.node, 'transform', `translate3d(-50%, -50%, ${px(z)}) scale(${(2 - squash).toFixed(3)}, ${squash.toFixed(3)})`);
      put(l.glow, 'opacity', (t >= l.at ? Math.exp(-(t - l.at) * 5) : 0).toFixed(3));
      // Подпись слоя — справа, повёрнута к камере, сворачивается перед названием
      const tk = span(t, l.at + 0.05, l.at + 0.25) * (1 - smooth(span(t, 6.35, 6.6)));
      if (fade(l.tag, tk)) put(l.tag, 'transform', `${face} translateX(${px((1 - tk) * -14)})`);
    });
    fade(mark, 1 - smooth(span(t, T.end - 0.5, T.end)));

    // ── Название: буквы сходятся из разрядки от центра к краям ──
    const mid = (letters.length - 1) / 2;
    letters.forEach((s, i) => {
      const d = Math.abs(i - mid) * 0.035;
      const k = outCubic(span(t, 6.5 + d, 7.1 + d));
      fade(s, k);
      put(s, 'transform', `translate3d(${((i - mid) * 0.55 * (1 - k)).toFixed(3)}em, 0, 0)`);
    });
    const out = smooth(span(t, T.out, T.out + 0.45));
    const subK = smooth(span(t, 6.8, 7.3));
    fade(sub, subK * (1 - out));
    put(sub, 'transform', `translate3d(0, ${px((1 - subK) * 8)}, 0)`);
    fade(title, 1 - out);
    put(title, 'transform', `translate3d(-50%, ${px(out * 18)}, 0)`);
    // Печать: штамп с отдачей
    const sk = span(t, 7.0, 7.25);
    if (fade(seal, span(t, 6.92, 7.0) * (1 - out))) {
      put(seal, 'transform', `rotate(-6deg) scale(${(t < 7.0 ? 1.6 : 1 + 0.6 * (1 - outBack(sk))).toFixed(3)})`);
    }
    fade(hud, Math.max(idle, smooth(span(t, 0.2, 1.0))) * (1 - out));
    put(timecode, 'textContent', startedAt === null && frozenAt === null ? '待機 · standby'
      : `${String(Math.floor(t)).padStart(2, '0')}:${String(Math.floor((t % 1) * 60)).padStart(2, '0')}`);

    // Шторка — плотная до выхода, на перелёте открывает сцену
    put(veil, 'opacity', (1 - smooth(span(t, T.out + 0.2, T.out + 1.1))).toFixed(3));
  }

  // ── Цикл ──
  let loopId = 0;
  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    breath += dt;
    if (playing) {
      const limit = ready ? T.end : T.hold;
      const prev = t;
      t = Math.min(limit, t + dt);
      if (t > prev && audio) {
        // Пока ждём загрузку, время сцены стоит — сдвигаем базу звука
        audio.schedule(prev, t + 0.12, audio.ctx.currentTime - t);
      }
      // Логотип сцены собирается под шторкой, пока идёт печать и проход света
      if (ready && !revealed && t >= 7.0) { revealed = true; handoff?.reveal(); }
      if (t >= T.out - 0.05 && handoff) target = handoff.target() ?? target;
      if (t >= T.end) { complete(); return; }
    }
    render(t);
    loopId = requestAnimationFrame(tick);
  }

  function complete() {
    root.classList.add('is-gone');
    cancelAnimationFrame(loopId);
    setTimeout(() => root.remove(), 400);
    handoff?.resolve();
  }

  // ── Старт по жесту: он же открывает звук ──
  const gate = root.querySelector('.mv__gate');
  const startBtn = gate.querySelector('button');
  function start(withSound) {
    if (playing) return;
    playing = true;
    startedAt = breath;
    root.classList.add('is-playing');
    gate.setAttribute('aria-hidden', 'true');
    if (withSound && !reduce) {
      try {
        audio = createAudio();
        audio?.ctx.resume();
      } catch (error) {
        console.warn('[signal] intro audio is unavailable', error);
      }
    }
    if (reduce) t = T.hold - 0.6;
  }
  startBtn.addEventListener('click', () => start(true));
  // Пропуск: Esc — сразу к финалу (если всё загружено — к перелёту)
  addEventListener('keydown', e => {
    if (!root.isConnected) return;
    if (!playing && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); start(true); return; }
    if (playing && e.key === 'Escape') {
      const to = ready ? T.out : T.hold;
      if (t < to) {
        t = to;
        audio?.skipTo(to);
        if (!ready) audio?.stopDrone();
      }
    }
  });

  if (frozenIdle !== null) {
    root.classList.add('is-on');
    render(0);
  } else if (frozenAt === null) {
    requestAnimationFrame(now => { last = now; root.classList.add('is-on'); loopId = requestAnimationFrame(tick); });
    if (auto || reduce) start(false);
    else startBtn.focus({ preventScroll: true });
  } else {
    root.classList.add('is-on', 'is-playing');
    render(frozenAt);
    addEventListener('resize', () => render(frozenAt));
  }

  return {
    /** Этап начался — строка состояния называет его. */
    start(id) { setStep(id, 'busy'); },
    /** Этап завершён; note — уточнение для строки состояния. */
    done(id, note) { setStep(id, 'done', note); },
    /** Этап упал: строка состояния говорит, что сломалось, и есть «Повторить». */
    fail(id, error) {
      failed = true;
      setStep(id, 'fail');
      const step = steps.find(s => s.id === id);
      status.textContent = `Не удалось: ${step.label.toLowerCase()}. ${error?.message || error || ''}`.trim();
      root.classList.add('is-failed');
      retry.hidden = false;
      retry.focus();
    },
    /**
     * Всё загружено. target() — прямоугольник 3D-логотипа на экране
     * ({ x, y, size } в px), reveal() — собрать логотип в сцене. Промис
     * разрешается, когда вступление ушло.
     */
    finish({ target: getTarget = () => null, reveal = () => {} } = {}) {
      status.textContent = 'Система готова';
      root.classList.add('is-loaded');
      return new Promise(resolve => {
        handoff = { target: getTarget, reveal, resolve };
        ready = !failed;
        if (frozenAt !== null) { reveal(); resolve(); }
      });
    },
  };
}
