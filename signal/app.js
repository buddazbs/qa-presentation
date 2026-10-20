// Связка страницы и сцены. Слайды не дублируются: они берутся из 3d.html
// как есть и становятся карточками на спирали. Их анимации — из общего
// ../app.js (в режиме data-deck="external": навигацию ведём мы, а он лишь
// оживляет слайд, когда камера до него доехала).
//
// Прокрутки страницы нет: пробел, стрелки, колесо, свайп и меню двигают
// камеру на одну карточку, и карточка встаёт по центру экрана.

import { mountSignal } from './main.js';
import { mountOrbit, mountVault } from '../3d/widgets.js';
import { applyPalette, WIDGET_PALETTE } from './palette.js';
import { createLoader } from './loader.js';
import { adaptSlides } from './slides.js';
import { mountMocks } from './mocks.js';
import { createChapterTitle } from './title.js';

const root = document.documentElement;
const menuList = document.getElementById('menuList');
const counterNum = document.getElementById('counterNum');

/** Слайды из 3d.html — единственный источник разметки глав; под QA Platform их правит slides.js. */
async function loadSlides() {
  const res = await fetch('3d.html');
  if (!res.ok) throw new Error(`3d.html: HTTP ${res.status}`);
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return adaptSlides([...doc.querySelectorAll('#deck > .slide')].map(s => document.adoptNode(s)));
}

// ── Печать подписи: знаки встают слева направо за курсором-блоком, как в
// терминале. Без шума и подмены букв — текст читается с первого кадра ──
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
function typeOn(el, text, duration = 420) {
  if (reduce) { el.textContent = text; return; }
  const start = performance.now();
  const id = (el.typeId = (el.typeId ?? 0) + 1);
  const tick = now => {
    if (el.typeId !== id) return;   // новый запуск перебил старый
    const p = Math.min(1, (now - start) / duration);
    const shown = Math.ceil(p * text.length);
    el.textContent = p < 1 ? text.slice(0, shown) + '▍' : text;
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Общий движок анимаций слайдов — классический скрипт, грузим после разметки. */
function loadDeckRuntime() {
  return new Promise((resolve, reject) => {
    const script = Object.assign(document.createElement('script'), { src: 'app.js' });
    script.onload = resolve;
    script.onerror = reject;
    document.body.append(script);
  });
}

// ── Запуск: этапы отмечаются по факту, ошибка этапа останавливает запуск ──
const boot = createLoader(document.getElementById('boot'), [
  { id: 'fonts', label: 'Шрифты', jp: '書体' },
  { id: 'slides', label: 'Главы презентации', jp: '章構成' },
  { id: 'scene', label: 'Трёхмерная сцена', jp: '描画' },
  { id: 'runtime', label: 'Анимации слайдов', jp: '演出' },
  { id: 'widgets', label: 'Виджеты слайдов', jp: '部品' },
], { reduce });

/** Этап запуска: отметить начало, выполнить, отметить итог; упал — дальше не идём. */
async function stage(id, run) {
  boot.start(id);
  try {
    const note = await run();
    boot.done(id, typeof note === 'string' ? note : undefined);
  } catch (error) {
    console.error(`[signal] boot stage "${id}" failed`, error);
    boot.fail(id, error);
    throw error;
  }
}

await stage('fonts', () => document.fonts.ready);
// Слайды — в палитре signal: правим уже загруженные стили этой страницы, 3d.html не затронута
applyPalette();
const slides = [];
await stage('slides', async () => { slides.push(...await loadSlides()); });

// Глава «Моки» анимируется здесь: общий app.js о ней не знает
const mocks = mountMocks(slides.find(s => s.classList.contains('slide--mocks'))?.querySelector('#mockMap'));
const frameChapter = document.getElementById('frameChapter');
// Заголовок главы слева (signal/title.js)
let chapterTitle = null;

let scene = null;
await stage('scene', () => {
  try {
    scene = mountSignal(document.getElementById('scene'), document.getElementById('cards'), slides, {
      onSettle: i => {
        if (i < 0) return;
        window.deck?.enter(slides[i]);
        if (slides[i].classList.contains('slide--mocks')) mocks.enter();
        const tag = slides[i].closest('.card3d')?.querySelector('.hud__tag');
        if (tag) typeOn(tag, tag.textContent, 320);
      },
      onLeave: i => {
        if (i < 0) return;
        window.deck?.leave(slides[i]);
        if (slides[i].classList.contains('slide--mocks')) mocks.leave();
      },
    });
  } catch (error) {
    // Без WebGL — слайды обычной лентой, как в 3d.html. Это не ошибка запуска
    console.warn('[signal] WebGL is unavailable, showing slides as a list', error);
    root.classList.add('no-webgl');
    document.getElementById('cards').append(...slides);
    return 'WebGL недоступен — главы показаны списком';
  }
});
await stage('runtime', loadDeckRuntime);
await stage('widgets', () => {
  // Виджеты слайдов — в той же палитре, что и стили (signal/palette.js)
  mountOrbit(document.getElementById('orbitStage'), WIDGET_PALETTE);
  // Ядро орбиты в 3d.html подписано старым именем — здесь платформа
  const core = document.querySelector('#orbitStage .gl-tag--core b');
  if (core) core.textContent = 'QA';
  mountVault(document.getElementById('vaultStage'), WIDGET_PALETTE);
});
boot.finish().then(() => { root.classList.add('is-ready'); scene?.reveal(); });

if (scene) {
  const total = scene.count;
  document.querySelector('.counter__total').textContent = ` / ${String(total).padStart(2, '0')}`;

  // ── Меню: названия слайдов из data-slide ──
  const menuItems = slides.map((s, i) => {
    const li = document.createElement('li');
    li.innerHTML = '<button type="button"><span class="menu__arrow" aria-hidden="true">→</span></button>';
    li.querySelector('button').append(s.dataset.slide || String(i + 1));
    li.querySelector('button').addEventListener('click', () => go(i));
    menuList.append(li);
    return li;
  });

  // Подпись главы: пока камера летит, слева собирается японский код главы
  // и сменяется русским названием, и остаётся на месте (signal/title.js).
  // Запуск — только при смене главы в go()
  const headings = slides.map(s => (s.querySelector('h2:not(.final-title), h1')?.textContent || s.dataset.slide || '').replace(/\s+/g, ' ').trim());
  const narrow = matchMedia('(max-width: 720px)');
  chapterTitle = createChapterTitle(document.getElementById('chapterTitle'), { reduce, persist: () => !narrow.matches });
  function showTitle(i) {
    if (i < 0 || overview) { chapterTitle.hide(); return; }
    chapterTitle.play({
      count: `${String(i + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`,
      jp: slides[i].dataset.jp || '',
      ru: headings[i],
    });
  }

  // Обзор: камера отъезжает и показывает спираль глав целиком
  let overview = false;
  function setOverview(on) {
    if (on === overview) return;
    overview = on;
    scene.setOverview(on);
    root.classList.toggle('is-overview', on);
    chapterTitle.hide();
  }
  document.getElementById('cards').addEventListener('click', e => {
    if (!overview) return;
    const card = e.target.closest('.card3d');
    if (!card) return;
    e.preventDefault();
    setOverview(false);
    go(slides.indexOf(card.querySelector('.slide')));
  });

  // Переключатель и шкала: имя главы проявляется из шума, ползунок едет
  const switchName = document.getElementById('switchName');
  const switchPrev = document.getElementById('switchPrev');
  const switchNext = document.getElementById('switchNext');
  const railThumb = document.getElementById('railThumb');
  switchPrev.addEventListener('click', () => go(current - 1));
  switchNext.addEventListener('click', () => go(current + 1));
  function syncInstruments(i) {
    if (i < 0) return;
    typeOn(switchName, `${String(i + 1).padStart(2, '0')} — ${slides[i].dataset.slide || ''}`, 320);
    switchPrev.disabled = i <= 0;
    switchNext.disabled = i >= total - 1;
    // Ползунок — 12% высоты шкалы; 100% его хода = (100/12 − 1)·100% от себя
    railThumb.style.setProperty('--rail', `${(i / Math.max(1, total - 1)) * (100 / 12 - 1) * 100}%`);
  }

  let current = -2;
  function go(i) {
    const next = Math.max(-1, Math.min(total - 1, i));
    scene.setTarget(next);
    if (next === current) return;
    current = next;
    showTitle(next);
    syncInstruments(next);
    // В вертикальной строке номер главы стоит поперёк (татэ-тю-ёко), а не набок
    if (next < 0) frameChapter.textContent = '序章';
    else frameChapter.replaceChildren('第', Object.assign(document.createElement('b'), { textContent: String(next + 1).padStart(2, '0') }), '章');
    counterNum.textContent = String(next + 1).padStart(2, '0');
    menuItems.forEach((li, n) => li.toggleAttribute('data-active', n === next));
    root.classList.toggle('in-chapters', next >= 0);
  }
  go(-1);
  document.getElementById('toStart').addEventListener('click', e => { e.preventDefault(); go(-1); });

  addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const step = { ArrowDown: 1, ArrowRight: 1, PageDown: 1, ' ': e.shiftKey ? -1 : 1, ArrowUp: -1, ArrowLeft: -1, PageUp: -1 }[e.key];
    if (e.key === 'Escape' && overview) { e.preventDefault(); setOverview(false); return; }
    if ((e.key === 'Enter' && overview)) { e.preventDefault(); setOverview(false); return; }
    if (e.key === 'o' || e.key === 'O' || e.key === 'щ' || e.key === 'Щ') { e.preventDefault(); if (current < 0) go(0); setOverview(!overview); return; }
    if (step) { e.preventDefault(); go(current + step); }
    else if (e.key === 'Home') { e.preventDefault(); go(-1); }
    else if (e.key === 'End') { e.preventDefault(); go(total - 1); }
  });

  // ── Колесо: один жест — одна карточка. Если карточка сама прокручивается
  // в эту сторону (длинный слайд на низком экране), колесо отдаём ей ──
  let wheelLock = 0;
  let wheelSum = 0;
  addEventListener('wheel', e => {
    const card = e.target.closest?.('.card3d.is-focus')?.querySelector('.card3d__scroll');
    if (card) {
      const room = e.deltaY > 0 ? card.scrollHeight - card.clientHeight - card.scrollTop : card.scrollTop;
      if (room > 1) return;
    }
    e.preventDefault();
    const now = performance.now();
    if (now < wheelLock) return;
    wheelSum += e.deltaY;
    if (Math.abs(wheelSum) < 40) return;
    go(current + Math.sign(wheelSum));
    wheelSum = 0;
    wheelLock = now + 700;
  }, { passive: false });

  // ── Свайп: как с колесом — пока длинный слайд прокручивается, листает он ──
  let touchY = null;
  let touchCard = null;
  let touchScroll = 0;
  addEventListener('touchstart', e => {
    touchY = e.touches[0].clientY;
    touchCard = e.target.closest?.('.card3d.is-focus')?.querySelector('.card3d__scroll') ?? null;
    touchScroll = touchCard?.scrollTop ?? 0;
  }, { passive: true });
  addEventListener('touchend', e => {
    if (touchY === null) return;
    const dy = touchY - e.changedTouches[0].clientY;
    touchY = null;
    if (Math.abs(dy) < 60) return;
    if (touchCard) {
      const room = dy > 0 ? touchCard.scrollHeight - touchCard.clientHeight - touchCard.scrollTop : touchCard.scrollTop;
      if (touchCard.scrollTop !== touchScroll || room > 1) return;
    }
    go(current + Math.sign(dy));
  }, { passive: true });
}
