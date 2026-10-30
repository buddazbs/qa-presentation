// Заголовок главы слева: «японский код → глитч → русское название».
//
// Пока камера летит к карточке, слева собирается подпись главы:
//   0–180 мс    инициализация — под строкой вырастает тонкая линия;
//   150–560 мс  японский код главы собирается по знакам: каждый проявляется
//               сверху вниз четырьмя сегментами и встаёт на место из сдвига;
//   680–900 мс  глитч — код режется на три горизонтальных слоя, слои
//               разъезжаются с разделением каналов и гаснут;
//   720–1020 мс русское название проявляется слева направо из-под разрыва,
//               расхождение каналов сходится в ноль;
//   1020–1250   остаётся тонкая линия-маркер под названием.
// Палитра сборки — Night City: пока знаки собираются и режутся, они жёлтые
// с бирюзовой обводкой, каналы расходятся в красный и бирюзовый; собранное
// русское название остывает из жёлтого в обычный белый.
// Подпись остаётся там, где собралась, до следующей смены главы. На узком
// экране она лежит поверх карточки — там после сборки гаснет.
//
// Размер контейнера задаёт русское название — оно в потоке с первого кадра,
// а видимостью управляет clip-path. Японский слой и срезы лежат поверх
// абсолютно, поэтому ничего не прыгает. Двигаются только transform, opacity
// и clip-path; анимации — WAAPI, перебиваемые: новый запуск отменяет старый.

const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
const RGB = (x) => `${-x}px 0 rgba(255, 0, 60, 0.9), ${x}px 0 rgba(0, 240, 255, 0.9)`;
const YELLOW = '#fcee0a';
const CYAN = '#00f0ff';

/**
 * @param {HTMLElement} root — .chapter-title
 * @param {{ reduce: boolean, persist: () => boolean }} opts
 *   persist — оставлять ли подпись после сборки (false — погасить)
 */
export function createChapterTitle(root, { reduce, persist }) {
  root.innerHTML = /* html */ `
    <span class="ct__num"><span class="ct__count"></span><span class="ct__code" lang="ja"></span></span>
    <span class="ct__stage">
      <span class="ct__ru"></span>
      <span class="ct__jp" lang="ja"></span>
      <span class="ct__slice ct__slice--a" lang="ja"></span>
      <span class="ct__slice ct__slice--b" lang="ja"></span>
      <span class="ct__slice ct__slice--c" lang="ja"></span>
      <i class="ct__line"></i>
    </span>`;
  const count = root.querySelector('.ct__count');
  const code = root.querySelector('.ct__code');
  const ru = root.querySelector('.ct__ru');
  const jp = root.querySelector('.ct__jp');
  const slices = [...root.querySelectorAll('.ct__slice')];
  const line = root.querySelector('.ct__line');

  let running = [];
  let token = 0;
  const stop = () => { running.forEach(a => a.cancel()); running = []; };
  const run = (el, frames, opts) => {
    const a = el.animate(frames, { fill: 'both', ...opts });
    running.push(a);
    return a.finished.catch(() => {});
  };

  /** Сброс в исходную позицию слева, без переходов. */
  function reset() {
    stop();
    root.classList.remove('is-on', 'is-set');
    for (const el of [jp, ru, line, ...slices]) el.removeAttribute('style');
  }

  return {
    /**
     * Показать главу: номер, японский код и русское название.
     * @param {{ count: string, jp: string, ru: string }} t
     */
    play(t) {
      const id = ++token;
      reset();
      count.textContent = t.count;
      code.textContent = '';
      ru.textContent = t.ru;
      jp.replaceChildren(...[...t.jp].map(ch => Object.assign(document.createElement('span'), { textContent: ch })));
      slices.forEach(s => { s.textContent = t.jp; });
      root.classList.add('is-on');

      if (reduce) {
        // Без движения: название сразу, японский код — только меткой рядом с номером
        code.textContent = t.jp;
        for (const el of [jp, ...slices]) el.style.opacity = '0';
        ru.style.clipPath = 'none';
        root.classList.add('is-set');
        line.style.transform = 'scaleX(1)';
        return;
      }

      const chars = [...jp.children];
      // 1. Инициализация: линия под строкой
      run(line, [{ transform: 'scaleX(0)', opacity: 1 }, { transform: 'scaleX(1)', opacity: 1 }], { duration: 180, easing: EASE_OUT });
      // 2. Сборка японского кода: знак за знаком, сегментами сверху вниз
      run(jp, [{ opacity: 1 }, { opacity: 1 }], { duration: 1 });
      chars.forEach((ch, i) => {
        run(ch, [
          { clipPath: 'inset(0 0 100% 0)', transform: 'translateX(-10px)', opacity: 0.4 },
          { clipPath: 'inset(0 0 0 0)', transform: 'translateX(0)', opacity: 1 },
        ], { duration: 240, delay: 150 + i * 55, easing: 'steps(4, end)' });
      });
      // Последний знак встал — короткий проход яркости по коду
      run(jp, [{ filter: 'brightness(1)' }, { filter: 'brightness(1.8)' }, { filter: 'brightness(1)' }],
        { duration: 160, delay: 150 + chars.length * 55 + 120, easing: 'linear' });
      // 3. Глитч: код гаснет, три среза разъезжаются и исчезают
      const g = 680;
      run(jp, [{ opacity: 1 }, { opacity: 0 }], { duration: 40, delay: g, easing: 'linear' });
      const shifts = [[0, 9, -4, 14], [0, -7, 5, -12], [0, 5, -9, 8]];
      slices.forEach((s, k) => {
        run(s, [
          // До своего такта срез невидим: fill: both держит первый кадр
          { opacity: 0, transform: 'translateX(0)', textShadow: RGB(0) },
          { opacity: 1, transform: 'translateX(0)', textShadow: RGB(1), offset: 0.02 },
          { opacity: 1, transform: `translateX(${shifts[k][1]}px)`, textShadow: RGB(3), offset: 0.3 },
          { opacity: 0.8, transform: `translateX(${shifts[k][2]}px)`, textShadow: RGB(2), offset: 0.6 },
          { opacity: 0, transform: `translateX(${shifts[k][3]}px)`, textShadow: RGB(4) },
        ], { duration: 220, delay: g, easing: 'steps(6, end)' });
      });
      // Русское название — из-под разрыва жёлтым с бирюзовым кантом, каналы
      // сходятся, цвет остывает в белый
      run(ru, [
        { clipPath: 'inset(0 100% 0 0)', transform: 'translateX(6px)', textShadow: RGB(3), color: YELLOW, webkitTextStrokeColor: CYAN },
        { clipPath: 'inset(0 0 0 0)', transform: 'translateX(0)', textShadow: RGB(0), color: YELLOW, webkitTextStrokeColor: CYAN, offset: 0.55 },
        { clipPath: 'inset(0 0 0 0)', transform: 'translateX(0)', textShadow: RGB(0), color: '#ffffff', webkitTextStrokeColor: 'rgba(0, 240, 255, 0)' },
      ], { duration: 520, delay: g + 40, easing: EASE_OUT });
      // 4. Итог: японский код остаётся меткой у номера, линия — маркером
      const done = run(line, [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0.18)' }], { duration: 260, delay: g + 340, easing: EASE_OUT })
        .then(() => {
          if (id !== token) return;
          code.textContent = t.jp;
          root.classList.add('is-set');
          if (!persist()) root.classList.remove('is-on');
        });
      return done;
    },

    /** Спрятать (обзор, вступление). */
    hide() { ++token; reset(); },
  };
}
