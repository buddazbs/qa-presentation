// Загрузочный экран — запуск системы. Прогресс настоящий: экран знает этапы
// старта и отмечает каждый, когда он действительно завершился. Процентов
// нет — есть этапы «3 / 5» и имя текущего.
//
// Порядок появления (всё — transform/opacity/stroke-dashoffset, без canvas):
//   1. проступает модульная сетка и рамка-метки по углам;
//   2. знак платформы прорисовывается контуром, слой за слоем;
//   3. сегменты кольца вокруг знака загораются по мере этапов;
//   4. на последнем этапе по контуру кольца один раз проходит свет,
//      экран гаснет и снимается из DOM.
// Ошибка этапа: сегмент краснеет, строка состояния говорит, что сломалось,
// и появляется «Повторить». prefers-reduced-motion — без прорисовки и
// прохода света, только смены прозрачности.

const SVG = 'http://www.w3.org/2000/svg';
// Знак Layers (Lucide, ISC) — тот же, что у логотипа в сцене и в сайдбаре
const LAYERS = [
  'M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z',
  'M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12',
  'M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17',
];
// Кольцо вокруг знака: скруглённый квадрат, как плитка логотипа
const RING = 'M30 6 H90 A24 24 0 0 1 114 30 V90 A24 24 0 0 1 90 114 H30 A24 24 0 0 1 6 90 V30 A24 24 0 0 1 30 6 Z';
const STATE_JP = { idle: '待機', busy: '処理中', done: '完了', fail: '失敗' };

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};
const svg = (tag, attrs) => {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};

/**
 * @param {HTMLElement} root — контейнер .boot из index.html
 * @param {Array<{ id: string, label: string, jp: string }>} steps — этапы по порядку
 * @param {{ reduce: boolean }} opts
 */
export function createLoader(root, steps, { reduce }) {
  const total = steps.length;
  const state = new Map(steps.map(s => [s.id, 'idle']));

  // ── Знак и кольцо ──
  const mark = root.querySelector('.boot__mark');
  const art = svg('svg', { viewBox: '0 0 120 120', 'aria-hidden': 'true' });
  art.append(svg('path', { d: RING, class: 'boot__track', pathLength: 100 }));
  const gap = 2;
  const segs = steps.map((_, i) => {
    const len = 100 / total;
    // Сегменты начинаются с верхнего края, по часовой
    const seg = svg('path', {
      d: RING, class: 'boot__seg', pathLength: 100,
      'stroke-dasharray': `${len - gap} ${100 - len + gap}`,
      'stroke-dashoffset': String(-(i * len + gap / 2)),
    });
    art.append(seg);
    return seg;
  });
  const sweep = svg('path', { d: RING, class: 'boot__sweep', pathLength: 100 });
  art.append(sweep);
  const glyph = svg('g', { class: 'boot__glyph', transform: 'translate(33 33) scale(2.25)' });
  LAYERS.forEach((d, i) => {
    const p = svg('path', { d, pathLength: 1 });
    p.style.setProperty('--i', i);
    glyph.append(p);
  });
  art.append(glyph);
  mark.append(art);

  // ── Журнал этапов ──
  const list = root.querySelector('.boot__steps');
  const rows = new Map(steps.map((s, i) => {
    const li = el('li', 'boot__step');
    li.dataset.state = 'idle';
    li.append(el('span', 'boot__num', String(i + 1).padStart(2, '0')), el('span', 'boot__label', s.label));
    const jp = el('span', 'boot__jp', s.jp);
    jp.lang = 'ja';
    const st = el('span', 'boot__state', STATE_JP.idle);
    st.lang = 'ja';
    li.append(jp, st);
    list.append(li);
    return [s.id, { li, st, seg: segs[i] }];
  }));
  const count = root.querySelector('.boot__count');
  const status = root.querySelector('.boot__status-text');
  const retry = root.querySelector('.boot__retry');
  retry.addEventListener('click', () => location.reload());

  function set(id, next, note) {
    const row = rows.get(id);
    if (!row) return;
    state.set(id, next);
    row.li.dataset.state = next;
    row.seg.dataset.state = next;
    row.st.textContent = STATE_JP[next];
    const done = [...state.values()].filter(v => v === 'done').length;
    count.textContent = `${done} / ${total}`;
    const step = steps.find(s => s.id === id);
    if (next === 'busy') status.textContent = `${step.label}…`;
    if (next === 'done' && note) status.textContent = note;
  }

  const shownAt = performance.now();
  requestAnimationFrame(() => root.classList.add('is-on'));
  count.textContent = `0 / ${total}`;

  return {
    /** Этап начался — строка состояния называет его. */
    start(id) { set(id, 'busy'); },
    /** Этап завершён; note — уточнение для строки состояния. */
    done(id, note) { set(id, 'done', note); },
    /** Этап упал: красный сегмент, причина, кнопка повтора. */
    fail(id, error) {
      set(id, 'fail');
      const step = steps.find(s => s.id === id);
      status.textContent = `Не удалось: ${step.label.toLowerCase()}. ${error?.message || error || ''}`.trim();
      root.classList.add('is-failed');
      retry.hidden = false;
      retry.focus();
    },
    /**
     * Все этапы готовы: проход света по кольцу и уход экрана. Промис
     * разрешается, когда экран уже не перекрывает сцену.
     */
    finish() {
      status.textContent = 'Система готова';
      root.classList.add('is-done');
      // Знак прорисовывается ~1,4 с; если всё загрузилось раньше, проход света
      // ждёт конца прорисовки, иначе экран мелькнул бы недорисованным
      const drawn = reduce ? 0 : Math.max(0, 1400 - (performance.now() - shownAt));
      const hold = reduce ? 0 : drawn + 900;
      return new Promise(resolve => {
        setTimeout(() => {
          root.classList.add('is-leaving');
          setTimeout(() => { root.remove(); }, reduce ? 300 : 600);
          resolve();
        }, hold);
      });
    },
  };
}
