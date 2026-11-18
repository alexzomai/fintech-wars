import * as THREE from 'three';

// Ретро-вайб PS1/PS2:
// 1) рендер в низком разрешении (растягивается CSS-ом без сглаживания);
// 2) лёгкое «дрожание» вершин — только у людей и машин (enableSnap);
// 3) пост-проход: тонмаппинг → sRGB → мягкий дизеринг Байера + палитра 18 бит (6 бит на канал).

// Внутреннее разрешение = половина экрана (на 1080p это ~960×540): пиксели видны, но мягко.
export const RENDER_SCALE = 0.5;
const SNAP = 'vec2(320.0, 180.0)'; // мелкая сетка — лёгкое дрожание, без тошноты

// Дрожание вершин — только у материалов с define RETRO_SNAP (люди и машины).
// Земля, асфальт и здания не дрожат: на больших плоскостях это даёт мерцание.
THREE.ShaderChunk.project_vertex += `
#ifdef RETRO_SNAP
  gl_Position.xy = floor(gl_Position.xy / gl_Position.w * ${SNAP}) / ${SNAP} * gl_Position.w;
#endif
`;
export function enableSnap(material) {
  material.defines = { ...(material.defines || {}), RETRO_SNAP: '' };
  material.needsUpdate = true;
  return material;
}

export class RetroPass {
  constructor(renderer) {
    this.renderer = renderer;
    this.rt = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.material = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: this.rt.texture } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        uniform sampler2D tDiffuse;
        varying vec2 vUv;
        const float bayer[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
        void main() {
          gl_FragColor = texture2D(tDiffuse, vUv);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          ivec2 p = ivec2(mod(gl_FragCoord.xy, 4.0));
          // Мягкий дизеринг: 6 бит на канал, половинная амплитуда.
          // Порог симметричен вокруг нуля — дизеринг не смещает картинку в тёмное.
          float d = ((bayer[p.y * 4 + p.x] + 0.5) / 16.0 - 0.5) / 63.0 * 0.6;
          gl_FragColor.rgb = floor((gl_FragColor.rgb + d) * 63.0 + 0.5) / 63.0;
        }`,
      depthTest: false,
      depthWrite: false,
    });
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
  }

  setSize(w, h) {
    this.rt.setSize(w, h);
  }

  render(scene, camera) {
    const r = this.renderer;
    r.setRenderTarget(this.rt);
    r.render(scene, camera);
    r.setRenderTarget(null);
    r.render(this.scene, this.camera);
  }
}

// Ужимаем картинку до maxSize и делаем «хрустящую» nearest-текстуру.
// smooth = true для земли: линейные мипмапы убирают рябь вдали.
export function crunchTexture(image, maxSize = 128, smooth = false) {
  const k = Math.min(1, maxSize / Math.max(image.width, image.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(image.width * k));
  c.height = Math.max(1, Math.round(image.height * k));
  c.getContext('2d').drawImage(image, 0, 0, c.width, c.height);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = smooth ? THREE.LinearMipmapLinearFilter : THREE.NearestMipmapLinearFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
