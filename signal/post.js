// Оптика кадра: сцена рендерится как обычно, готовый кадр копируется с экрана
// в текстуру, и один полноэкранный проход добавляет то, что делает картинку
// «снятой», а не отрисованной. Копия с экрана, а не render target: так кадр уже
// прошёл тон-маппинг и перевод в sRGB, и собственные шейдеры сцены (волокна,
// фон, голоэкраны) выглядят ровно как без оптики.
//   · хроматическая аберрация — едва заметная, только у краёв кадра и на
//     скорости камеры: это оптика объектива, а не глитч;
//   · мягкий ореол вокруг неона — только у ярких источников;
//   · виньетка и мелкое зерно.
// Цветных засветов нет: цвет в кадре дают только неон и вывески.
// DOM-карточки лежат поверх холста, поэтому текст слайдов оптика не трогает.

import * as THREE from '../3d/vendor/three.module.js';

const fragment = /* glsl */ `
  uniform sampler2D tScene;
  uniform vec2 uResolution;
  uniform float uTime;
  uniform float uAberration;   // 0..1 — сила, растёт на облёте
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

  void main() {
    vec2 c = vUv - 0.5;
    float r = length(c * vec2(uResolution.x / uResolution.y, 1.0));
    // Аберрация: каналы разъезжаются от центра, в центре — ноль
    vec2 shift = c * (0.0008 + 0.005 * uAberration) * smoothstep(0.35, 0.95, r);
    vec3 col;
    col.r = texture2D(tScene, vUv + shift).r;
    col.g = texture2D(tScene, vUv).g;
    col.b = texture2D(tScene, vUv - shift).b;

    // Неоновый ореол: два кольца выборок вокруг пикселя, в счёт идёт только
    // то, что ярче порога, — вывески, светодиоды, кольца ствола. Стены и
    // небо ниже порога и не засвечиваются
    vec3 glow = vec3(0.0);
    vec2 px = 1.0 / uResolution;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.785398 + 0.39;
      vec2 d = vec2(cos(a), sin(a)) * px;
      glow += max(texture2D(tScene, vUv + d * 5.0).rgb - 0.42, 0.0);
      glow += max(texture2D(tScene, vUv + d * 13.0).rgb - 0.42, 0.0) * 0.6;
    }
    col += glow * 0.075;

    // Виньетка: края темнеют, но город по краям кадра остаётся виден
    col *= mix(1.0, 0.62, smoothstep(0.55, 1.15, r));

    // Зерно: на каждом кадре своё, по яркости — сильнее в тенях
    float g = hash(vUv * uResolution + fract(uTime * 7.3) * 91.0) - 0.5;
    col += g * mix(0.022, 0.008, clamp(dot(col, vec3(0.333)), 0.0, 1.0));

    gl_FragColor = vec4(col, 1.0);
  }
`;

/** @returns {{ render(scene, camera): void, resize(w, h, dpr): void, uniforms: object }} */
export function createPost(renderer) {
  let frame = new THREE.FramebufferTexture(1, 1);
  const uniforms = {
    tScene: { value: frame },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uAberration: { value: 0 },
  };
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: fragment,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,   // кадр уже тон-маплен
  }));
  const screen = new THREE.Scene();
  screen.add(quad);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  return {
    uniforms,
    resize(w, h, dpr) {
      frame.dispose();
      frame = new THREE.FramebufferTexture(Math.round(w * dpr), Math.round(h * dpr));
      uniforms.tScene.value = frame;
      uniforms.uResolution.value.set(w, h);
    },
    render(scene, camera) {
      renderer.render(scene, camera);
      renderer.copyFramebufferToTexture(frame);
      renderer.render(screen, ortho);
    },
  };
}
