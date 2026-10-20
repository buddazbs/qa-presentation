/* ══════════════════════════════════════════════════════════════════
   Callback Admin Tool — презентация
   Ванильный JS, без зависимостей. Всё, что здесь оживает, объявлено
   в classic.html: #dots, #heroTitle, #collapseStage, #pipePath,
   #cage, #pkgVersions, #ide, #dbstage, #secretStage, .num[data-count],
   .reveal[data-d].
   Фон, кубик, рука и переходы между слайдами живут в stage.js.
   ══════════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const CALM = matchMedia('(prefers-reduced-motion: reduce)');
  const calm = () => CALM.matches;

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const rand  = (a, b) => a + Math.random() * (b - a);
  // easeOutExpo — быстрый старт, долгое «доезжание» до значения
  const easeOut = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

  const slides = $$('.slide');
  const EXTERNAL = document.documentElement.dataset.deck === 'external';

  /* ═════════════════════ 2. Хром: точки, прогресс ═════════════════════ */

  const bar = $('#progressBar');
  let dotButtons = [];

  function chrome() {
    const nav = $('#dots');
    if (nav) {
      dotButtons = slides.map((s, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.label = s.dataset.slide || String(i + 1);
        b.setAttribute('aria-label', `Слайд ${i + 1}: ${b.dataset.label}`);
        b.addEventListener('click', () => goTo(i));
        nav.appendChild(b);
        return b;
      });
    }

    const hint = $('#hint');
    if (hint) {
      const hide = () => {
        if (scrollY > 60) {
          hint.classList.add('gone');
          removeEventListener('scroll', hide);
        }
      };
      addEventListener('scroll', hide, { passive: true });
    }

    let queued = false;
    const sync = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        const max = document.documentElement.scrollHeight - innerHeight;
        if (bar) bar.style.width = `${max > 0 ? (scrollY / max) * 100 : 0}%`;
        const i = nearestSlide();
        dotButtons.forEach((b, n) => b.classList.toggle('on', n === i));
      });
    };
    addEventListener('scroll', sync, { passive: true });
    addEventListener('resize', sync, { passive: true });
    sync();
  }

  function nearestSlide() {
    const mid = scrollY + innerHeight / 2;
    let best = 0, bestD = Infinity;
    slides.forEach((s, i) => {
      const c = s.offsetTop + s.offsetHeight / 2;
      const d = Math.abs(c - mid);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  function goTo(i) {
    const s = slides[clamp(i, 0, slides.length - 1)];
    if (s) s.scrollIntoView({ behavior: calm() ? 'auto' : 'smooth', block: 'start' });
  }

  function keys() {
    addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const cur = nearestSlide();
      switch (e.key) {
        case 'ArrowDown': case 'ArrowRight': case 'PageDown': case ' ':
          e.preventDefault(); goTo(cur + 1); break;
        case 'ArrowUp': case 'ArrowLeft': case 'PageUp':
          e.preventDefault(); goTo(cur - 1); break;
        case 'Home':
          e.preventDefault(); goTo(0); break;
        case 'End':
          e.preventDefault(); goTo(slides.length - 1); break;
        default:
          if (/^[1-9]$/.test(e.key)) { e.preventDefault(); goTo(Number(e.key) - 1); }
      }
    });

    // Свайп по вертикали на тач-устройствах
    let y0 = null;
    addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; }, { passive: true });
    addEventListener('touchend', (e) => {
      if (y0 === null) return;
      const dy = y0 - e.changedTouches[0].clientY;
      y0 = null;
      if (Math.abs(dy) < 70) return;
      goTo(nearestSlide() + (dy > 0 ? 1 : -1));
    }, { passive: true });
  }

  /* ═════════════════════ 3. Появление содержимого ═════════════════════ */

  function reveals() {
    // data-d — задержка в мс, объявленная в разметке
    $$('.reveal[data-d]').forEach((el) => {
      el.style.transitionDelay = `${Number(el.dataset.d) || 0}ms`;
    });

    // Внешний режим (index.html): слайды — карточки в 3D-сцене, прокрутки нет.
    // Какой слайд «живой», решает сцена — когда камера доехала до карточки.
    if (EXTERNAL) {
      window.deck = {
        enter(s) { if (!s.classList.contains('live')) { s.classList.add('live'); onSlideEnter(s); } },
        leave(s) { if (s.classList.contains('live')) { s.classList.remove('live'); onSlideLeave(s); } },
      };
      return;
    }

    const enter = new Set();
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        const s = en.target;
        if (en.intersectionRatio >= 0.28) {
          if (!s.classList.contains('live')) {
            s.classList.add('live');
            onSlideEnter(s);
          }
          enter.add(s);
        } else if (en.intersectionRatio < 0.04 && enter.has(s)) {
          // Уводим слайд в исходное состояние, чтобы анимация шла и на обратном ходу
          s.classList.remove('live');
          enter.delete(s);
          onSlideLeave(s);
        }
      }
    }, { threshold: [0, 0.04, 0.28, 0.6] });

    slides.forEach((s) => io.observe(s));
  }

  const onEnter = [];
  const onLeave = [];
  const onSlideEnter = (s) => onEnter.forEach((f) => f(s));
  const onSlideLeave = (s) => onLeave.forEach((f) => f(s));

  /* ═════════════════════ 4. Титул: по буквам ═════════════════════ */

  function heroTitle() {
    const h = $('#heroTitle');
    if (!h) return;
    const text = h.textContent.trim();
    h.textContent = '';
    [...text].forEach((ch, i) => {
      const span = document.createElement('span');
      span.className = ch === ' ' ? 'ch ch--space' : 'ch';
      span.textContent = ch === ' ' ? ' ' : ch;
      span.style.setProperty('--d', `${120 + i * 42}ms`);
      h.appendChild(span);
    });
  }

  /* ═════════════════════ 5. Счётчики ═════════════════════ */

  const fmt = (n) => (n >= 1000 ? n.toLocaleString('ru-RU').replace(/ /g, ' ') : String(n));

  function counters() {
    const run = (el) => {
      const target = Number(el.dataset.count);
      if (!Number.isFinite(target)) return;
      if (calm()) { el.textContent = fmt(target); return; }
      const dur = 1500 + Math.min(target, 12000) / 12;
      const t0 = performance.now();
      const tick = (now) => {
        const p = clamp((now - t0) / dur, 0, 1);
        el.textContent = fmt(Math.round(target * easeOut(p)));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    onEnter.push((s) => $$('.num[data-count]', s).forEach(run));
    onLeave.push((s) => $$('.num[data-count]', s).forEach((el) => { el.textContent = '0'; }));
  }

  /* ═════════════════ 6. Куча коллекций → одна база ═════════════════ */

  function collapse() {
    const stage = $('#collapseStage');
    const target = $('#collapseTarget');
    if (!stage || !target) return;

    /* Четыре экспорта одной и той же коллекции — так они и расходились.
       Число запросов внутри — иллюстрация, а не замер: импортёр и файл
       коллекции удалены 15 сентября, считать уже нечего. Поэтому ни одна
       подпись на слайде это число не называет. */
    const GROUPS = [
      { name: 'collection.json', n: 12 },
      { name: 'collection (2).json', n: 9 },
      { name: 'callbacks_final.json', n: 14 },
      { name: 'callbacks_final_v2.json', n: 11 },
    ];
    const CHIP_W = 46, CHIP_H = 30;
    const GAP = 7;           // между запросами внутри коллекции
    const PAD = 11;          // отбивка рамки коллекции
    const NAME_H = 22;       // строка с именем файла

    const chips = [];        // { el, group }
    const boxes = [];        // рамки коллекций
    const names = [];        // подписи под рамками

    GROUPS.forEach((g, gi) => {
      const box = document.createElement('div');
      box.className = 'collection';
      stage.insertBefore(box, target);
      boxes.push(box);

      for (let i = 0; i < g.n; i++) {
        const c = document.createElement('div');
        c.className = 'chip';
        stage.insertBefore(c, target);
        chips.push({ el: c, group: gi });
      }

      const nm = document.createElement('div');
      nm.className = 'collection-name';
      nm.textContent = g.name;
      stage.insertBefore(nm, target);
      names.push(nm);
    });

    /* Раскладка: коллекции стоят решёткой, внутри каждой — свои запросы.
       Число колонок и высота сцены считаются от ширины, а не задаются
       константой: иначе на узком экране четыре коллекции в ряд не влезают,
       а высокие блоки вылезают за фиксированные 290px. */
    function layout() {
      const W = stage.clientWidth || 800;
      // Только 4, 2 или 1 в ряд: при трёх последняя коллекция висит одна
      const fit = clamp(Math.floor(W / 190), 1, GROUPS.length);
      const gcols = fit >= 4 ? 4 : fit >= 2 ? 2 : 1;
      const grows = Math.ceil(GROUPS.length / gcols);
      const colW = W / gcols;
      const cols = clamp(Math.floor((colW - 2 * PAD) / (CHIP_W + GAP)), 2, 3);

      // Ряд коллекций высок настолько, насколько высока самая большая в нём
      const rowH = [];
      GROUPS.forEach((g, gi) => {
        const gr = Math.floor(gi / gcols);
        const h = Math.ceil(g.n / cols) * (CHIP_H + GAP) - GAP + 2 * PAD + NAME_H;
        rowH[gr] = Math.max(rowH[gr] || 0, h);
      });
      const rowTop = [];
      rowH.reduce((acc, h, i) => { rowTop[i] = acc; return acc + h + 26; }, 0);
      const H = rowTop[grows - 1] + rowH[grows - 1];
      stage.style.height = `${Math.round(H)}px`;

      let seen = 0;
      GROUPS.forEach((g, gi) => {
        const gc = gi % gcols, gr = Math.floor(gi / gcols);
        const rows = Math.ceil(g.n / cols);
        const gridW = cols * CHIP_W + (cols - 1) * GAP;
        const gridH = rows * CHIP_H + (rows - 1) * GAP;
        const x0 = gc * colW + (colW - gridW) / 2;
        const y0 = rowTop[gr] + PAD;

        boxes[gi].style.left = `${(x0 - PAD).toFixed(1)}px`;
        boxes[gi].style.top = `${(y0 - PAD).toFixed(1)}px`;
        boxes[gi].style.width = `${gridW + 2 * PAD}px`;
        boxes[gi].style.height = `${gridH + 2 * PAD}px`;

        // Имена — по общей линии ряда, иначе при разной высоте блоков рвутся
        names[gi].style.left = `${(gc * colW).toFixed(1)}px`;
        names[gi].style.width = `${colW.toFixed(1)}px`;
        names[gi].style.top = `${(rowTop[gr] + rowH[gr] - NAME_H + 4).toFixed(1)}px`;

        for (let i = 0; i < g.n; i++) {
          const c = chips[seen + i].el;
          const x = x0 + (i % cols) * (CHIP_W + GAP) + rand(-3, 3);
          const y = y0 + Math.floor(i / cols) * (CHIP_H + GAP) + rand(-2, 2);
          c.style.left = `${x.toFixed(1)}px`;
          c.style.top = `${y.toFixed(1)}px`;
          c.style.transform = `rotate(${rand(-6, 6).toFixed(2)}deg)`;
          // Куда лететь при схлопывании — в центр сцены
          c.style.setProperty('--tx', `${(W / 2 - CHIP_W / 2 - x).toFixed(1)}px`);
          c.style.setProperty('--ty', `${(H / 2 - CHIP_H / 2 - y).toFixed(1)}px`);
        }
        seen += g.n;
      });
    }

    layout();
    addEventListener('resize', () => {
      if (!stage.classList.contains('merged')) layout();
    }, { passive: true });

    const SCATTER_HOLD = 3000;  // стоим на «куче», пока её читают
    const MERGED_HOLD = 4200;   // стоим на карточке: она — вывод слайда
    const FADE = 420;           // столько гаснет сцена перед новым кругом

    let timer = null;

    function delaysOff() {
      chips.forEach(({ el }) => { el.style.transitionDelay = '0ms'; });
      boxes.forEach((b) => { b.style.transitionDelay = '0ms'; });
      names.forEach((n) => { n.style.transitionDelay = '0ms'; });
    }

    function scatter() {
      // Коллекции набегают одна за другой: сначала одна, потом «и ещё, и ещё»
      chips.forEach(({ el, group }, i) => {
        el.style.transitionDelay = `${group * 320 + (i % 7) * 40}ms`;
      });
      boxes.forEach((b, gi) => { b.style.transitionDelay = `${gi * 320}ms`; });
      names.forEach((n, gi) => { n.style.transitionDelay = `${gi * 320 + 140}ms`; });
      stage.classList.add('scattered');
    }

    function merge() {
      chips.forEach(({ el }, i) => { el.style.transitionDelay = `${i * 9}ms`; });
      boxes.forEach((b) => { b.style.transitionDelay = '0ms'; });
      names.forEach((n) => { n.style.transitionDelay = '0ms'; });
      stage.classList.add('merged');
    }

    /* Круг: куча → схлопывание → сцена гаснет → заново. Сцена гаснет целиком
       не для красоты: снимать классы на виду нельзя — чипы поехали бы из
       карточки обратно по коллекциям, и слайд читался бы задом наперёд. */
    function cycle() {
      scatter();
      timer = setTimeout(() => {
        merge();
        timer = setTimeout(() => {
          stage.classList.add('rewind');
          timer = setTimeout(() => {
            // Возврат в исходное — мгновенно, без переходов и на погашенной сцене
            stage.classList.add('nofx');
            stage.classList.remove('scattered', 'merged');
            delaysOff();
            layout();
            void stage.offsetHeight;           // применить сброс до нового круга
            stage.classList.remove('nofx', 'rewind');
            cycle();
          }, FADE);
        }, MERGED_HOLD);
      }, SCATTER_HOLD);
    }

    onEnter.push((s) => {
      if (!s.classList.contains('slide--collapse')) return;
      clearTimeout(timer);
      // В index.html слайд до показа скрыт и при запуске мерил ширину 0 —
      // раскладываем заново по настоящей ширине (сцена сейчас не схлопнута)
      layout();
      if (calm()) { scatter(); stage.classList.add('merged'); return; }
      cycle();
    });

    onLeave.push((s) => {
      if (!s.classList.contains('slide--collapse')) return;
      clearTimeout(timer);
      stage.classList.add('nofx');
      stage.classList.remove('scattered', 'merged', 'rewind');
      delaysOff();
      layout();
      void stage.offsetHeight;
      stage.classList.remove('nofx');
    });
  }

  /* ═════════════════════ 7. Конвейер из 8 шагов ═════════════════════ */

  function pipeline() {
    const track = $('.pipe-track');
    const path = $('#pipePath');
    const dot = $('#pipeDot');
    const steps = $$('.pipe-steps li');
    if (!track || !path || !dot || steps.length === 0) return;

    const DWELL = 620;   // стоим на шаге
    const TRAVEL = 340;  // едем к следующему
    const REST = 1100;   // пауза в конце цикла

    let raf = 0, t0 = 0, running = false;
    let stops = [];      // центры карточек, в пикселях трека
    let railY = 0;

    /* Остановки замеряются по вёрстке, а не считаются от viewBox.
       Со своей шкалой (`0 0 1000` и путь 20…980) точка шла по собственной
       сетке и расходилась с grid-сеткой карточек: на первом шаге отставала,
       к последнему уезжала вперёд. */
    function measure() {
      const w = track.clientWidth;
      const h = track.clientHeight;
      if (!w || !h) { stops = []; return; }   // на узком экране трек скрыт
      railY = h / 2;
      // Координаты вёрстки, а не экрана: на них не влияют ни наклон
      // .visual при появлении, ни 3D-карточка в index.html. Рельс стоит
      // в .pipeline с left: 0, список шагов — там же
      const list = steps[0].offsetParent;
      stops = steps.map((li) => list.offsetLeft + li.offsetLeft + li.offsetWidth / 2);
      // viewBox 1:1 к пикселям — иначе preserveAspectRatio="none" растянет кружок в овал
      track.setAttribute('viewBox', `0 0 ${w} ${h}`);
      path.setAttribute('d', `M ${stops[0].toFixed(1)} ${railY} H ${stops[stops.length - 1].toFixed(1)}`);
    }

    const at = (x) => {
      dot.setAttribute('cx', x.toFixed(2));
      dot.setAttribute('cy', railY);
    };

    const mark = (idx) => {
      steps.forEach((li, i) => {
        li.classList.toggle('on', i === idx);
        li.classList.toggle('done', i < idx);
      });
    };

    const cycle = DWELL * steps.length + TRAVEL * (steps.length - 1) + REST;

    function frame(now) {
      if (!running) return;
      const t = (now - t0) % cycle;
      const unit = DWELL + TRAVEL;
      const idx = Math.min(Math.floor(t / unit), steps.length - 1);
      const inStep = t - idx * unit;

      const last = stops.length - 1;
      if (t >= cycle - REST) {
        mark(last);
        at(stops[last]);
      } else if (inStep < DWELL) {
        // Стоим: ровно центр карточки, без накопленной погрешности
        mark(idx);
        at(stops[idx]);
      } else {
        const p = easeOut((inStep - DWELL) / TRAVEL);
        const a = stops[idx];
        const b = stops[Math.min(idx + 1, last)];
        mark(idx);
        at(a + (b - a) * p);
      }
      raf = requestAnimationFrame(frame);
    }

    addEventListener('resize', () => {
      measure();
      if (stops.length && !running) at(stops[0]);
    }, { passive: true });

    onEnter.push((s) => {
      if (!s.classList.contains('slide--pipe')) return;
      measure();
      if (!stops.length) return;
      if (calm()) {
        steps.forEach((li) => li.classList.add('on'));
        at(stops[stops.length - 1]);
        return;
      }
      running = true;
      t0 = performance.now();
      raf = requestAnimationFrame(frame);
    });

    onLeave.push((s) => {
      if (!s.classList.contains('slide--pipe')) return;
      running = false;
      cancelAnimationFrame(raf);
      mark(-1);
    });
  }

  /* ═════════════════════ 8. Песочница: отбитые попытки ═════════════════════ */

  function cage() {
    const box = $('#cage');
    if (!box) return;

    const bars = $('.cage-bars', box);
    const shield = $('.cage-shield', box);
    const log = $('#guardLog');
    const counter = $('#guardCount');

    /* Две линии защиты, и они правда разные.

       `static`  — восемь конструкций из astGuard.js. Отсеиваются регулярками
                   ДО запуска, поэтому отбиваются на внешнем кольце.
       `runtime` — про них astGuard ничего не знает, они спокойно проходят
                   решётку и гасятся уже внутри: interrupt по времени в
                   runner.js и лимит памяти рантайма.

       Коды — настоящие, из domain/script/errorCodes. */
    const ATTACKS = [
      { src: 'require(',        by: 'static',  code: 'MODULE_ACCESS_DENIED' },
      { src: 'while (true) {}', by: 'runtime', code: 'SCRIPT_TIMEOUT' },
      { src: 'fetch(',          by: 'static',  code: 'NETWORK_ACCESS_DENIED' },
      { src: 'process.env',     by: 'static',  code: 'MODULE_ACCESS_DENIED' },
      { src: 'new Array(1e9)',  by: 'runtime', code: 'SCRIPT_MEMORY_LIMIT' },
      { src: 'WebAssembly',     by: 'static',  code: 'WASM_DENIED' },
      { src: 'child_process',   by: 'static',  code: 'MODULE_ACCESS_DENIED' },
      { src: 'XMLHttpRequest',  by: 'static',  code: 'NETWORK_ACCESS_DENIED' },
      { src: 'import(',         by: 'static',  code: 'MODULE_ACCESS_DENIED' },
      { src: 'WebSocket',       by: 'static',  code: 'NETWORK_ACCESS_DENIED' },
    ];

    const DUR = 2600;
    const HIT = 0.55;                 // доля пути до удара
    let timer = null, i = 0, rejected = 0;

    function note(attack) {
      if (!log) return;
      const li = document.createElement('li');
      li.className = `by-${attack.by}`;
      li.innerHTML = '<span class="what"></span><span class="why"></span>';
      li.firstChild.textContent = attack.src;
      li.lastChild.textContent = attack.code;
      log.appendChild(li);
      while (log.children.length > 4) log.removeChild(log.firstChild);
      if (counter) counter.textContent = String(++rejected);
    }

    function flash(ring) {
      if (!ring) return;
      ring.classList.add('hit');
      setTimeout(() => ring.classList.remove('hit'), 260);
    }

    function throwOne() {
      const R = box.clientWidth / 2;
      if (!R) return;
      // В скрытой вкладке WAAPI-анимации стоят, `finished` не наступает и
      // элементы копятся. Потолок — страховка на любой другой затор.
      if (document.hidden || box.querySelectorAll('.intruder').length >= 3) return;

      const attack = ATTACKS[i++ % ATTACKS.length];
      const isStatic = attack.by === 'static';
      // Радиусы согласованы с маской в styles.css: решётка 0.76…0.94R, щит 0.66R
      const wall = isStatic ? R * 0.85 : R * 0.68;

      const el = document.createElement('div');
      el.className = isStatic ? 'intruder' : 'intruder intruder--runtime';
      el.textContent = attack.src;
      el.style.left = '50%';
      el.style.top = '50%';
      box.appendChild(el);

      const angle = rand(0, Math.PI * 2);
      const from = R * 1.55;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const px = (r) => `translate(calc(-50% + ${(cos * r).toFixed(1)}px), calc(-50% + ${(sin * r).toFixed(1)}px))`;

      // Статику отбрасывает наружу; рантайм внутрь не пускает, но и не
      // возвращает — он гаснет там, где его остановили.
      const keyframes = isStatic
        ? [
            { transform: px(from), opacity: 0 },
            { transform: px(R * 1.12), opacity: 1, offset: 0.3 },
            { transform: px(wall), opacity: 1, offset: HIT },
            { transform: px(R * 1.25), opacity: 0.9, offset: 0.8 },
            { transform: px(from), opacity: 0 },
          ]
        : [
            { transform: px(from), opacity: 0 },
            { transform: px(R * 1.05), opacity: 1, offset: 0.28 },
            { transform: px(wall), opacity: 1, offset: HIT },
            { transform: `${px(wall)} scale(0.75)`, opacity: 0, offset: 0.78 },
            { transform: `${px(wall)} scale(0.6)`, opacity: 0 },
          ];

      const anim = el.animate(keyframes, {
        duration: DUR,
        easing: isStatic ? 'cubic-bezier(.3,0,.5,1)' : 'cubic-bezier(.4,0,.7,1)',
      });

      // Вспышка ровно в момент удара — в ту точку, где остановили
      setTimeout(() => {
        const s = document.createElement('div');
        s.className = isStatic ? 'spark' : 'spark spark--runtime';
        s.style.left = `${(50 + (cos * wall * 100) / box.clientWidth).toFixed(2)}%`;
        s.style.top = `${(50 + (sin * wall * 100) / box.clientHeight).toFixed(2)}%`;
        box.appendChild(s);
        setTimeout(() => s.remove(), 650);
        flash(isStatic ? bars : shield);
        note(attack);
      }, DUR * HIT);

      anim.finished.then(() => el.remove(), () => el.remove());
    }

    onEnter.push((s) => {
      if (!s.classList.contains('slide--cage') || calm()) return;
      throwOne();
      timer = setInterval(throwOne, 1250);
    });

    onLeave.push((s) => {
      if (!s.classList.contains('slide--cage')) return;
      clearInterval(timer);
      timer = null;
      $$('.intruder, .spark', box).forEach((el) => el.remove());
      if (log) log.textContent = '';
      rejected = 0;
      if (counter) counter.textContent = '0';
    });
  }

  /* ═════════════════════ 9. Секрет и четыре выхода ═════════════════════ */

  function secrets() {
    const stage = $('#secretStage');
    const token = $('#secretToken');
    const wires = $('#secretWires');
    if (!stage || !token || !wires) return;

    const SVGNS = 'http://www.w3.org/2000/svg';
    const gates = $$('.gate', stage);
    if (gates.length === 0) return;

    const SPEED = 0.3;   // px/мс — одна и та же на всех проводах
    const FLOOR = 340;   // короткий провод всё равно должно быть видно
    const TAIL = 170;    // втягивание в карточку / схлопывание у креста

    const lines = [];    // пунктиры, по одному на карточку
    const marks = [];    // кресты на серединах
    let legs = [];
    let timer = null;

    /* Смещение до стейджа по цепочке offsetParent. offsetLeft/offsetTop не
       учитывают transform — а токен «дышит» (float) и карточки выезжают на
       появлении. Через getBoundingClientRect концы проводов дрожали бы вместе
       с ними; так они стоят там, где элемент лежит по вёрстке. */
    function anchor(el) {
      let x = 0, y = 0, node = el;
      while (node && node !== stage) {
        x += node.offsetLeft;
        y += node.offsetTop;
        node = node.offsetParent;
      }
      return { x, y };
    }

    function measure() {
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      // На узком экране провода спрятаны, карточки стоят в два ряда — не летаем
      if (!w || !h || getComputedStyle(wires).display === 'none') { legs = []; return; }

      wires.setAttribute('viewBox', `0 0 ${w} ${h}`);

      const t = anchor(token);
      const x0 = t.x + token.offsetWidth / 2;
      const y0 = t.y + token.offsetHeight;

      legs = gates.map((gate, i) => {
        const pass = gate.classList.contains('gate--pass');
        const g = anchor(gate);
        const x1 = g.x + gate.offsetWidth / 2;
        const y1 = g.y;

        let line = lines[i];
        if (!line) {
          line = document.createElementNS(SVGNS, 'line');
          line.setAttribute('class', `wire wire--${pass ? 'pass' : 'block'}`);
          wires.appendChild(line);
          lines[i] = line;
        }
        line.setAttribute('x1', x0.toFixed(1));
        line.setAttribute('y1', y0.toFixed(1));
        line.setAttribute('x2', x1.toFixed(1));
        line.setAttribute('y2', y1.toFixed(1));

        // Крест ровно на середине провода
        const mx = (x0 + x1) / 2;
        const my = (y0 + y1) / 2;

        let mark = marks[i];
        if (!mark) {
          mark = document.createElement('i');
          mark.className = `wire-x wire-x--${pass ? 'pass' : 'block'}`;
          mark.textContent = pass ? '✓' : '✕';
          stage.appendChild(mark);
          marks[i] = mark;
        }
        mark.style.left = `${mx.toFixed(1)}px`;
        mark.style.top = `${my.toFixed(1)}px`;

        return { x0, y0, x1, y1, mx, my, pass, mark };
      });
    }

    /* Удар об крест: он вспыхивает, секрет брызгает осколками назад */
    function smash(leg) {
      leg.mark.classList.add('hit');
      setTimeout(() => leg.mark.classList.remove('hit'), 440);

      const back = Math.atan2(leg.y0 - leg.my, leg.x0 - leg.mx);
      for (let i = 0; i < 5; i++) {
        const ang = back + (Math.random() - 0.5) * 2.1;
        const dist = 15 + Math.random() * 22;
        const sh = document.createElement('i');
        sh.className = 'shard';
        sh.style.left = `${leg.mx}px`;
        sh.style.top = `${leg.my}px`;
        stage.appendChild(sh);
        const a = sh.animate([
          { transform: 'translate(0,0) scale(1)', opacity: 1 },
          {
            transform: `translate(${(Math.cos(ang) * dist).toFixed(1)}px,${(Math.sin(ang) * dist).toFixed(1)}px) scale(0.2)`,
            opacity: 0,
          },
        ], { duration: 520, easing: 'cubic-bezier(.16,1,.3,1)' });
        a.finished.then(() => sh.remove(), () => sh.remove());
      }
    }

    function fly(leg, delay) {
      const bead = document.createElement('i');
      bead.className = leg.pass ? 'bead bead--pass' : 'bead';
      bead.style.left = `${leg.x0}px`;
      bead.style.top = `${leg.y0}px`;
      stage.appendChild(bead);

      const dxm = leg.mx - leg.x0, dym = leg.my - leg.y0;   // до креста
      const dx = leg.x1 - leg.x0, dy = leg.y1 - leg.y0;     // до карточки
      const mid = `translate(${dxm.toFixed(1)}px,${dym.toFixed(1)}px)`;
      const end = `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px)`;

      /* Длительность считается от длины провода, а не берётся константой:
         провода разной длины, и на общем таймере индикатор на коротком
         внутреннем проводе полз бы вчетверо медленнее зелёного. */
      const full = Math.hypot(dx, dy);
      const dist = leg.pass ? full : full / 2;
      const travel = Math.max(FLOOR, dist / SPEED);
      const duration = travel + TAIL;
      const tEnd = travel / duration;

      /* Зелёный проходит крест насквозь и втягивается в карточку; красный
         доходит ровно до креста и там гаснет, дальше летят только осколки. */
      const keyframes = leg.pass
        ? [
            { transform: 'translate(0,0) scale(1)', opacity: 1, offset: 0 },
            { transform: `${mid} scale(1)`, opacity: 1, offset: tEnd / 2 },
            { transform: `${end} scale(1)`, opacity: 1, offset: tEnd },
            { transform: `${end} scale(2.4)`, opacity: 0, offset: 1 },
          ]
        : [
            { transform: 'translate(0,0) scale(1)', opacity: 1, offset: 0 },
            { transform: `${mid} scale(1)`, opacity: 1, offset: tEnd },
            { transform: `${mid} scale(0.3)`, opacity: 0, offset: 1 },
          ];

      const anim = bead.animate(keyframes, { duration, easing: 'linear', delay });
      anim.finished.then(() => bead.remove(), () => bead.remove());

      if (!leg.pass) setTimeout(() => smash(leg), delay + travel);
    }

    function volley() {
      // В скрытой вкладке анимации не тикают: finished не придёт, шарики копятся
      if (document.hidden || !legs.length) return;
      if (stage.querySelectorAll('.bead').length >= gates.length) return;
      legs.forEach((leg, i) => fly(leg, i * 260));
    }

    function clear() {
      $$('.bead, .shard', stage).forEach((el) => el.remove());
      marks.forEach((m) => m.classList.remove('hit'));
    }

    addEventListener('resize', () => {
      if (legs.length) measure();
    }, { passive: true });

    onEnter.push((s) => {
      if (!s.classList.contains('slide--secret')) return;
      measure();                 // провода и кресты нужны и в спокойном режиме
      if (calm() || !legs.length) return;
      setTimeout(volley, 1100);
      timer = setInterval(volley, 3600);
    });

    onLeave.push((s) => {
      if (!s.classList.contains('slide--secret')) return;
      clearInterval(timer);
      timer = null;
      clear();
    });
  }

  /* ═════════════════════ QA Package: история версий ═════════════════════

     Сохранения идут так же, как на сервере: номер считает nextVersion()
     по выбранному bump, откат — это не перемотка, а новая версия со
     старым кодом. В конце цикла второй редактор получает 409. */
  function pkgHistory() {
    const list = $('#pkgVersions');
    const conflict = $('#pkgConflict');
    if (!list) return;

    const STEPS = [
      { v: '1.0.0', bump: 'create',  note: 'OkPay: подпись md5' },
      { v: '1.0.1', bump: 'patch',   note: 'сортировка ключей' },
      { v: '1.1.0', bump: 'minor',   note: 'utils.randomString' },
      { v: '2.0.0', bump: 'major',   note: 'класс Client', broken: true },
      { v: '2.0.1', bump: 'restore', note: 'код из 1.1.0', from: '1.1.0' },
    ];
    let timer = null;

    function row(step) {
      const li = document.createElement('li');
      li.dataset.v = step.v;
      li.innerHTML = `<b>${step.v}</b><em data-bump="${step.bump}">${step.bump}</em><span>${step.note}</span><i>HEAD</i>`;
      return li;
    }

    function push(step) {
      $$('li', list).forEach((li) => {
        li.classList.remove('is-head', 'is-source');
        li.classList.toggle('is-old', li.dataset.broken === '1');
      });
      if (step.from) {
        const src = $(`li[data-v="${step.from}"]`, list);
        if (src) src.classList.add('is-source');
      }
      const li = row(step);
      if (step.broken) li.dataset.broken = '1';
      li.classList.add('is-head');
      list.prepend(li);
    }

    function reset() {
      clearTimeout(timer);
      timer = null;
      list.textContent = '';
      conflict.classList.remove('on');
    }

    function play(i = 0) {
      if (i === 0) reset();
      if (i < STEPS.length) {
        push(STEPS[i]);
        timer = setTimeout(() => play(i + 1), 1500);
        return;
      }
      conflict.classList.add('on');
      timer = setTimeout(() => play(0), 3200);
    }

    onEnter.push((s) => {
      if (!s.classList.contains('slide--pkg')) return;
      if (calm()) { reset(); STEPS.forEach(push); conflict.classList.add('on'); return; }
      play(0);
    });
    onLeave.push((s) => {
      if (!s.classList.contains('slide--pkg')) return;
      reset();
    });
  }

  /* ═════════════════════ Редактор: подсказка vars. ═════════════════════

     Печатает строку, на `vars.` открывает список ключей колбэка с
     документацией по рынкам, дофильтровывает и принимает. Потом то же
     для `secrets.` — там в документации только происхождение, без
     значения: ровно как в настоящем редакторе. */
  function ide() {
    const box = $('#ide');
    const lines = $('#ideLines');
    const pop = $('#idePop');
    const items = $('#ideItems');
    const doc = $('#ideDoc');
    if (!box || !lines) return;

    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const VARS = ['amount', 'currency', 'transactionId', 'baseUrl', 'callbackUrl'];
    const SECRETS = ['ps_secretKey'];
    const DOCS = {
      amount: 'Сумма\nParams · required · default: 100',
      currency: 'Params\nEmpty on the form — taken from the market:\nBK: RUB',
      transactionId: 'Transaction\nParams · required',
      baseUrl: 'Market variable\nBK: https://bk.example.test\nIB: https://ib.example.test',
      callbackUrl: 'Market variable\nBK: https://bk.example.test/cb',
      ps_secretKey: 'Ключ ПС\nSecret param',
    };

    const STATIC = [
      '<span class="k">const</span> body = { order_id: <span class="p">vars</span>.transactionId };',
      '',
      '<span class="k">return</span> {',
    ];

    let timers = [];
    const later = (ms, fn) => timers.push(setTimeout(fn, ms));
    const stop = () => { timers.forEach(clearTimeout); timers = []; };

    function render(active) {
      lines.innerHTML = [...STATIC, ...active].map((l) => `<li>${l}</li>`).join('');
    }

    function place() {
      const caret = $('.caret', lines);
      if (!caret) return;
      const b = box.querySelector('.ide-body').getBoundingClientRect();
      const c = caret.getBoundingClientRect();
      const k = b.width / box.querySelector('.ide-body').offsetWidth || 1;   // масштаб карточки в index.html
      pop.style.setProperty('--pop-x', `${(c.left - b.left) / k - 8}px`);
      pop.style.setProperty('--pop-y', `${(c.bottom - b.top) / k + 4}px`);
    }

    function list(keys, typed, sel) {
      const shown = keys.filter((k) => k.startsWith(typed));
      items.innerHTML = shown
        .map((k, i) => `<li class="${i === sel ? 'is-sel' : ''}"><span><b>${esc(typed)}</b>${esc(k.slice(typed.length))}</span></li>`)
        .join('');
      const cur = shown[sel];
      doc.innerHTML = cur ? `<b>${cur}</b>${esc(DOCS[cur])}` : '';
      pop.classList.add('on');
      place();
    }

    /* Одна строка: печать префикса, открытие списка, фильтр, выбор */
    function scene(t0, prefix, obj, keys, typed, pick, suffix, done) {
      const line = (s, caret = true) => `  ${prefix}<span class="p">${obj}</span>${s}${caret ? '<span class="caret"></span>' : ''}`;
      const upto = done.slice();
      let t = t0;
      t += 260;
      later(t, () => { render([...upto, line('.')]); list(keys, '', 0); });
      [...typed].forEach((_, i) => {
        t += 380;
        later(t, () => { render([...upto, line('.' + typed.slice(0, i + 1))]); list(keys, typed.slice(0, i + 1), 0); });
      });
      t += 1700;
      later(t, () => { pop.classList.remove('on'); render([...upto, line('.' + pick + suffix)]); });
      return { t, line: line('.' + pick + suffix, false) };
    }

    function play() {
      stop();
      pop.classList.remove('on');
      render(['  <span class="caret"></span>']);
      const a = scene(500, 'url: ', 'vars', VARS, 'ba', 'baseUrl', ',', []);
      const b = scene(a.t + 900, 'sign: ', 'secrets', SECRETS, 'ps', 'ps_secretKey', ',', [a.line]);
      later(b.t + 600, () => render([a.line, b.line, '}<span class="caret"></span>']));
      later(b.t + 3600, play);
    }

    onEnter.push((s) => {
      if (!s.classList.contains('slide--ide')) return;
      if (calm()) {
        render(['  url: <span class="p">vars</span>.ba<span class="caret"></span>']);
        list(VARS, 'ba', 0);
        return;
      }
      play();
    });
    onLeave.push((s) => {
      if (!s.classList.contains('slide--ide')) return;
      stop();
      pop.classList.remove('on');
    });
  }

  /* ═════════════════════ Запуск ═════════════════════ */

  heroTitle();
  if (!EXTERNAL) {   // в index.html навигацию и хром ведёт сцена
    chrome();
    keys();
  }
  counters();
  collapse();
  pipeline();
  cage();
  pkgHistory();
  ide();
  secrets();
  reveals();   // последним: наблюдатель сразу дёрнет onEnter для видимого слайда
})();
