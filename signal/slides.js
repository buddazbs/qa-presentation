// Слайды для signal.html: та же разметка из 3d.html, но под QA Platform.
//
// 3d.html остаётся прежней (как и её палитра — см. palette.js): здесь уже
// загруженные секции переписываются до того, как их увидит сцена и общий
// app.js. Callback Admin Tool вырос в QA Platform — к колбэкам переехали
// мок-стенды, — поэтому меняется бренд, глава «Честно» уходит, а глава
// «Моки» встаёт перед цифрами.

const BRAND = 'QA Platform';

/**
 * Японский код главы — короткий идентификатор раздела, с которого начинается
 * анимация заголовка (signal/title.js). Это не перевод названия, а рубрика,
 * как в оглавлении технической документации:
 */
const JP_CODE = {
  'Титул': '序章',             // пролог
  'Что это': '概要',           // обзор
  'Как было': '旧方式',        // прежний способ
  'Почему не Postman': '比較', // сравнение
  'Конвейер': '処理工程',      // этапы обработки
  'Песочница': '隔離実行',     // изолированное выполнение
  'QA Package': '版管理',      // управление версиями
  'Редактор': '編集',          // редактирование
  'Две базы': '読取専用',      // только чтение
  'Секреты': '機密',           // конфиденциально
  'Моки': 'モック統合',        // объединение моков
  'Цифры': '数値',             // показатели
  'Итог': '結論',              // вывод
};

/** Глава «Моки»: стенды — раздел платформы, а не россыпь сервисов. */
const MOCKS = /* html */ `
  <section class="slide slide--mocks" data-slide="Моки">
    <div class="wrap wrap--wide split">
      <div>
        <h2 class="reveal">Моки: один проект, а не россыпь сервисов</h2>
        <p class="lead reveal" data-d="120">
          Мок-стенды Adapter, Processor и Dynamic Mock Dev жили отдельно: свой
          адрес, своя авторизация, своя вкладка. Теперь это <b>раздел Mock
          внутри QA Platform</b> — рядом с колбэками, которые в эти моки и стучатся.
        </p>
        <ul class="cage-facts">
          <li class="reveal" data-d="200"><b>Один вход</b> — та же учётка и та же сессия, что и для колбэков</li>
          <li class="reveal" data-d="280"><b>Адреса и пароли стендов — только на сервере.</b> Браузер называет стенд, прокси <code>/api/mocks</code> подставляет хост, учётку и cookie</li>
          <li class="reveal" data-d="360"><b>Dynamic Mock Dev — по allowlist:</b> Basic-пароль уходит лишь на хосты из <code>MOCK_DEV_HOST_ALLOWLIST</code>; loopback и link-local закрыты</li>
          <li class="reveal" data-d="440"><b>Один запрос на стенд</b>, а не на каждый мок: <code>GET /api/mocks?ports=…</code>, стенд ждём не дольше 10 с</li>
        </ul>
      </div>
      <figure class="visual">
        <div class="visual-body">
          <div class="mockmap" id="mockMap" aria-hidden="true"></div>
        </div>
        <figcaption>четыре стенда → один раздел</figcaption>
      </figure>
    </div>
  </section>`;

/** Заменить текст узла, если он найден; разметку вокруг не трогаем. */
function setText(root, selector, text) {
  const el = root.querySelector(selector);
  if (el) el.textContent = text;
  return el;
}

/** Заменить «CAT» на имя платформы в текстовых узлах секции. */
function rebrandText(slide) {
  const walker = slide.ownerDocument.createTreeWalker(slide, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (/\bCAT\b/.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(/\bCAT\b/g, BRAND);
  }
}

/**
 * @param {HTMLElement[]} slides — секции из 3d.html, ещё не в документе
 * @returns {HTMLElement[]} новый порядок глав
 */
export function adaptSlides(slides) {
  const byName = name => slides.find(s => s.dataset.slide === name);

  // ── Титул: новое имя, подзаголовок и строка про моки в новостях ──
  const hero = byName('Титул');
  if (hero) {
    setText(hero, '.eyebrow', 'QA-платформа платёжного контура');
    const title = setText(hero, '#heroTitle', BRAND);
    title?.setAttribute('aria-label', BRAND);
    const sub = hero.querySelector('.hero-sub');
    if (sub) {
      sub.innerHTML = 'Начинали с замены коллекции Postman. Теперь колбэки, моки '
        + 'и общий код скриптов — <b>один сервис</b> для всей команды.';
    }
    const news = hero.querySelector('.hero-news');
    if (news) {
      const li = news.ownerDocument.createElement('li');
      li.className = 'reveal';
      li.dataset.d = '1200';
      li.innerHTML = '<b>Моки переехали к нам</b><span>Adapter, Processor и Dynamic Mock Dev — раздел Mock той же платформы</span>';
      news.prepend(li);
      // Новостей остаётся четыре: самая старая уступает место
      news.lastElementChild?.remove();
      [...news.children].forEach((item, i) => { item.dataset.d = String(1200 + i * 80); });
    }
  }

  // ── Итог: строка про моки в перечне ──
  const final = byName('Итог');
  const finalSub = final?.querySelector('.final-sub');
  if (finalSub) {
    finalSub.innerHTML = 'Поэтому платёжная система у нас — строка в базе,<br>'
      + 'подпись — скрипт в песочнице, общий код — пакет с версиями,<br>'
      + 'мок-стенды — раздел той же платформы, а история отправок — общая.';
  }

  slides.forEach(rebrandText);

  // ── Порядок: «Честно» уходит, «Моки» — перед цифрами ──
  const kept = slides.filter(s => s.dataset.slide !== 'Честно');
  const doc = new DOMParser().parseFromString(MOCKS, 'text/html');
  const mocks = document.adoptNode(doc.querySelector('.slide'));
  const at = kept.findIndex(s => s.dataset.slide === 'Цифры');
  kept.splice(at < 0 ? kept.length - 1 : at, 0, mocks);
  for (const s of kept) s.dataset.jp = JP_CODE[s.dataset.slide] || '';
  return kept;
}
