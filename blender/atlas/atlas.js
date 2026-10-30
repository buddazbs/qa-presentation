// Атласы вывесок, рекламы и мониторов для build_city.py. Рисуются кодом
// исходной презентации — те же надписи, стили и шрифты, что у signal/:
//   вывески — signTexture из signal/signage.js (списки SIGNS / FAR_SIGNS из signal/city.js),
//   реклама — раскладка adTexture из signal/future.js (не экспортируется — перенесена сюда),
//   мониторы башни — интерфейс в тех же цветах и шрифтах.
// Японский текст только осмысленный, перевод — в комментарии у каждой надписи.
// Запуск: node atlas/bake.js (открывает эту страницу в headless Chrome).
import { INK, signTexture, JP_FONT } from '../../signal/signage.js';

const NC = { yellow: '#fcee0a', cyan: '#00f0ff', red: '#ff003c' };   // signal/future.js
const COND = '"DIN Condensed", "Avenir Next Condensed", "Arial Narrow", sans-serif';
const MONO = 'ui-monospace, Menlo, monospace';

// signal/city.js SIGNS + FAR_SIGNS
const VERTICAL = [
  { text: 'ラーメン', style: 'tube', accent: INK.aqua },                    // рамэн
  { text: '居酒屋', style: 'tube', accent: INK.magenta },                   // идзакая
  { text: 'カラオケ', style: 'tube', accent: INK.violet },                  // караоке
  { text: '焼鳥', style: 'tube', accent: INK.pink },                        // якитори
  { text: '寿司', style: 'tube', accent: INK.aqua },                        // суси
  { text: '喫茶', style: 'tube', accent: INK.pink },                        // кафе
  { text: '品質保証', style: 'tube', accent: INK.aqua, caption: 'QA' },     // обеспечение качества
  { text: '歌舞伎町', style: 'tube', accent: INK.magenta },                 // Кабукитё
  { text: '薬局', style: 'box', accent: INK.aqua },                         // аптека
  { text: '麻雀', style: 'tube', accent: INK.violet },                      // маджонг
  { text: '酒場', style: 'tube', accent: INK.magenta },                     // бар
  { text: '占い', style: 'tube', accent: INK.pink },                        // гадание
  { text: '決済通知', style: 'tube', accent: INK.magenta, caption: 'CALLBACK' }, // уведомление о платеже
  { text: 'モックサーバ', style: 'tube', accent: INK.violet, caption: 'MOCK' },  // мок-сервер
  { text: '中華料理', style: 'inverse', accent: INK.seal },                 // китайская кухня
  { text: '二十四時間', style: 'tube', accent: INK.pink },                  // круглосуточно
  { text: '古着', style: 'tube', accent: INK.aqua },                        // винтажная одежда
  { text: '試験環境', style: 'inverse', accent: INK.magenta, caption: 'TEST ENV' }, // тестовое окружение
  { text: '銭湯', style: 'tube', accent: INK.aqua },                        // баня
  { text: '本屋', style: 'tube', accent: INK.pink },                        // книжный
  { text: '新宿', style: 'tube', accent: INK.magenta },                     // Синдзюку
  { text: '信号幹線', style: 'tube', accent: INK.aqua },                    // сигнальная магистраль
  { text: '品質保証基盤', style: 'tube', accent: INK.violet },              // QA-платформа
  { text: '電気街', style: 'tube', accent: INK.aqua },                      // «электрический квартал»
  { text: '渋谷', style: 'tube', accent: INK.magenta },                     // Сибуя
];
// Горизонтальные: из списков signal/ и те же надписи в строку — над входами и на консолях
const HORIZONTAL = [
  { text: '営業中', style: 'tube', accent: INK.aqua },                      // открыто
  { text: 'ホテル', style: 'tube', accent: INK.violet },                    // отель
  { text: '東京', style: 'tube', accent: INK.pink },                        // Токио
  { text: '居酒屋', style: 'box', accent: INK.magenta },                    // идзакая
  { text: 'ラーメン', style: 'inverse', accent: INK.seal },                 // рамэн
  { text: '決済通知', style: 'tube', accent: INK.aqua, caption: 'CALLBACK' }, // уведомление о платеже
  { text: '品質保証', style: 'box', accent: INK.aqua, caption: 'QA' },      // обеспечение качества
  { text: '試験環境', style: 'tube', accent: INK.magenta, caption: 'TEST ENV' }, // тестовое окружение
  { text: '薬局', style: 'inverse', accent: INK.aqua },                     // аптека
  { text: '二十四時間', style: 'box', accent: INK.pink },                   // круглосуточно
  { text: 'カラオケ', style: 'tube', accent: INK.violet },                  // караоке
  { text: '監視中', style: 'tube', accent: INK.aqua, caption: 'MONITORING' }, // идёт мониторинг
];
// signal/future.js ADS + две из словаря signal/signage.js
const ADS = [
  { jp: '決済通知', en: 'CALLBACK  //  24/7', ink: NC.yellow, edge: NC.cyan },   // уведомление о платеже
  { jp: '模擬応答', en: 'MOCK RESPONSE', ink: NC.cyan, edge: NC.red },           // имитация ответа
  { jp: '試験中', en: 'TEST IN PROGRESS', ink: NC.cyan, edge: NC.yellow },       // идёт тестирование
  { jp: '信号幹線', en: 'SIGNAL TRUNK', ink: NC.yellow, edge: NC.red },          // сигнальная магистраль
  { jp: '品質', en: 'QA PLATFORM', ink: NC.red, edge: NC.yellow, tall: true },   // качество
  { jp: '信号', en: 'SIGNAL ONLINE', ink: NC.yellow, edge: NC.red, tall: true }, // сигнал
  { jp: '監視中', en: 'MONITORING', ink: NC.cyan, edge: NC.yellow, tall: true }, // идёт мониторинг
  { jp: '東京', en: 'TOKYO  //  QA', ink: NC.cyan, edge: NC.red, tall: true },   // Токио
];

const canvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });

/** Полки: знаки одной высоты слева направо, перенос по ширине атласа. */
function shelf(items, W, rowH, gap) {
  let x = gap, y = gap;
  const out = [];
  for (const it of items) {
    const w = Math.round(rowH * it.aspect);
    if (x + w + gap > W) { x = gap; y += rowH + gap; }
    out.push({ ...it, x, y, w, h: rowH });
    x += w + gap;
  }
  return { rects: out, H: y + rowH + gap };
}

function signAtlas(list, orient, W, rowH) {
  const items = list.map(s => {
    const { texture, aspect } = signTexture(s.text, { orient, style: s.style, accent: s.accent, caption: s.caption });
    return { ...s, img: texture.image, aspect };
  });
  const { rects, H } = shelf(items, W, rowH, 8);
  const size = 2 ** Math.ceil(Math.log2(H));
  const cv = canvas(W, size);
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, size);
  for (const r of rects) g.drawImage(r.img, r.x, r.y, r.w, r.h);
  return { cv, rects: rects.map(({ text, style, caption, x, y, w, h, aspect }) => ({ text, style, caption: caption || '', x, y, w, h, aspect })) };
}

/** Реклама — раскладка signal/future.js adTexture: развёртка, двойная рамка со срезом, метки, надпись, бегущая строка. */
function adCanvas({ jp, en, ink, edge, tall }) {
  const W = tall ? 384 : 1024;
  const H = tall ? 1024 : 448;
  const cv = canvas(W, H);
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  g.globalAlpha = 0.09; g.fillStyle = edge;
  for (let x = 24; x < W; x += 24) g.fillRect(x, 0, 1, H);
  for (let y = 24; y < H; y += 24) g.fillRect(0, y, W, 1);
  g.globalAlpha = 1;
  const cut = 48;
  const frame = (o, lw) => {
    g.lineWidth = lw;
    g.beginPath(); g.moveTo(cut + o, 8 + o); g.lineTo(W - 8 - o, 8 + o); g.lineTo(W - 8 - o, H - cut - o); g.lineTo(W - cut - o, H - 8 - o); g.lineTo(8 + o, H - 8 - o); g.lineTo(8 + o, cut + o); g.closePath(); g.stroke();
  };
  g.strokeStyle = edge; frame(0, 6);
  g.globalAlpha = 0.5; frame(14, 1.5); g.globalAlpha = 1;
  g.fillStyle = edge;
  for (let x = cut + 24; x < W - 170; x += 24) g.fillRect(x, 8, 1.5, x % 96 === 0 ? 14 : 7);
  g.lineWidth = 2;
  for (const [x, y, sx, sy] of [[34, 34, 1, 1], [W - 34, 34, -1, 1], [34, H - 34, 1, -1], [W - 34, H - 34, -1, -1]]) {
    g.beginPath(); g.moveTo(x, y + sy * 16); g.lineTo(x, y); g.lineTo(x + sx * 16, y); g.stroke();
  }
  for (let i = 0; i < 9; i++) g.fillRect(W - 150 + i * 14, 26, 6, 26);
  g.save(); g.beginPath(); g.rect(24, H - 70, 120, 40); g.clip();
  g.strokeStyle = ink; g.lineWidth = 6;
  for (let x = -40; x < 180; x += 16) { g.beginPath(); g.moveTo(24 + x, H - 30); g.lineTo(64 + x, H - 70); g.stroke(); }
  g.restore();
  g.font = `600 15px ${MONO}`; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillStyle = edge;
  g.fillText(`CH-${String(jp.codePointAt(0) % 97).padStart(2, '0')} // HOLO`, tall ? 30 : 64, tall ? 78 : 44);
  g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
  // Свечение надписи: экран в городе — светящийся, не печать
  g.shadowColor = ink; g.shadowBlur = 18;
  if (tall) {
    const n = [...jp].length;
    const size = n > 2 ? 170 : 210;
    g.font = `900 ${size}px ${JP_FONT}`;
    [...jp].forEach((ch, i) => g.fillText(ch, W / 2 - 14, 210 + i * (size + 20)));
    g.save(); g.translate(W - 46, H / 2); g.rotate(Math.PI / 2);
    g.font = `700 44px ${COND}`; g.fillStyle = edge; g.shadowColor = edge; g.fillText(en, 0, 0); g.restore();
  } else {
    g.font = `900 ${[...jp].length > 3 ? 170 : 190}px ${JP_FONT}`;
    g.fillText(jp, W / 2, H * 0.42);
    g.font = `700 64px ${COND}`; g.fillStyle = edge; g.shadowColor = edge;
    g.fillText(en, W / 2, H * 0.74);
  }
  g.shadowBlur = 0;
  const tk = tall ? { y: [0.075, 0.105], x: [24 / 384, 360 / 384] } : { y: [0.075, 0.15], x: [150 / 1024, 1000 / 1024] };
  const by = H * (1 - tk.y[1]), bh = H * (tk.y[1] - tk.y[0]);
  const bx = W * tk.x[0], bw = W * (tk.x[1] - tk.x[0]);
  g.fillStyle = '#000'; g.fillRect(bx, by, bw, bh);
  g.globalAlpha = 0.6; g.fillStyle = edge; g.fillRect(bx, by, bw, 1.5); g.globalAlpha = 1;
  g.save(); g.beginPath(); g.rect(bx, by, bw, bh); g.clip();
  g.font = `600 ${Math.round(bh * 0.62)}px ${COND}`; g.textAlign = 'left'; g.fillStyle = ink;
  const unit = `${en}  ·  ${jp}  ·  `;
  for (let x = 0; x < bw; x += g.measureText(unit).width) g.fillText(unit, bx + x, by + bh * 0.55);
  g.restore();
  return cv;
}

function adAtlas() {
  // 2048²: четыре широких (1024 × 448) столбиком слева, четыре высоких (384 × 1024) справа, 2 × 2
  const cv = canvas(2048, 2048);
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 2048, 2048);
  const rects = [];
  let wide = 0, tall = 0;
  for (const ad of ADS) {
    const x = ad.tall ? 1088 + (tall % 2) * 448 : 16;
    const y = ad.tall ? 16 + Math.floor(tall / 2) * 1040 : 16 + wide * 464;
    const c = adCanvas(ad);
    g.drawImage(c, x, y);
    rects.push({ text: ad.jp, caption: ad.en.replace(/\s+/g, ' '), tall: !!ad.tall, x, y, w: c.width, h: c.height, aspect: c.width / c.height });
    if (ad.tall) tall++; else wide++;
  }
  return { cv, rects };
}

/**
 * Мониторы башни: служебные экраны платформы — очередь колбэков, моки,
 * журнал запросов, график задержки. Текст читаемый, на английском и японском.
 */
const MONITORS = [
  {
    title: 'CALLBACK QUEUE', jp: '決済通知', accent: INK.cyan,       // уведомление о платеже
    rows: [['POST', '/callback/payment', '200', '24 ms'], ['POST', '/callback/refund', '200', '31 ms'], ['POST', '/callback/payout', '202', '18 ms'], ['POST', '/callback/payment', '500', 'RETRY 1'], ['POST', '/callback/payment', '200', '27 ms']],
    foot: 'DELIVERED 1 284  ·  RETRY 3  ·  FAILED 0',
  },
  {
    title: 'MOCK SERVER', jp: 'モックサーバ', accent: INK.violet,      // мок-сервер
    rows: [['GET', '/mock/pay/status', '200', 'STUB'], ['POST', '/mock/pay/notify', '201', 'STUB'], ['GET', '/mock/bank/ping', '204', 'STUB'], ['POST', '/mock/acq/auth', '200', 'DELAY'], ['GET', '/mock/fx/rates', '200', 'STUB']],
    foot: 'ROUTES 42  ·  SCENARIOS 7  ·  ACTIVE',
  },
  {
    title: 'SIGNAL TRUNK', jp: '信号幹線', accent: INK.aqua,          // сигнальная магистраль
    chart: [22, 26, 24, 31, 28, 25, 27, 41, 29, 24, 23, 26, 30, 27, 25, 24, 22, 28, 33, 26, 24, 25, 27, 23],
    foot: 'P50 25 ms  ·  P95 38 ms  ·  UPLINK OK',
  },
  {
    title: 'TEST ENV', jp: '試験環境', accent: INK.magenta,           // тестовое окружение
    rows: [['STAND', 'qa-01', 'UP', '99.9 %'], ['STAND', 'qa-02', 'UP', '99.7 %'], ['STAND', 'stage', 'UP', '99.9 %'], ['DB', 'market', 'SYNC', '0 lag'], ['DB', 'core', 'SYNC', '0 lag']],
    foot: 'ENVIRONMENTS 5  ·  ALL ONLINE',
  },
  {
    title: 'QA PLATFORM', jp: '品質保証基盤', accent: INK.cyan,        // QA-платформа
    big: ['13', 'CHAPTERS'], sub: ['CALLBACKS', 'MOCKS', 'SCRIPTS', 'HISTORY'],
    foot: 'TWR-00  ·  SLIDE SPIRE  ·  ONLINE',
  },
  {
    title: 'MONITORING', jp: '監視中', accent: NC.yellow,              // идёт мониторинг
    chart: [3, 4, 2, 5, 3, 2, 6, 4, 3, 2, 3, 5, 4, 3, 2, 4, 3, 2, 3, 4, 5, 3, 2, 3],
    foot: 'ERRORS / MIN  ·  ALERTS 0  ·  24/7',
  },
];

function monitorCanvas(m) {
  const W = 1024, H = 640;
  const cv = canvas(W, H);
  const g = cv.getContext('2d');
  g.fillStyle = '#04070a'; g.fillRect(0, 0, W, H);
  // Развёртка и сетка
  g.fillStyle = 'rgba(255,255,255,0.025)';
  for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
  g.strokeStyle = m.accent; g.lineWidth = 4; g.strokeRect(10, 10, W - 20, H - 20);
  g.globalAlpha = 0.4; g.lineWidth = 1.5; g.strokeRect(24, 24, W - 48, H - 48); g.globalAlpha = 1;
  // Шапка: название, японская подпись, индикатор
  g.fillStyle = m.accent; g.fillRect(24, 24, W - 48, 74);
  g.fillStyle = '#04070a';
  g.font = `700 46px ${COND}`; g.textBaseline = 'middle'; g.textAlign = 'left';
  g.fillText(m.title, 48, 64);
  g.textAlign = 'right'; g.font = `700 40px ${JP_FONT}`;
  g.fillText(m.jp, W - 48, 62);
  g.textAlign = 'left';
  const body = 130;
  if (m.rows) {
    g.font = `600 34px ${MONO}`;
    m.rows.forEach((r, i) => {
      const y = body + 30 + i * 70;
      g.fillStyle = 'rgba(255,255,255,0.04)'; if (i % 2 === 0) g.fillRect(36, y - 30, W - 72, 60);
      g.fillStyle = INK.steel; g.fillText(r[0], 52, y);
      g.fillStyle = INK.white; g.fillText(r[1], 170, y);
      const bad = /^5|RETRY/.test(r[2] + r[3]);
      g.fillStyle = bad ? INK.seal : m.accent; g.fillText(r[2], 690, y);
      g.fillStyle = bad ? INK.seal : INK.steel; g.fillText(r[3], 800, y);
    });
  } else if (m.chart) {
    const x0 = 60, x1 = W - 60, y0 = body + 20, y1 = H - 110;
    const max = Math.max(...m.chart) * 1.15;
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1;
    for (let k = 0; k <= 4; k++) { const y = y0 + (y1 - y0) * k / 4; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); }
    const bw = (x1 - x0) / m.chart.length;
    m.chart.forEach((v, i) => {
      const h = (y1 - y0) * v / max;
      g.fillStyle = i === m.chart.indexOf(Math.max(...m.chart)) ? INK.seal : m.accent;
      g.globalAlpha = 0.85; g.fillRect(x0 + i * bw + 4, y1 - h, bw - 8, h); g.globalAlpha = 1;
    });
  } else if (m.big) {
    g.fillStyle = m.accent; g.font = `700 260px ${COND}`; g.textBaseline = 'alphabetic';
    g.fillText(m.big[0], 60, body + 250);
    g.fillStyle = INK.white; g.font = `700 52px ${COND}`; g.fillText(m.big[1], 60, body + 320);
    g.font = `600 36px ${MONO}`;
    m.sub.forEach((s, i) => {
      const y = body + 60 + i * 76;
      g.fillStyle = m.accent; g.fillRect(560, y - 12, 14, 14);
      g.fillStyle = INK.white; g.fillText(s, 600, y + 2);
    });
    g.textBaseline = 'middle';
  }
  // Подвал: итоговая строка
  g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(24, H - 84, W - 48, 60);
  g.fillStyle = m.accent; g.font = `600 30px ${MONO}`; g.textBaseline = 'middle';
  g.fillText(m.foot, 48, H - 54);
  return cv;
}

function monitorAtlas() {
  const cv = canvas(2048, 2048);
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 2048, 2048);
  const rects = MONITORS.map((m, i) => {
    const x = (i % 2) * 1024, y = Math.floor(i / 2) * 672;
    g.drawImage(monitorCanvas(m), x, y);
    return { text: m.jp, caption: m.title, x, y, w: 1024, h: 640, aspect: 1024 / 640 };
  });
  return { cv, rects };
}

await document.fonts.ready;
const out = {};
for (const [name, a] of Object.entries({
  signs_v: signAtlas(VERTICAL, 'v', 2048, 640),
  signs_h: signAtlas(HORIZONTAL, 'h', 2048, 200),
  ads: adAtlas(),
  monitors: monitorAtlas(),
})) {
  out[name] = { png: a.cv.toDataURL('image/png'), width: a.cv.width, height: a.cv.height, rects: a.rects };
}
window.ATLASES = out;
document.title = 'atlases-ready';
