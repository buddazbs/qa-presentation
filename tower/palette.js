// Палитра слайдов для index.html (Tower): графит, сталь, белый, один неоновый
// акцент (циан) и красный печати.
//
// Слайды берут стили из общих styles.css и 3d/deck.css, и там цвета не только
// в переменных: акценты вписаны и литералами (rgba(56, 232, 255, …) в тенях,
// рамках, градиентах). Файлы не трогаем — 3d.html должна остаться прежней, — а
// переписываем уже загруженные правила в этой странице: браузер отдаёт любой
// цвет из CSSOM как rgb(r, g, b) / rgba(r, g, b, a), поэтому достаточно
// заменить тройки каналов.
//
// Пять акцентов 3d.html сводятся к двум. Смысл цвета сохраняется: «можно» —
// циан, «нельзя» — красный, предупреждение — приглушённая латунь, второй
// акцент (фиолетовый) уходит в сталь. Тёмно-синие подложки — в графит.

const SWAP = {
  '56, 232, 255': '47, 216, 255',   // --cyan    → акцент
  '139, 108, 255': '154, 161, 173', // --violet  → сталь
  '255, 77, 157': '229, 50, 59',    // --magenta → красный печати
  '107, 255, 176': '47, 216, 255',  // --lime    → акцент: «пропущено» = «разрешено»
  '255, 200, 87': '196, 165, 116',  // --amber   → латунь
  '255, 92, 110': '229, 50, 59',    // --red     → красный печати
  '140, 160, 220': '154, 161, 173', // --line    → линии и рамки — сталь
  '200, 215, 255': '214, 219, 226',
  // Тёмно-синие подложки панелей → графит той же яркости
  '5, 7, 14': '8, 9, 11',
  '4, 8, 20': '8, 9, 12',
  '6, 10, 24': '10, 11, 14',
  '8, 12, 26': '12, 13, 16',
  '8, 14, 32': '13, 14, 18',
  '8, 16, 36': '14, 15, 19',
  '10, 15, 32': '14, 15, 19',
  '12, 17, 36': '17, 18, 22',
  '18, 24, 48': '24, 26, 31',
};
// Пользовательские свойства браузер не нормализует — их значения как в файле
const SWAP_HEX = {
  '#38e8ff': '#2fd8ff', '#8b6cff': '#9aa1ad', '#ff4d9d': '#e5323b', '#6bffb0': '#2fd8ff', '#ffc857': '#c4a574', '#ff5c6e': '#e5323b',
  '#05070e': '#08090b', '#0b1022': '#111317', '#e8edff': '#eceef2', '#8e9ab8': '#9aa1ad', '#5a6480': '#626875',
};

/** Та же палитра для WebGL-виджетов слайдов (mountOrbit / mountVault). */
export const WIDGET_PALETTE = { cyan: '#2fd8ff', violet: '#9aa1ad', magenta: '#e5323b', lime: '#2fd8ff', amber: '#c4a574', red: '#e5323b' };

const pattern = new RegExp(Object.keys(SWAP).map(k => `\\b${k.replace(/ /g, '\\s*')}\\b`).join('|'), 'g');
const hexPattern = new RegExp(Object.keys(SWAP_HEX).join('|'), 'gi');

function recolor(style) {
  for (let i = 0; i < style.length; i++) {
    const prop = style[i];
    const value = style.getPropertyValue(prop);
    const next = value
      .replace(pattern, m => SWAP[m.replace(/\s+/g, ' ').replace(/,(?! )/g, ', ')])
      .replace(hexPattern, m => SWAP_HEX[m.toLowerCase()]);
    if (next !== value) style.setProperty(prop, next, style.getPropertyPriority(prop));
  }
}

function walk(rules) {
  for (const rule of rules) {
    if (rule.style) recolor(rule.style);       // обычные правила и кадры @keyframes
    if (rule.cssRules) walk(rule.cssRules);    // @media, @supports, @keyframes
  }
}

/** Перекрасить стили слайдов (styles.css и 3d/deck.css) в этой странице. */
export function applyPalette() {
  for (const sheet of document.styleSheets) {
    if (!/\/(styles|deck)\.css$/.test(sheet.href || '')) continue;
    walk(sheet.cssRules);
  }
}
