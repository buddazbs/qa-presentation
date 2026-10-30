// Маркировка и вывески — общий набор для ствола и города.
//
// Японский текст здесь только осмысленный, у каждой надписи — перевод:
//   信号幹線      — сигнальная магистраль (так называется ствол сцены)
//   品質保証      — обеспечение качества (QA)
//   品質保証基盤  — QA-платформа
//   試験環境      — тестовое окружение
//   決済通知      — уведомление о платеже (колбэк)
//   モックサーバ  — мок-сервер
//   監視中        — идёт мониторинг
//   東京          — Токио
//   第N章         — глава N
// Цвета — из дизайн-системы signal: один неоновый акцент (циан) и красный
// печати; тексты белые.

import * as THREE from '../3d/vendor/three.module.js';

export const INK = {
  cyan: '#2fd8ff',
  seal: '#e5323b',
  white: '#f2f4f7',
  steel: '#9aa1ad',
  graphite: '#111317',
  // Только для отдельных вывесок города — не для интерфейса
  magenta: '#ff2e88',
  pink: '#ff5cc8',
  violet: '#9b6bff',
  ice: '#9cc8ff',
  aqua: '#3cf2e0',
};

/**
 * Знаки, которые в вертикальной записи поворачиваются на 90°: в татэгаки
 * тире удлинения гласной стоит вертикально, а не лежит поперёк столбца.
 */
const ROTATE_IN_VERTICAL = new Set(['ー', '〜', '…', '－']);

// Плотность холстов вывесок относительно макета и фильтрация под углом:
// вывески видны сбоку на облёте — анизотропия держит знаки резкими
const RES = 2;
export const ANISOTROPY = 8;

/** Детерминированный шум (Park–Miller): одинаковый рисунок и раскладка при каждом запуске. */
export const seeded = seed => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

/**
 * Подложка неоновой вывески: тёмный окрашенный металл с горизонтальными
 * рисками шлифовки; у трубок металл подсвечен их цветом — отражение
 * неона на подложке. Рисуется до трубок.
 */
function backplate(g, W, H, tint) {
  const glow = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.55);
  glow.addColorStop(0, `${tint}1f`);
  glow.addColorStop(1, `${tint}00`);
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);
  // Риски: тонкие горизонтальные линии разной яркости — детерминированно
  const rnd = seeded(W * 31 + H);
  for (let y = 4; y < H; y += 3) {
    g.fillStyle = `rgba(255, 255, 255, ${(0.012 + rnd() * 0.022).toFixed(3)})`;
    g.fillRect(0, y, W, 1);
  }
}

/**
 * Держатели трубки: прозрачные стойки, которыми неон крепится к подложке, —
 * тёмные перемычки поперёк рамки через равный шаг.
 */
function tubeClips(g, W, H) {
  g.fillStyle = 'rgba(20, 22, 28, 0.9)';
  const clip = (x, y, horizontal) => (horizontal ? g.fillRect(x - 2, y - 7, 4, 14) : g.fillRect(x - 7, y - 2, 14, 4));
  for (let x = 60; x < W - 40; x += 90) { clip(x, 16, true); clip(x, H - 16, true); }
  for (let y = 70; y < H - 40; y += 110) { clip(16, y, false); clip(W - 16, y, false); }
}

/**
 * Световой короб изнутри: лампы за рассеивателем светят ярче в середине и
 * гаснут к краям, рассеиватель собран из панелей — тонкие швы поперёк.
 * Рисуется под знаками, поверх фона.
 */
function lightbox(g, W, H, tint) {
  const glow = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.62);
  glow.addColorStop(0, `${tint}26`);
  glow.addColorStop(1, `${tint}00`);
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);
  // Швы между панелями рассеивателя — по длинной стороне, шаг ~2 знака
  g.fillStyle = 'rgba(0, 0, 0, 0.35)';
  const long = H >= W;
  const step = 264;
  for (let p = step; p < (long ? H : W) - 40; p += step) {
    if (long) g.fillRect(22, p, W - 44, 1.5);
    else g.fillRect(p, 22, 1.5, H - 44);
  }
  // Заклёпки крепления рамы по углам
  g.fillStyle = 'rgba(255, 255, 255, 0.35)';
  for (const [x, y] of [[13, 13], [W - 13, 13], [13, H - 13], [W - 13, H - 13]]) {
    g.beginPath();
    g.arc(x, y, 2.2, 0, Math.PI * 2);
    g.fill();
  }
}

/**
 * Вывеска города: вертикальная (татэгаки) или горизонтальная.
 * Стили — как у настоящих коробов: box — тёмное поле, светлые знаки и рамка
 * цвета; inverse — заливка цветом, белые знаки; neon — тёмное поле и знаки
 * трубкой цвета со свечением; tube — то же, плюс светящаяся рамка.
 * @param {string} text
 * @param {{ orient?: 'v' | 'h', style?: 'box' | 'inverse' | 'neon' | 'tube', accent?: string, caption?: string, raw?: boolean }} opts
 *   raw — текстура без пометки sRGB, для собственных ShaderMaterial
 */
export function signTexture(text, { orient = 'v', style = 'box', accent = INK.cyan, caption = '', raw = false } = {}) {
  const chars = [...text];
  const vertical = orient === 'v';
  const W = vertical ? 160 : 160 + chars.length * 132;
  const H = vertical ? 160 + chars.length * 132 : 220;
  const canvas = document.createElement('canvas');
  // Холст вдвое плотнее макета: на подлёте камеры знаки и рамки остаются
  // резкими. Рисуем в координатах макета — масштаб берёт на себя контекст
  canvas.width = W * RES;
  canvas.height = H * RES;
  const g = canvas.getContext('2d');
  g.scale(RES, RES);
  g.fillStyle = style === 'inverse' ? accent : '#06070a';
  g.fillRect(0, 0, W, H);
  if (style === 'box' || style === 'inverse') lightbox(g, W, H, style === 'inverse' ? '#ffffff' : accent);
  if (style === 'neon' || style === 'tube') backplate(g, W, H, accent);
  if (style === 'tube') {
    // Рамка-трубка: свечение цвета и светлая сердцевина — как у неоновых
    // коробов в переулках, где рамка горит вместе с надписью
    g.shadowColor = accent;
    g.shadowBlur = 22;
    g.strokeStyle = accent;
    g.lineWidth = 7;
    g.strokeRect(16, 16, W - 32, H - 32);
    g.shadowBlur = 0;
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.lineWidth = 2;
    g.strokeRect(16, 16, W - 32, H - 32);
    tubeClips(g, W, H);
  } else if (style !== 'neon') {
    g.strokeStyle = style === 'inverse' ? 'rgba(255,255,255,0.85)' : accent;
    g.lineWidth = 5;
    g.strokeRect(9, 9, W - 18, H - 18);
    g.lineWidth = 1.5;
    g.strokeRect(19, 19, W - 38, H - 38);
  }
  const size = 112;
  g.font = `700 ${size}px ${JP_FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const glowing = style === 'neon' || style === 'tube';
  const paint = () => {
    if (glowing) {
      // Неоновая трубка: широкое свечение цвета, затем светлая сердцевина
      g.shadowColor = accent;
      g.shadowBlur = 26;
      g.fillStyle = accent;
    } else {
      g.shadowBlur = 0;
      g.fillStyle = style === 'inverse' ? '#ffffff' : INK.white;
    }
  };
  const body = caption ? (vertical ? H - 64 : W) : (vertical ? H : W);
  chars.forEach((ch, i) => {
    const x = vertical ? W / 2 : 80 + 132 * (i + 0.5);
    const y = vertical ? 80 + 132 * (i + 0.5) - (caption ? 10 : 0) : H / 2 - (caption ? 14 : 0);
    g.save();
    g.translate(x, y);
    if (vertical && ROTATE_IN_VERTICAL.has(ch)) g.rotate(Math.PI / 2);
    paint();
    g.fillText(ch, 0, 0);
    if (glowing) {
      g.shadowBlur = 0;
      g.fillStyle = 'rgba(255,255,255,0.75)';
      g.font = `600 ${size * 0.96}px ${JP_FONT}`;
      g.fillText(ch, 0, 0);
      g.font = `700 ${size}px ${JP_FONT}`;
    }
    g.restore();
  });
  if (caption) {
    g.shadowBlur = 0;
    g.font = '600 18px ui-monospace, Menlo, monospace';
    g.fillStyle = style === 'inverse' ? 'rgba(255,255,255,0.85)' : INK.steel;
    g.fillText(caption, W / 2, vertical ? body + 22 : H - 30);
  }
  const texture = new THREE.CanvasTexture(canvas);
  if (!raw) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = ANISOTROPY;
  return { texture, aspect: W / H };
}

export const JP_FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans JP", Meiryo, sans-serif';

/** Номер главы по-японски: 第03章. */
export const chapterJp = n => `第${String(n).padStart(2, '0')}章`;

/**
 * Вертикальная вывеска (татэгаки): знаки сверху вниз в рамке, внизу —
 * мелкая латинская подпись. Возвращает текстуру с соотношением 1 : 4.
 * @param {string} text — японский текст, по знаку на строку
 * @param {{ accent?: string, caption?: string, inverse?: boolean }} opts
 *   inverse — светлый фон и тёмные знаки (как красная вывеска с белым)
 */
export function verticalSignTexture(text, { accent = INK.cyan, caption = '', inverse = false } = {}) {
  const chars = [...text];
  const W = 160;
  const H = 640;
  const canvas = document.createElement('canvas');
  canvas.width = W * RES;
  canvas.height = H * RES;
  const g = canvas.getContext('2d');
  g.scale(RES, RES);
  g.fillStyle = inverse ? accent : '#07080a';
  g.fillRect(0, 0, W, H);
  lightbox(g, W, H, inverse ? '#ffffff' : accent);
  // Рамка в два контура — как у световых коробов на фасадах
  g.strokeStyle = inverse ? 'rgba(255,255,255,0.85)' : accent;
  g.lineWidth = 4;
  g.strokeRect(8, 8, W - 16, H - 16);
  g.lineWidth = 1.5;
  g.strokeRect(16, 16, W - 32, H - 32);
  const area = H - (caption ? 120 : 64);
  const size = Math.min(104, area / chars.length * 0.86);
  g.font = `700 ${size}px ${JP_FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = inverse ? '#ffffff' : INK.white;
  const step = area / chars.length;
  chars.forEach((ch, i) => g.fillText(ch, W / 2, 32 + step * (i + 0.5)));
  if (caption) {
    g.font = '600 15px ui-monospace, Menlo, monospace';
    g.fillStyle = inverse ? 'rgba(255,255,255,0.8)' : INK.steel;
    g.fillText(caption, W / 2, H - 52);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = ANISOTROPY;
  return texture;
}

/**
 * Световой короб с вертикальной надписью: тонкий металлический корпус и
 * лицевая панель. Светится только лицо — корпус ловит отражения.
 * @returns {THREE.Group} высота h, лицо смотрит в +z
 */
export function buildSign(text, { width = 0.42, height = 1.68, accent, caption, inverse, intensity = 1 } = {}) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.06, height + 0.06, 0.08),
    new THREE.MeshPhysicalMaterial({ color: '#2a2e36', metalness: 0.9, roughness: 0.35, envMapIntensity: 1.1 }),
  );
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: verticalSignTexture(text, { accent, caption, inverse }), toneMapped: false }),
  );
  face.material.color.setScalar(intensity);
  face.position.z = 0.041;
  group.add(body, face);
  return group;
}
