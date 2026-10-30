// Большие видеоэкраны города: грани M_Video_<канал> из blender/build_city.py.
// Каждый канал — свой анимированный холст, ролик о платформе:
//   0 決済通知 — лента колбэков: запросы бегут снизу вверх, статусы, задержки;
//   1 信号幹線 — осциллограф сигнальной магистрали: две трассы и бегущий импульс;
//   2 品質保証 — заставка QA Platform: слои знака расходятся и сходятся;
//   3 模擬応答 — терминал мок-сервера: запрос и ответ печатаются построчно;
//   4 監視中 — вертикальный: знаки и столбцы нагрузки, пульс (9:16);
//   5 試験中 — вертикальный: кольцо прогресса и проходящие тесты (9:16).
// Поверх — строки развёртки и редкий срыв кадра, как у голо-реклам future.js.
// Холсты перерисовываются ~10 раз в секунду: экраны крупные, но далеко.

import * as THREE from '../3d/vendor/three.module.js';
import { JP_FONT, ANISOTROPY } from './signage.js';

const NC = { yellow: '#fcee0a', cyan: '#00f0ff', red: '#ff003c' };   // палитра future.js
const COND = '"DIN Condensed", "Avenir Next Condensed", "Arial Narrow", sans-serif';
const MONO = 'ui-monospace, Menlo, monospace';
const WIDE = [768, 432];
const TALL = [432, 768];

const hash = n => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };
// Остаток без знака: время канала может быть и отрицательным
const mod = (n, m) => ((n % m) + m) % m;

/** Шапка канала: японская надпись, перевод, метка эфира. */
function header(g, W, jp, en, ink, t) {
  g.fillStyle = 'rgba(0,0,0,0.65)';
  g.fillRect(0, 0, W, 54);
  g.fillStyle = ink;
  g.fillRect(0, 52, W, 2);
  g.font = `800 30px ${JP_FONT}`;
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.fillText(jp, 20, 28);
  g.font = `700 22px ${COND}`;
  g.fillStyle = '#e8eef5';
  g.fillText(en, 30 + g.measureText(jp).width * 1.45, 29);
  // Метка эфира мигает раз в секунду
  g.textAlign = 'right';
  g.fillStyle = Math.floor(t * 2) % 2 ? NC.red : 'rgba(255,0,60,0.35)';
  g.beginPath(); g.arc(W - 92, 28, 7, 0, Math.PI * 2); g.fill();
  g.font = `600 18px ${MONO}`;
  g.fillStyle = '#e8eef5';
  g.fillText('LIVE', W - 20, 29);
}

const SYSTEMS = ['CARD', 'SBP', 'WALLET', 'QR', 'BANK', 'CRYPTO'];
const OPS = ['payment', 'refund', 'payout', 'status', 'capture'];

function callbacks(g, W, H, t) {
  g.fillStyle = '#04070b'; g.fillRect(0, 0, W, H);
  header(g, W, '決済通知', 'CALLBACK FEED', NC.yellow, t);
  const rowH = 34;
  const speed = 1.6;                      // строк в секунду
  const shift = (t * speed) % 1;
  const first = Math.floor(t * speed);
  g.font = `500 19px ${MONO}`;
  g.textBaseline = 'middle';
  for (let k = 0; k < 10; k++) {
    const id = first + k;
    const y = H - 30 - (k + shift) * rowH;
    if (y < 70) break;
    const ok = hash(id) > 0.16;
    const fresh = k === 0;
    g.globalAlpha = fresh ? 0.6 + 0.4 * shift : 1 - k * 0.07;
    g.fillStyle = fresh ? 'rgba(0,240,255,0.08)' : 'transparent';
    g.fillRect(12, y - rowH / 2 + 2, W - 24, rowH - 4);
    g.textAlign = 'left';
    g.fillStyle = '#7d8a99';
    const sec = String(mod(Math.floor(id * 7.3), 60)).padStart(2, '0');
    g.fillText(`23:${String(mod(Math.floor(id / 8), 60)).padStart(2, '0')}:${sec}`, 22, y);
    g.fillStyle = '#e8eef5';
    g.fillText(`POST /callback/${SYSTEMS[mod(id, SYSTEMS.length)].toLowerCase()}`, 140, y);
    g.fillStyle = '#9aa6b4';
    g.fillText(OPS[Math.floor(hash(id + 3) * OPS.length)], 470, y);
    g.textAlign = 'right';
    g.fillStyle = ok ? NC.cyan : NC.yellow;
    g.fillText(ok ? '200 OK' : '409', W - 120, y);
    g.fillStyle = '#7d8a99';
    g.fillText(`${Math.round(18 + hash(id + 9) * 140)} ms`, W - 22, y);
  }
  g.globalAlpha = 1;
}

function oscilloscope(g, W, H, t) {
  g.fillStyle = '#03070a'; g.fillRect(0, 0, W, H);
  // Сетка 10 × 6 делений
  g.strokeStyle = 'rgba(0,240,255,0.12)'; g.lineWidth = 1;
  for (let i = 1; i < 10; i++) { g.beginPath(); g.moveTo((W * i) / 10, 60); g.lineTo((W * i) / 10, H - 40); g.stroke(); }
  for (let i = 1; i < 6; i++) { const y = 60 + ((H - 100) * i) / 6; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  header(g, W, '信号幹線', 'SIGNAL TRUNK', NC.cyan, t);
  const mid = 60 + (H - 100) / 2;
  const trace = (color, amp, f, ph, width, pulse) => {
    g.strokeStyle = color; g.lineWidth = width; g.shadowColor = color; g.shadowBlur = 12;
    g.beginPath();
    for (let x = 0; x <= W; x += 4) {
      const u = x / W;
      const p = pulse ? Math.exp(-(((u - ((t * 0.35) % 1.2) + 0.1) * 18) ** 2)) * 90 : 0;
      const y = mid + Math.sin(u * f + t * ph) * amp + Math.sin(u * f * 3.1 - t * ph * 1.7) * amp * 0.25 - p;
      if (x) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.stroke();
    g.shadowBlur = 0;
  };
  trace(NC.cyan, 38, 14, 2.2, 3, true);
  trace(NC.yellow, 22, 9, -1.4, 2, false);
  g.font = `600 17px ${MONO}`; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.fillStyle = NC.cyan; g.fillText('CH1  packets  2 V/div', 18, H - 14);
  g.fillStyle = NC.yellow; g.fillText('CH2  ack', 300, H - 14);
  g.textAlign = 'right'; g.fillStyle = '#e8eef5';
  g.fillText(`${(1180 + Math.sin(t * 0.7) * 60).toFixed(0)} pkt/s`, W - 18, H - 14);
}

function brand(g, W, H, t) {
  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#061019'); grad.addColorStop(1, '#14061a');
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  // Знак: три слоя — ромб и две «галочки», как у логотипа платформы; слои дышат
  const cx = W * 0.27, cy = H * 0.5, s = H * 0.2;
  const open = 0.5 + 0.5 * Math.sin(t * 1.3);
  g.lineJoin = 'round'; g.lineCap = 'round';
  const layer = (dy, color, top) => {
    g.strokeStyle = color; g.lineWidth = 12; g.shadowColor = color; g.shadowBlur = 24;
    g.beginPath();
    if (top) { g.moveTo(cx, cy - s + dy); g.lineTo(cx + s * 1.3, cy + dy); g.lineTo(cx, cy + s + dy); g.lineTo(cx - s * 1.3, cy + dy); g.closePath(); }
    else { g.moveTo(cx - s * 1.3, cy + dy); g.lineTo(cx, cy + s + dy); g.lineTo(cx + s * 1.3, cy + dy); }
    g.stroke();
  };
  layer(-s * 0.55 - open * 18, '#ffffff', true);
  layer(s * 0.35, NC.cyan, false);
  layer(s * 0.85 + open * 18, NC.cyan, false);
  g.shadowBlur = 0;
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.fillStyle = '#ffffff';
  g.font = `800 86px ${COND}`;
  g.fillText('QA Platform', W * 0.5, H * 0.5);
  g.font = `500 26px ${COND}`;
  g.fillStyle = '#b8c4d2';
  g.fillText('Колбэки и моки в одном сервисе', W * 0.5, H * 0.5 + 42);
  g.font = `800 40px ${JP_FONT}`;
  g.fillStyle = NC.red;
  g.fillText('品質保証基盤', W * 0.5, H * 0.5 - 92);
  // Блик бежит по экрану раз в несколько секунд
  const sx = ((t * 0.25) % 1.6 - 0.3) * W;
  const sweep = g.createLinearGradient(sx - 120, 0, sx + 120, 0);
  sweep.addColorStop(0, 'rgba(255,255,255,0)'); sweep.addColorStop(0.5, 'rgba(255,255,255,0.08)'); sweep.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sweep; g.fillRect(0, 0, W, H);
}

const TERMINAL = [
  ['$ ', 'curl -X POST qa/mock/payments', '#e8eef5'],
  ['', '> scenario: delayed-success', '#7d8a99'],
  ['', '< HTTP/1.1 202 Accepted', NC.yellow],
  ['', '{ "status": "PENDING",', '#e8eef5'],
  ['', '  "callback_in": "5s" }', '#e8eef5'],
  ['', '… 5 s', '#7d8a99'],
  ['', '→ POST /callback  200 OK', NC.cyan],
  ['', '{ "status": "SUCCESS" }', '#e8eef5'],
];

function terminal(g, W, H, t) {
  g.fillStyle = '#05080a'; g.fillRect(0, 0, W, H);
  header(g, W, '模擬応答', 'MOCK SERVER', NC.red, t);
  // Печать: ~22 знака в секунду, после последней строки — пауза и заново
  const total = TERMINAL.reduce((n, [, s]) => n + s.length, 0);
  let left = mod(Math.floor(t * 22), total + 60);
  g.font = `500 22px ${MONO}`; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  let y = 100;
  for (const [prompt, line, color] of TERMINAL) {
    if (left <= 0) break;
    const shown = line.slice(0, left);
    left -= line.length;
    g.fillStyle = NC.red; g.fillText(prompt, 24, y);
    g.fillStyle = color; g.fillText(shown, 24 + g.measureText(prompt).width, y);
    if (left <= 0 && Math.floor(t * 3) % 2) g.fillRect(24 + g.measureText(prompt + shown).width + 2, y - 20, 12, 24);
    y += 38;
  }
}

function monitoring(g, W, H, t) {
  g.fillStyle = '#05060c'; g.fillRect(0, 0, W, H);
  g.font = `900 120px ${JP_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = NC.cyan; g.shadowColor = NC.cyan; g.shadowBlur = 20;
  ['監', '視', '中'].forEach((ch, i) => g.fillText(ch, W / 2, 110 + i * 132));
  g.shadowBlur = 0;
  // Столбцы нагрузки
  const n = 9, bw = (W - 60) / n;
  for (let i = 0; i < n; i++) {
    const v = 0.25 + 0.7 * (0.5 + 0.5 * Math.sin(t * (1.1 + i * 0.23) + i * 1.9));
    const h = v * 150;
    g.fillStyle = v > 0.85 ? NC.red : v > 0.65 ? NC.yellow : NC.cyan;
    g.fillRect(30 + i * bw + 4, 640 - h, bw - 8, h);
  }
  // Пульс
  g.strokeStyle = NC.red; g.lineWidth = 3; g.beginPath();
  for (let x = 0; x <= W; x += 3) {
    const u = (x / W + t * 0.4) % 1;
    const beat = u > 0.45 && u < 0.55 ? Math.sin((u - 0.45) * 62.8) * 40 : 0;
    const y = 700 - beat;
    if (x) g.lineTo(x, y); else g.moveTo(x, y);
  }
  g.stroke();
  g.font = `700 24px ${COND}`; g.fillStyle = '#e8eef5'; g.textAlign = 'center';
  g.fillText('MONITORING  //  24/7', W / 2, 748);
}

const TESTS = ['signature', 'callback retry', 'mock delay', 'idempotency', 'refund flow', 'webhook auth'];

function testing(g, W, H, t) {
  g.fillStyle = '#07050a'; g.fillRect(0, 0, W, H);
  const p = mod(t * 0.12, 1);
  const cx = W / 2, cy = 190, r = 120;
  g.lineWidth = 14; g.strokeStyle = 'rgba(252,238,10,0.15)';
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = NC.yellow; g.shadowColor = NC.yellow; g.shadowBlur = 18;
  g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2); g.stroke();
  g.shadowBlur = 0;
  g.font = `800 64px ${COND}`; g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(`${Math.floor(p * 100)}%`, cx, cy);
  g.font = `900 96px ${JP_FONT}`; g.fillStyle = NC.yellow;
  g.fillText('試験中', cx, 390);
  g.font = `500 21px ${MONO}`; g.textAlign = 'left';
  TESTS.forEach((name, i) => {
    const done = p > (i + 1) / (TESTS.length + 1);
    g.fillStyle = done ? NC.cyan : '#56606c';
    g.fillText(`${done ? '✓' : '·'} ${name}`, 48, 480 + i * 40);
  });
  g.font = `700 24px ${COND}`; g.fillStyle = '#e8eef5'; g.textAlign = 'center';
  g.fillText('TEST IN PROGRESS', cx, 740);
}

const CHANNELS = [
  { draw: callbacks, size: WIDE },
  { draw: oscilloscope, size: WIDE },
  { draw: brand, size: WIDE },
  { draw: terminal, size: WIDE },
  { draw: monitoring, size: TALL },
  { draw: testing, size: TALL },
];

/** Строки развёртки — один раз в узор, накладываются на каждый кадр. */
function scanPattern() {
  const cv = Object.assign(document.createElement('canvas'), { width: 4, height: 4 });
  const g = cv.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(0, 2, 4, 2);
  return cv;
}

/**
 * Материалы видеоэкранов по номеру канала.
 * @returns {{ material(index: number): THREE.Material, update(t: number): void, lowPower(): void }}
 */
export function createScreens({ reduced = false } = {}) {
  const scan = scanPattern();
  let fps = 10;
  let last = -1;
  const channels = CHANNELS.map((c, k) => {
    const [W, H] = c.size;
    const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
    const g = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = ANISOTROPY;
    // Грань из glTF: v = 0 у верхней кромки — как строки холста
    tex.flipY = false;
    const material = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, name: `M_Video_${k}` });
    material.color.setScalar(0.9);
    return { ...c, W, H, g, tex, material, pattern: g.createPattern(scan, 'repeat'), seed: k * 3.7 };
  });
  const draw = t => {
    for (const ch of channels) {
      const { g, W, H } = ch;
      ch.draw(g, W, H, t + ch.seed);
      g.fillStyle = ch.pattern; g.fillRect(0, 0, W, H);
      // Срыв кадра: раз в несколько секунд полоса съезжает вбок
      const tick = Math.floor((t + ch.seed) * 2);
      if (hash(tick + ch.seed) > 0.9) {
        const y = hash(tick * 1.3) * H, h = 20 + hash(tick * 2.1) * 50;
        g.drawImage(g.canvas, 0, y, W, h, (hash(tick * 3.7) - 0.5) * 60, y, W, h);
      }
      ch.tex.needsUpdate = true;
    }
  };
  draw(0);
  return {
    material: k => channels[k]?.material ?? null,
    update(t) {
      if (reduced) return;
      const frame = Math.floor(t * fps);
      if (frame === last) return;
      last = frame;
      draw(t);
    },
    /** Слабое устройство: кадры реже. */
    lowPower() { fps = 4; },
  };
}
