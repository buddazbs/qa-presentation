/* ══════════════════════════════════════════════════════════════════
   Callback Admin Tool — 3D-версия: то, чего нет в app.js
   Точки, клавиши, появление, счётчики и анимации в панелях — общие
   с исходной презентацией (../app.js). Здесь — шина у левого края
   и ярлык сцены (как в stage.js), облако частиц и две 3D-панели.
   ══════════════════════════════════════════════════════════════════ */
import { mountScene } from './scene.js';
import { mountOrbit, mountVault } from './widgets.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

const slides = $$('.slide');

/* Пакеты на шине — настоящие сущности проекта, в том порядке,
   в каком они проходят через prepareCallbackRequest(). */
const PACKETS = [
  'request', 'vars', 'secrets', 'fillFromDb', 'market vars',
  'substitute', 'url', 'QuickJS', 'sign', 'SSRF check', 'POST', 'response', '200 OK',
];

// Ярлык сцены — по слайду, в порядке показа
const TAGS = [
  'система', 'назначение', 'разрыв', 'решение', 'конвейер', 'изоляция', 'общий код',
  'редактор', 'доступ', 'секреты', 'состояние', 'границы', 'отправка',
];

/* ─────────────────────── Шина и ярлык сцены ───────────────────────
   Как в stage.js: положение пакета — функция прокрутки, а не таймера,
   поэтому он не убегает при быстром скролле и не копит состояние. */
function track() {
  const bus = document.createElement('div');
  bus.className = 'bus';
  bus.setAttribute('aria-hidden', 'true');
  bus.innerHTML = '<div class="bus-rail"></div><div class="bus-live"></div>' +
    '<div class="bus-packet"><i></i><span></span></div>';

  const tag = document.createElement('div');
  tag.className = 'scene-tag';
  tag.setAttribute('aria-hidden', 'true');
  tag.innerHTML = '<i></i><b></b><span></span>';

  document.body.append(bus, tag);
  const packet = $('.bus-packet', bus), label = $('span', packet);
  const total = String(slides.length).padStart(2, '0');

  let active = -1, queued = false;
  const sync = () => {
    queued = false;
    const doc = document.documentElement;
    const max = doc.scrollHeight - innerHeight;
    const run = max > 0 ? clamp(scrollY / max, 0, 1) : 0;
    doc.style.setProperty('--run', run.toFixed(4));

    const span = 1 / PACKETS.length;
    const idx = clamp(Math.floor(run / span), 0, PACKETS.length - 1);
    const local = (run - idx * span) / span;
    label.textContent = PACKETS[idx];
    packet.style.top = `${lerp(8, 92, local)}%`;
    // Притухает у краёв отрезка — пакет «входит» и «выходит» из узла
    packet.style.opacity = String(0.3 + Math.sin(local * Math.PI) * 0.6);

    const mid = scrollY + innerHeight / 2;
    let i = 0, best = Infinity;
    slides.forEach((s, n) => {
      const d = Math.abs(s.offsetTop + s.offsetHeight / 2 - mid);
      if (d < best) { best = d; i = n; }
    });
    if (i === active) return;
    active = i;
    $('b', tag).textContent = TAGS[i] ?? '';
    $('span', tag).textContent = `${String(i + 1).padStart(2, '0')} / ${total}`;
    // На слайде «Как было» связь рвётся буквально
    bus.classList.toggle('is-broken', slides[i].dataset.mood === 'loose');
  };
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(sync);
  };
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', queue, { passive: true });
  sync();
  tag.classList.add('on');
}

track();
mountScene($('#scene'), slides);
mountOrbit($('#orbitStage'));
mountVault($('#vaultStage'));
