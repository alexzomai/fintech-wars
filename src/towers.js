import * as THREE from 'three';

// Стилизованные силуэты башен Москва-Сити: low-poly экструзии из простых тел.
// Каждый билдер получает центр квартала и возвращает AABB для коллизий.
// Башни настоящие, банки в них — вымышленные.

const box = new THREE.BoxGeometry(1, 1, 1);
const cyl = (seg) => new THREE.CylinderGeometry(1, 1, 1, seg);
const cyl12 = cyl(12), cyl3 = cyl(3), cyl6 = cyl(6);
const sphereHalf = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);

export const TOWERS = {
  // Евразия: зелёное стекло, две вытянутые «волнистые» пластины со сдвигом.
  evrazia(t) {
    t.part(cyl12, t.glass(0x3fae7a), 0, 0, 0, 13, 125, 8, 0.15);
    t.part(cyl12, t.glass(0x3fae7a), 4, 0, 5, 12, 95, 7, 0.15);
    t.neon(0, 125, 0, 26, 16);
    return [-13, 13, -10, 12];
  },
  // Федерация: две трёхгранные башни разной высоты и шпиль. Нейтральная, главный приз.
  federation(t) {
    t.part(cyl3, t.glass(0x5d7fa8), -6, 0, 0, 10, 155, 10, 0);
    t.part(cyl3, t.glass(0x5d7fa8), 7, 0, 3, 9, 112, 9, Math.PI);
    t.part(cyl6, t.metal(0xdde6f0), 0, 145, 0, 0.6, 55, 0.6, 0);
    return [-15, 15, -10, 12];
  },
  // Меркурий: медно-оранжевые ступени, сужаются кверху.
  mercury(t) {
    const m = t.glass(0xc8763d);
    t.part(box, m, 0, 0, 0, 22, 70, 22, 0);
    t.part(box, m, -2, 70, 2, 17, 40, 17, 0);
    t.part(box, m, -3, 110, 3, 11, 30, 11, 0);
    t.neon(-3, 140, 3, 12, 12);
    return [-11, 11, -11, 11];
  },
  // Империя: синее стекло, две пластины и скошенная «шапка».
  imperia(t) {
    const m = t.glass(0x4f7fc0);
    t.part(box, m, 0, 0, 0, 26, 100, 13, 0);
    t.part(box, m, 6, 0, 8, 13, 70, 10, 0);
    t.part(cyl3, m, 0, 100, 0, 9, 16, 9, Math.PI / 2);
    t.neon(0, 100, 0, 27, 14);
    return [-13, 13, -7, 13];
  },
  // Око: две тёмные стройные башни, слегка закрученные секциями.
  oko(t) {
    const m = t.glass(0x5a5f6a);
    for (let k = 0; k < 4; k++) t.part(box, m, -6, k * 32, -2, 12, 32, 12, k * 0.12);
    for (let k = 0; k < 3; k++) t.part(box, m, 9, k * 28, 6, 10, 28, 10, k * 0.15);
    t.neon(-6, 128, -2, 13, 13);
    return [-12, 14, -8, 11];
  },
  // Башня на набережной: овальная в плане.
  embankment(t) {
    t.part(cyl12, t.glass(0x6a8fb0), 0, 0, 0, 14, 92, 9, 0.4);
    t.neon(0, 92, 0, 26, 18);
    return [-14, 14, -10, 10];
  },
  // Город Столиц: ступенчатые блоки-«кирпичики».
  capitals(t) {
    const m = t.glass(0x7b8fa0);
    t.part(box, m, -6, 0, -4, 13, 72, 13, 0);
    t.part(box, m, 7, 0, 5, 12, 52, 12, 0);
    t.neon(-6, 72, -4, 14, 14);
    return [-13, 13, -11, 11];
  },
  // IQ-квартал: три бирюзовые башни разной высоты.
  iq(t) {
    const m = t.glass(0x3f9c9c);
    t.part(box, m, -8, 0, -6, 12, 55, 12, 0);
    t.part(box, m, 7, 0, -4, 11, 40, 11, 0);
    t.part(box, m, 0, 0, 9, 14, 30, 10, 0);
    t.neon(-8, 55, -6, 13, 13);
    return [-14, 13, -12, 14];
  },
  // Афимолл: широкий низкий объём со стеклянным куполом.
  afimall(t) {
    t.part(box, t.concrete(0xb9b3a8), 0, 0, 0, 34, 12, 30, 0);
    t.part(sphereHalf, t.glass(0x47b6b0), 0, 12, 0, 11, 9, 11, 0);
    return [-17, 17, -15, 15];
  },
  // Экспоцентр: павильоны с полукруглыми крышами.
  expo(t) {
    const c = t.concrete(0xcfc8b8);
    for (const z of [-9, 9]) {
      t.part(box, c, 0, 0, z, 32, 8, 12, 0);
      t.part(cyl12, t.glass(0x8fb6c0), 0, 8, z, 6, 32, 6, 0, true);
    }
    return [-16, 16, -15, 15];
  },
  // ЦМТ: широкий подиум и одна прямоугольная башня.
  cmt(t) {
    t.part(box, t.concrete(0xb5ada0), 0, 0, 0, 34, 16, 26, 0);
    t.part(box, t.glass(0x8a8f95), 8, 16, 0, 12, 40, 12, 0);
    t.neon(8, 56, 0, 13, 13);
    return [-17, 17, -13, 13];
  },
};

// Контекст постройки башни в центре квартала (cx, cz).
// part(geo, mat, dx, y0, dz, sx, h, sz, rotY, lying): тело от высоты y0 вверх на h.
// Для цилиндров sx/sz — радиусы, для боксов — размеры.
export function towerContext(scene, cx, cz, district, texInto) {
  return {
    glass(color) {
      // Без тумана: башни Сити горят своими цветами сквозь дымку — главный силуэт карты.
      const m = new THREE.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.35, fog: false, emissive: color, emissiveIntensity: 0.12 });
      texInto(m, '/textures/facade_glass.png', 3, 14, true);
      return m;
    },
    concrete(color) { return new THREE.MeshStandardMaterial({ color, roughness: 0.95 }); },
    metal(color) { return new THREE.MeshStandardMaterial({ color, metalness: 0.8, roughness: 0.3, fog: false }); },
    part(geo, mat, dx, y0, dz, sx, h, sz, rotY = 0, lying = false) {
      const mesh = new THREE.Mesh(geo, mat);
      if (lying) {
        mesh.rotation.z = Math.PI / 2;
        mesh.scale.set(sx, h, sz);
        mesh.position.set(cx + dx, y0 + 0.25, cz + dz);
      } else if (geo === sphereHalf) {
        mesh.scale.set(sx, h, sz);
        mesh.position.set(cx + dx, y0 + 0.25, cz + dz);
      } else {
        mesh.scale.set(sx, h, sz);
        mesh.position.set(cx + dx, y0 + h / 2 + 0.25, cz + dz);
        mesh.rotation.y = rotY;
      }
      mesh.castShadow = mesh.receiveShadow = true;
      scene.add(mesh);
      return mesh;
    },
    // Неоновый пояс у крыши в цвете владельца района.
    neon(dx, y, dz, w, d) {
      const mesh = new THREE.Mesh(box, district.neonMat);
      mesh.scale.set(w + 0.4, 1.6, d + 0.4);
      mesh.position.set(cx + dx, y - 2, cz + dz);
      scene.add(mesh);
    },
  };
}
