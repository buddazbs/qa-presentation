/* ══════════════════════════════════════════════════════════════════
   Callback Admin Tool — сцена презентации

   Ванильный JS, без зависимостей. Модуль владеет всем, что живёт
   между слайдами: чертёжный фон, шина данных, кубик Рубика,
   рука, переходы и финальное нажатие Send callback.

   Устройство одно на весь файл: есть единственный цикл rAF, который
   читает положение скролла и ВЫЧИСЛЯЕТ из него состояние сцены.
   Ничего не копится от события к событию, поэтому быстрый скролл,
   рывок к якорю или resize не могут оставить сцену в подвешенном
   состоянии — следующий же кадр приведёт её к правильному виду.
   ══════════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const CALM = matchMedia('(prefers-reduced-motion: reduce)');
  const calm = () => CALM.matches;

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  /* Сглаживание к краям: кадр «доезжает» и замирает, а не тормозит рывком */
  const smooth = (t) => t * t * (3 - 2 * t);

  const slides = $$('.slide');
  if (!slides.length) return;

  const NS = 'http://www.w3.org/2000/svg';
  const svgEl = (name, attrs = {}) => {
    const el = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };

  /* ══════════════════════════════════════════════════════════════
     Сценарий

     Один источник правды на всю презентацию: для каждого слайда
     записано, как он въезжает в кадр и какая деталь руки на нём
     встаёт на место. Всё остальное — следствие этой таблицы,
     отдельных «магических» мест нет.

     Кубика здесь нет: он крутится по собственному циклу и к слайдам
     не привязан.

     scene  — тип перехода
     part   — деталь руки, которая докуется на этом слайде
     mood   — 'build' обычная сборка, 'loose' расшатывание,
              'still' намеренный покой, 'final' финал
     ══════════════════════════════════════════════════════════════ */
  const SCRIPT = [
    { scene: 'depth',  part: 'base',     mood: 'build', tag: 'система' },
    { scene: 'slide',  part: 'column',   mood: 'build', tag: 'назначение' },
    { scene: 'blur',   part: null,       mood: 'loose', tag: 'разрыв' },
    { scene: 'split',  part: 'shoulder', mood: 'build', tag: 'решение' },
    { scene: 'track',  part: 'upper',    mood: 'build', tag: 'конвейер' },
    { scene: 'scale',  part: 'elbow',    mood: 'build', tag: 'изоляция' },
    { scene: 'depth',  part: null,       mood: 'build', tag: 'общий код' },
    { scene: 'slide',  part: null,       mood: 'build', tag: 'редактор' },
    { scene: 'split',  part: 'fore',     mood: 'build', tag: 'доступ' },
    { scene: 'mask',   part: 'wrist',    mood: 'build', tag: 'секреты' },
    { scene: 'slide',  part: 'hand',     mood: 'build', tag: 'состояние' },
    { scene: 'still',  part: 'cables',   mood: 'still', tag: 'границы' },
    { scene: 'depth',  part: 'leds',     mood: 'final', tag: 'отправка' },
  ];

  /* Пакеты на шине — настоящие сущности проекта, в том порядке,
     в каком они проходят через prepareCallbackRequest(). */
  const PACKETS = [
    'request', 'vars', 'secrets', 'fillFromDb', 'market vars',
    'substitute', 'url', 'QuickJS', 'sign', 'SSRF check', 'POST', 'response', '200 OK',
  ];

  const FINAL_FLOW = ['request', 'prepare', 'QuickJS', 'sign', 'HTTP', '200 OK'];

  /* ══════════════════════════════════════════════════════════════
     Разметка сцены
     ══════════════════════════════════════════════════════════════ */

  function mountLayers() {
    const frag = document.createDocumentFragment();

    const blueprint = document.createElement('div');
    blueprint.className = 'blueprint';
    blueprint.setAttribute('aria-hidden', 'true');
    frag.appendChild(blueprint);

    const horizon = document.createElement('div');
    horizon.className = 'horizon';
    horizon.setAttribute('aria-hidden', 'true');
    frag.appendChild(horizon);

    document.body.insertBefore(frag, document.body.firstChild);
  }

  function mountBus() {
    const bus = document.createElement('div');
    bus.className = 'bus';
    bus.setAttribute('aria-hidden', 'true');
    bus.innerHTML = '<div class="bus-rail"></div><div class="bus-live"></div>';

    const packet = document.createElement('div');
    packet.className = 'bus-packet';
    packet.innerHTML = '<i></i><span></span>';
    bus.appendChild(packet);

    document.body.appendChild(bus);
    return { bus, packet, label: $('span', packet) };
  }

  /* Промежутки между слайдами ставятся скриптом: так нумерация
     шагов считается сама и не разъедется при добавлении слайда. */
  function mountInterludes() {
    const made = [];
    for (let i = 0; i < slides.length - 1; i += 1) {
      const el = document.createElement('div');
      el.className = 'interlude';
      el.setAttribute('aria-hidden', 'true');
      const next = slides[i + 1].dataset.slide || '';
      el.innerHTML =
        '<div class="interlude-mark">' +
          '<span class="interlude-node"></span>' +
          `<span class="interlude-step">${String(i + 1).padStart(2, '0')} → ${String(i + 2).padStart(2, '0')}</span>` +
          '<span class="interlude-line"></span>' +
          `<span class="interlude-name">${next}</span>` +
        '</div>';
      slides[i].after(el);
      made.push(el);
    }
    return made;
  }

  function mountSceneTag() {
    const tag = document.createElement('div');
    tag.className = 'scene-tag';
    tag.setAttribute('aria-hidden', 'true');
    tag.innerHTML = '<i></i><b></b><span></span>';
    document.body.appendChild(tag);
    return { el: tag, name: $('b', tag), num: $('span', tag) };
  }

  function mountTelemetry() {
    const el = document.createElement('div');
    el.className = 'telemetry';
    el.setAttribute('aria-hidden', 'true');
    FINAL_FLOW.forEach((step, i) => {
      if (i > 0) {
        const sep = document.createElement('span');
        sep.className = 'telemetry-sep';
        sep.textContent = '→';
        el.appendChild(sep);
      }
      const s = document.createElement('span');
      s.className = 'telemetry-step';
      s.textContent = step;
      el.appendChild(s);
    });
    document.body.appendChild(el);
    return { el, steps: $$('.telemetry-step', el) };
  }

  /* ══════════════════════════════════════════════════════════════
     Кубик Рубика

     Настоящие четвертные повороты: у каждой детали есть логическая
     позиция (x, y, z) в диапазоне -1…1, поворот слоя переставляет
     её по кругу и доворачивает собственную ориентацию детали.
     Ориентация копится матрицей, а не строкой трансформаций —
     иначе style.transform рос бы с каждым ходом без предела.
     ══════════════════════════════════════════════════════════════ */
  function makeCube() {
    const host = document.createElement('div');
    host.className = 'cube-stage';
    host.setAttribute('aria-hidden', 'true');

    const cube = document.createElement('div');
    cube.className = 'cube';
    host.appendChild(cube);

    const label = document.createElement('div');
    label.className = 'cube-label';
    label.innerHTML = 'сборка <b>0%</b>';
    host.appendChild(label);
    document.body.appendChild(host);

    /* Шаг сетки = ребро детали + зазор. Оба числа живут в stage.css
       (`.cube-stage`, --cubie-size и --cubie-gap), здесь они только
       читаются: так их можно крутить руками в одном месте, в том числе
       вживую в DevTools — metrics() перечитывает их каждый кадр. */
    let GAP = 46;

    function metrics() {
      const css = getComputedStyle(host);
      const size = parseFloat(css.getPropertyValue('--cubie-size')) || 40;
      const gapPx = parseFloat(css.getPropertyValue('--cubie-gap')) || 0;
      const next = size + gapPx;
      if (Math.abs(next - GAP) < 0.01) return false;
      GAP = next;
      return true;
    }

    const cubies = [];

    for (let x = -1; x <= 1; x += 1) {
      for (let y = -1; y <= 1; y += 1) {
        for (let z = -1; z <= 1; z += 1) {
          // Внутренняя деталь не видна ни с одной стороны — не рисуем
          if (x === 0 && y === 0 && z === 0) continue;
          const el = document.createElement('div');
          el.className = 'cubie';
          // Шесть граней: каркас, а не наклейки. Сами трансформации —
          // в stage.css, они завязаны на ребро детали.
          for (const side of ['front', 'back', 'right', 'left', 'top', 'bottom']) {
            const face = document.createElement('div');
            face.className = `cubie-face cubie-face--${side}`;
            el.appendChild(face);
          }
          cube.appendChild(el);
          cubies.push({ el, x, y, z, m: new DOMMatrix() });
        }
      }
    }

    // Оси поворотов граней: буква → ось и знак
    const AXIS = {
      U: { axis: 'y', at: -1, vec: [0, 1, 0] },
      R: { axis: 'x', at: 1,  vec: [1, 0, 0] },
      F: { axis: 'z', at: 1,  vec: [0, 0, 1] },
    };

    let turn = null; // { move, from, t }

    function place(c) {
      // Позиция и накопленная ориентация. Порядок важен: сначала
      // деталь ставится в свою ячейку, потом крутится вокруг центра.
      const m = new DOMMatrix()
        .translate(c.x * GAP, c.y * GAP, c.z * GAP)
        .multiply(c.m);
      c.el.style.transform = m.toString();
    }

    function layerOf(move) {
      const spec = AXIS[move];
      return cubies.filter(c => c[spec.axis] === spec.at);
    }

    function start(move) {
      if (turn || !AXIS[move]) return;
      const layer = layerOf(move);
      layer.forEach(c => c.el.classList.add('is-turning'));
      turn = { move, layer, t: 0 };
    }

    /* ─────────── Собственный цикл кубика ───────────

       Кубик живёт сам по себе и не спрашивает, где находится зритель:
       россыпь → сборка → пауза на собранном → снова россыпь. Скролл на
       него не влияет вовсе — он фоновая история, идущая своим чередом,
       а не индикатор прогресса показа.

       Фазы считаются по числу сделанных ходов, а не по таймеру: пока
       идёт поворот, следующий не начинается, поэтому цикл не может
       «убежать» и на медленной машине, и в замороженной вкладке. */
    const MOVES = ['U', 'R', 'F'];
    const SCRAMBLE = 9;   // ходов на россыпь
    const SOLVE = 14;      // ходов на сборку — длиннее, это главная часть
    const HOLD = 2200;     // мс покоя на собранном кубике

    let phase = 'solve';
    let step = 0;
    let holdLeft = 0;
    let gap = 0;
    let prev = '';

    function nextMove() {
      // Два одинаковых хода подряд читаются как полуоборот — избегаем
      const pool = MOVES.filter(m => m !== prev);
      prev = pool[Math.floor(Math.random() * pool.length)];
      return prev;
    }

    function cycle(dt) {
      if (turn) return;

      if (holdLeft > 0) { holdLeft -= dt; return; }
      if (gap > 0) { gap -= dt; return; }

      if (phase === 'scramble') {
        step += 1;
        if (step > SCRAMBLE) { phase = 'solve'; step = 0; return; }
        gap = 90;
      } else {
        step += 1;
        if (step > SOLVE) { phase = 'scramble'; step = 0; holdLeft = HOLD; return; }
        gap = 170;
      }
      start(nextMove());
      paint();
    }

    /* Собранность рисуется долей деталей со сплошной обводкой: на
       россыпи она тает, на сборке нарастает до 100%. */
    function paint() {
      const total = phase === 'scramble' ? SCRAMBLE : SOLVE;
      const done = clamp(step / total, 0, 1);
      const value = phase === 'scramble' ? 1 - done : done;
      const want = Math.round(value * cubies.length);
      cubies.forEach((c, i) => c.el.classList.toggle('is-set', i < want));
      label.innerHTML = `сборка <b>${Math.round(value * 100)}%</b>`;
    }

    function finish(t) {
      const spec = AXIS[turn.move];
      const [ax, ay, az] = spec.vec;
      for (const c of turn.layer) {
        // Доворот собственной ориентации детали на четверть
        c.m = new DOMMatrix().rotateAxisAngle(ax, ay, az, 90).multiply(c.m);
        // Перестановка логической позиции по кругу вокруг той же оси
        const { x, y, z } = c;
        if (spec.axis === 'y') { c.x = -z; c.z = x; }
        if (spec.axis === 'x') { c.y = -z; c.z = y; }
        if (spec.axis === 'z') { c.x = -y; c.y = x; }
        void t;
        c.el.classList.remove('is-turning');
        place(c);
      }
      turn = null;
    }

    let recheck = 0;

    function render(now, dt) {
      // Чтение computed style после записи трансформаций стоит пересчёта
      // стилей, поэтому не каждый кадр: четырёх раз в секунду хватает,
      // чтобы правка --cubie-gap руками выглядела мгновенной.
      recheck -= dt;
      if (recheck <= 0) {
        recheck = 250;
        if (metrics()) cubies.forEach(place);
      }

      cycle(dt);
      if (turn) {
        turn.t = clamp(turn.t + dt / 620, 0, 1);
        const a = smooth(turn.t) * 90;
        const spec = AXIS[turn.move];
        const [ax, ay, az] = spec.vec;
        for (const c of turn.layer) {
          const m = new DOMMatrix()
            .rotateAxisAngle(ax, ay, az, a)
            .translate(c.x * GAP, c.y * GAP, c.z * GAP)
            .multiply(c.m);
          c.el.style.transform = m.toString();
        }
        if (turn.t >= 1) finish(now);
      }
    }

    /* Ориентация всего кубика: очень медленный дрейф, чтобы грани
       читались объёмно. Хаотичного вращения нет намеренно — кубик
       всё время повёрнут к зрителю одними и теми же гранями, вся
       видимая работа идёт внутри него. */
    function orient(now) {
      const drift = Math.sin(now / 5200) * 5;
      // Сетка деталей задана в px, поэтому под размер контейнера
      // (он резиновый) кубик подгоняется масштабом всей сцены.
      // Делитель считается от шага сетки: развели детали шире —
      // кубик сам ужмётся и останется в своём углу.
      const k = (host.clientWidth || 168) / (GAP * 4);
      cube.style.transform =
        `scale(${k.toFixed(3)}) ` +
        `rotateX(${-26 + Math.cos(now / 6400) * 3}deg) ` +
        `rotateY(${34 + drift}deg)`;
    }

    metrics();
    cubies.forEach(place);
    paint();

    return { host, render, orient };
  }

  /* ══════════════════════════════════════════════════════════════
     Рука

     Человекоподобная, вид сбоку: стойка на основании, плечевой
     шарнир, плечо, локоть, предплечье, запястье и кисть — ладонь,
     большой палец и четыре пальца по три фаланги.

     Поза не подбирается углами «на глаз», а решается от кончика
     указательного пальца: сперва задаётся, где должен быть кончик и
     как повёрнута кисть, потом обратная кинематика (два звена, локоть
     вверх) находит плечо и предплечье. Поэтому палец приходит ровно
     в центр крышки при любой позе пальцев — ошибка не копится по
     суставам.

     Движение собрано из ключевых поз — покой, указание, нажатие, —
     а промежуточные кадры считаются на каждом тике rAF.
     ══════════════════════════════════════════════════════════════ */

  const RAD = Math.PI / 180;

  const SHOULDER = { x: 476, y: 392 };
  const UPPER = 165;
  const FORE = 150;

  /* Кисть в своей системе: x — от запястья к пальцам, ладонь смотрит
     в −y. base — пястно-фаланговый сустав, len — фаланги от основной
     к ногтевой, w — толщина пальца. Пропорции человеческие: палец
     чуть длиннее ладони, мизинец заметно короче остальных. */
  const PALM = 60;
  const FINGERS = {
    little: { base: [51, -5], len: [25, 17, 13], w: 12 },
    ring:   { base: [56, -4], len: [31, 21, 15], w: 13 },
    middle: { base: [58, -2], len: [33, 22, 16], w: 13.5 },
    index:  { base: [57, 1],  len: [30, 20, 15], w: 13.5 },
    thumb:  { base: [16, -11], len: [24, 19, 15], w: 14.5 },
  };
  const TIP_PAD = 4; // кончик — подушечка, а не ось последнего сустава

  /* Ключевые позы: сгиб каждого сустава в градусах, плюс — к ладони.
     У большого пальца первое число — отвод пястной кости к ладони,
     два других — сгиб обратно к пальцам: так он ложится поверх
     согнутого среднего, а не торчит в сторону. */
  const RELAX = {
    little: [28, 36, 22], ring: [22, 30, 18], middle: [16, 24, 14],
    index: [10, 16, 10], thumb: [26, 10, 8],
  };
  const POINT = {
    little: [90, 104, 64], ring: [86, 102, 62], middle: [80, 98, 60],
    index: [3, 5, 3], thumb: [42, 34, 26],
  };
  /* Под нагрузкой ногтевая фаланга прогибается назад, а основная
     чуть подгибается — палец пружинит, как живой. */
  const PRESS_FLEX = [7, -3, -18];

  /* Пальцы складываются волной от мизинца: одновременный сгиб
     читается как механизм, волна — как рука. */
  const WAVE = { little: 0, ring: 0.08, middle: 0.16, thumb: 0.2, index: 0.24 };
  const PHASE = { little: 0, ring: 1.3, middle: 2.1, index: 2.9, thumb: 4.2 };

  /* Кнопка стоит на полу под точкой, куда приходит палец, и больше
     никуда не двигается: из гнезда выдвигается только плунжер. */
  const BTN = { x: 262, y: 724, s: 0.62 };
  BTN.capY = BTN.y + (316 - 338) * BTN.s; // центр крышки — точка касания
  const SINK = 14 * BTN.s;                // ход плунжера
  const HOVER = 18;                       // просвет над крышкой перед нажатием
  const HIDDEN = 56;                      // насколько плунжер утоплен до появления

  /* Нажатие по времени: [мс, глубина кончика относительно крышки].
     Минус — над крышкой. Сначала короткий замах вверх, потом ход
     вниз с продавливанием, удержание и отпускание — кнопка
     возвращается сама, потому что её просадка выводится из пальца. */
  const STRIKE = [[0, -HOVER], [380, -HOVER - 9], [620, SINK], [860, SINK], [1320, -HOVER * 0.7]];

  function strikeDepth(ms) {
    for (let i = 1; i < STRIKE.length; i += 1) {
      const [t1, d1] = STRIKE[i];
      const [t0, d0] = STRIKE[i - 1];
      if (ms <= t1) return lerp(d0, d1, smooth(clamp((ms - t0) / (t1 - t0), 0, 1)));
    }
    return STRIKE[STRIKE.length - 1][1];
  }

  /* Прямая кинематика пальца: точка кончика в системе кисти */
  function fingerTip(f, flex, sign = [-1, -1, -1]) {
    let [x, y] = f.base;
    let a = 0;
    f.len.forEach((len, j) => {
      a += sign[j] * flex[j] * RAD;
      const reach = j === f.len.length - 1 ? len + TIP_PAD : len;
      x += Math.cos(a) * reach;
      y += Math.sin(a) * reach;
    });
    return { x, y };
  }

  /* Сплайн Катмулла — Рома через точки: жгут огибает суставы плавно */
  function spline(pts) {
    let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i += 1) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1.map(v => v.toFixed(1)).join(' ')} ${c2.map(v => v.toFixed(1)).join(' ')} ${p2.map(v => v.toFixed(1)).join(' ')}`;
    }
    return d;
  }

  function fingerMarkup(name, f, far) {
    const cls = far ? 'arm-shell arm-shell--far' : 'arm-shell';
    let inner = '';
    for (let j = f.len.length - 1; j >= 0; j -= 1) {
      const len = f.len[j];
      const w = f.w * (1 - j * 0.09);
      const r = w / 2;
      const tip = j === f.len.length - 1;
      inner =
        `<g data-seg="${j}">` +
          `<rect class="${cls}" x="${(-r * 0.8).toFixed(2)}" y="${(-r).toFixed(2)}" width="${(len + r * (tip ? 1.8 : 1.3)).toFixed(2)}" height="${w.toFixed(2)}" rx="${r.toFixed(2)}"/>` +
          `<circle class="arm-pin" r="${(w * 0.16).toFixed(2)}"/>` +
          (tip ? `<path class="arm-seam" d="M${(len * 0.3).toFixed(1)} ${(r * 0.55).toFixed(1)} H${(len * 0.95).toFixed(1)}"/>` : '') +
          (tip && name === 'index' ? `<circle class="arm-pad" cx="${(len + r * 0.35).toFixed(1)}" cy="${(-r * 0.25).toFixed(1)}" r="${(r * 0.42).toFixed(1)}"/>` : '') +
          inner +
        '</g>';
    }
    return `<g class="arm-finger" data-finger="${name}">${inner}</g>`;
  }

  function makeArm(onContact) {
    const host = document.createElement('div');
    host.className = 'arm-stage';
    host.setAttribute('aria-hidden', 'true');

    /* viewBox обрезан по графике в крайних позах: от вытянутой к кнопке
       кисти слева до индикаторной панели справа и подписи кнопки снизу. */
    const svg = svgEl('svg', {
      class: 'arm-svg',
      viewBox: '150 300 460 490',
      preserveAspectRatio: 'xMidYMid meet',
    });

    svg.innerHTML = `
      <defs>
        <linearGradient id="armMetal" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stop-color="#243052"/>
          <stop offset="45%"  stop-color="#141c34"/>
          <stop offset="100%" stop-color="#2c3a60"/>
        </linearGradient>

        <!-- Звенья — цилиндры: свет идёт поперёк звена, от освещённой
             кромки к теневой, поэтому объём держится при любом угле. -->
        <linearGradient id="armShade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stop-color="#3a4b78"/>
          <stop offset="32%"  stop-color="#1f2a4a"/>
          <stop offset="100%" stop-color="#0c1227"/>
        </linearGradient>

        <linearGradient id="armShadeFar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stop-color="#233052"/>
          <stop offset="100%" stop-color="#0a0f20"/>
        </linearGradient>

        <radialGradient id="armBall" cx="34%" cy="30%" r="72%">
          <stop offset="0%"   stop-color="#46598a"/>
          <stop offset="55%"  stop-color="#18213d"/>
          <stop offset="100%" stop-color="#080c1a"/>
        </radialGradient>

        <radialGradient id="btnCap" cx="34%" cy="26%" r="78%">
          <stop offset="0%"   stop-color="#2b4066"/>
          <stop offset="58%"  stop-color="#16203a"/>
          <stop offset="100%" stop-color="#0c1225"/>
        </radialGradient>

        <linearGradient id="btnWall" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stop-color="#090e1c"/>
          <stop offset="38%"  stop-color="#1b2542"/>
          <stop offset="100%" stop-color="#070b16"/>
        </linearGradient>

        <!-- Колодец гнезда: всё, что ниже этой формы, срезается, поэтому
             плунжер выдвигается из пола и тонет в нём, а не висит. -->
        <clipPath id="btnWell">
          <ellipse cx="100" cy="338" rx="64" ry="25"/>
          <rect x="36" y="200" width="128" height="138"/>
        </clipPath>
      </defs>

      <!-- Кнопка нарисована до руки: палец должен лежать поверх крышки,
           иначе нажатие читается как зависание над ней. -->
      <g class="arm-button">
        <line class="arm-beam"/>
        <g transform="translate(${BTN.x} ${BTN.y}) scale(${BTN.s}) translate(-100 -338)">
          <g class="btn-open">
            <ellipse class="btn-socket" cx="100" cy="338" rx="64" ry="25"/>
            <ellipse class="btn-socket-inner" cx="100" cy="338" rx="54" ry="21"/>
          </g>
          <g clip-path="url(#btnWell)">
            <g class="btn-plunger">
              <path class="btn-wall"
                    d="M48 316 L48 338 A52 20 0 0 0 152 338 L152 316 A52 20 0 0 1 48 316 Z"/>
              <ellipse class="btn-cap" cx="100" cy="316" rx="52" ry="20"/>
              <path class="btn-gloss" d="M56 306 A52 20 0 0 1 128 299"/>
            </g>
          </g>
          <ellipse class="btn-ring" cx="100" cy="338" rx="64" ry="25"/>
        </g>
        <text class="arm-button-label" x="${BTN.x}" y="${BTN.y + 38}" text-anchor="middle">Send callback</text>
      </g>

      <!-- основание -->
      <g class="arm-part" data-part="base" style="--dy:38px">
        <path class="arm-line" d="M356 712 H596 L586 742 H366 Z"/>
        <path class="arm-metal" d="M356 712 H596 L586 742 H366 Z" opacity="0.55"/>
        <path class="arm-hatch" d="M372 742 l12-30M402 742 l12-30M432 742 l12-30M462 742 l12-30M492 742 l12-30M522 742 l12-30M552 742 l12-30"/>
        <circle class="arm-line--thin" cx="386" cy="722" r="5" fill="none"/>
        <circle class="arm-line--thin" cx="566" cy="722" r="5" fill="none"/>
        <rect class="arm-line" x="418" y="686" width="116" height="26" rx="4" fill="url(#armMetal)"/>
        <circle class="arm-led" data-led="0" cx="438" cy="699" r="3.4"/>
        <circle class="arm-led" data-led="1" cx="452" cy="699" r="3.4"/>
      </g>

      <!-- стойка -->
      <g class="arm-part" data-part="column" style="--dy:30px">
        <rect class="arm-line" x="450" y="428" width="52" height="260" rx="6" fill="url(#armMetal)"/>
        <path class="arm-hatch" d="M458 452 h36M458 476 h36M458 500 h36M458 524 h36M458 548 h36M458 572 h36M458 596 h36M458 620 h36M458 644 h36M458 668 h36"/>
      </g>

      <!-- индикаторная панель -->
      <g class="arm-part" data-part="leds" style="--dy:14px">
        <rect class="arm-line--thin" x="512" y="608" width="58" height="42" rx="5" fill="rgba(9,13,28,0.85)"/>
        <circle class="arm-led" data-led="3" cx="526" cy="620" r="3.4"/>
        <circle class="arm-led" data-led="4" cx="540" cy="620" r="3.4"/>
        <circle class="arm-led" data-led="5" cx="554" cy="620" r="3.4"/>
        <path class="arm-hatch" d="M520 634 h42M520 642 h28"/>
      </g>

      <!-- кабельный жгут: из стойки вдоль руки к запястью -->
      <g class="arm-part" data-part="cables" style="--dy:16px">
        <path class="arm-cable" data-cable="0"/>
        <path class="arm-cable" data-cable="1" style="stroke:rgba(56,232,255,0.4)"/>
      </g>

      <!-- плечевой узел на стойке -->
      <g class="arm-part" data-part="shoulder" style="--dx:22px;--dy:-14px">
        <path class="arm-shell" d="M440 434 V390 C440 352, 512 352, 512 390 V434 Z"/>
        <path class="arm-hatch" d="M448 420 h56M448 428 h56"/>
      </g>

      <!-- плечо -->
      <g class="arm-part" data-part="upper" style="--dx:18px;--dy:-18px">
        <g data-bone="upper">
          <path class="arm-shell" d="M-6 -26 C 60 -37, 120 -25, 168 -17 L 168 17 C 110 22, 40 30, -6 26 Z"/>
          <path class="arm-seam" d="M34 -30 C 40 -10, 40 10, 34 27M128 -24 C 132 -8, 132 8, 128 20"/>
          <path class="arm-hatch" d="M52 -6 H 120M52 4 H 120"/>
        </g>
        <g data-ball="shoulder">
          <circle class="arm-ball" r="29"/>
          <circle class="arm-line--thin" r="11" fill="none"/>
        </g>
      </g>

      <!-- предплечье -->
      <g class="arm-part" data-part="fore" style="--dx:-20px;--dy:-10px">
        <g data-bone="fore">
          <path class="arm-shell" d="M-4 -21 C 30 -27, 90 -18, 152 -11 L 152 11 C 96 15, 40 22, -4 20 Z"/>
          <path class="arm-seam" d="M118 -13 C 122 -4, 122 4, 118 14M24 -3 C 60 -5, 96 -4, 132 -3"/>
          <path class="arm-hatch" d="M30 6 H 96M30 12 H 80"/>
        </g>
      </g>

      <!-- локоть -->
      <g class="arm-part" data-part="elbow" style="--dx:-14px;--dy:-16px">
        <g data-ball="elbow">
          <circle class="arm-ball" r="19"/>
          <circle class="arm-line--thin" r="7" fill="none"/>
        </g>
      </g>

      <!-- кисть: дальние пальцы, ладонь, указательный, большой -->
      <g class="arm-part" data-part="hand" style="--dx:-22px">
        <g data-bone="hand">
          ${fingerMarkup('little', FINGERS.little, true)}
          ${fingerMarkup('ring', FINGERS.ring, true)}
          ${fingerMarkup('middle', FINGERS.middle, true)}
          <path class="arm-shell" d="M-4 -14 C 8 -25, 36 -22, ${PALM} -13 C ${PALM + 5} -6, ${PALM + 5} 6, ${PALM + 1} 12 C 44 16, 18 16, -4 13 Z"/>
          <path class="arm-seam" d="M50 -9 C 55 -3, 55 4, 50 10M8 10 C 24 6, 40 6, 50 8"/>
          ${fingerMarkup('index', FINGERS.index, false)}
          ${fingerMarkup('thumb', FINGERS.thumb, false)}
        </g>
      </g>

      <!-- запястье: манжета поверх стыка предплечья и ладони -->
      <g class="arm-part" data-part="wrist" style="--dx:-18px">
        <g data-ball="wrist">
          <ellipse class="arm-ball" rx="8" ry="14"/>
          <path class="arm-seam" d="M0 -11 V 11"/>
        </g>
      </g>
    `;

    host.appendChild(svg);
    document.body.appendChild(host);

    const parts = new Map($$('.arm-part', svg).map(el => [el.dataset.part, el]));
    const bone = (n) => svg.querySelector(`[data-bone="${n}"]`);
    const ball = (n) => svg.querySelector(`[data-ball="${n}"]`);
    const bones = { upper: bone('upper'), fore: bone('fore'), hand: bone('hand') };
    const balls = { shoulder: ball('shoulder'), elbow: ball('elbow'), wrist: ball('wrist') };
    const fingers = Object.fromEntries(Object.keys(FINGERS).map(name => [
      name,
      [0, 1, 2].map(j => svg.querySelector(`[data-finger="${name}"] [data-seg="${j}"]`)),
    ]));
    const cables = $$('[data-cable]', svg);
    const leds = $$('.arm-led', svg);
    const plunger = svg.querySelector('.btn-plunger');
    const opening = svg.querySelector('.btn-open');
    const label = svg.querySelector('.arm-button-label');
    const beam = svg.querySelector('.arm-beam');

    const put = (el, x, y, deg) =>
      el.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${deg.toFixed(2)})`);

    function dockedUpTo(index) {
      // Состояние выводится из позиции, а не накапливается: при
      // прокрутке вверх лишние детали снимаются обратно.
      SCRIPT.forEach((step, i) => {
        if (!step.part) return;
        const el = parts.get(step.part);
        if (el) el.classList.toggle('is-docked', i <= index);
      });
    }

    let punchAt = 0;
    let touched = false;
    let still = false;

    function strike() {
      if (!punchAt) punchAt = performance.now();
    }

    // Прокрутка вверх возвращает кнопку в пол: при повторном заходе
    // в финал всё собирается и нажимается заново.
    function release() {
      punchAt = 0;
      touched = false;
    }

    // Режим покоя: кадр нажатия без движения
    function pressedStill() {
      still = true;
    }

    /* Двузвенная обратная кинематика: кисть должна встать так, чтобы
       кончик пальца оказался в (tx, ty). Локоть — вверх, как у человека,
       который тянется к столу. Недостижимая точка не ломает руку:
       расстояние поджимается к полной длине. */
    function solve(tx, ty, handDeg, tipLocal) {
      const h = handDeg * RAD;
      const wx = tx - (tipLocal.x * Math.cos(h) - tipLocal.y * Math.sin(h));
      const wy = ty - (tipLocal.x * Math.sin(h) + tipLocal.y * Math.cos(h));
      const dx = wx - SHOULDER.x;
      const dy = wy - SHOULDER.y;
      const d = clamp(Math.hypot(dx, dy), Math.abs(UPPER - FORE) + 1, UPPER + FORE - 0.5);
      const bend = Math.acos(clamp((UPPER * UPPER + d * d - FORE * FORE) / (2 * UPPER * d), -1, 1));
      const upper = Math.atan2(dy, dx) + bend;
      const ex = SHOULDER.x + Math.cos(upper) * UPPER;
      const ey = SHOULDER.y + Math.sin(upper) * UPPER;
      const fore = Math.atan2(wy - ey, wx - ex);
      return {
        upper: upper / RAD,
        fore: fore / RAD,
        elbow: [ex, ey],
        wrist: [ex + Math.cos(fore) * FORE, ey + Math.sin(fore) * FORE],
      };
    }

    function pose(run, reach, now) {
      const r = smooth(clamp(reach, 0, 1));
      const idle = 1 - r;

      const depth = still ? SINK : punchAt ? strikeDepth(now - punchAt) : -HOVER;
      const load = clamp(depth / SINK, 0, 1);

      if (punchAt && depth > 0 && !touched) {
        touched = true;
        if (onContact) onContact();
      }

      /* Пальцы: из расслабленной кисти в указующий жест волной */
      const gesture = clamp((reach - 0.2) / 0.6, 0, 1);
      const flex = {};
      for (const name of Object.keys(FINGERS)) {
        const k = smooth(clamp((gesture - WAVE[name]) / 0.7, 0, 1));
        flex[name] = RELAX[name].map((v, j) =>
          lerp(v, POINT[name][j], k) + Math.sin(now / 1100 + PHASE[name] + j * 0.6) * 2.4 * idle);
      }
      flex.index = flex.index.map((v, j) => v + PRESS_FLEX[j] * load);
      for (const name of ['little', 'ring', 'middle']) flex[name] = flex[name].map(v => v + 4 * load);

      /* Цель кончика: в покое кисть свободно висит над полом и чуть
         дышит, в финале кончик стоит над центром крышки. */
      const restX = lerp(330, 308, run) + Math.sin(now / 1700) * 3 * idle;
      const restY = lerp(604, 590, run) + Math.sin(now / 1250) * 2.5 * idle;
      const restHand = 128 + Math.sin(now / 2100) * 3 * idle;
      const tx = lerp(restX, BTN.x, r);
      const ty = lerp(restY, BTN.capY + depth, r);
      const handDeg = lerp(restHand, 101, r) + load * 2;

      const tip = fingerTip(FINGERS.index, flex.index);
      const k = solve(tx, ty, handDeg, tip);

      put(bones.upper, SHOULDER.x, SHOULDER.y, k.upper);
      put(bones.fore, k.elbow[0], k.elbow[1], k.fore);
      put(bones.hand, k.wrist[0], k.wrist[1], handDeg);
      put(balls.shoulder, SHOULDER.x, SHOULDER.y, k.upper);
      put(balls.elbow, k.elbow[0], k.elbow[1], k.fore);
      put(balls.wrist, k.wrist[0], k.wrist[1], handDeg);

      for (const name of Object.keys(FINGERS)) {
        const f = FINGERS[name];
        const segs = fingers[name];
        const sign = name === 'thumb' ? [-1, 1, 1] : [-1, -1, -1];
        segs.forEach((g, j) => {
          const [x, y] = j === 0 ? f.base : [f.len[j - 1], 0];
          put(g, x, y, sign[j] * flex[name][j]);
        });
      }

      // Жгут идёт по нижней стороне руки и провисает между суставами
      const [ex, ey] = k.elbow;
      const [wx, wy] = k.wrist;
      cables.forEach((c, i) => {
        const o = 10 + i * 7;
        c.setAttribute('d', spline([
          [503, 470 + i * 10],
          [SHOULDER.x - 6, SHOULDER.y + o + 22],
          [(SHOULDER.x + ex) / 2, (SHOULDER.y + ey) / 2 + o + 8],
          [ex + 4, ey + o],
          [(ex + wx) / 2 + o, (ey + wy) / 2],
          [wx + 10 + i * 3, wy - 10],
        ]));
      });

      /* Кнопка появляется под пальцем: пока кончик подходит, в полу
         раскрывается гнездо, потом из него выдвигается плунжер. Всё —
         функция reach, поэтому прокрутка назад убирает кнопку обратно.
         Просадка — та же глубина кончика, что ведёт руку: палец и
         крышка не могут разойтись ни на одном кадре. */
      const emerge = smooth(clamp((reach - 0.5) / 0.42, 0, 1));
      const open = smooth(clamp(emerge * 1.8, 0, 1));
      const rise = smooth(clamp((emerge - 0.3) / 0.7, 0, 1));
      const sink = (1 - rise) * HIDDEN + clamp(depth, 0, SINK) / BTN.s;

      opening.setAttribute('transform', `translate(100 338) scale(${open.toFixed(3)}) translate(-100 -338)`);
      opening.style.opacity = open.toFixed(3);
      plunger.setAttribute('transform', `translate(0 ${sink.toFixed(2)})`);
      plunger.style.opacity = clamp(rise * 3, 0, 1).toFixed(3);
      label.style.opacity = rise.toFixed(3);

      // Луч от кончика в пол: показывает, где сейчас родится кнопка
      const h = handDeg * RAD;
      const tipX = wx + tip.x * Math.cos(h) - tip.y * Math.sin(h);
      const tipY = wy + tip.x * Math.sin(h) + tip.y * Math.cos(h);
      beam.setAttribute('x1', tipX.toFixed(1));
      beam.setAttribute('y1', tipY.toFixed(1));
      beam.setAttribute('x2', BTN.x);
      beam.setAttribute('y2', BTN.y);
      beam.style.opacity = (Math.sin(emerge * Math.PI) * 0.8).toFixed(3);
    }

    function setLeds(n) {
      leds.forEach((el, i) => el.classList.toggle('on', i < n));
    }

    return { host, dockedUpTo, pose, strike, release, pressedStill, setLeds, svg };
  }

  /* ══════════════════════════════════════════════════════════════
     Геометрия прокрутки

     Для каждого слайда считается t: -1 слайд ещё под кадром,
     0 — по центру кадра, +1 — уже над кадром. Все переходы —
     функции от этого числа, поэтому они обратимы и не ломаются
     при рывке скролла.

     Вокруг центра есть зона покоя шириной DEAD: пока слайд в ней,
     он стоит ровно и на полной непрозрачности. Переход начинается
     только на выходе из зоны — отсюда ритм «покой → движение →
     покой», а не постоянное подрагивание всего на экране.
     ══════════════════════════════════════════════════════════════ */
  const DEAD = 0.3;

  function sceneTransform(kind, raw) {
    const out = { op: 1, tf: 'none', fx: 'none', mask: '0%' };
    const mag = Math.abs(raw);
    if (mag <= DEAD) return out;

    // Доля пройденного перехода и его направление
    const a = clamp((mag - DEAD) / (1 - DEAD), 0, 1.4);
    const t = raw < 0 ? -a : a;

    // Общая для всех сцен убыль: кадр гаснет, уходя с экрана
    out.op = clamp(1 - a * 1.15, 0, 1);

    switch (kind) {
      case 'depth':
        // Уход в глубину: сцена отодвигается от зрителя
        out.tf = `translate3d(0, ${t * -34}px, 0) scale(${1 - a * 0.085})`;
        break;
      case 'slide':
        // Горизонтальный сдвиг кадра, как в слайдшоу
        out.tf = `translate3d(${t * -13}vw, 0, 0)`;
        break;
      case 'split':
        // Сцена расходится в сторону и слегка проваливается
        out.tf = `translate3d(${t * 9}vw, ${a * 22}px, 0)`;
        break;
      case 'track':
        // Движение вдоль конвейера — в ту же сторону, что и шаги
        out.tf = `translate3d(${t * 16}vw, 0, 0)`;
        break;
      case 'scale':
        // Сжатие в точку: сцена «запирается», как скрипт в песочнице
        out.tf = `scale(${1 - a * 0.16})`;
        out.fx = `blur(${a * 3}px)`;
        break;
      case 'blur':
        // Расфокус разрыва
        out.tf = `translate3d(0, ${t * -20}px, 0)`;
        out.fx = `blur(${a * 5}px)`;
        break;
      case 'mask':
        // Шторка сверху вниз
        out.mask = `${clamp(a * 100, 0, 100)}%`;
        out.tf = `translate3d(0, ${t * -16}px, 0)`;
        break;
      case 'still':
        // Намеренно почти без движения: контраст перед финалом
        out.op = clamp(1 - a * 0.9, 0, 1);
        break;
      default:
        out.tf = `translate3d(0, ${t * -18}px, 0)`;
    }
    return out;
  }

  /* ══════════════════════════════════════════════════════════════
     Сборка
     ══════════════════════════════════════════════════════════════ */

  function init() {
    mountLayers();
    const busUI = mountBus();
    const interludes = mountInterludes();
    const tagUI = mountSceneTag();
    const tele = mountTelemetry();

    slides.forEach((s, i) => {
      const step = SCRIPT[i] || SCRIPT[SCRIPT.length - 1];
      s.dataset.scene = step.scene;
    });

    /* Кубик и рука — только для широкого экрана: на узком им негде
       стоять, не мешая тексту. Строятся лениво и один раз, но по
       событию медиазапроса, а не только при загрузке — иначе
       развернув окно, зритель остался бы без главного героя. */
    const wide = matchMedia('(min-width: 981px)');
    let cube = null;
    let arm = null;
    let active = -1;

    function build() {
      if (!wide.matches) return;
      if (!cube && !calm()) cube = makeCube();
      if (!arm) arm = makeArm(contact);
      // Свежепостроенная сцена должна догнать текущее место в показе
      active = -1;
    }
    build();
    wide.addEventListener('change', build);

    document.documentElement.classList.add('stage-on');

    let pressed = false;
    let last = performance.now();

    /* Отклик кнопки и телеметрия стартуют в момент касания, а не вместе
       с началом хода: иначе кнопка срабатывает раньше пальца и причина
       со следствием меняются местами. Момент касания сообщает сама
       рука — он выводится из того же хода, что и её поза. */
    function contact() {
      arm.host.classList.add('is-pressed');
      tele.el.classList.add('on');
      tele.steps.forEach((s, i) => {
        setTimeout(() => {
          s.classList.add(i === tele.steps.length - 1 ? 'ok' : 'on');
          if (i > 0) tele.steps[i - 1].classList.add('done');
        }, 260 + i * 240);
      });
    }

    /* Пакет на шине: его положение — функция прогресса, а не таймера.
       Поэтому он не «убегает» при быстрой прокрутке. */
    function busPacket(run) {
      const span = 1 / PACKETS.length;
      const idx = clamp(Math.floor(run / span), 0, PACKETS.length - 1);
      const local = (run - idx * span) / span;
      busUI.label.textContent = PACKETS[idx];
      busUI.packet.style.top = `${lerp(8, 92, local)}%`;
      // Притухает у краёв отрезка — пакет «входит» и «выходит» из узла.
      // Не до нуля: шина должна читаться и в самом начале показа.
      busUI.packet.style.opacity = String(0.3 + Math.sin(local * Math.PI) * 0.6);
    }

    function applyScenes(centerY) {
      for (const s of slides) {
        const rect = s.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        const t = clamp((centerY - mid) / (innerHeight * 0.9), -1.4, 1.4);
        const k = sceneTransform(s.dataset.scene, t);
        const box = s.firstElementChild;
        s.style.setProperty('--op', String(k.op));
        s.style.setProperty('--tf', k.tf);
        s.style.setProperty('--fx', k.fx);
        s.style.setProperty('--mask', k.mask);
        void box;
      }
    }

    function nearest(centerY) {
      let best = 0, bestD = Infinity;
      slides.forEach((s, i) => {
        const r = s.getBoundingClientRect();
        const d = Math.abs(r.top + r.height / 2 - centerY);
        if (d < bestD) { bestD = d; best = i; }
      });
      return best;
    }

    /* Непрерывная позиция в слайдах: целая часть — номер слайда, чей
       центр уже прошли, дробная — сколько пройдено до следующего.
       В отличие от nearest() не щёлкает по слайдам, а течёт, поэтому
       годится для плавного угасания. Считается из той же геометрии,
       что и всё остальное, — значит, обратима и переживает рывок. */
    function slidePos(centerY) {
      const d = slides.map(s => {
        const r = s.getBoundingClientRect();
        return r.top + r.height / 2 - centerY;
      });
      if (d[0] >= 0) return 0;
      for (let i = 0; i < d.length - 1; i += 1) {
        if (d[i] <= 0 && d[i + 1] > 0) return i + d[i] / (d[i] - d[i + 1]);
      }
      return d.length - 1;
    }

    /* Кубик тает от слайда к слайду и к предпоследнему пропадает
       совсем: к финалу сцену забирает рука, и делить её не с кем. */
    const CUBE_GONE_AT = slides.length - 2;

    function enter(i) {
      const step = SCRIPT[i];
      if (!step) return;

      tagUI.name.textContent = step.tag;
      tagUI.num.textContent = `${String(i + 1).padStart(2, '0')} / ${String(slides.length).padStart(2, '0')}`;

      if (arm) {
        arm.dockedUpTo(i);
        arm.host.classList.toggle('is-loose', step.mood === 'loose');
        arm.host.classList.toggle('is-flowing', step.mood !== 'still' && step.mood !== 'loose');
        arm.setLeds(step.mood === 'loose' ? 0 : Math.round(((i + 1) / slides.length) * 6));
      }

      busUI.bus.classList.toggle('is-broken', step.mood === 'loose');

      // Ходы кубика идут своим циклом; от сценария он берёт только
      // приглушение на слайде-разрыве, чтобы не спорить с ним за внимание
      if (cube) cube.host.classList.toggle('is-loose', step.mood === 'loose');

      /* Эстафета, а не толпа. Две машины в одном углу весь показ —
         это и есть перегрузка: кубик и рука тянут взгляд одновременно
         и ни одна не читается. Поэтому у каждой свой акт: кубик ведёт
         показ, а на последних двух слайдах отступает, и сцену забирает
         рука. В финале в кадре один главный объект. */
      document.documentElement.classList.toggle('is-finale', i >= slides.length - 2);

      // Уход с финала снимает нажатие: сцена должна собираться заново
      if (step.mood !== 'final' && pressed) {
        pressed = false;
        if (arm) { arm.host.classList.remove('is-pressed'); arm.release(); }
        tele.el.classList.remove('on');
        tele.steps.forEach(s => s.classList.remove('on', 'done', 'ok'));
      }
    }

    /* Финал: рука дотягивается до кнопки и нажимает её. Запускается
       один раз за посещение финального слайда — не по таймеру, а по
       тому, что слайд доведён до центра и кнопка уже выдвинулась. */
    function finale(localProgress) {
      if (pressed || !arm || calm()) return;
      if (localProgress < 0.97) return;
      pressed = true;
      arm.strike();
    }

    function frame(now) {
      const dt = Math.min(now - last, 48);
      last = now;

      const doc = document.documentElement;
      const max = doc.scrollHeight - innerHeight;
      const run = max > 0 ? clamp(scrollY / max, 0, 1) : 0;
      doc.style.setProperty('--run', run.toFixed(4));

      const centerY = innerHeight / 2;

      applyScenes(centerY);
      busPacket(run);

      const i = nearest(centerY);
      if (i !== active) { active = i; enter(i); }

      for (const el of interludes) {
        const r = el.getBoundingClientRect();
        el.classList.toggle('on', r.top < innerHeight * 0.86 && r.bottom > 0);
      }

      if (cube) {
        cube.render(now, dt);
        cube.orient(now);
        const fade = clamp(1 - slidePos(centerY) / CUBE_GONE_AT, 0, 1);
        cube.host.style.setProperty('--cube-fade', fade.toFixed(3));
      }

      if (arm) {
        // Тянется к кнопке только на последнем слайде
        const lastRect = slides[slides.length - 1].getBoundingClientRect();
        const reach = clamp(1 - Math.abs(lastRect.top + lastRect.height / 2 - centerY) / (innerHeight * 0.7), 0, 1);
        arm.pose(run, reach, now);
        if (active === slides.length - 1) finale(reach);
      }

      requestAnimationFrame(frame);
    }

    if (calm()) {
      // В режиме покоя сцена собирается сразу и больше не двигается
      if (arm) {
        arm.dockedUpTo(SCRIPT.length - 1);
        arm.setLeds(6);
        arm.pressedStill();
        arm.pose(1, 1, performance.now());
      }

      /* Нажатие здесь показано состоянием, а не движением: кнопка уже
         утоплена, телеметрия уже прошла. Цикл кадров в этом режиме не
         работает, и без этого зритель не увидел бы смысла финала —
         покой должен убирать перемещение, а не результат. */
      document.documentElement.classList.add('is-finale');
      if (arm) arm.host.classList.add('is-pressed');
      tele.el.classList.add('on');
      tele.steps.forEach((s, i) => s.classList.add(i === tele.steps.length - 1 ? 'ok' : 'done'));

      applyScenes(innerHeight / 2);
      return;
    }

    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
