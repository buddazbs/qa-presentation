// Глава «Моки»: россыпь стендов собирается в раздел платформы.
//
// Круг из трёх тактов, как у «Как было» в app.js:
//   1. россыпь — четыре стенда, у каждого свой логин и свой провод к браузеру;
//   2. сборка — проступает QA Platform, стенды по очереди перелетают в
//      строки раздела Mock, отдельные провода гаснут, остаётся один — через
//      /api/mocks; по нему бегут пакеты, стенды загораются online;
//   3. пауза, затем сцена гаснет целиком и круг начинается заново.
// Двигаются только transform и opacity; координаты — из offset*, то есть в
// пикселях вёрстки: карточка в 3D-слое масштабирована, а offset* этого не видят.

const STANDS = [
  { id: 'adapter', name: 'adapter-mock', meta: 'Adapter · :8084' },
  { id: 'p01', name: 'processor-01', meta: 'Processor · :8085' },
  { id: 'p02', name: 'processor-02', meta: 'Processor · :8086' },
  { id: 'dyn', name: 'dynamic-mock-dev', meta: 'Dynamic · allowlist' },
];
// Где стенды висят в россыпи: доли сцены (левый верхний угол узла)
const SCATTER = [[0.33, 0.04], [0.66, 0.17], [0.38, 0.55], [0.66, 0.69]];

const SVG = 'http://www.w3.org/2000/svg';
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Смещение элемента относительно сцены — по цепочке offsetParent, без transform. */
function offsetIn(el, stage) {
  let x = 0;
  let y = 0;
  for (let n = el; n && n !== stage; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

function build(stage) {
  stage.innerHTML = /* html */ `
    <svg class="mm-wires"></svg>
    <div class="mm-client"><i></i><b>браузер</b><span>QA-инженер</span></div>
    <div class="mm-hub">
      <div class="mm-hub__head"><span class="mm-logo"><i></i><i></i><i></i></span><b>QA Platform</b><em>одна сессия</em></div>
      <div class="mm-tile mm-tile--side mm-tile--a"><b>Колбэки</b><span></span><span></span></div>
      <div class="mm-tile mm-tile--side mm-tile--b"><b>QA Package</b><span></span><span></span></div>
      <div class="mm-tile mm-tile--mock"><b>Mock</b><ol class="mm-rows">
        ${STANDS.map(s => `<li data-id="${s.id}"><i></i><code>${s.name}</code><span>online</span></li>`).join('')}
      </ol></div>
      <div class="mm-proxy"><code>/api/mocks</code><span>хосты и пароли — на сервере</span></div>
    </div>
    ${STANDS.map((s, i) => `
      <div class="mm-node" data-id="${s.id}" style="--i:${i}">
        <div class="mm-node__body"><code>${s.name}</code><span>${s.meta}</span><em>свой логин</em></div>
      </div>`).join('')}`;
}

/** @param {HTMLElement|null} stage */
export function mountMocks(stage) {
  if (!stage) return { enter() {}, leave() {} };
  build(stage);
  const wires = stage.querySelector('.mm-wires');
  const client = stage.querySelector('.mm-client');
  const proxy = stage.querySelector('.mm-proxy');
  const nodes = [...stage.querySelectorAll('.mm-node')];
  const rows = new Map([...stage.querySelectorAll('.mm-rows li')].map(li => [li.dataset.id, li]));

  let timers = [];
  let raf = 0;
  const later = (ms, fn) => timers.push(setTimeout(fn, ms));
  const stop = () => { timers.forEach(clearTimeout); timers = []; cancelAnimationFrame(raf); raf = 0; };

  /** Россыпь: узлы по своим местам, провод к каждому. */
  function layout() {
    const W = stage.offsetWidth;
    const H = stage.offsetHeight;
    wires.setAttribute('viewBox', `0 0 ${W} ${H}`);
    wires.textContent = '';
    const c = offsetIn(client, stage);
    const from = [c.x + c.w, c.y + c.h / 2];
    nodes.forEach((node, i) => {
      node.style.left = `${SCATTER[i][0] * W}px`;
      node.style.top = `${SCATTER[i][1] * H}px`;
      const n = offsetIn(node, stage);
      const to = [n.x, n.y + n.h / 2];
      const dx = (to[0] - from[0]) * 0.5;
      const path = document.createElementNS(SVG, 'path');
      path.setAttribute('d', `M${from} C${from[0] + dx},${from[1]} ${to[0] - dx},${to[1]} ${to}`);
      path.setAttribute('class', 'mm-wire');
      path.style.setProperty('--i', i);
      wires.append(path);
    });
    // Единственный провод после сборки: браузер → прокси платформы
    const p = offsetIn(proxy, stage);
    const to = [p.x, p.y + p.h / 2];
    const main = document.createElementNS(SVG, 'path');
    const mx = (to[0] - from[0]) * 0.55;
    main.setAttribute('d', `M${from} C${from[0] + mx},${from[1]} ${to[0] - mx},${to[1]} ${to}`);
    main.setAttribute('class', 'mm-main');
    wires.append(main);
    const length = main.getTotalLength();
    main.style.setProperty('--len', length);
    // Пакеты: три точки, бегут по проводу к прокси
    const packets = [0, 1, 2].map(() => {
      const dot = document.createElementNS(SVG, 'circle');
      dot.setAttribute('r', '3');
      dot.setAttribute('class', 'mm-packet');
      wires.append(dot);
      return dot;
    });
    return { main, length, packets };
  }

  /** Сборка: узел летит в свою строку раздела Mock и растворяется в ней. */
  function fly(node) {
    const row = rows.get(node.dataset.id);
    const n = offsetIn(node, stage);
    const r = offsetIn(row, stage);
    // Равномерный масштаб по ширине строки: текст не сплющивается, пока летит
    node.style.transform = `translate(${r.x - n.x}px, ${r.y - n.y}px) scale(${r.w / n.w})`;
    node.classList.add('is-flying');
  }

  function runPackets(main, length, packets) {
    const t0 = performance.now();
    const tick = now => {
      const t = (now - t0) / 1000;
      packets.forEach((dot, i) => {
        const u = (t * 0.55 + i / packets.length) % 1;
        const p = main.getPointAtLength(u * length);
        dot.setAttribute('transform', `translate(${p.x} ${p.y})`);
        dot.style.opacity = String(Math.sin(u * Math.PI));
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  function reset() {
    stop();
    stage.classList.add('nofx');
    stage.classList.remove('is-merged', 'is-wired', 'rewind');
    nodes.forEach(n => { n.style.transform = ''; n.classList.remove('is-flying'); });
    rows.forEach(li => li.classList.remove('is-in'));
    const wiring = layout();
    void stage.offsetWidth;   // сброс без анимации — до снятия nofx
    stage.classList.remove('nofx');
    return wiring;
  }

  function play() {
    const { main, length, packets } = reset();
    stage.classList.add('is-scattered');
    // 2,4 с россыпи — успеть прочитать «свой логин» у каждого
    later(2400, () => {
      stage.classList.add('is-merged');
      nodes.forEach((node, i) => later(260 + i * 140, () => {
        fly(node);
        later(820, () => rows.get(node.dataset.id).classList.add('is-in'));
      }));
    });
    later(2400 + 260 + 3 * 140 + 900, () => { stage.classList.add('is-wired'); runPackets(main, length, packets); });
    // Пауза на собранной картине, затем перемотка
    later(8600, () => stage.classList.add('rewind'));
    later(9100, play);
  }

  return {
    enter() {
      if (reduce()) {
        reset();
        stage.classList.add('is-merged', 'is-wired', 'nofx');
        nodes.forEach(fly);
        rows.forEach(li => li.classList.add('is-in'));
        return;
      }
      play();
    },
    leave() {
      stop();
      stage.classList.remove('is-scattered', 'is-merged', 'is-wired', 'rewind');
      nodes.forEach(n => { n.style.transform = ''; n.classList.remove('is-flying'); });
      rows.forEach(li => li.classList.remove('is-in'));
    },
  };
}
