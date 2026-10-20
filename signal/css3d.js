// DOM-слой с той же перспективой, что у WebGL-камеры: HTML-элемент
// ставится в мир как плоскость и проецируется через matrix3d.
// Это та же математика, что у CSS3DRenderer из примеров three.js,
// сведённая к нужному минимуму: перспективная камера и плоские объекты.

const num = v => (Math.abs(v) < 1e-10 ? 0 : v);

/** Матрица вида камеры в CSS: ось Y у DOM смотрит вниз — отражаем её. */
function cameraMatrix(m) {
  const e = m.elements;
  return `matrix3d(${[
    e[0], -e[1], e[2], e[3], e[4], -e[5], e[6], e[7],
    e[8], -e[9], e[10], e[11], e[12], -e[13], e[14], e[15],
  ].map(num).join(',')})`;
}

/** Матрица объекта: вторая колонка (ось Y) тоже переворачивается. */
function objectMatrix(m) {
  const e = m.elements;
  return `matrix3d(${[
    e[0], e[1], e[2], e[3], -e[4], -e[5], -e[6], -e[7],
    e[8], e[9], e[10], e[11], e[12], e[13], e[14], e[15],
  ].map(num).join(',')})`;
}

/**
 * @param {HTMLElement} view — контейнер на весь экран
 * @returns {{ add(el: HTMLElement, object: import('three').Object3D): void, render(camera, flat?): void, fovPx: number }}
 */
export function createCss3d(view) {
  const stage = document.createElement('div');
  stage.className = 'css3d__stage';
  view.append(stage);
  const items = [];
  let last = '';
  const layer = {
    fovPx: 1,
    add(el, object) {
      el.classList.add('css3d__item');
      stage.append(el);
      items.push({ el, object });
    },
    /**
     * flat: { el, scale, dx } — карточка, перед которой стоит камера. Пока она в
     * 3D-слое, браузер сэмплирует её текстуру с дробным сдвигом, и текст
     * мылится. Камера смотрит на неё в лоб, так что та же картинка — это
     * обычный 2D-масштаб по центру экрана: ставим его, округлив до пикселя.
     */
    render(camera, flat = null) {
      const w = innerWidth / 2;
      const h = innerHeight / 2;
      view.classList.toggle('is-flat', Boolean(flat));
      if (flat) {
        if (last !== 'none') { stage.style.transform = 'none'; view.style.perspective = 'none'; last = 'none'; }
        const item = items.find(i => i.el === flat.el);
        const x = Math.round(w + (flat.dx || 0) - (flat.el.offsetWidth * flat.scale) / 2);
        const y = Math.round(h - (flat.el.offsetHeight * flat.scale) / 2);
        const value = `translate(${x}px, ${y}px) scale(${flat.scale.toFixed(4)})`;
        if (value !== item.value) { item.el.style.transform = value; item.value = value; }
        return;
      }
      layer.fovPx = camera.projectionMatrix.elements[5] * h;
      const perspective = `${layer.fovPx}px`;
      if (view.style.perspective !== perspective) view.style.perspective = perspective;
      if (last === 'none') last = '';
      camera.updateMatrixWorld();
      const camTransform = `translateZ(${layer.fovPx}px) ${cameraMatrix(camera.matrixWorldInverse)} translate(${w}px, ${h}px)`;
      // Пишем в DOM, только если значение изменилось: на стоящей камере
      // стиль не трогается, и браузеру нечего пересчитывать
      if (camTransform !== last) { stage.style.transform = camTransform; last = camTransform; }
      for (const item of items) {
        if (item.el.hidden) continue;
        item.object.updateMatrixWorld();
        const value = `translate(-50%, -50%) ${objectMatrix(item.object.matrixWorld)}`;
        if (value !== item.value) { item.el.style.transform = value; item.value = value; }
      }
    },
  };
  return layer;
}
