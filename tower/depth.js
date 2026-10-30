// Глубина внутри слайда: элементы карточки разнесены по планам.
//
//   0    — карточка и текст на ней: заголовки и абзацы не двигаются, их читают;
//   0,5  — панели (карточки, цифры, шлюзы, строки сравнения): приподняты над
//          листом, под ними мягкая тень;
//   0,7  — иллюстрации: висят выше панелей;
//   1    — иконки и значки — ближе всего к зрителю.
//
// Смещение планов — от того же облёта камеры, что двигает 3D-мир за
// карточкой (main.js, onDrift): камера сдвинулась вправо — ближние планы
// уходят влево, сильнее всего самые высокие. Своего сглаживания здесь нет:
// облёт уже сглажен, и планы идут с миром кадр в кадр — это один параллакс.
//
// Пишем свойство translate, а не transform: появление слайда (общий app.js,
// .reveal) уже анимирует transform, translate складывается с ним независимо.
// Значение ставится прямо на элемент — без CSS-переменной на родителе.
// Вложенный план (иконка в панели) смещается только на разницу глубин:
// остальное ему даёт родитель.
//
// Вход планов ведёт .reveal — своего здесь нет. На уходе карточки облёт
// гаснет, и планы вместе с ним возвращаются к нулю; стиль снимается, когда
// смещение стало незаметным. prefers-reduced-motion — без смещений, тени
// остаются.

const PLANES = [
  { depth: 0.5, sel: '.card, .stat, .gate, .entry, .versus, .pkg-history, .stats-note, .cage-facts li, .hero-news li, .pipe-steps li, .final-cta, .collection, .pain-facts li' },
  { depth: 0.7, sel: '.visual' },
  { depth: 1, sel: '.card-ico, .gate-ico, .final-badge, .secret-token, .step--hot, .ring-key' },
];
const PX = 16;        // смещение плана глубины 1 на единицу сдвига камеры, px
const REST = 0.05;    // смещение, ниже которого план считается на месте, px

/** Планы слайда: элемент и его глубина относительно ближайшего плана-предка. */
function collect(slide) {
  const items = [];
  const depthOf = new Map();
  for (const { depth, sel } of PLANES) for (const el of slide.querySelectorAll(sel)) depthOf.set(el, Math.max(depthOf.get(el) ?? 0, depth));
  for (const [el, depth] of depthOf) {
    let parent = el.parentElement;
    while (parent && parent !== slide && !depthOf.has(parent)) parent = parent.parentElement;
    const base = parent && parent !== slide ? depthOf.get(parent) : 0;
    const own = depth - base;
    if (own > 0.01) items.push({ el, depth: own, shown: '' });
  }
  return items;
}

/** @param {{ reduce: boolean }} opts */
export function createDepth({ reduce }) {
  const cache = new WeakMap();
  const live = new Set();   // слайды, чьи планы сейчас смещены: в фокусе и уходящие
  let focus = null;

  /** Снять смещения слайда — планы на месте, отдельные слои отпущены. */
  function rest(slide) {
    for (const it of cache.get(slide)) { it.el.style.translate = ''; it.el.style.willChange = ''; it.shown = ''; }
    live.delete(slide);
  }

  return {
    /** Карточка встала: её планы начинают следовать за облётом. */
    enter(slide) {
      if (reduce || !slide) return;
      if (!cache.has(slide)) cache.set(slide, collect(slide));
      // Каждый план — свой слой композитора: сдвиг не перерисовывает лист с
      // текстом. Карточка в этот момент стоит в своём масштабе, и слой
      // растрируется в нём — текст остаётся чётким
      if (!live.has(slide)) for (const it of cache.get(slide)) it.el.style.willChange = 'translate';
      focus = slide;
      live.add(slide);
    },
    /** Карточка уходит: планы доводит до нуля гаснущий облёт (update). */
    leave(slide) {
      if (focus === slide) focus = null;
    },
    /** Кадр: x, y — сдвиг камеры облёта в осях экрана (вправо, вверх), единицы мира. */
    update({ x, y }) {
      if (!live.size) return;
      const still = Math.hypot(x, y) * PX < REST;
      for (const slide of live) {
        // Уходящий слайд, облёт погас — смещения снимаются, стиль чистый
        if (slide !== focus && still) { rest(slide); continue; }
        for (const it of cache.get(slide)) {
          const v = `${(-x * PX * it.depth).toFixed(2)}px ${(y * PX * it.depth).toFixed(2)}px`;
          if (v !== it.shown) { it.el.style.translate = v; it.shown = v; }
        }
      }
    },
  };
}
